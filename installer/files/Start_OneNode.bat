@echo off
chcp 65001 >nul
title CoFoTy5 OneNode (ComfyUI)
cd /d "%~dp0ComfyUI_windows_portable"
echo.
echo   CoFoTy5 OneNode를 켜는 중입니다. 잠시 뒤 인터넷 창이 열립니다.
echo   처음 켤 때는 1~2분 걸릴 수 있습니다.
echo   이 검은 창을 닫으면 ComfyUI가 꺼집니다.
echo.
.\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --enable-manager
echo.
echo   ComfyUI가 꺼졌습니다. 아무 키나 누르면 이 창이 닫힙니다.
pause >nul
