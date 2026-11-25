"""LoRA metadata + saved LoRA sets (LoRA 공통 규격 v2). No ComfyUI imports.

(LORA_CORE_VERSION으로 규격 버전을 표시)

Sources, in priority order:
  keywords : user edits  >  Civitai info (trainedWords / activation text)  >  modelspec.trigger_phrase
             >  most frequent training tags in the safetensors header (marked as a guess)
  preview  : <name>.preview.png|jpg|webp, <name>.png|jpg|webp, metadata "preview_url"
  base     : Civitai baseModel  >  ss_base_model_version / modelspec.architecture
"""
import hashlib
import json
import os
import re
import shutil
import sys as _sys
import threading

IMG_EXTS = (".preview.png", ".preview.jpg", ".preview.jpeg", ".preview.webp", ".preview.gif",
            ".png", ".jpg", ".jpeg", ".webp", ".gif", ".thumb.jpg", ".thumb.png")
VID_EXTS = (".preview.mp4", ".preview.webm", ".mp4", ".webm")
INFO_EXTS = (".metadata.json", ".civitai.info", ".info", ".json")
GENERIC = {"1girl", "1boy", "solo", "looking at viewer", "simple background", "white background", "smile", "blush",
           "open mouth", "long hair", "short hair", "breasts", "highres", "absurdres", "multiple girls", "2girls",
           "upper body", "full body", "closed mouth", "standing", "monochrome", "greyscale", "outdoors", "indoors",
           "day", "sky", "cloud", "masterpiece", "best quality", "male focus", "1other", "holding", "shirt"}


def _stem(path):
    for ext in (".safetensors", ".ckpt", ".pt", ".bin", ".pth"):
        if path.lower().endswith(ext):
            return path[: -len(ext)]
    return os.path.splitext(path)[0]


def read_safetensors_meta(path):
    try:
        with open(path, "rb") as f:
            n = int.from_bytes(f.read(8), "little")
            if n <= 0 or n > 64 * 1024 * 1024:
                return {}
            header = json.loads(f.read(n).decode("utf-8", errors="replace"))
        meta = header.get("__metadata__") or {}
        return meta if isinstance(meta, dict) else {}
    except Exception:
        return {}


def _find_key(obj, keys, depth=0):
    """Return the first value for any of `keys` anywhere in a nested JSON object."""
    if depth > 6:
        return None
    if isinstance(obj, dict):
        for k in keys:
            if k in obj and obj[k]:
                return obj[k]
        for v in obj.values():
            r = _find_key(v, keys, depth + 1)
            if r:
                return r
    elif isinstance(obj, list):
        for v in obj[:20]:
            r = _find_key(v, keys, depth + 1)
            if r:
                return r
    return None


def _split_words(v):
    items = v if isinstance(v, list) else [v]
    out = []
    for it in items:
        for w in re.split(r"[,\n]", str(it)):
            w = w.strip().strip(",")
            if w and w not in out:
                out.append(w)
    return out


def _base_name(s):
    s = str(s or "").lower()
    for key, name in (("illustrious", "Illustrious"), ("noob", "NoobAI"), ("pony", "Pony"), ("flux", "Flux"),
                      ("sd3", "SD3"), ("sdxl", "SDXL"), ("xl", "SDXL"), ("v2", "SD2"), ("sd_v1", "SD1.5"),
                      ("1.5", "SD1.5"), ("v1", "SD1.5"), ("anima", "Anima"), ("cosmos", "Anima")):
        if key in s:
            return name
    return ""


def describe(path):
    """Collect metadata for one LoRA file."""
    stem = _stem(path)
    folder = os.path.dirname(path)
    info = {}
    for ext in INFO_EXTS:
        p = stem + ext
        if os.path.isfile(p):
            try:
                with open(p, "r", encoding="utf-8-sig") as f:
                    info = json.load(f)
                break
            except Exception:
                pass
    meta = read_safetensors_meta(path) if path.lower().endswith(".safetensors") else {}

    words, guess = [], False
    tw = _find_key(info, ("trainedWords", "trained_words", "activation text", "activation_text"))
    if tw:
        words = _split_words(tw)
    elif meta.get("modelspec.trigger_phrase"):
        words = _split_words(meta["modelspec.trigger_phrase"])
    elif meta.get("ss_tag_frequency"):
        try:
            freq = json.loads(meta["ss_tag_frequency"])
            agg = {}
            for d in freq.values():
                for t, c in d.items():
                    t = t.strip().replace("_", " ")
                    agg[t] = agg.get(t, 0) + int(c)
            words = [t for t, _ in sorted(agg.items(), key=lambda x: -x[1]) if t.lower() not in GENERIC][:6]
            guess = True
        except Exception:
            pass

    preview = ""
    for ext in IMG_EXTS + VID_EXTS:   # still images first; animated previews are usually mp4/webm
        if os.path.isfile(stem + ext):
            preview = stem + ext
            break
    if not preview:
        pu = _find_key(info, ("preview_url", "preview"))
        if isinstance(pu, str) and not pu.startswith("http"):
            cand = pu if os.path.isabs(pu) else os.path.join(folder, pu)
            if os.path.isfile(cand):
                preview = cand
    kind = "video" if preview.lower().endswith((".mp4", ".webm")) else ("image" if preview else "")

    desc = _find_key(info, ("description",)) or ""
    if not isinstance(desc, str):
        desc = ""
    if isinstance(info.get("model"), dict) and isinstance(info["model"].get("description"), str):
        desc = info["model"]["description"] or desc
    import html as _html
    desc = re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", " ", desc))).strip()[:400]

    base = _base_name(_find_key(info, ("baseModel", "base_model")) or "") or \
        _base_name(meta.get("ss_base_model_version", "")) or _base_name(meta.get("modelspec.architecture", ""))
    title = _find_key(info, ("model_name",))
    if not isinstance(title, str) and isinstance(info.get("model"), dict):
        title = info["model"].get("name")
    tags = _find_key(info, ("tags",))   # Civitai 모델 태그 (style · artist · character …)
    tags = [str(t).strip().lower() for t in (tags if isinstance(tags, list) else []) if isinstance(t, (str, int))][:30]
    return {"keywords": words, "guess": guess, "preview": preview, "kind": kind, "base": base,
            "title": title if isinstance(title, str) else "", "desc": desc, "tags": tags}


LORA_CORE_VERSION = "2.1.0"
SCHEMA = 2
SET_TYPES = ("anima", "xl", "sd15")
SETS_FILE, USER_FILE, CFG_FILE = "lora_sets.json", "lora_user.json", "lora_store.json"

# 공용 저장 폴더 · 잠금은 cofoty5_store에서 (두 팩이 같은 폴더를 쓸 때 저장이 겹치지 않게 한 프로세스 안에서 같은 잠금을 씀)
from . import cofoty5_store
FILE_LOCK = cofoty5_store.FILE_LOCK


def _load(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def _save(path, data):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


# ---------------------------------------------------------------- 모델 계열 (화면의 loraFam과 같은 규칙)
BASE_FAM = {"Anima": "anima", "Illustrious": "xl", "NoobAI": "xl", "SDXL": "xl", "Pony": "xl",
            "SD1.5": "sd15", "SD2": "sd15", "Flux": "other", "SD3": "other"}
_RE_AN = re.compile(r"anima|cosmos")
_RE_XL = re.compile(r"(^|[^a-z])(il|ill|illu|illustrious|noob|noobai|sdxl|xl|pony)([^a-z]|$)")
_RE_15 = re.compile(r"(^|[^a-z0-9])(sd ?1\.?5|sd15)([^0-9]|$)")


def lora_family(name, base=""):
    """anima / xl / sd15 / other, 모르면 \"\""""
    if base and base in BASE_FAM:
        return BASE_FAM[base]
    s = str(name or "").replace("\\", "/").lower()
    if _RE_AN.search(s):
        return "anima"
    if _RE_XL.search(s):
        return "xl"
    if _RE_15.search(s):
        return "sd15"
    return ""


def _clean_loras(v):
    return [{"name": str(x.get("name", "")), "strength": round(float(x.get("strength", 1)), 3), "on": bool(x.get("on", True))}
            for x in (v if isinstance(v, list) else []) if isinstance(x, dict) and x.get("name")]


def _clean_name(k):
    return str(k or "").strip()[:40]


def pick_folder_dialog(start=""):
    """ComfyUI가 도는 PC에서 폴더 고르기 창을 띄움. 고르면 경로, 취소하면 \"\", 띄울 수 없으면 None"""
    import subprocess
    if _sys.platform.startswith("win"):
        start = (start or "").replace("'", "''")
        # 보이지 않는 작은 맨 위 창을 먼저 띄워 두고 그 위에 폴더 창을 엶 (그냥 열면 브라우저 뒤에 숨어서 안 보임)
        ps = ("$ErrorActionPreference='Stop';"
              "try{"
              "Add-Type -AssemblyName System.Windows.Forms;"
              "$o=New-Object System.Windows.Forms.Form;$o.TopMost=$true;$o.ShowInTaskbar=$false;$o.StartPosition='CenterScreen';"
              "$o.Opacity=0;$o.Width=1;$o.Height=1;$o.Show();$o.Activate();"
              "$f=New-Object System.Windows.Forms.FolderBrowserDialog;"
              "$f.Description='LoRA 세트를 저장할 폴더';$f.ShowNewFolderButton=$true;"
              f"if('{start}' -and (Test-Path '{start}')){{$f.SelectedPath='{start}'}};"
              "$r=$f.ShowDialog($o);$o.Close();"
              "if($r -eq 'OK'){[Console]::OutputEncoding=[Text.Encoding]::UTF8;Write-Output $f.SelectedPath}"
              "}catch{[Console]::Error.WriteLine($_.Exception.Message);exit 1}")
        try:
            r = subprocess.run(["powershell", "-NoProfile", "-STA", "-Command", ps], capture_output=True, timeout=600,
                               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            if r.returncode != 0:
                print("[CoFoTy5 LoRA] 폴더 고르기 창 오류:", r.stderr.decode("utf-8", errors="replace").strip()[:300])
                return None
            return r.stdout.decode("utf-8", errors="replace").strip()
        except Exception as e:
            print("[CoFoTy5 LoRA] 폴더 고르기 창을 띄우지 못함:", e)
            return None
    try:
        import tkinter
        from tkinter import filedialog
        root = tkinter.Tk(); root.withdraw(); root.attributes("-topmost", True)
        p = filedialog.askdirectory(initialdir=start or None, title="LoRA 세트를 저장할 폴더")
        root.destroy()
        return p or ""
    except Exception:
        return None


class LoraLibrary:
    """Metadata cache + user keyword overrides + saved LoRA sets.

    저장 폴더: cofoty5_store 참고 — 팩 폴더의 lora_store.json {"folder": "..."} 이 가리키는 곳 (없으면 이 ComfyUI의 user\\cofoty5).
      lora_sets.json : {"version": 2, "sets": {이름: [LoRA…]}, "types": {이름: anima|xl|sd15}, "prompts": {이름: "로라 프롬프트"}, "models": {이름: "저장할 때 쓰던 모델 파일"}}
      lora_user.json : LoRA마다 직접 고친 키워드
    두 팩이 같은 폴더를 가리키면 세트·키워드를 같이 씀. 저장은 세트 하나 단위(파일을 다시 읽고 합쳐서 씀).
    """

    def __init__(self, folder, list_fn, path_fn):
        self.home = folder              # 팩 폴더 (설정 파일 · 기본 저장 위치)
        self.list_fn = list_fn          # () -> ["sub/name.safetensors", ...]
        self.path_fn = path_fn          # name -> full path or None
        self.cache = {}                 # name -> (mtime, describe())
        self.lock = threading.Lock()

    # ---------- 저장 위치 ----------
    @property
    def cfg_path(self):
        return cofoty5_store.cfg_path(self.home)

    @property
    def folder(self):
        return cofoty5_store.shared_dir(self.home)

    @property
    def user_path(self):
        return os.path.join(self.folder, USER_FILE)

    @property
    def sets_path(self):
        return os.path.join(self.folder, SETS_FILE)

    def folder_info(self):
        f = self.folder
        return {"folder": f, "default": cofoty5_store.default_dir(), "pack": self.home,
                "is_default": os.path.normcase(f) == os.path.normcase(cofoty5_store.default_dir()),
                "exists": os.path.isfile(os.path.join(f, SETS_FILE)), "version": LORA_CORE_VERSION}

    def set_folder(self, path):
        """저장 위치 바꾸기 (LoRA 세트 · 키워드 · 태그 사전 · 고친 한글 뜻이 함께 옮겨감).
        새 폴더에 파일이 있으면 그것을 쓰고, 없는 파일만 지금 폴더에서 복사 (덮어쓰지 않음)."""
        copied = cofoty5_store.set_folder(self.home, path)
        info = self.folder_info()
        info["copied"] = copied
        return info

    # ---------- LoRA 목록 ----------
    def _meta(self, name):
        path = self.path_fn(name)
        if not path or not os.path.isfile(path):
            return None
        mt = os.path.getmtime(path)
        with self.lock:
            hit = self.cache.get(name)
        if hit and hit[0] == mt:
            return hit[1]
        d = describe(path)
        with self.lock:
            self.cache[name] = (mt, d)
        return d

    def listing(self):
        user = _load(self.user_path, {})
        names = list(self.list_fn())
        # 폴더를 옮긴 LoRA도 예전에 고친 키워드를 그대로 쓰도록 (파일 이름으로 찾음)
        by_file = {os.path.basename(k.replace("\\", "/")).lower(): v for k, v in user.items() if k not in names}
        out = []
        for name in names:
            d = self._meta(name) or {"keywords": [], "guess": False, "preview": "", "kind": "", "base": "", "title": "", "desc": "", "tags": []}
            u = user.get(name) or by_file.get(os.path.basename(name.replace("\\", "/")).lower(), {})
            kws = u.get("keywords") if isinstance(u.get("keywords"), list) else d["keywords"]
            disp = os.path.splitext(os.path.basename(name))[0]
            out.append({"name": name, "label": disp, "folder": os.path.dirname(name).replace("\\", "/"),
                        "keywords": kws, "guess": d["guess"] and "keywords" not in u, "user": "keywords" in u,
                        "has_preview": bool(d["preview"]), "kind": d.get("kind", ""), "base": d["base"],
                        "fam": lora_family(name, d["base"]),
                        "title": d["title"], "desc": d.get("desc", ""), "tags": d.get("tags", [])})
        return out

    def preview_path(self, name):
        if name not in set(self.list_fn()):
            return None
        d = self._meta(name)
        return d["preview"] if d and d["preview"] else None

    def set_keywords(self, name, keywords):
        with FILE_LOCK:
            user = _load(self.user_path, {})
            if keywords is None:
                user.pop(name, None)
            else:
                user.setdefault(name, {})["keywords"] = _split_words(keywords)
            _save(self.user_path, user)

    # ---------- 세트 ----------
    def _fam_of(self, name):
        d = None
        try:
            d = self._meta(name)
        except Exception:
            pass
        return lora_family(name, (d or {}).get("base", ""))

    def _guess_type(self, loras, old=""):
        """종류 기록이 없거나 예전 값(ckpt)일 때 들어 있는 LoRA를 보고 anima / xl / sd15. 끝내 모르면 "" (모든 모델에서 보임)"""
        if old in SET_TYPES:
            return old
        fams = {self._fam_of(x["name"]) for x in loras}
        if old == "ckpt":
            return "sd15" if "sd15" in fams and "xl" not in fams else "xl"
        for t in ("anima", "xl", "sd15"):
            if t in fams:
                return t
        return ""

    def _read(self):
        raw = _load(self.sets_path, {})
        raw = raw if isinstance(raw, dict) else {}
        sets = {}
        for k, v in (raw.get("sets") or {}).items():
            k = _clean_name(k)
            if k and isinstance(v, list):
                sets[k] = _clean_loras(v)
        tys0 = raw.get("types") if isinstance(raw.get("types"), dict) else {}
        prs0 = raw.get("prompts") if isinstance(raw.get("prompts"), dict) else {}
        mds0 = raw.get("models") if isinstance(raw.get("models"), dict) else {}
        types, prompts, models = {}, {}, {}
        for k, v in sets.items():
            t = tys0.get(k)
            types[k] = self._guess_type(v, t if isinstance(t, str) else "")
            p = prs0.get(k)
            if isinstance(p, str) and p.strip():
                prompts[k] = p
            m = mds0.get(k)  # 세트를 저장할 때 쓰던 모델(체크포인트) 파일 이름
            if isinstance(m, str) and m.strip():
                models[k] = m.strip()[:300]
        # ★ 고정 · 목록에서 숨김 (세트 편집 창)
        stars = [k for k in (raw.get("stars") or []) if k in sets]
        hidden = [k for k in (raw.get("hidden") or []) if k in sets]
        return {"sets": sets, "types": types, "prompts": prompts, "models": models, "stars": stars, "hidden": hidden}

    def _write(self, d):
        _save(self.sets_path, {"version": SCHEMA, "sets": d["sets"],
                               "types": {k: d["types"][k] for k in d["sets"] if d["types"].get(k) in SET_TYPES},
                               "prompts": {k: d["prompts"][k] for k in d["sets"] if d["prompts"].get(k)},
                               "models": {k: d["models"][k] for k in d["sets"] if d.get("models", {}).get(k)},
                               "stars": [k for k in d.get("stars", []) if k in d["sets"]],
                               "hidden": [k for k in d.get("hidden", []) if k in d["sets"]]})

    def flag_set(self, name, flag, on):
        """세트에 ★ 고정(flag=stars) · 숨김(flag=hidden) 켜기/끄기"""
        name = _clean_name(name)
        if flag not in ("stars", "hidden"):
            raise ValueError("알 수 없는 표시")
        with FILE_LOCK:
            d = self._read()
            if name in d["sets"]:
                cur = [k for k in d[flag] if k != name]
                if on:
                    cur.append(name)
                d[flag] = cur
                self._write(d)
        return self.store()

    def store(self):
        """화면에 줄 전체: {sets, types, prompts, folder…}. 옮긴 LoRA는 지금 위치로."""
        with FILE_LOCK:
            d = self._read()
        try:
            from .lora_paths import resolve_lora
            names = list(self.list_fn())
            for v in d["sets"].values():
                for x in v:
                    x["name"] = resolve_lora(x["name"], names) or x["name"]
        except Exception:
            pass
        d.update(self.folder_info())
        d["thumbs"] = self.thumbs(d["sets"].keys())
        d["order"] = list(d["sets"].keys())  # 등록순 (파일에 적힌 순서)
        return d

    def put_set(self, name, loras, type_=None, prompt=None, model=None):
        """세트 하나 저장/수정. prompt=None 이면 예전 프롬프트 유지, \"\" 이면 지움. model 도 같은 규칙(저장할 때 쓰던 모델 이름)."""
        name = _clean_name(name)
        if not name:
            raise ValueError("세트 이름이 비었습니다")
        with FILE_LOCK:
            d = self._read()
            L = _clean_loras(loras)
            d["sets"][name] = L
            d["types"][name] = type_ if type_ in SET_TYPES else self._guess_type(L, d["types"].get(name, ""))
            if prompt is not None:
                d["prompts"][name] = str(prompt)
            if model is not None:
                if str(model).strip():
                    d["models"][name] = str(model).strip()[:300]
                else:
                    d["models"].pop(name, None)
            self._write(d)
        return self.store()

    def delete_set(self, name):
        name = _clean_name(name)
        with FILE_LOCK:
            d = self._read()
            for k in ("sets", "types", "prompts", "models"):
                d[k].pop(name, None)
            self._write(d)
            shutil.rmtree(self.img_dir(name), ignore_errors=True)
        return self.store()

    # ---------- 세트에 붙인 그림 (set_images/<이름>_<해시>/ : 원본 복사 + thumb.webp) ----------
    def img_dir(self, name):
        name = _clean_name(name)
        safe = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", name).strip(" .") or "set"
        return os.path.join(self.folder, "set_images", f"{safe[:30]}_{hashlib.sha1(name.encode('utf-8')).hexdigest()[:6]}")

    THUMB_PX = 1024

    def _make_thumb(self, d):
        """폴더 안 첫 원본으로 thumb.webp (긴 변 1024px)"""
        src = sorted(f for f in os.listdir(d) if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")) and not f.startswith("thumb"))
        if not src:
            return None
        from PIL import Image
        out = os.path.join(d, "thumb.webp")
        with Image.open(os.path.join(d, src[0])) as im:
            im = im.convert("RGB")
            im.thumbnail((self.THUMB_PX, self.THUMB_PX))
            im.save(out, "WEBP", quality=86)
        return out

    def thumb_path(self, name):
        d = self.img_dir(name)
        p = os.path.join(d, "thumb.webp")
        try:
            if os.path.isfile(p):
                from PIL import Image
                with Image.open(p) as im:
                    small = max(im.size) < 700  # 예전(400px) 미리보기 → 크게 다시
                if not small:
                    return p
            if os.path.isdir(d):
                return self._make_thumb(d)
        except Exception as e:
            print(f"[CoFoTy5] 세트 미리보기를 못 만들었습니다: {e}")
            return p if os.path.isfile(p) else None
        return None

    def thumbs(self, names):
        out = {}
        for k in names:
            p = os.path.join(self.img_dir(k), "thumb.webp")
            try:
                out[k] = int(os.path.getmtime(p))
            except OSError:
                pass
        return out

    def upload_image(self, name, raw):
        """세트에 그림 한 장 올리기 (파일 · 붙여넣기). 맨 앞(00_)에 두어 그 그림이 미리보기가 됨. 예전에 올린 그림은 바꿈."""
        import io
        import time as _t
        from PIL import Image
        name = _clean_name(name)
        with FILE_LOCK:
            if name not in self._read()["sets"]:
                raise ValueError(f"세트가 없습니다: {name}")
        try:
            with Image.open(io.BytesIO(raw)) as im:  # 그림이 맞는지 확인
                im.load()
                fmt = (im.format or "PNG").lower()
        except Exception:
            raise ValueError("그림 파일을 읽지 못했습니다 (PNG · JPG · WEBP를 넣어 주세요)")
        ext = {"jpeg": ".jpg", "png": ".png", "webp": ".webp"}.get(fmt)
        d = self.img_dir(name)
        os.makedirs(d, exist_ok=True)
        for f in os.listdir(d):
            if f.startswith("00_upload"):
                os.remove(os.path.join(d, f))
        if ext:
            with open(os.path.join(d, f"00_upload_{int(_t.time())}{ext}"), "wb") as f:
                f.write(raw)
        else:  # gif · bmp 등은 png로
            with Image.open(io.BytesIO(raw)) as im:
                im.convert("RGB").save(os.path.join(d, f"00_upload_{int(_t.time())}.png"))
        if not os.path.isfile(os.path.join(d, "set.txt")):
            with open(os.path.join(d, "set.txt"), "w", encoding="utf-8") as f:
                f.write(name + "\n")
        self._make_thumb(d)
        return d

    def attach_images(self, name, paths):
        """세트에 그림을 붙임 (있던 그림은 바꿈). paths: 실제 파일 경로들. 첫 장으로 미리보기(thumb.webp)를 만듦."""
        name = _clean_name(name)
        if not name:
            raise ValueError("세트 이름이 비었습니다")
        paths = [p for p in paths if p and os.path.isfile(p)][:8]
        if not paths:
            raise ValueError("붙일 그림을 찾지 못했습니다")
        d = self.img_dir(name)
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d, exist_ok=True)
        kept = []
        for i, p in enumerate(paths):
            dst = os.path.join(d, f"{i + 1:02d}_" + os.path.basename(p))
            shutil.copy2(p, dst)
            kept.append(dst)
        try:
            self._make_thumb(d)
        except Exception as e:
            print(f"[CoFoTy5] 세트 미리보기를 못 만들었습니다: {e}")
        with open(os.path.join(d, "set.txt"), "w", encoding="utf-8") as f:
            f.write(name + "\n")
        return {"name": name, "count": len(kept), "folder": d}

    def rename_set(self, old, new):
        old, new = _clean_name(old), _clean_name(new)
        with FILE_LOCK:
            d = self._read()
            if old in d["sets"] and new and new not in d["sets"]:
                for k in ("sets", "types", "prompts", "models"):
                    if old in d[k]:
                        d[k][new] = d[k].pop(old)
                for k in ("stars", "hidden"):
                    d[k] = [new if x == old else x for x in d[k]]
                self._write(d)
                if os.path.isdir(self.img_dir(old)):
                    try:
                        shutil.move(self.img_dir(old), self.img_dir(new))
                    except OSError:
                        pass
        return self.store()

    # ---------- 예전 방식 (전체를 한 번에 보내던 화면) — 보낸 것만 반영, 프롬프트·종류는 보존 ----------
    def get_sets(self):
        return self.store()["sets"]

    def get_set_types(self):
        return self.store()["types"]

    def save_sets(self, sets, types=None):
        with FILE_LOCK:
            d = self._read()
            new = {}
            for k, v in (sets or {}).items():
                k = _clean_name(k)
                if k and isinstance(v, list):
                    new[k] = _clean_loras(v)
            tys = types if isinstance(types, dict) else {}
            out = {"sets": new, "types": {}, "prompts": {}, "models": {}}
            for k, v in new.items():
                t = tys.get(k)
                out["types"][k] = self._guess_type(v, t) if t else (d["types"].get(k) or self._guess_type(v))
                if d["prompts"].get(k):
                    out["prompts"][k] = d["prompts"][k]
                if d["models"].get(k):
                    out["models"][k] = d["models"][k]
            self._write(out)
        return self.get_sets()
