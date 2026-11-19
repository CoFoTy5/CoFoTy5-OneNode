"""Korean Danbooru tag dictionary + Google translate fallback.

No ComfyUI imports — testable on its own.

Dictionary source: https://huggingface.co/datasets/chiharoong/danbooru-tags-kr (MIT)
CSV rows (no header):  tag, category, post_count, "[분류 > 세부] 설명. 키워드: <짧은이름>, 키워드1, 키워드2"
"""
import csv
import glob
import json
import os
import re
import threading
import time
import urllib.parse
import urllib.request

from . import cofoty5_store

HF_REPO = "chiharoong/danbooru-tags-kr"
HF_API = f"https://huggingface.co/api/datasets/{HF_REPO}"
HF_FILE = f"https://huggingface.co/datasets/{HF_REPO}/resolve/main/" + "{name}"
GT_URL = "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl={sl}&tl={tl}&q={q}"
# 429(요청 과다)로 막혔을 때 한글→영어(실행용)만 써 보는 다른 주소
GT_URL2 = "https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl={sl}&tl={tl}&q={q}"
GT_GAP = 0.35        # 구글 요청 사이 최소 간격(초) — 한꺼번에 몰아 보내서 막히는 것 방지
GT_COOLDOWN = 180    # 429를 받으면 이 시간(초) 동안 태그 뜻 추정(영→한)은 쉬고, 실행용 번역만 보냄
GT_PER_ITEM_MAX = 10 # 묶음 번역이 줄 수가 안 맞을 때 하나씩 다시 보내는 최대 개수

# Danbooru categories: 0 general, 1 artist, 3 copyright, 4 character, 5 meta
CAT_NAMES = {"0": "일반", "1": "작가", "3": "작품", "4": "캐릭터", "5": "메타"}
MIN_COUNT = {"0": 20, "5": 20, "1": 100, "3": 100, "4": 100}
DESC_RE = re.compile(r"^\s*\[(?P<path>[^\]]*)\]\s*(?P<desc>.*?)\s*(?:키워드\s*:\s*(?P<kw>.*))?$", re.S)
HANGUL = re.compile(r"[\uac00-\ud7a3\u3131-\u318e]")


def norm_key(tag):
    t = str(tag).strip().lower()
    m = re.fullmatch(r"\((.+):\s*-?[\d.]+\)", t, re.S)   # (tag:1.2)
    if m:
        t = m.group(1).strip()
    while len(t) > 2 and t[0] == "(" and t[-1] == ")" and not t.endswith("\\)"):  # ((tag))
        t = t[1:-1].strip()
    t = re.sub(r"\\([()\[\]])", r"\1", t)
    t = t.replace("_", " ")
    return re.sub(r"\s+", " ", t).strip()


def parse_desc(text):
    m = DESC_RE.match(text or "")
    if not m:
        return {"path": "", "desc": (text or "").strip(), "short": "", "kw": []}
    kws = [k.strip() for k in (m.group("kw") or "").split(",") if k.strip()]
    plain = [k for k in kws if not (k.startswith("<") and k.endswith(">"))]
    group = next((k[1:-1] for k in kws if k.startswith("<") and k.endswith(">")), "")
    short = plain[0] if plain else group
    if not short:
        short = re.split(r"[.。]", m.group("desc"))[0][:16]
    return {"path": m.group("path").strip(), "desc": m.group("desc").strip(), "short": short,
            "kw": [k.lower() for k in plain] + ([group.lower()] if group else [])}


def _ssl_context():
    """Embedded/portable Pythons often lack a CA bundle — prefer certifi when it is installed."""
    import ssl
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def http_get(url, timeout=10, headers=None):
    """GET returning (bytes, headers). Tries `requests` (bundles certifi) first, then urllib."""
    headers = {"User-Agent": "Mozilla/5.0 ComfyUI-PromptComposer", **(headers or {})}
    try:
        import requests
        r = requests.get(url, timeout=timeout, headers=headers)
        r.raise_for_status()
        return r.content, r.headers
    except ImportError:
        pass
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=timeout, context=_ssl_context()) as r:
        return r.read(), r.headers


def http_stream(url, timeout=60):
    """Yield (chunk, total_bytes) for large downloads."""
    headers = {"User-Agent": "ComfyUI-PromptComposer"}
    try:
        import requests
        with requests.get(url, timeout=timeout, headers=headers, stream=True) as r:
            r.raise_for_status()
            total = int(r.headers.get("Content-Length") or 0)
            for chunk in r.iter_content(1 << 16):
                if chunk:
                    yield chunk, total
        return
    except ImportError:
        pass
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=timeout, context=_ssl_context()) as r:
        total = int(r.headers.get("Content-Length") or 0)
        while True:
            chunk = r.read(1 << 16)
            if not chunk:
                break
            yield chunk, total


def _short_err(e):
    s = f"{type(e).__name__}: {e}"
    if "CERTIFICATE" in s.upper() or "SSL" in s.upper():
        return "인증서(SSL) 오류 — certifi 설치 필요할 수 있음"
    if "timed out" in s.lower() or "Timeout" in s:
        return "연결 시간 초과"
    if "403" in s or "429" in s:
        return "서버가 요청을 거부함(" + ("429 요청 과다" if "429" in s else "403") + ")"
    return s[:120]


def _is_limited(e):
    s = str(e)
    return "429" in s or "Too Many" in s


def _first_str(x):
    if isinstance(x, str):
        return x
    if isinstance(x, list):
        for y in x:
            r = _first_str(y)
            if r is not None:
                return r
    return None


def _load_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def _save_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)


class TagDict:
    def __init__(self, folder):
        self.home = folder         # 팩 폴더. 실제 저장 위치는 cofoty5_store가 정함 (LoRA 세트와 같은 공용 폴더)
        self.entries = {}          # key -> entry dict
        self.ranked = []           # entries sorted by count desc (for suggest)
        self.state = {"loaded": False, "loading": False, "count": 0, "files": [],
                      "downloading": False, "progress": 0.0, "error": "", "tr_error": "", "tr_ok": None}
        self.lock = threading.Lock()
        self._bind()
        try:
            cofoty5_store.on_change(self.relocate)   # 📁로 폴더를 바꾸면 사전도 새 폴더에서 다시 읽음
        except Exception:
            pass
        self._gt_lock = threading.Lock()   # 구글 요청은 한 번에 하나씩, 간격을 두고
        self._gt_last = 0.0
        self.tr_block_until = 0.0          # 이 시각까지 태그 뜻 추정 번역은 쉼 (429 받은 뒤)

    def _bind(self):
        self.folder = cofoty5_store.shared_dir(self.home)
        self.dict_dir = os.path.join(self.folder, "dict")
        os.makedirs(self.dict_dir, exist_ok=True)
        self.user_path = os.path.join(self.folder, "user_dict.json")
        self.cache_path = os.path.join(self.folder, "translate_cache.json")
        self.user = _load_json(self.user_path, {})          # key -> korean label
        self.cache = _load_json(self.cache_path, {"en>ko": {}, "ko>en": {}})

    def _save_cache(self):
        with cofoty5_store.FILE_LOCK:
            disk = _load_json(self.cache_path, {"en>ko": {}, "ko>en": {}})
            for k in ("en>ko", "ko>en"):
                d = disk.setdefault(k, {})
                d.update(self.cache.get(k, {}))
                self.cache[k] = d
            _save_json(self.cache_path, disk)

    def relocate(self):
        """저장 폴더가 바뀐 뒤: 새 폴더의 사전 · 고친 한글 뜻 · 번역 저장을 다시 읽음"""
        if self.state.get("downloading"):
            return
        with self.lock:
            self._bind()
            self.entries, self.ranked = {}, []
            self.state.update({"loaded": False, "loading": False, "count": 0, "files": [], "error": ""})
        self.ensure_loaded(True)

    # ---------------- loading ----------------
    def csv_files(self):
        return sorted(glob.glob(os.path.join(self.dict_dir, "*.csv")))

    def ensure_loaded(self, background=True):
        with self.lock:
            if self.state["loaded"] or self.state["loading"] or not self.csv_files():
                return
            self.state["loading"] = True
        if background:
            threading.Thread(target=self._load, daemon=True).start()
        else:
            self._load()

    def _load(self):
        entries = {}
        try:
            files = self.csv_files()
            for path in files:
                with open(path, "r", encoding="utf-8-sig", newline="") as f:
                    for row in csv.reader(f):
                        if len(row) < 4:
                            continue
                        tag, cat, cnt, desc = row[0], row[1].strip(), row[2], row[3]
                        try:
                            count = int(float(cnt))
                        except ValueError:
                            continue  # header or junk
                        if count < MIN_COUNT.get(cat, 20):
                            continue
                        key = norm_key(tag)
                        if key in entries and entries[key]["count"] >= count:
                            continue
                        d = parse_desc(desc)
                        entries[key] = {"tag": key, "cat": CAT_NAMES.get(cat, cat), "count": count,
                                        "ko": d["short"], "path": d["path"], "desc": d["desc"],
                                        "kw": d["kw"], "s": "|".join([key] + d["kw"] + [d["short"].lower()])}
            ranked = sorted(entries.values(), key=lambda e: -e["count"])
            with self.lock:
                self.entries, self.ranked = entries, ranked
                self.state.update(loaded=True, loading=False, count=len(entries),
                                  files=[os.path.basename(p) for p in files], error="")
        except Exception as e:
            with self.lock:
                self.state.update(loading=False, error=f"사전 읽기 실패: {e}")

    def status(self):
        self.ensure_loaded()
        with self.lock:
            return dict(self.state)

    # ---------------- download ----------------
    def start_download(self):
        with self.lock:
            if self.state["downloading"]:
                return
            self.state.update(downloading=True, progress=0.0, error="")
        threading.Thread(target=self._download, daemon=True).start()

    @staticmethod
    def pick_files(names):
        """Prefer the single combined file; fall back to general + meta."""
        def latest(pattern):
            found = sorted(n for n in names if re.fullmatch(pattern, n))
            return found[-1] if found else None
        combined = latest(r"danbooru-tags-kr-\d{4}-\d{2}-\d{2}\.csv")
        if combined:
            return [combined]
        return [f for f in (latest(r"danbooru-tags-general-kr-\d{4}-\d{2}-\d{2}\.csv"),
                            latest(r"danbooru-tags-meta-kr-\d{4}-\d{2}-\d{2}\.csv")) if f]

    def _download(self):
        try:
            body, _ = http_get(HF_API, timeout=20)
            info = json.loads(body.decode("utf-8"))
            names = [s.get("rfilename", "") for s in info.get("siblings", [])]
            files = self.pick_files(names)
            if not files:
                raise RuntimeError("사전 파일을 찾지 못했습니다")
            done = []
            for i, name in enumerate(files):
                url = HF_FILE.format(name=urllib.parse.quote(name))
                tmp = os.path.join(self.dict_dir, name + ".part")
                got = 0
                with open(tmp, "wb") as f:
                    for chunk, total in http_stream(url):
                        f.write(chunk)
                        got += len(chunk)
                        if total:
                            with self.lock:
                                self.state["progress"] = round((i + got / total) / len(files), 3)
                os.replace(tmp, os.path.join(self.dict_dir, name))
                done.append(name)
            for old in self.csv_files():
                if os.path.basename(old) not in done:
                    os.remove(old)
            with self.lock:
                self.state.update(downloading=False, progress=1.0, loaded=False, loading=False)
            self.ensure_loaded(background=False)
        except Exception as e:
            print(f"[PromptComposer] 사전 받기 실패: {e!r}")
            with self.lock:
                self.state.update(downloading=False, error=f"사전 받기 실패: {_short_err(e)}")

    # ---------------- translate ----------------
    def _gt_get(self, url):
        with self._gt_lock:
            wait = self._gt_last + GT_GAP - time.time()
            if wait > 0:
                time.sleep(wait)
            try:
                return http_get(url, timeout=8)
            finally:
                self._gt_last = time.time()

    def _google(self, texts, sl, tl, important=False):
        def main(q):
            body, _ = self._gt_get(GT_URL.format(sl=sl, tl=tl, q=urllib.parse.quote(q)))
            data = json.loads(body.decode("utf-8"))
            return "".join(seg[0] for seg in data[0] if seg and seg[0])

        def alt(q):
            body, _ = self._gt_get(GT_URL2.format(sl=sl, tl=tl, q=urllib.parse.quote(q)))
            r = _first_str(json.loads(body.decode("utf-8")))
            if not r:
                raise ValueError("다른 주소 응답을 읽지 못함")
            return r

        def one(q):
            try:
                return main(q)
            except Exception as e:
                if not _is_limited(e):
                    raise
                self.tr_block_until = time.time() + GT_COOLDOWN
                print(f"[PromptComposer] 구글 번역 429(요청 과다) — {GT_COOLDOWN}초 동안 태그 뜻 추정 번역을 쉽니다")
                if not important:
                    raise
                try:
                    return alt(q)            # 실행용(한글→영어)만: 다른 주소로 한 번
                except Exception as e2:
                    print(f"[PromptComposer] 다른 주소도 실패: {e2!r}")
                time.sleep(2.5)
                return main(q)               # 잠깐 쉬고 한 번 더

        out = []
        for i in range(0, len(texts), 30):
            part = texts[i:i + 30]
            lines = [s.strip() for s in one("\n".join(part)).split("\n")]
            if len(lines) != len(part):  # 줄 수가 안 맞으면 하나씩 (너무 많으면 앞쪽만 — 나머지는 다음에)
                out += [one(t).strip() for t in part[:GT_PER_ITEM_MAX]]
                break
            out += lines
        return out

    def translate(self, texts, direction):
        """direction: 'en>ko' or 'ko>en'. Cached. Returns {text: result}.
        ko>en(실행에 쓰는 번역)은 중요 — 429 때도 다른 주소·재시도. en>ko(태그 뜻 추정)는 429 뒤 잠시 쉼."""
        bucket = self.cache.setdefault(direction, {})
        need = [t for t in dict.fromkeys(texts) if t and t not in bucket]
        important = direction == "ko>en"
        if need and not important and time.time() < self.tr_block_until:
            need = []  # 쉬는 중: 저장된 것만 돌려줌
        if need:
            sl, tl = direction.split(">")
            try:
                res = self._google(need, sl, tl, important=important)
                for t, r in zip(need, res):
                    bucket[t] = r
                self._save_cache()
                with self.lock:
                    self.state.update(tr_ok=True, tr_error="")
            except Exception as e:
                print(f"[PromptComposer] 구글 번역 실패: {e!r}")
                with self.lock:
                    self.state.update(tr_ok=False, tr_error=_short_err(e))
        return {t: bucket[t] for t in texts if t in bucket}

    # ---------------- lookup / suggest ----------------
    def lookup(self, tags, translate=True):
        self.ensure_loaded()
        out, missing = {}, []
        for raw in tags:
            key = norm_key(raw)
            if not key or key in out:
                continue
            e = self.entries.get(key)
            if e:
                out[key] = {k: e[k] for k in ("tag", "cat", "count", "ko", "path", "desc")}
            else:
                out[key] = {"tag": key, "unknown": True, "ko": ""}
                missing.append(key)
            if key in self.user:
                out[key]["ko"] = self.user[key]
                out[key]["user"] = True
        if self.state["loading"]:
            translate = False  # dictionary still loading — don't spend translations on tags it will know
        if translate and missing:
            tr = self.translate([m for m in missing if m not in self.user and not HANGUL.search(m)], "en>ko")
            for k, v in tr.items():
                if k in out and not out[k].get("user"):
                    out[k]["ko"] = v
                    out[k]["guess"] = True
        return out

    def suggest(self, q, limit=12):
        self.ensure_loaded()
        q = q.strip().lower()
        if not q:
            return []
        qk = norm_key(q)
        is_ko = bool(HANGUL.search(q))
        scored = []
        for e in self.ranked:
            s = e["s"]
            if qk not in s:
                continue
            if not is_ko:
                if e["tag"] == qk:
                    sc = 5
                elif e["tag"].startswith(qk):
                    sc = 4
                elif (" " + qk) in (" " + e["tag"]):
                    sc = 3
                else:
                    continue
            else:
                if e["ko"].lower() == q:
                    sc = 5
                elif q in e["kw"]:
                    sc = 4
                elif e["ko"].lower().startswith(q):
                    sc = 3
                else:
                    sc = 2
            scored.append((sc, e))
            if len(scored) > 400:
                break
        scored.sort(key=lambda x: (-x[0], -x[1]["count"]))
        res = []
        for sc, e in scored[:limit]:
            res.append({"tag": e["tag"], "ko": self.user.get(e["tag"], e["ko"]), "count": e["count"],
                        "cat": e["cat"], "desc": e["desc"], "exact": sc >= 4})
        # user dictionary entries match too
        for k, v in self.user.items():
            if q in v.lower() and all(r["tag"] != k for r in res):
                res.insert(0, {"tag": k, "ko": v, "count": self.entries.get(k, {}).get("count", 0),
                               "cat": "내 사전", "desc": "", "exact": v.lower() == q})
        return res[:limit]

    def selftest(self):
        """Check each network path separately and report in plain words."""
        res = {}
        try:
            import requests  # noqa: F401
            res["lib"] = "requests 사용"
        except ImportError:
            try:
                import certifi  # noqa: F401
                res["lib"] = "urllib + certifi 사용"
            except ImportError:
                res["lib"] = "urllib (certifi 없음)"
        try:
            r = self._google(["smile"], "en", "ko")[0]
            res["google"] = f"정상 (smile → {r})"
            with self.lock:
                self.state.update(tr_ok=True, tr_error="")
        except Exception as e:
            res["google"] = "실패: " + _short_err(e)
            print(f"[PromptComposer] 번역 점검 실패: {e!r}")
        try:
            http_get(HF_API, timeout=15)
            res["hf"] = "정상"
        except Exception as e:
            res["hf"] = "실패: " + _short_err(e)
            print(f"[PromptComposer] 사전 서버 점검 실패: {e!r}")
        st = self.status()
        res["dict"] = (f"{st['count']:,}개 읽음" if st["loaded"] else
                       "읽는 중" if st["loading"] else
                       "dict 폴더에 사전 파일 없음" if not self.csv_files() else (st["error"] or "읽지 않음"))
        res["folder"] = self.dict_dir
        return res

    def set_user(self, tag, ko):
        key = norm_key(tag)
        if not key:
            return
        if ko and ko.strip():
            self.user[key] = ko.strip()
        else:
            self.user.pop(key, None)
        with cofoty5_store.FILE_LOCK:   # 다른 노드팩이 같은 폴더에 쓴 내용을 지우지 않도록 다시 읽고 합쳐서 저장
            disk = _load_json(self.user_path, {})
            if ko and ko.strip():
                disk[key] = ko.strip()
            else:
                disk.pop(key, None)
            _save_json(self.user_path, disk)
            self.user = disk
