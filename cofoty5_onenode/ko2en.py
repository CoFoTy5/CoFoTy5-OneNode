"""
cofoty5_onenode - 한글 → 영어 (ko2en.py)

프롬프트를 쉼표로 나눠, 한글이 들어간 조각만 바꿉니다. 영어 태그는 그대로 둡니다.
1) 단어 하나짜리(웃음, 금발, 교복 …)는 Danbooru 한국어 사전(chiharoong/danbooru-tags-kr, MIT)에서 정확한 태그로
2) 사전에 없거나 문장이면 구글 번역(무료 · 비공식 주소)으로 영어 문장
   Anima는 영어 문장도 잘 알아들어서 문장 번역도 쓸 만합니다.
가중치 (웃음:1.2) 는 괄호와 숫자를 살린 채 안쪽만 바꿉니다.

to_korean: 반대로 영어 → 한글 (한글로 잠깐 보기). 보여주기만 하고 프롬프트는 바꾸지 않으므로
영→한→영으로 원문이 바뀌는 일이 없습니다.
"""
import os
import re
import threading

from .tagdict import TagDict, HANGUL, norm_key

HERE = os.path.dirname(os.path.abspath(__file__))
_dict = TagDict(HERE)

_ko_index = {"n": -1, "map": {}}
_ko_lock = threading.Lock()
WEIGHT_RE = re.compile(r"^\((.+):\s*(-?[\d.]+)\)$", re.S)


def status():
    st = _dict.status() or {}
    st["has_dict"] = bool(_dict.csv_files())
    return st


def download_dict():
    _dict.start_download()
    return status()


def _index():
    """한국어 이름·키워드 → 태그 (같은 말이면 '일반' 분류, 많이 쓰인 태그 우선)"""
    _dict.ensure_loaded(background=False)
    ents = _dict.entries
    with _ko_lock:
        if _ko_index["n"] == len(ents):
            return _ko_index["map"]
        m = {}
        for e in ents.values():
            score = (1 if e.get("cat") == "일반" else 0, e.get("count", 0))
            for word in [e.get("ko", "")] + list(e.get("kw", [])):
                w = re.sub(r"\s+", "", str(word or "")).lower()
                if not w or not HANGUL.search(w):
                    continue
                if w not in m or score > m[w][0]:
                    m[w] = (score, e["tag"])
        _ko_index.update(n=len(ents), map=m)
        return m


def _split(text):
    """쉼표·줄바꿈으로 나누되 구분자를 살려 둠"""
    return re.split(r"(\s*[,\n]\s*)", text or "")


def translate_texts(texts):
    """[글] → {"result": [바뀐 글], "dict": 사전으로 바꾼 수, "google": 구글로 바꾼 수, "failed": [못 바꾼 조각]}"""
    idx = _index() if _dict.csv_files() else {}
    pieces = []          # (텍스트 번호, 조각 번호, 앞, 안쪽, 뒤)
    split_all = [_split(t) for t in texts]
    need_google = []
    n_dict = 0
    for ti, parts in enumerate(split_all):
        for pi, chunk in enumerate(parts):
            if pi % 2 == 1 or not HANGUL.search(chunk):
                continue  # 구분자 또는 한글 없음
            pre, core, post = "", chunk.strip(), ""
            m = WEIGHT_RE.match(core)
            if m:
                pre, core, post = "(", m.group(1).strip(), f":{m.group(2)})"
            key = re.sub(r"\s+", "", core).lower()
            if key in idx:
                parts[pi] = pre + idx[key][1] + post
                n_dict += 1
            else:
                pieces.append((ti, pi, pre, core, post))
                need_google.append(core)
    n_google, failed = 0, []
    if need_google:
        res = _dict.translate(list(dict.fromkeys(need_google)), "ko>en")
        for ti, pi, pre, core, post in pieces:
            en = (res.get(core) or "").strip().rstrip(".")
            if en and not HANGUL.search(en):
                en = en[0].lower() + en[1:] if len(en) > 1 and not en[:2].isupper() else en
                split_all[ti][pi] = pre + en + post
                n_google += 1
            else:
                failed.append(core)
    return {"result": ["".join(p) for p in split_all], "dict": n_dict, "google": n_google, "failed": failed,
            "tr_error": (_dict.state or {}).get("tr_error", "")}


def to_korean(texts):
    """[영어 프롬프트] → {"result": [한글로 옮긴 글], "dict": 사전, "google": 구글, "left": 못 옮긴 수}
    태그는 Danbooru 한국어 사전으로, 사전에 없는 태그·문장은 구글 번역(영→한)으로. 한글·LoRA 태그는 그대로."""
    have = bool(_dict.csv_files())
    if have:
        _dict.ensure_loaded(background=False)
    ents = _dict.entries if have else {}
    user = getattr(_dict, "user", {}) or {}
    split_all = [_split(t) for t in texts]
    pieces, need, n_dict = [], [], 0
    for ti, parts in enumerate(split_all):
        for pi, chunk in enumerate(parts):
            core = chunk.strip()
            if pi % 2 == 1 or not core or HANGUL.search(core) or core.startswith("<") or not re.search(r"[A-Za-z]", core):
                continue
            pre, inner, post = "", core, ""
            m = WEIGHT_RE.match(core)
            if m:
                pre, inner, post = "(", m.group(1).strip(), f":{m.group(2)})"
            key = norm_key(inner)
            ko = user.get(key) or (ents.get(key) or {}).get("ko", "")
            if ko:
                parts[pi] = pre + ko + post
                n_dict += 1
            else:
                pieces.append((ti, pi, pre, inner.replace("_", " "), post))
                need.append(inner.replace("_", " "))
    n_google, left = 0, 0
    if need:
        res = _dict.translate(list(dict.fromkeys(need)), "en>ko")
        for ti, pi, pre, inner, post in pieces:
            ko = (res.get(inner) or "").strip()
            if ko:
                split_all[ti][pi] = pre + ko + post
                n_google += 1
            else:
                left += 1
    return {"result": ["".join(p) for p in split_all], "dict": n_dict, "google": n_google, "left": left,
            "has_dict": have, "tr_error": (_dict.state or {}).get("tr_error", "")}
