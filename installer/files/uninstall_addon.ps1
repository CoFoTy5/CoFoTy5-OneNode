# CoFoTy5 OneNode — 이미 쓰던 ComfyUI에서 OneNode가 더한 것만 지우기
#  지우는 것: custom_nodes\cofoty5_onenode, 시작용 워크플로(고치지 않았을 때만)와 그 즐겨찾기,
#            (물어본 뒤) 함께 받은 노드 · 모델, 바탕화면 바로가기, 이 기록 폴더
#  지우지 않는 것: ComfyUI 본체 · 파이썬 부품 · 설정 · 원래 있던 노드와 모델 · 만든 그림
#  이 기록 폴더(<ComfyUI>\user\cofoty5_onenode_addon)의 added_ledger.txt 에 적힌 것만 지웁니다.
param([string]$Target, [switch]$Stage2, [switch]$Nodes, [switch]$Models)
Add-Type -AssemblyName System.Windows.Forms
$T = 'CoFoTy5 OneNode 지우기'
function Msg($text, $buttons = 'OK', $icon = 'Information') { [System.Windows.Forms.MessageBox]::Show($text, $T, $buttons, $icon) }
function Same($a, $b) { return [string]::Equals(([IO.Path]::GetFullPath($a)).TrimEnd('\'), ([IO.Path]::GetFullPath($b)).TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase) }
function Under($path, $dir) { $d = ([IO.Path]::GetFullPath($dir)).TrimEnd('\') + '\'; return ([IO.Path]::GetFullPath($path)).StartsWith($d, [StringComparison]::OrdinalIgnoreCase) }

try { $Target = [IO.Path]::GetFullPath($Target.TrimEnd('\', '.')) } catch { Msg "기록 폴더를 알 수 없습니다: $Target" 'OK' 'Error'; exit 1 }
$infoF = Join-Path $Target 'addon_info.json'
$I = $null; try { $I = Get-Content -Raw -Encoding UTF8 -LiteralPath $infoF | ConvertFrom-Json } catch {}
# 안전장치 1: 추가 설치 기록이 맞고, 이 폴더가 정확히 <ComfyUI>\user\cofoty5_onenode_addon 일 때만
if (-not $I -or $I.mode -ne 'addon' -or -not $I.comfy -or -not (Same $Target (Join-Path ([string]$I.comfy) 'user\cofoty5_onenode_addon'))) {
    Msg "이 폴더는 OneNode 추가 설치 기록 폴더가 아닌 것 같아 아무것도 지우지 않습니다.`n$Target" 'OK' 'Warning'; exit 1
}
$CUI = [string]$I.comfy; $CN = Join-Path $CUI 'custom_nodes'
# 기록 읽기
$L = @{ node = @(); model = @(); shortcut = @(); accel = @(); onenode = @() }
foreach ($line in @(Get-Content -LiteralPath (Join-Path $Target 'added_ledger.txt') -Encoding UTF8 -ErrorAction SilentlyContinue)) {
    $a = ([string]$line).Split("`t", 2)
    if ($a.Count -eq 2 -and $L.ContainsKey($a[0]) -and $L[$a[0]] -notcontains $a[1]) { $L[$a[0]] += $a[1] }
}
# 안전장치 2: 노드는 custom_nodes 바로 아래 이름만, 모델은 <ComfyUI>\models 안의 파일만
$nodeDirs = @($L.node | Where-Object { $_ -and $_ -eq (Split-Path -Leaf $_) -and $_ -notmatch '\.\.' -and $_ -ne 'cofoty5_onenode' } | ForEach-Object { Join-Path $CN $_ } | Where-Object { Test-Path -LiteralPath $_ -PathType Container })
$modelFiles = @($L.model | Where-Object { $_ -and (Under $_ (Join-Path $CUI 'models')) -and $_ -match '\.(safetensors|pt|pth|ckpt|bin)$' -and (Test-Path -LiteralPath $_ -PathType Leaf) })

if (-not $Stage2) {
    $r = Msg "이 ComfyUI에서 OneNode를 지울까요?`n$CUI`n`n• 지우는 것: OneNode 노드 · 시작용 워크플로(고치지 않았을 때) · 이 기록 폴더`n• 그대로 두는 것: ComfyUI 본체 · 설정 · 원래 있던 노드와 모델 · 만든 그림 · 파이썬 부품" 'YesNo' 'Question'
    if ($r -ne 'Yes') { exit 0 }
    $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden')
    if ($nodeDirs.Count -gt 0) {
        $names = ($nodeDirs | ForEach-Object { Split-Path -Leaf $_ }) -join ', '
        $r2 = Msg "OneNode를 설치할 때 함께 받은 노드도 지울까요?`n$names`n`n다른 워크플로에서 이 노드를 쓰고 있다면 [아니요]를 누르세요." 'YesNoCancel' 'Question'
        if ($r2 -eq 'Cancel') { exit 0 }
        if ($r2 -eq 'Yes') { $Nodes = $true }
    }
    if ($modelFiles.Count -gt 0) {
        $gb = [math]::Round((($modelFiles | ForEach-Object { (Get-Item -LiteralPath $_).Length } | Measure-Object -Sum).Sum) / 1GB, 1)
        $names = ($modelFiles | ForEach-Object { Split-Path -Leaf $_ }) -join ', '
        $r3 = Msg "OneNode를 설치할 때 받은 모델도 지울까요? (약 $gb GB)`n$names`n`n다른 워크플로에서 이 모델을 쓰고 있다면 [아니요]를 누르세요." 'YesNoCancel' 'Question'
        if ($r3 -eq 'Cancel') { exit 0 }
        if ($r3 -eq 'Yes') { $Models = $true }
    }
    # ComfyUI가 켜져 있으면 먼저 끄도록 (파일이 쓰이는 중이면 지워지지 않음)
    $root = [string]$I.root; if (-not $root) { $root = $CUI }
    $pre = $root.TrimEnd('\') + '\'
    $run = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $pp = $null; try { $pp = $_.Path } catch {}; $pp -and $pp.StartsWith($pre, [StringComparison]::OrdinalIgnoreCase) })
    if ($run.Count -gt 0) {
        $r4 = Msg "ComfyUI가 켜져 있습니다. 끄고 계속할까요?" 'YesNo' 'Question'
        if ($r4 -ne 'Yes') { exit 0 }
        $run | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2
    }
    # 기록 폴더 밖(임시 폴더)에서 다시 실행해야 이 폴더도 지울 수 있음
    $tmp = Join-Path $env:TEMP 'OneNode_uninstall_addon.ps1'
    Copy-Item -Force $MyInvocation.MyCommand.Path $tmp
    $a += @('-File', "`"$tmp`"", '-Target', "`"$Target`"", '-Stage2')
    if ($Nodes) { $a += '-Nodes' }
    if ($Models) { $a += '-Models' }
    Start-Process powershell.exe -ArgumentList $a -WorkingDirectory $env:TEMP
    exit 0
}

# ---- 2단계: 임시 폴더에서 실제로 지움
Start-Sleep -Seconds 2
$fail = @(); $done = @()
function Del($path, $label) {
    try { Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop; $script:done += $label } catch { $script:fail += "$label ($path)" }
}
# 1) OneNode 노드
$on = Join-Path $CN 'cofoty5_onenode'
if (Test-Path -LiteralPath (Join-Path $on '__init__.py')) { Del $on 'OneNode 노드' }
# 2) 시작용 워크플로: 설치한 그대로일 때만 지우고, 즐겨찾기에서도 뺌
$wfDir = Join-Path $CUI 'user\default\workflows'
$wf = Join-Path $wfDir 'CoFoTy5 OneNode.json'
if ((Test-Path -LiteralPath $wf) -and $I.workflow_sha) {
    $h = ''; try { $h = (Get-FileHash -Algorithm SHA256 -LiteralPath $wf).Hash.ToLower() } catch {}
    if ($h -eq [string]$I.workflow_sha) {
        Del $wf '시작용 워크플로'
        $idx = Join-Path $wfDir '.index.json'
        try {
            if (Test-Path -LiteralPath $idx) {
                $j = Get-Content -Raw -Encoding UTF8 -LiteralPath $idx | ConvertFrom-Json
                $fav = @($j.favorites)
                if ($fav -contains 'workflows/CoFoTy5 OneNode.json') {
                    $j.favorites = @($fav | Where-Object { $_ -ne 'workflows/CoFoTy5 OneNode.json' })
                    [IO.File]::WriteAllText($idx, ($j | ConvertTo-Json -Depth 20 -Compress), (New-Object Text.UTF8Encoding($false)))
                }
            }
        } catch {}
    }
}
# 3) 함께 받은 노드 · 모델 (고른 경우)
if ($Nodes) { foreach ($d in $nodeDirs) { Del $d ("노드 " + (Split-Path -Leaf $d)) } }
if ($Models) { foreach ($f in $modelFiles) { Del $f ("모델 " + (Split-Path -Leaf $f)) } }
# 4) 가속 시험 결과 (OneNode가 처음 만든 경우만)
foreach ($f in @($L.accel)) { if ($f -and (Same $f (Join-Path $CUI 'user\cofoty5_accel.json')) -and (Test-Path -LiteralPath $f)) { Del $f '가속 시험 결과' } }
# 5) 바탕화면 바로가기 (OneNode가 만든 것만)
foreach ($f in @($L.shortcut)) {
    try {
        if ($f -and $f.EndsWith('.lnk') -and (Test-Path -LiteralPath $f)) {
            $sh = New-Object -ComObject WScript.Shell
            if ($sh.CreateShortcut($f).Description -like '*CoFoTy5 OneNode*') { Del $f '바탕화면 바로가기' }
        }
    } catch {}
}
# 6) 기록 폴더
Del $Target '설치 기록 폴더'

$m = "OneNode를 지웠습니다.`nComfyUI 본체 · 설정 · 원래 있던 노드와 모델은 그대로입니다."
if (-not $Nodes -and $nodeDirs.Count -gt 0) { $m += "`n함께 받은 노드는 남겨 두었습니다." }
if (-not $Models -and $modelFiles.Count -gt 0) { $m += "`n받은 모델은 남겨 두었습니다." }
$m += "`n(설치할 때 더한 파이썬 부품은 다른 노드가 쓸 수 있어 그대로 두었습니다)"
if ($fail.Count -gt 0) { $m += "`n`n지우지 못한 것 (다른 프로그램이 쓰는 중일 수 있음):`n" + ($fail -join "`n"); Msg $m 'OK' 'Warning' } else { Msg $m }
Remove-Item -Force $MyInvocation.MyCommand.Path -ErrorAction SilentlyContinue
