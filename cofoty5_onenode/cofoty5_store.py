"""공용 저장 폴더 (cofoty5_store.py) — CoFoTy5 OneNode

LoRA 세트(lora_sets.json) · 직접 고친 LoRA 키워드(lora_user.json) · 태그 사전(dict/) · 고친 한글 뜻(user_dict.json) · 번역 저장(translate_cache.json)을
한 폴더에 모아 두고, 같은 폴더를 가리키는 모든 노드팩이 같이 씁니다.

  저장 폴더 = 팩 폴더의 lora_store.json {"folder": "..."} 이 가리키는 곳
              (없으면 기본 폴더 = 이 ComfyUI의 user\\cofoty5, 예: C:\\ComfyUI\\ComfyUI\\user\\cofoty5)
  → 같은 ComfyUI 안의 노드팩끼리는 같이 쓰고, 따로 깐 ComfyUI(예: 원노드 설치본)는 각자 따로 씀.
    ComfyUI 폴더를 지우면 같이 지워지고, 노드팩만 지우거나 새로 깔면 남음.
  기본 폴더를 처음 쓰는 순간 팩 폴더에 있던 예전 파일을 한 번 합쳐 넣음 (같은 이름이 있으면 공용 쪽을 유지, 지우거나 덮어쓰지 않음)
"""
import json
import os
import shutil
import sys
import threading
import types

STORE_VERSION = "1.0.0"
CFG_FILE = "lora_store.json"          # 예전 이름 그대로 (이미 폴더를 고른 사람의 설정이 이어지도록)
MARK_FILE = ".cofoty5_shared_merged"
DEFAULT_NAME = "cofoty5"
JSON_FILES = ("lora_sets.json", "lora_user.json", "user_dict.json", "translate_cache.json")

# 두 팩이 한 프로세스에서 같은 잠금 · 같은 알림 목록을 쓰도록
_shared = sys.modules.setdefault("_cofoty5_lora_shared", types.ModuleType("_cofoty5_lora_shared"))
if not hasattr(_shared, "lock"):
    _shared.lock = threading.RLock()
if not hasattr(_shared, "listeners"):
    _shared.listeners = []
FILE_LOCK = _shared.lock
_done = set()


def default_dir():
    """이 ComfyUI의 사용자 폴더(ComfyUI\\user) 안 cofoty5. 못 찾으면 custom_nodes 옆의 user 폴더."""
    try:
        import folder_paths
        u = folder_paths.get_user_directory()
        if u:
            return os.path.join(os.path.abspath(u), DEFAULT_NAME)
    except Exception:
        pass
    here = os.path.dirname(os.path.abspath(__file__))            # …\ComfyUI\custom_nodes\팩
    return os.path.join(os.path.dirname(os.path.dirname(here)), "user", DEFAULT_NAME)


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


def cfg_path(home):
    return os.path.join(home, CFG_FILE)


def pointer(home):
    """팩 폴더에 기록된 저장 폴더 (없으면 "")"""
    p = cfg_path(home)
    f = _load(p, {}).get("folder") if os.path.isfile(p) else ""
    return os.path.abspath(f) if isinstance(f, str) and f.strip() else ""


def _same(a, b):
    return os.path.normcase(os.path.abspath(a)) == os.path.normcase(os.path.abspath(b))


def shared_dir(home):
    """지금 쓸 저장 폴더. 폴더가 만들어지지 않으면 팩 폴더로 물러남."""
    p = pointer(home)
    if p:
        try:
            os.makedirs(p, exist_ok=True)
            return p
        except OSError:
            return home
    d = default_dir()
    try:
        os.makedirs(d, exist_ok=True)
    except OSError:
        return home
    key = (os.path.normcase(os.path.abspath(home)), os.path.normcase(d))
    if key not in _done:
        _done.add(key)
        try:
            with FILE_LOCK:
                migrate_once(home, d)
        except Exception as e:
            print(f"[cofoty5_store] 예전 파일을 저장 폴더로 옮기지 못했습니다: {e!r}")
    return d


# ---------- 합치기 ----------
def _merge_dict(dst, src):
    """dst에 없는 키만 src에서 채움 (재귀). 바뀐 게 있으면 True"""
    changed = False
    for k, v in src.items():
        if k not in dst:
            dst[k] = v
            changed = True
        elif isinstance(dst[k], dict) and isinstance(v, dict):
            changed |= _merge_dict(dst[k], v)
    return changed


def _merge_sets(dst, src):
    """lora_sets.json: 이름이 없는 세트만 (종류 · 프롬프트와 함께) 가져옴"""
    changed = False
    dst.setdefault("version", 2)
    ds = dst.setdefault("sets", {})
    for name, v in (src.get("sets") or {}).items():
        if name in ds:
            continue
        ds[name] = v
        for key in ("types", "prompts"):
            sv = (src.get(key) or {}).get(name)
            if sv:
                dst.setdefault(key, {})[name] = sv
        changed = True
    return changed


def merge_into(src, dst):
    """src 폴더의 공용 파일을 dst에 합침. dst에 이미 있는 내용은 그대로. 합친 파일 이름 목록을 돌려줌"""
    out = []
    if not os.path.isdir(src) or _same(src, dst):
        return out
    os.makedirs(dst, exist_ok=True)
    for n in JSON_FILES:
        a, b = os.path.join(src, n), os.path.join(dst, n)
        if not os.path.isfile(a):
            continue
        if not os.path.isfile(b):
            shutil.copy2(a, b)
            out.append(n)
            continue
        sd, dd = _load(a, {}), _load(b, {})
        if not isinstance(sd, dict) or not isinstance(dd, dict):
            continue
        if _merge_sets(dd, sd) if n == "lora_sets.json" else _merge_dict(dd, sd):
            _save(b, dd)
            out.append(n)
    sa, sb = os.path.join(src, "dict"), os.path.join(dst, "dict")
    if os.path.isdir(sa):
        for f in os.listdir(sa):
            a, b = os.path.join(sa, f), os.path.join(sb, f)
            if f.lower().endswith(".csv") and os.path.isfile(a) and not os.path.exists(b):
                os.makedirs(sb, exist_ok=True)
                shutil.copy2(a, b)
                out.append("dict/" + f)
    return out


def migrate_once(home, dst):
    mark = os.path.join(home, MARK_FILE)
    if _same(home, dst):
        return []
    try:   # 이미 이 폴더로 합쳤으면 건너뜀 (다른 폴더로 합친 기록이면 다시 합침)
        with open(mark, "r", encoding="utf-8") as f:
            if _same(f.read().strip() or "?", dst):
                return []
    except OSError:
        pass
    done = merge_into(home, dst)
    try:
        with open(mark, "w", encoding="utf-8") as f:
            f.write(dst)
    except OSError:
        pass
    if done:
        print(f"[cofoty5_store] 저장 폴더({dst})로 합침: {', '.join(done)}")
    return done


# ---------- 바꾸기 ----------
def set_folder(home, path):
    """저장 폴더 바꾸기. 새 폴더에 있는 파일은 그대로 쓰고, 없는 파일만 지금 폴더에서 복사 (덮어쓰지 않음).
    path가 비면 공용 기본 폴더로. 복사한 파일 이름 목록을 돌려줌."""
    path = str(path or "").strip().strip('"')
    new = os.path.abspath(path) if path else default_dir()
    with FILE_LOCK:
        os.makedirs(new, exist_ok=True)
        old = shared_dir(home)
        copied = []
        if not _same(old, new):
            for n in JSON_FILES:
                a, b = os.path.join(old, n), os.path.join(new, n)
                if os.path.isfile(a) and not os.path.exists(b):
                    shutil.copy2(a, b)
                    copied.append(n)
            sa, sb = os.path.join(old, "dict"), os.path.join(new, "dict")
            if os.path.isdir(sa):
                for f in os.listdir(sa):
                    a, b = os.path.join(sa, f), os.path.join(sb, f)
                    if f.lower().endswith(".csv") and os.path.isfile(a) and not os.path.exists(b):
                        os.makedirs(sb, exist_ok=True)
                        shutil.copy2(a, b)
                        copied.append("dict/" + f)
        if not path:
            if os.path.isfile(cfg_path(home)):
                os.remove(cfg_path(home))
            _done.add((os.path.normcase(os.path.abspath(home)), os.path.normcase(new)))
        else:
            _save(cfg_path(home), {"folder": new})
    for fn in list(_shared.listeners):       # 사전처럼 폴더가 바뀌면 다시 읽어야 하는 곳에 알림
        try:
            fn()
        except Exception as e:
            print(f"[cofoty5_store] 알림 실패: {e!r}")
    return copied


def on_change(fn):
    _shared.listeners.append(fn)
