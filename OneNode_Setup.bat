@echo off
chcp 65001 >nul
setlocal
set "HERE=%~dp0"
if not exist "%HERE%installer\install.ps1" (
  echo.
  echo   [!] 압축을 먼저 풀어 주세요.
  echo       받은 zip 파일을 오른쪽 클릭 - [모두 압축 풀기]를 한 뒤,
  echo       풀린 폴더 안의 OneNode_Setup.bat 를 실행하세요.
  echo.
  pause
  exit /b 1
)
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%HERE%installer\install.ps1"
exit /b 0
