@echo off
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0_installer\uninstall.ps1" -Target "%~dp0."
