"""
cofoty5_onenode - ComfyUI 재시작 (restart.py)

화면 위쪽 버튼 / 메뉴 cofoty5 › ComfyUI 재시작 / Ctrl+Alt+R 로 ComfyUI를 다시 켭니다.
(슬립 모드에서 깨어난 뒤 GPU를 못 잡을 때 등). 구형 매니저의 재시작과 같은 방식입니다.
"""

import asyncio
import os
import sys

from aiohttp import web
from server import PromptServer

routes = PromptServer.instance.routes


def _restart_now():
    try:
        sys.stdout.close_log()  # ComfyUI 로그 파일 정리 (없으면 무시)
    except Exception:
        pass
    if "__COMFY_CLI_SESSION__" in os.environ:  # comfy-cli로 실행한 경우
        with open(os.environ["__COMFY_CLI_SESSION__"] + ".reboot", "w"):
            pass
        print("\n[CoFoTy5 OneNode] 재시작합니다...\n", flush=True)
        os._exit(0)

    argv = sys.argv.copy()
    # 재시작 때마다 브라우저 새 창이 뜨지 않게. (--windows-standalone-build는 지우면 안 됨:
    #  자산(Assets) 기능도 같이 꺼지므로 그대로 두고 자동 실행만 끔)
    if "--disable-auto-launch" not in argv:
        argv.append("--disable-auto-launch")
    if argv[0].endswith("__main__.py"):
        cmds = [sys.executable, "-m", os.path.basename(os.path.dirname(argv[0]))] + argv[1:]
    elif sys.platform.startswith("win32"):
        cmds = ['"' + sys.executable + '"', '"' + argv[0] + '"'] + argv[1:]
    else:
        cmds = [sys.executable] + argv
    print(f"\n[CoFoTy5 OneNode] 재시작합니다... {cmds}\n", flush=True)
    os.execv(sys.executable, cmds)


@routes.post("/cofoty5_onenode/restart")
async def _restart(request):
    # 응답을 먼저 보내고 0.5초 뒤 재시작
    asyncio.get_running_loop().call_later(0.5, _restart_now)
    return web.json_response({"ok": True})
