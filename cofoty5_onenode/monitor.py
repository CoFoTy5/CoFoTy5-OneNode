"""
cofoty5_onenode - 상태 표시줄 (monitor.py)

화면의 상태 표시줄(CPU · RAM · GPU · VRAM · 온도 + 리셋 버튼)이 읽어 가는 값을 내줍니다.
GET /cofoty5_onenode/monitor

- CPU · RAM : psutil (ComfyUI에 이미 들어 있음)
- GPU 사용률 · 온도 · VRAM : nvidia-ml-py (import 이름 pynvml) — 없으면 VRAM만 torch로 읽음
- CPU 온도 : Windows는 기본 방법이 없어서 아래 순서로 시도하고, 다 안 되면 표시하지 않음
    1) LibreHardwareMonitor / OpenHardwareMonitor 원격 웹서버 (http://localhost:8085/data.json)
    2) LibreHardwareMonitor / OpenHardwareMonitor WMI (프로그램이 켜져 있을 때)
    3) ACPI 온도 (관리자 권한 필요 · 보드에 따라 부정확)
  Linux는 psutil.sensors_temperatures()
- GPU 끊김 감지 : NVML 읽기 실패 또는 torch CUDA 오류 → 화면에서 빨갛게 표시하고 리셋을 권함
"""

import json
import re
import subprocess
import sys
import threading
import time
import urllib.request

from aiohttp import web
from server import PromptServer

routes = PromptServer.instance.routes

try:
    import psutil
except Exception:  # 거의 없음
    psutil = None

# ---------------------------------------------------------------- GPU (NVML)
_nv = None          # pynvml 모듈
_nv_handle = None
_nv_name = ""
_nv_err = ""
_nv_last_try = 0.0


def _nv_init():
    """NVML 초기화. 실패하면 30초마다 다시 시도."""
    global _nv, _nv_handle, _nv_name, _nv_err, _nv_last_try
    if _nv_handle is not None:
        return True
    now = time.time()
    if now - _nv_last_try < 30:
        return False
    _nv_last_try = now
    try:
        import pynvml  # nvidia-ml-py (예전 pynvml 패키지도 같은 이름)
        pynvml.nvmlInit()
        idx = 0
        try:  # ComfyUI가 쓰는 GPU 번호에 맞춤
            import torch
            if torch.cuda.is_available():
                idx = torch.cuda.current_device()
        except Exception:
            pass
        _nv = pynvml
        _nv_handle = pynvml.nvmlDeviceGetHandleByIndex(idx)
        name = pynvml.nvmlDeviceGetName(_nv_handle)
        _nv_name = name.decode() if isinstance(name, bytes) else str(name)
        _nv_err = ""
        return True
    except ImportError:
        _nv_err = "nvidia-ml-py 없음"
    except Exception as e:
        _nv_err = f"NVML 오류: {e}"
    _nv_handle = None
    return False


def _nv_reset():
    global _nv_handle
    try:
        if _nv is not None:
            _nv.nvmlShutdown()
    except Exception:
        pass
    _nv_handle = None


def _gpu_stats():
    out = {"name": _nv_name, "util": None, "temp": None, "vram_used": None, "vram_total": None, "ok": True, "err": ""}
    if _nv_init():
        try:
            out["util"] = _nv.nvmlDeviceGetUtilizationRates(_nv_handle).gpu
            out["temp"] = _nv.nvmlDeviceGetTemperature(_nv_handle, _nv.NVML_TEMPERATURE_GPU)
            m = _nv.nvmlDeviceGetMemoryInfo(_nv_handle)
            out["vram_used"], out["vram_total"] = m.used, m.total
            out["name"] = _nv_name
            return out
        except Exception as e:
            # 절전 후 등: 읽기 실패 → 끊김으로 보고 다음에 다시 초기화
            out["ok"] = False
            out["err"] = f"GPU 읽기 실패: {e}"
            _nv_reset()
            return out
    out["err"] = _nv_err
    # NVML이 없으면 VRAM만 torch로
    try:
        import torch
        if torch.cuda.is_available():
            free, total = torch.cuda.mem_get_info()
            out["vram_used"], out["vram_total"] = total - free, total
            if not out["name"]:
                out["name"] = torch.cuda.get_device_name()
    except Exception as e:
        out["ok"] = False
        out["err"] = f"CUDA 오류: {e}"
    return out


# ---------------------------------------------------------------- CUDA 확인 (5초마다)
_cuda_state = {"ok": True, "err": "", "t": 0.0}


def _cuda_check():
    """ComfyUI(torch)가 실제로 GPU를 쓸 수 있는지. 절전 후 'GPU를 못 잡는' 상태를 잡아냄."""
    now = time.time()
    if now - _cuda_state["t"] < 5:
        return _cuda_state
    _cuda_state["t"] = now
    try:
        import torch
        if not torch.cuda.is_available():
            _cuda_state.update(ok=False, err="torch가 CUDA를 찾지 못함")
        else:
            torch.cuda.mem_get_info()
            _cuda_state.update(ok=True, err="")
    except Exception as e:
        _cuda_state.update(ok=False, err=f"CUDA 오류: {e}")
    return _cuda_state


# ---------------------------------------------------------------- CPU 온도 (백그라운드, 5초마다)
_cpu_temp = {"value": None, "src": "", "tried": False}
_CPU_NAME_HINTS = ("tctl", "tdie", "package", "cpu", "core")


def _from_lhm_http():
    """LibreHardwareMonitor / OpenHardwareMonitor 원격 웹서버(기본 8085)."""
    with urllib.request.urlopen("http://127.0.0.1:8085/data.json", timeout=0.4) as r:
        data = json.loads(r.read().decode("utf-8", "ignore"))

    best = None  # (점수, 값)

    def walk(node, in_cpu):
        nonlocal best
        text = str(node.get("Text", ""))
        sid = str(node.get("SensorId", ""))
        cpu_here = in_cpu or bool(re.search(r"ryzen|intel|core i\d|cpu|amdcpu|intelcpu", text, re.I)) or "cpu/" in sid.lower()
        val = str(node.get("Value", ""))
        if cpu_here and "°C" in val:
            m = re.search(r"(-?\d+(?:[.,]\d+)?)", val)
            if m:
                t = float(m.group(1).replace(",", "."))
                low = text.lower()
                score = 3 if ("tctl" in low or "tdie" in low or "package" in low) else (2 if "core" in low and "max" in low else 1)
                if 5 < t < 120 and (best is None or score > best[0]):
                    best = (score, t)
        for c in node.get("Children", []) or []:
            walk(c, cpu_here)

    walk(data, False)
    return best[1] if best else None


def _powershell(cmd):
    flags = 0x08000000 if sys.platform.startswith("win") else 0  # CREATE_NO_WINDOW
    r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", cmd],
                       capture_output=True, text=True, timeout=4, creationflags=flags)
    return r.stdout.strip()


def _from_wmi_hwmon():
    for ns in ("root/LibreHardwareMonitor", "root/OpenHardwareMonitor"):
        try:
            out = _powershell(
                f"Get-CimInstance -Namespace {ns} -ClassName Sensor -ErrorAction Stop | "
                "Where-Object {$_.SensorType -eq 'Temperature' -and $_.Parent -match 'cpu'} | "
                "ForEach-Object { $_.Name + '|' + $_.Value }")
        except Exception:
            continue
        best = None
        for line in out.splitlines():
            if "|" not in line:
                continue
            name, v = line.rsplit("|", 1)
            try:
                t = float(v.replace(",", "."))
            except ValueError:
                continue
            low = name.lower()
            score = 3 if ("tctl" in low or "tdie" in low or "package" in low) else 1
            if 5 < t < 120 and (best is None or score > best[0]):
                best = (score, t)
        if best:
            return best[1]
    return None


def _from_acpi():
    out = _powershell("Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature "
                      "-ErrorAction Stop | Select-Object -First 1 -ExpandProperty CurrentTemperature")
    if out:
        t = float(out.splitlines()[0]) / 10.0 - 273.15
        if 5 < t < 120:
            return round(t, 1)
    return None


def _cpu_temp_once():
    if not sys.platform.startswith("win"):
        try:
            temps = psutil.sensors_temperatures() if psutil else {}
            for key in ("k10temp", "coretemp", "zenpower", "cpu_thermal"):
                if temps.get(key):
                    return max(x.current for x in temps[key]), "센서"
        except Exception:
            pass
        return None, ""
    for fn, src in ((_from_lhm_http, "LibreHardwareMonitor"), (_from_wmi_hwmon, "LibreHardwareMonitor"), (_from_acpi, "ACPI")):
        try:
            t = fn()
            if t is not None:
                return t, src
        except Exception:
            pass
    return None, ""


def _cpu_temp_loop():
    misses = 0
    while True:
        t, src = _cpu_temp_once()
        _cpu_temp.update(value=t, src=src, tried=True)
        misses = 0 if t is not None else misses + 1
        # 못 읽으면 점점 드물게 시도 (5초 → 최대 60초) — 나중에 LibreHardwareMonitor를 켜도 잡힘
        time.sleep(5 if misses == 0 else min(60, 5 * misses))


threading.Thread(target=_cpu_temp_loop, name="cofoty5_onenode_cpu_temp", daemon=True).start()

# ---------------------------------------------------------------- 묶어서 내보내기
if psutil:
    try:
        psutil.cpu_percent(interval=None)  # 첫 호출은 0이 나오므로 미리 한 번
    except Exception:
        pass

_cache = {"t": 0.0, "data": None}
_lock = threading.Lock()


def _collect():
    with _lock:
        now = time.time()
        if _cache["data"] is not None and now - _cache["t"] < 0.4:
            return _cache["data"]
        d = {"cpu": None, "ram_used": None, "ram_total": None}
        if psutil:
            try:
                d["cpu"] = psutil.cpu_percent(interval=None)
                vm = psutil.virtual_memory()
                d["ram_used"], d["ram_total"] = vm.total - vm.available, vm.total
            except Exception:
                pass
        d["cpu_temp"] = _cpu_temp["value"]
        d["cpu_temp_src"] = _cpu_temp["src"]
        d["cpu_temp_tried"] = _cpu_temp["tried"]
        d["gpu"] = _gpu_stats()
        c = _cuda_check()
        d["cuda_ok"], d["cuda_err"] = c["ok"], c["err"]
        _cache.update(t=now, data=d)
        return d


@routes.get("/cofoty5_onenode/monitor")
async def _monitor(request):
    return web.json_response(_collect())
