"""CoFoTy5 OneNode · 가속 (Sage Attention + fp16 누적)

- 상태 파일: ComfyUI/user/cofoty5_accel.json  (설치 프로그램 · [다시 시험]이 accel_test.py로 씀)
    installed / ok / reason / enabled / runtime_error / tested / gpu …
- 시험을 통과(ok)했고 사용자가 켜 두었을 때(enabled)만 적용합니다.
- 적용 방법: 모델 복제본의 transformer_options 에 attention 바꿔치기(optimized_attention_override)를 넣고,
  샘플링하는 동안만 torch fp16 누적을 켭니다. 원래 모델 · 설정은 건드리지 않습니다.
- 실행 중 Sage가 오류를 내면 그 자리에서 기본 계산으로 돌아가고, 가속을 '사용 불가'로 기록합니다
  ([다시 시험]으로 풀 수 있음).
"""
import asyncio
import json
import os
import subprocess
import sys
import threading
from contextlib import contextmanager

import torch
import folder_paths
from aiohttp import web
from server import PromptServer

LOG = "[CoFoTy5 가속]"
HERE = os.path.dirname(os.path.abspath(__file__))
_lock = threading.Lock()
_rt = {"used": False, "warned": False, "said": False}


def state_path():
    try:
        base = folder_paths.get_user_directory()
    except Exception:
        base = os.path.join(os.path.dirname(os.path.dirname(HERE)), "user")
    return os.path.join(base, "cofoty5_accel.json")


def _load():
    try:
        with open(state_path(), encoding="utf-8") as f:
            d = json.load(f)
            return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def _save(d):
    p = state_path()
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    os.replace(tmp, p)


def _sage_fn():
    """ComfyUI 안의 Sage 계산 함수 (이 ComfyUI가 sageattention을 불러왔을 때만)"""
    try:
        import comfy.ldm.modules.attention as A
    except Exception:
        return None, "ComfyUI의 attention 모듈을 찾지 못했습니다"
    if getattr(A, "SAGE_ATTENTION_IS_AVAILABLE", True) is False:
        return None, "ComfyUI가 SageAttention을 불러오지 못했습니다. ComfyUI를 다시 켜(↻ 리셋) 보세요"
    f = getattr(A, "attention_sage", None)
    if f is None:
        return None, "이 ComfyUI 버전에서 가속을 연결할 곳을 찾지 못했습니다"
    return getattr(f, "__wrapped__", f), ""


def status():
    d = _load()
    installed = bool(d.get("installed"))
    ok = bool(d.get("ok")) and not d.get("runtime_error")
    reason = d.get("runtime_error") or d.get("reason") or ""
    if installed and ok:
        f, why = _sage_fn()
        if f is None:
            ok, reason = False, why
    return {"installed": installed, "ok": ok, "enabled": ok and d.get("enabled", True) is not False,
            "reason": reason, "tested": d.get("tested", ""), "gpu": d.get("gpu", ""), "used": _rt["used"]}


def active():
    s = status()
    return s["ok"] and s["enabled"]


def _mark_broken(msg):
    with _lock:
        d = _load()
        d["runtime_error"] = msg
        try:
            _save(d)
        except Exception:
            pass


def _strip(kw):
    to = kw.get("transformer_options")
    if isinstance(to, dict) and "optimized_attention_override" in to:
        to = dict(to)
        to.pop("optimized_attention_override", None)
        kw = dict(kw)
        kw["transformer_options"] = to
    return kw


def patch(model):
    """가속이 켜져 있으면 Sage를 쓰는 모델 복제본, 아니면 그대로"""
    if model is None or not active():
        return model
    sage, why = _sage_fn()
    if sage is None:
        print(f"{LOG} 건너뜀 — {why}")
        return model
    broken = {"v": False}

    def override(func, *args, **kwargs):
        kw = _strip(kwargs)
        if broken["v"]:
            return func(*args, **kw)
        try:
            out = sage(*args, **kw)
            if not _rt["used"]:
                _rt["used"] = True
                print(f"{LOG} 적용됨 (Sage Attention)")
            return out
        except Exception as e:
            broken["v"] = True
            msg = f"실행 중 오류로 기본 계산으로 바꿨습니다 ({type(e).__name__}: {str(e)[:160]})"
            print(f"{LOG} {msg}")
            _mark_broken(msg)
            return func(*args, **kw)

    try:
        m = model.clone()
        to = dict(m.model_options.get("transformer_options") or {})
        to["optimized_attention_override"] = override
        m.model_options["transformer_options"] = to
        return m
    except Exception as e:
        print(f"{LOG} 건너뜀 — 모델에 연결하지 못했습니다: {e}")
        return model


@contextmanager
def fp16_ctx():
    """샘플링하는 동안만 fp16 누적(토치 설정 가속)을 켬"""
    mm = getattr(torch.backends.cuda, "matmul", None)
    use = active() and mm is not None and hasattr(mm, "allow_fp16_accumulation")
    old = mm.allow_fp16_accumulation if use else None
    if use:
        try:
            mm.allow_fp16_accumulation = True
        except Exception:
            use = False
    try:
        yield
    finally:
        if use:
            try:
                mm.allow_fp16_accumulation = old
            except Exception:
                pass


def after_sample():
    """가속을 켰는데 한 번도 쓰이지 않았으면 한 번만 알려 줌 (ComfyUI가 바꿔치기를 지원하지 않는 경우)"""
    if active() and not _rt["used"] and not _rt["warned"]:
        _rt["warned"] = True
        print(f"{LOG} 켜져 있지만 이번 생성에는 쓰이지 않았습니다 (이 ComfyUI · 모델에서 지원하지 않을 수 있음)")


# ---------------------------------------------------------------- 화면용 주소
routes = PromptServer.instance.routes


@routes.get("/cofoty5_onenode/accel")
async def _get(request):
    return web.json_response(status())


@routes.post("/cofoty5_onenode/accel")
async def _set(request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    with _lock:
        d = _load()
        if not d.get("installed"):
            return web.json_response({**status(), "error": "가속 기능이 설치되어 있지 않습니다"})
        d["enabled"] = bool(body.get("enabled"))
        _save(d)
    return web.json_response(status())


def _run_test():
    cmd = [sys.executable, "-s", os.path.join(HERE, "accel_test.py"), "--out", state_path()]
    kw = {}
    if os.name == "nt":
        kw["creationflags"] = 0x08000000   # 검은 창 안 띄움
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300, **kw)
    print(f"{LOG} 다시 시험: {(r.stdout or '').strip()[:400]}")
    if r.stderr and r.returncode not in (0, 1):
        print(f"{LOG} {r.stderr.strip()[-400:]}")


@routes.post("/cofoty5_onenode/accel/test")
async def _test(request):
    if not _load().get("installed"):
        return web.json_response({**status(), "error": "가속 기능이 설치되어 있지 않습니다"})
    try:
        await asyncio.get_running_loop().run_in_executor(None, _run_test)
    except Exception as e:
        return web.json_response({**status(), "error": f"시험을 실행하지 못했습니다: {e}"})
    _rt["warned"] = False
    return web.json_response(status())
