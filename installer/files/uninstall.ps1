# CoFoTy5 OneNode — 지우기
#  설치 폴더를 통째로 지우고, 바탕화면 바로가기도 지웁니다. 윈도우에는 남는 것이 없습니다.
#  만든 그림(output)은 원하면 바탕화면으로 옮겨 둡니다.
param([string]$Target, [switch]$Stage2, [switch]$KeepOutput)
Add-Type -AssemblyName System.Windows.Forms
$T = 'CoFoTy5 OneNode 지우기'
function Msg($text, $buttons = 'OK', $icon = 'Information') { [System.Windows.Forms.MessageBox]::Show($text, $T, $buttons, $icon) }

try {
    $Target = [IO.Path]::GetFullPath($Target.TrimEnd('\', '.'))
} catch { Msg "지울 폴더를 알 수 없습니다: $Target" 'OK' 'Error'; exit 1 }

# 안전장치: 이 설치기로 만든 폴더가 맞을 때만 지움
if (-not (Test-Path (Join-Path $Target '_installer\install_info.json')) -or $Target.Length -le 3) {
    Msg "이 폴더는 CoFoTy5 OneNode 설치 폴더가 아닌 것 같아 지우지 않습니다.`n$Target" 'OK' 'Warning'; exit 1
}

if (-not $Stage2) {
    $r = Msg "CoFoTy5 OneNode를 지울까요?`n`n지울 폴더: $Target`n(ComfyUI · 모델 · LoRA · 설정이 모두 지워집니다)" 'YesNo' 'Question'
    if ($r -ne 'Yes') { exit 0 }
    $out = Join-Path $Target 'ComfyUI_windows_portable\ComfyUI\output'
    $keep = $false
    if ((Test-Path $out) -and (Get-ChildItem $out -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1)) {
        $r2 = Msg "만든 그림(output 폴더)을 바탕화면으로 옮겨 둘까요?`n`n[예] 옮겨 두고 지우기   [아니요] 그림까지 지우기   [취소] 그만두기" 'YesNoCancel' 'Question'
        if ($r2 -eq 'Cancel') { exit 0 }
        $keep = ($r2 -eq 'Yes')
    }
    # ComfyUI가 켜져 있으면 먼저 끔
    $py = Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($Target, [StringComparison]::OrdinalIgnoreCase) }
    if ($py) {
        $r3 = Msg "ComfyUI가 켜져 있습니다. 끄고 계속할까요?" 'YesNo' 'Question'
        if ($r3 -ne 'Yes') { exit 0 }
        $py | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2
    }
    # 설치 폴더 밖(임시 폴더)에서 다시 실행해야 폴더를 지울 수 있음
    $tmp = Join-Path $env:TEMP 'OneNode_uninstall.ps1'
    Copy-Item -Force $MyInvocation.MyCommand.Path $tmp
    $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$tmp`"", '-Target', "`"$Target`"", '-Stage2')
    if ($keep) { $a += '-KeepOutput' }
    Start-Process powershell.exe -ArgumentList $a -WorkingDirectory $env:TEMP
    exit 0
}

# ---- 2단계: 임시 폴더에서 실제로 지움
Start-Sleep -Seconds 2
$moved = ''
if ($KeepOutput) {
    $out = Join-Path $Target 'ComfyUI_windows_portable\ComfyUI\output'
    $dst = Join-Path ([Environment]::GetFolderPath('Desktop')) ("OneNode_그림_" + (Get-Date -Format 'yyyyMMdd_HHmm'))
    try { Move-Item -Path $out -Destination $dst -ErrorAction Stop; $moved = $dst } catch { Msg "그림을 옮기지 못해 지우기를 멈춥니다.`n$($_.Exception.Message)" 'OK' 'Error'; exit 1 }
}
$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'CoFoTy5 OneNode.lnk'
if (Test-Path $lnk) {
    try { $sh = New-Object -ComObject WScript.Shell; if ($sh.CreateShortcut($lnk).TargetPath.StartsWith($Target, [StringComparison]::OrdinalIgnoreCase)) { Remove-Item -Force $lnk } } catch {}
}
try { Remove-Item -LiteralPath $Target -Recurse -Force -ErrorAction Stop } catch {}
if (Test-Path $Target) {
    Msg "일부 파일을 지우지 못했습니다 (다른 프로그램이 쓰는 중일 수 있음).`n컴퓨터를 다시 켠 뒤 이 폴더를 직접 지워 주세요:`n$Target" 'OK' 'Warning'
} else {
    $m = "다 지웠습니다."
    if ($moved) { $m += "`n만든 그림은 여기에 옮겨 두었습니다:`n$moved" }
    Msg $m
}
Remove-Item -Force $MyInvocation.MyCommand.Path -ErrorAction SilentlyContinue
