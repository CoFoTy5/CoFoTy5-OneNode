# =====================================================================
#  CoFoTy5 OneNode — 설치기 (Windows PowerShell 5.1, 별도 설치 필요 없음)
#  - 모든 파일은 고른 폴더 하나 안에만 설치됩니다. 지울 때는 폴더만 지우면 끝.
#  - 관리자 권한 · 레지스트리 · PATH 변경 없음.
#  - 받는 곳은 모두 공식 주소이고, 받은 파일은 SHA256으로 확인합니다.
#  - 중간에 끊기거나 창을 닫아도, 다시 실행하면 받은 데까지 이어서 진행합니다.
# =====================================================================
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$PackRoot = Split-Path -Parent $Here

# 창이 뜨기 전에 문제가 생겨도 알 수 있게 (이 창은 검은 창 없이 실행됨)
$script:Ready = $false
trap {
    if (-not $script:Ready) {
        [System.Windows.Forms.MessageBox]::Show("설치 프로그램을 여는 중 문제가 생겼습니다.`n`n$($_.Exception.Message)`n`n압축을 다 푼 폴더에서 다시 실행해 보세요.", 'CoFoTy5 OneNode 설치', 'OK', 'Error') | Out-Null
        exit 1
    }
    # 창이 뜬 뒤의 오류는 창을 닫지 않고 기록만
    try { Add-Content -Path (Join-Path $env:TEMP 'OneNode_setup_error.log') -Value ("[{0}] {1}" -f (Get-Date), $_) } catch {}
    continue
}
# 인터넷에서 받은 파일 표시(차단) 풀기 — 설치 폴더로 복사한 실행 파일에 경고 창이 뜨지 않게
try { Get-ChildItem -LiteralPath $PackRoot -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue } catch {}
$M = Get-Content -Raw -Encoding UTF8 (Join-Path $Here 'manifest.json') | ConvertFrom-Json
if (-not (Test-Path (Join-Path $PackRoot 'cofoty5_onenode\__init__.py'))) { throw '설치 파일 일부(cofoty5_onenode 폴더)가 없습니다. 받은 zip을 다시 풀어 주세요.' }

# ---------------------------------------------------------------- 공통 모양
$FontN = New-Object System.Drawing.Font('Malgun Gothic', 10)
$FontB = New-Object System.Drawing.Font('Malgun Gothic', 10, [System.Drawing.FontStyle]::Bold)
$FontT = New-Object System.Drawing.Font('Malgun Gothic', 15, [System.Drawing.FontStyle]::Bold)
$FontS = New-Object System.Drawing.Font('Malgun Gothic', 9)
$ColAccent = [System.Drawing.Color]::FromArgb(44, 138, 138)
$ColOk = [System.Drawing.Color]::FromArgb(40, 140, 70)
$ColWarn = [System.Drawing.Color]::FromArgb(200, 120, 20)
$ColBad = [System.Drawing.Color]::FromArgb(200, 50, 50)
$ColDim = [System.Drawing.Color]::FromArgb(110, 110, 110)

function New-Label($text, $x, $y, $w, $h, $font = $FontN, $color = $null) {
    $l = New-Object System.Windows.Forms.Label
    $l.Text = $text; $l.Location = New-Object System.Drawing.Point($x, $y)
    $l.Size = New-Object System.Drawing.Size($w, $h); $l.Font = $font
    if ($color) { $l.ForeColor = $color }
    $l.BackColor = [System.Drawing.Color]::Transparent   # 쪽 배경 그림이 비치도록
    return $l
}
function New-Button($text, $x, $y, $w = 110, $h = 34) {
    $b = New-Object System.Windows.Forms.Button
    $b.Text = $text; $b.Location = New-Object System.Drawing.Point($x, $y)
    $b.Size = New-Object System.Drawing.Size($w, $h); $b.Font = $FontN
    return $b
}
function Show-Msg($text, $icon = 'Information', $buttons = 'OK') {
    return [System.Windows.Forms.MessageBox]::Show($text, 'CoFoTy5 OneNode 설치', $buttons, $icon)
}

# ---------------------------------------------------------------- 창
$form = New-Object System.Windows.Forms.Form
$form.Text = "CoFoTy5 OneNode 설치 (v$($M.version))"
$form.ClientSize = New-Object System.Drawing.Size(1000, 560)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'; $form.MaximizeBox = $false
$form.Font = $FontN; $form.BackColor = [System.Drawing.Color]::White

$head = New-Object System.Windows.Forms.Panel
$head.Location = New-Object System.Drawing.Point(0, 0); $head.Size = New-Object System.Drawing.Size(1000, 70)
$head.BackColor = $ColAccent
$title = New-Label 'CoFoTy5 OneNode  ·  원클릭 설치' 22 10 940 32 $FontT ([System.Drawing.Color]::White)
$stepLbl = New-Label '' 24 42 700 22 $FontS ([System.Drawing.Color]::FromArgb(220, 245, 245))
$head.Controls.AddRange(@($title, $stepLbl))
$form.Controls.Add($head)

$body = New-Object System.Windows.Forms.Panel
$body.Location = New-Object System.Drawing.Point(0, 70); $body.Size = New-Object System.Drawing.Size(1000, 430)
$form.Controls.Add($body)

# 1쪽(안내)에는 맞이 그림, 끝 쪽(설치 완료)에는 완료 그림을 쪽 배경으로 깔음 (오른쪽 그림이 왼쪽 흰색으로 섞이도록 미리 만들어 둔 1000x430 그림).
# 그림 파일이 없거나 못 읽어도 설치는 그대로 진행됨
function Get-Art($name) { try { $p = Join-Path $Here "img\$name"; if (Test-Path $p) { return [System.Drawing.Image]::FromFile($p) } } catch {} return $null }
$ImgWelcome = Get-Art 'bg_welcome.jpg'
$ImgDone = Get-Art 'bg_done.jpg'
$script:DoneOk = $false

$btnBack = New-Button '< 이전' 650 512
$btnNext = New-Button '다음 >' 765 512
$btnCancel = New-Button '취소' 880 512
$form.Controls.AddRange(@($btnBack, $btnNext, $btnCancel))

$pages = @{}
function New-Page { $p = New-Object System.Windows.Forms.Panel; $p.Dock = 'Fill'; $p.Visible = $false
    if ($ImgWelcome) { $p.BackgroundImage = $ImgWelcome; $p.BackgroundImageLayout = 'None' }   # 모든 쪽 같은 그림 (끝 쪽만 설치가 성공하면 완료 그림)
    $body.Controls.Add($p); return $p }

# ================================================================ 1. 안내
$p1 = New-Page; $pages[1] = $p1
$p1.Controls.Add((New-Label '이 프로그램이 하는 일' 30 18 700 26 $FontB))
$intro = @"
ComfyUI(공식 포터블판)를 설치하고, 그 위에 'CoFoTy5 OneNode' 노드를 바로 쓸 수 있게 준비합니다.

  • 받는 것: ComfyUI · Anima 터보 모델 · 글 읽는 모델 · VAE · 손/얼굴 보정 · LoRA Manager
  • 받을 양: 약 8GB  (설치 후 약 18GB 사용)  ·  시간: 인터넷 속도에 따라 20분~1시간
  • 고른 폴더 하나 안에만 설치합니다. 지우고 싶으면 그 폴더만 지우면 끝입니다.
  • 관리자 권한이 필요 없고, 윈도우 설정은 건드리지 않습니다.
  • 중간에 끊겨도 괜찮습니다. 다시 실행하면 받은 데까지 이어서 합니다.
  • 체크포인트(Illustrious 등)도 models\checkpoints 에 넣으면 같은 화면에서 쓸 수 있습니다.

설치된 ComfyUI는 공식 구조 그대로입니다. 익숙해지면 다른 워크플로와 노드도 자유롭게 쓸 수 있습니다.
"@
$p1.Controls.Add((New-Label $intro 30 50 700 210))
$p1.Controls.Add((New-Label '모델 라이선스' 30 268 700 24 $FontB))
$lic = @"
Anima 모델(CircleStone Labs)은 비상업 라이선스입니다. 만든 그림(결과물)에는 이 라이선스가 걸리지 않지만,
모델 파일 자체를 판매하거나 상업 서비스에 쓰는 것은 허용되지 않습니다.
"@
$p1.Controls.Add((New-Label $lic 30 294 700 52 $FontS $ColDim))
$licLink = New-Object System.Windows.Forms.LinkLabel
$licLink.Text = '라이선스 전문 보기 (Hugging Face)'; $licLink.Location = New-Object System.Drawing.Point(30, 344)
$licLink.Size = New-Object System.Drawing.Size(400, 22); $licLink.Font = $FontS; $licLink.BackColor = [System.Drawing.Color]::Transparent
$licLink.add_LinkClicked({ Start-Process 'https://huggingface.co/circlestone-labs/Anima/blob/main/LICENSE.md' })
$p1.Controls.Add($licLink)
$chkLic = New-Object System.Windows.Forms.CheckBox
$chkLic.Text = '위 내용을 확인했고 동의합니다'; $chkLic.Location = New-Object System.Drawing.Point(30, 372)
$chkLic.Size = New-Object System.Drawing.Size(500, 26); $chkLic.Font = $FontB; $chkLic.BackColor = [System.Drawing.Color]::Transparent
$p1.Controls.Add($chkLic)

# ================================================================ 2. 이 PC 확인
$p2 = New-Page; $pages[2] = $p2
$p2.Controls.Add((New-Label '이 PC에서 쓸 수 있는지 확인합니다' 30 18 700 26 $FontB))
$chkList = New-Object System.Windows.Forms.Panel
$chkList.Location = New-Object System.Drawing.Point(30, 52); $chkList.Size = New-Object System.Drawing.Size(700, 300); $chkList.BackColor = [System.Drawing.Color]::Transparent
$p2.Controls.Add($chkList)
$btnRecheck = New-Button '다시 확인' 30 368 120 32
$p2.Controls.Add($btnRecheck)
$script:HardFail = $false
$script:GpuMissing = $false
$script:Gpu = $null
# NVIDIA 카드가 없을 때만 보이는 체크 (CPU 모드로 계속)
$chkCpu = New-Object System.Windows.Forms.CheckBox
$chkCpu.Text = '그래픽카드 없이(CPU 모드) 계속 진행하기 — 그림 한 장에 몇십 분 걸릴 수 있습니다'
$chkCpu.Location = New-Object System.Drawing.Point(170, 372); $chkCpu.Size = New-Object System.Drawing.Size(560, 26)
$chkCpu.Font = $FontS; $chkCpu.Visible = $false; $chkCpu.BackColor = [System.Drawing.Color]::Transparent
$p2.Controls.Add($chkCpu)
function Update-NextP2 { $btnNext.Enabled = (-not $script:HardFail) -and ((-not $script:GpuMissing) -or $chkCpu.Checked) }
$chkCpu.add_CheckedChanged({ if ($script:Page -eq 2) { Update-NextP2 } })

# 이 PC의 모든 그래픽카드 이름 (가상 화면 장치는 제외)
function Get-VideoNames {
    try {
        return @(Get-CimInstance Win32_VideoController -ErrorAction Stop | ForEach-Object { $_.Name } |
            Where-Object { $_ -and $_ -notmatch 'Basic Display|Basic Render|Hyper-V|Remote Display|Virtual|VMware|VirtualBox|Parsec|Citrix' })
    } catch { return @() }
}

function Get-GpuInfo {
    $smi = Join-Path $env:SystemRoot 'System32\nvidia-smi.exe'
    if (-not (Test-Path $smi)) { $c = Get-Command nvidia-smi -ErrorAction SilentlyContinue; if ($c) { $smi = $c.Source } else { return $null } }
    try {
        $out = & $smi --query-gpu=name,driver_version,memory.total --format=csv,noheader,nounits 2>$null | Select-Object -First 1
        if (-not $out) { return $null }
        $a = $out.Split(',') | ForEach-Object { $_.Trim() }
        return @{ Name = $a[0]; Driver = $a[1]; VramGB = [math]::Round([double]$a[2] / 1024, 1) }
    } catch { return $null }
}
function Add-CheckRow($i, $state, $titleText, $detail) {
    $y = $i * 58
    $mark = @{ ok = '✔'; warn = '!'; bad = '✖' }[$state]
    $col = @{ ok = $ColOk; warn = $ColWarn; bad = $ColBad }[$state]
    $chkList.Controls.Add((New-Label $mark 0 $y 28 28 $FontT $col))
    $chkList.Controls.Add((New-Label $titleText 34 ($y + 2) 660 22 $FontB))
    $chkList.Controls.Add((New-Label $detail 34 ($y + 24) 660 34 $FontS $ColDim))
}
function Invoke-Checks {
    $chkList.Controls.Clear(); $script:HardFail = $false; $script:GpuMissing = $false; $i = 0
    # 윈도우
    $os = [Environment]::OSVersion.Version
    if ([Environment]::Is64BitOperatingSystem -and $os.Major -ge 10) { Add-CheckRow $i 'ok' "Windows 64비트 ($($os.Major).$($os.Build))" '문제없습니다.' }
    else { Add-CheckRow $i 'bad' 'Windows 10/11 64비트가 필요합니다' '이 PC의 윈도우에서는 설치할 수 없습니다.'; $script:HardFail = $true }
    $i++
    # 그래픽카드 · 드라이버
    $script:Gpu = Get-GpuInfo
    if (-not $script:Gpu) {
        $names = Get-VideoNames
        $nv = @($names | Where-Object { $_ -match 'NVIDIA|GeForce' })
        $other = @($names | Where-Object { $_ -match 'AMD|Radeon|Intel|Arc' -and $_ -notmatch 'NVIDIA|GeForce' })
        if ($nv.Count -gt 0) {
            Add-CheckRow $i 'bad' "NVIDIA 그래픽카드($($nv[0]))의 드라이버를 찾지 못했습니다" 'nvidia.com 또는 NVIDIA 앱에서 드라이버를 설치한 뒤 [다시 확인]을 누르세요. (드라이버 없이는 CPU로만 동작합니다)'
        } elseif ($other.Count -gt 0) {
            Add-CheckRow $i 'bad' "이 그래픽카드는 쓸 수 없습니다: $($other[0])" '이 설치판의 ComfyUI는 NVIDIA 전용(CUDA)이라 AMD · 인텔 그래픽카드로는 그림을 만들 수 없습니다. 계속하면 CPU로만 동작해 아주 느립니다.'
        } else {
            Add-CheckRow $i 'bad' 'NVIDIA 그래픽카드를 찾지 못했습니다' 'NVIDIA(지포스 RTX 등) 그래픽카드와 드라이버가 필요합니다. 없으면 CPU로만 동작해 아주 느립니다.'
        }
        $script:GpuMissing = $true; $i++
    } else {
        Add-CheckRow $i 'ok' "그래픽카드: $($script:Gpu.Name)" "그래픽 메모리(VRAM) $($script:Gpu.VramGB)GB"
        $i++
        $drvMajor = [int]([double]$script:Gpu.Driver)
        if ($drvMajor -ge [int]$M.min_driver) { Add-CheckRow $i 'ok' "드라이버 $($script:Gpu.Driver)" '문제없습니다.' }
        else {
            Add-CheckRow $i 'bad' "드라이버가 오래되었습니다 ($($script:Gpu.Driver))" "$($M.min_driver) 버전 이상이 필요합니다. NVIDIA 앱 또는 nvidia.com에서 최신 드라이버를 설치한 뒤 [다시 확인]을 누르세요."
            $script:HardFail = $true
        }
        $i++
        if ($script:Gpu.VramGB -lt [double]$M.min_vram_gb) {
            Add-CheckRow $i 'warn' 'VRAM이 적습니다' "$($M.min_vram_gb)GB보다 적으면 아주 느리거나 오류가 날 수 있습니다. 설치는 할 수 있습니다."
            $i++
        }
    }
    # 인터넷
    try {
        $r = [Net.HttpWebRequest]::Create('https://huggingface.co'); $r.Method = 'HEAD'; $r.Timeout = 8000
        $r.UserAgent = 'CoFoTy5OneNodeInstaller'; $resp = $r.GetResponse(); $resp.Close()
        Add-CheckRow $i 'ok' '인터넷 연결' '받을 곳(GitHub · Hugging Face)에 연결됩니다.'
    } catch {
        Add-CheckRow $i 'bad' '인터넷 연결을 확인하세요' 'Hugging Face에 연결하지 못했습니다. 인터넷 · 방화벽 · 백신 설정을 확인한 뒤 [다시 확인]을 누르세요.'
        $script:HardFail = $true
    }
    $chkCpu.Visible = $script:GpuMissing
    if (-not $script:GpuMissing) { $chkCpu.Checked = $false }
    Update-NextP2
}
$btnRecheck.add_Click({ Invoke-Checks })

# ================================================================ 3. 설치 위치 · 선택
$p3 = New-Page; $pages[3] = $p3
$p3.Controls.Add((New-Label '어디에 설치할까요?' 30 18 700 26 $FontB))
$p3.Controls.Add((New-Label '이 폴더 하나에 모든 것이 들어갑니다. 영문 · 숫자로 된 짧은 경로가 안전합니다 (한글 · 띄어쓰기 X).' 30 46 700 22 $FontS $ColDim))
$txtDir = New-Object System.Windows.Forms.TextBox
$txtDir.Location = New-Object System.Drawing.Point(30, 74); $txtDir.Size = New-Object System.Drawing.Size(560, 28); $txtDir.Font = $FontN
$txtDir.Text = 'C:\CoFoTy5-OneNode'
$btnBrowse = New-Button '찾아보기…' 600 72 120 32
$p3.Controls.AddRange(@($txtDir, $btnBrowse))
$lblDir = New-Label '' 30 108 700 40 $FontS
$p3.Controls.Add($lblDir)

$p3.Controls.Add((New-Label '함께 설치할 것' 30 156 700 24 $FontB))
function New-Check($text, $y, $checked, $tip) {
    $c = New-Object System.Windows.Forms.CheckBox
    $c.Text = $text; $c.Location = New-Object System.Drawing.Point(34, $y); $c.Size = New-Object System.Drawing.Size(690, 24)
    $c.Checked = $checked; $c.Font = $FontN; $c.BackColor = [System.Drawing.Color]::Transparent
    $p3.Controls.Add($c)
    $p3.Controls.Add((New-Label $tip 54 ($y + 24) 670 20 $FontS $ColDim))
    return $c
}
$chkDetail = New-Check '손 · 얼굴 보정 (Impact Pack + 감지 모델, 약 0.6GB)' 184 $true '저장할 때 손과 얼굴을 찾아 한 번 더 다듬는 기능입니다.'
$chkLora = New-Check 'LoRA Manager (LoRA 미리보기 · 정보 받기)' 232 $true 'LoRA 그림과 설명을 받아 보여 주는 관리 화면입니다. ComfyUI 위쪽 메뉴에서 엽니다.'
$chkShortcut = New-Check '바탕화면에 바로가기 만들기' 280 $true '바탕화면의 [CoFoTy5 OneNode]를 두 번 누르면 시작합니다.'
$lblNeed = New-Label '' 30 330 700 44 $FontS
$p3.Controls.Add($lblNeed)

$btnBrowse.add_Click({
    $d = New-Object System.Windows.Forms.FolderBrowserDialog
    $d.Description = '설치할 위치를 고르세요. 고른 곳 안에 CoFoTy5-OneNode 폴더를 만듭니다.'
    if ($d.ShowDialog() -eq 'OK') {
        $p = $d.SelectedPath.TrimEnd('\')
        if ((Split-Path -Leaf $p) -ne 'CoFoTy5-OneNode') { $p = Join-Path $p 'CoFoTy5-OneNode' }
        $txtDir.Text = $p
    }
})

function Test-InstallDir {
    $p = $txtDir.Text.Trim().TrimEnd('\')
    $ok = $true; $msg = ''
    if ($p -notmatch '^[A-Za-z]:\\[A-Za-z0-9_\-\.\\]+$') { $ok = $false; $msg = '영문 · 숫자 · _ - . 만 쓸 수 있습니다 (한글 · 띄어쓰기 · 특수문자 X). 예) C:\CoFoTy5-OneNode' }
    elseif ($p.Length -gt 60) { $ok = $false; $msg = '경로가 너무 깁니다. 60자 이내로 짧게 해 주세요.' }
    elseif ($p -match '(?i)\\(windows|program files|program files \(x86\)|programdata)(\\|$)') { $ok = $false; $msg = '윈도우 · 프로그램 폴더 안에는 설치할 수 없습니다.' }
    elseif ($env:OneDrive -and $p.StartsWith($env:OneDrive, [StringComparison]::OrdinalIgnoreCase)) { $ok = $false; $msg = 'OneDrive 폴더 안은 동기화 때문에 문제가 생깁니다. 다른 곳을 고르세요.' }
    $drive = $null
    if ($ok) {
        try { $drive = New-Object System.IO.DriveInfo($p.Substring(0, 1)); if (-not $drive.IsReady) { $ok = $false; $msg = '그 드라이브를 쓸 수 없습니다.' } }
        catch { $ok = $false; $msg = '그 드라이브를 찾을 수 없습니다.' }
    }
    if ($ok) {
        $freeGB = [math]::Round($drive.AvailableFreeSpace / 1GB, 1)
        $exist = Test-Path (Join-Path $p '_installer\comfyui_unpacked.ok')
        $need = [double]$M.need_free_gb; if ($exist) { $need = 6 }
        if ($freeGB -lt $need) { $ok = $false; $msg = "남은 공간이 부족합니다: $freeGB GB (필요 약 $need GB)" }
        else {
            $msg = "남은 공간 $freeGB GB  ·  필요 약 $need GB"
            if ($exist) { $msg += "`n이미 설치되어 있습니다 → 빠진 것만 채우고 노드를 최신으로 고칩니다 (만든 그림 · LoRA · 모델은 그대로)." }
        }
    }
    $lblDir.Text = $msg; $lblDir.ForeColor = $(if ($ok) { $ColOk } else { $ColBad })
    $btnNext.Enabled = $ok
    return $ok
}
$txtDir.add_TextChanged({ [void](Test-InstallDir) })

# ================================================================ 4. 설치 진행
$p4 = New-Page; $pages[4] = $p4
$lblNow = New-Label '준비 중…' 30 16 700 24 $FontB
$barAll = New-Object System.Windows.Forms.ProgressBar
$barAll.Location = New-Object System.Drawing.Point(30, 44); $barAll.Size = New-Object System.Drawing.Size(600, 22); $barAll.Maximum = 1000
$lblFile = New-Label '' 30 72 700 20 $FontS $ColDim
$barFile = New-Object System.Windows.Forms.ProgressBar
$barFile.Location = New-Object System.Drawing.Point(30, 94); $barFile.Size = New-Object System.Drawing.Size(600, 12); $barFile.Maximum = 1000
$lstSteps = New-Object System.Windows.Forms.ListBox
$lstSteps.Location = New-Object System.Drawing.Point(30, 118); $lstSteps.Size = New-Object System.Drawing.Size(600, 230); $lstSteps.Font = $FontN
$lstSteps.IntegralHeight = $false
$txtLog = New-Object System.Windows.Forms.TextBox
$txtLog.Location = New-Object System.Drawing.Point(30, 118); $txtLog.Size = New-Object System.Drawing.Size(600, 230)
$txtLog.Multiline = $true; $txtLog.ScrollBars = 'Vertical'; $txtLog.ReadOnly = $true; $txtLog.Visible = $false
$txtLog.Font = New-Object System.Drawing.Font('Consolas', 8.5)
$btnLog = New-Button '자세한 기록 보기' 30 356 160 30
$p4.Controls.Add((New-Label '창을 닫거나 [취소]해도, 다시 실행하면 이어서 합니다.' 200 362 520 22 $FontS $ColDim))
$p4.Controls.AddRange(@($lblNow, $barAll, $lblFile, $barFile, $lstSteps, $txtLog, $btnLog))
$btnLog.add_Click({ $txtLog.Visible = -not $txtLog.Visible; $lstSteps.Visible = -not $txtLog.Visible
    $btnLog.Text = $(if ($txtLog.Visible) { '단계 보기' } else { '자세한 기록 보기' }) })

# ================================================================ 5. 끝
$p5 = New-Page; $pages[5] = $p5
$lblDoneT = New-Label '' 30 24 700 30 $FontT
$lblDone = New-Label '' 30 66 700 220
$btnRun = New-Button '지금 시작하기' 30 300 160 40
$btnOpen = New-Button '설치 폴더 열기' 200 300 160 40
$btnRun.Font = $FontB
$p5.Controls.AddRange(@($lblDoneT, $lblDone, $btnRun, $btnOpen))

# ================================================================ 설치 작업 (뒤에서 돌아감)
$Worker = {
    param($sync, $cfg)
    $ErrorActionPreference = 'Stop'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $Inst = $cfg.Inst; $Comfy = Join-Path $Inst 'ComfyUI_windows_portable'
    $Work = Join-Path $Inst '_installer'; $Dl = Join-Path $Work 'downloads'
    New-Item -ItemType Directory -Force -Path $Dl | Out-Null
    $LogFile = Join-Path $Work 'install.log'
    $Unpacked = Join-Path $Work 'comfyui_unpacked.ok'

    function Log($t) {
        $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $t
        [void]$sync.Log.Add($line)
        try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch {}
    }
    function Check-Cancel { if ($sync.Cancel) { throw 'CANCELLED' } }
    function Step($i, $state) { $sync.Steps[$i].State = $state; $sync.StepIdx = $i; $sync.Changed = $true }
    function Get-Sha($path) { return (Get-FileHash -Algorithm SHA256 -Path $path).Hash.ToLower() }

    function Get-Url($url, $dest, $sha, $label, $again = $false) {
        if (Test-Path $dest) {
            if (-not $sha) { Log "있음: $label"; return }
            $sync.FileLabel = "$label — 이미 받은 파일 확인 중…"; $sync.FileCur = 0; $sync.FileTotal = 0
            if (@($sha) -contains (Get-Sha $dest)) { Log "확인됨(이미 있음): $label"; return }
            Log "이미 있는 파일이 설치 프로그램에 적힌 버전과 다릅니다. 직접 바꾸신 새 버전으로 보고 그대로 둡니다: $label"; return
        }
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
        $part = "$dest.part"
        for ($try = 1; $try -le 6; $try++) {
            Check-Cancel
            $start = 0L; if (Test-Path $part) { $start = (Get-Item $part).Length }
            try {
                $req = [Net.HttpWebRequest]::Create($url)
                $req.UserAgent = 'CoFoTy5OneNodeInstaller/1.0'; $req.AllowAutoRedirect = $true
                $req.Timeout = 30000; $req.ReadWriteTimeout = 60000
                if ($start -gt 0) { $req.AddRange([long]$start) }
                $resp = $req.GetResponse()
                $code = [int]$resp.StatusCode
                if ($start -gt 0 -and $code -ne 206) { $start = 0L }  # 이어받기를 안 받아주면 처음부터
                $len = $resp.ContentLength
                $total = $(if ($len -gt 0) { $start + $len } else { -1 })
                $in = $resp.GetResponseStream()
                $mode = $(if ($start -gt 0) { [IO.FileMode]::Append } else { [IO.FileMode]::Create })
                $out = New-Object IO.FileStream($part, $mode, [IO.FileAccess]::Write, [IO.FileShare]::None, 1048576)
                $buf = New-Object byte[] 1048576
                $got = $start; $t0 = [DateTime]::Now; $g0 = $got; $lastUi = [DateTime]::MinValue
                try {
                    while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
                        $out.Write($buf, 0, $n); $got += $n
                        $now = [DateTime]::Now
                        if (($now - $lastUi).TotalMilliseconds -gt 250) {
                            $lastUi = $now
                            $sec = ($now - $t0).TotalSeconds
                            $speed = $(if ($sec -gt 0.5) { ($got - $g0) / $sec } else { 0 })
                            $sync.FileCur = $got; $sync.FileTotal = $total
                            $mb = [math]::Round($got / 1MB); $tmb = $(if ($total -gt 0) { [math]::Round($total / 1MB) } else { '?' })
                            $eta = ''
                            if ($speed -gt 0 -and $total -gt 0) { $left = ($total - $got) / $speed; $eta = ' · 남은 시간 약 ' + $(if ($left -ge 60) { '{0}분' -f [math]::Ceiling($left / 60) } else { '{0}초' -f [math]::Ceiling($left) }) }
                            $sync.FileLabel = '{0} — {1} / {2} MB · {3:N1} MB/s{4}' -f $label, $mb, $tmb, ($speed / 1MB), $eta
                            if ($sync.Cancel) { throw 'CANCELLED' }
                        }
                    }
                } finally { $out.Close(); $in.Close(); $resp.Close() }
                if ($total -gt 0 -and (Get-Item $part).Length -lt $total) { throw "받다가 끊겼습니다 ($([math]::Round((Get-Item $part).Length/1MB))MB)" }
                break
            } catch {
                if ("$_" -match 'CANCELLED') { throw }
                Log "받기 실패 ($try/6) $label : $($_.Exception.Message)"
                if ($try -eq 6) { throw "받기에 계속 실패했습니다: $label`n$($_.Exception.Message)" }
                Start-Sleep -Seconds ([math]::Min(30, 3 * $try))
            }
        }
        if ($sha) {
            $sync.FileLabel = "$label — 파일 확인 중 (SHA256)…"
            $h = Get-Sha $part
            if (@($sha) -notcontains $h) {
                $sz = (Get-Item $part).Length
                Log "SHA256 불일치: $label · 크기 $sz 바이트 · 받은 값 $h · 기대한 값 $(@($sha) -join " 또는 ")"
                Remove-Item -Force $part
                if (-not $again) { Log "한 번 더 새로 받아 확인합니다: $label"; Get-Url $url $dest $sha $label $true; return }
                throw "받은 파일이 원본과 다릅니다(손상 또는 변경): $label`n자세한 값은 기록 파일에 있습니다: $LogFile"
            }
        }
        Move-Item -Force $part $dest
        Log "받음: $label"
    }

    function Run-Py($argList, $label) {
        $py = Join-Path $Comfy 'python_embeded\python.exe'
        $out = Join-Path $Work 'pip_out.txt'
        $sync.FileLabel = "$label — 설치 중 (몇 분 걸릴 수 있습니다)…"; $sync.FileCur = 0; $sync.FileTotal = 0
        Log "실행: python $argList"
        $p = Start-Process -FilePath $py -ArgumentList $argList -WorkingDirectory $Comfy -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput $out -RedirectStandardError "$out.err"
        $null = $p.Handle   # PowerShell 5.1: 이걸 잡아 두지 않으면 끝난 뒤 종료 코드가 비어 버림
        while (-not $p.HasExited) {
            Start-Sleep -Milliseconds 500
            try { $last = Get-Content $out -Tail 1 -ErrorAction SilentlyContinue; if ($last) { $sync.FileLabel = "$label — $($last.Trim())" } } catch {}
            if ($sync.Cancel) { try { $p.Kill() } catch {}; throw 'CANCELLED' }
        }
        $p.WaitForExit()
        try { Get-Content $out -ErrorAction SilentlyContinue | Select-Object -Last 15 | ForEach-Object { Log "  $_" } } catch {}
        try { Get-Content "$out.err" -ErrorAction SilentlyContinue | Select-Object -Last 15 | ForEach-Object { Log "  ! $_" } } catch {}
        $code = $p.ExitCode
        if ($null -eq $code) {   # 종료 코드를 못 읽은 경우: 오류 출력이 없으면 성공으로 봄
            $errTxt = ''; try { $errTxt = [string](Get-Content "$out.err" -Raw -ErrorAction SilentlyContinue) } catch {}
            $code = $(if ($errTxt -match '(?m)^ERROR') { 1 } else { 0 })
            Log "(종료 코드를 읽지 못해 출력으로 판단: $code)"
        }
        if ($code -ne 0) { throw "$label 설치에 실패했습니다 (코드 $code). 자세한 기록: $LogFile" }
    }
    $PipBase = '-s -m pip install --no-warn-script-location --disable-pip-version-check --progress-bar off'

    function Install-Node($n) {
        $dest = Join-Path $Comfy "ComfyUI\custom_nodes\$($n.folder)"
        if (-not (Test-Path (Join-Path $dest '__init__.py'))) {
            $zip = Join-Path $Dl "$($n.folder).zip"
            if (Test-Path $zip) { Remove-Item -Force $zip }
            Get-Url $n.url $zip $null $n.label
            $tmp = Join-Path $Work "unzip_$($n.folder)"
            if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
            $sync.FileLabel = "$($n.label) — 압축 푸는 중…"
            Expand-Archive -Path $zip -DestinationPath $tmp -Force
            $inner = Get-ChildItem $tmp -Directory | Select-Object -First 1
            if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
            Move-Item $inner.FullName $dest
            Remove-Item -Recurse -Force $tmp; Remove-Item -Force $zip
            Log "노드 설치: $($n.folder)"
        } else { Log "노드 있음: $($n.folder)" }
        $req = Join-Path $dest 'requirements.txt'
        if (Test-Path $req) {
            # git이 필요한 줄(git+https…)은 빼고 설치 — 빠져도 이 설치판에서 쓰는 기능에는 영향 없음
            $clean = Join-Path $Work "req_$($n.folder).txt"
            Get-Content $req -Encoding UTF8 | Where-Object { $_.Trim() -and -not $_.Trim().StartsWith('#') -and $_ -notmatch '^\s*git\+' } |
                Set-Content -Path $clean -Encoding ASCII
            Run-Py "$PipBase -r `"$clean`"" $n.label
        }
    }

    try {
        Log "설치 시작: $Inst"
        $i = 0
        foreach ($s in $sync.Steps) {
            Check-Cancel
            Step $i 'run'
            $sync.Now = $s.Label
            switch ($s.Kind) {
                'tool' {
                    Get-Url $cfg.M.tool_7zr.url (Join-Path $Work '7zr.exe') $cfg.M.tool_7zr.sha256 '압축 풀기 도구 (7-Zip)'
                }
                'comfy_get' {
                    if (Test-Path $Unpacked) { Log 'ComfyUI 있음 — 받기 건너뜀' }
                    else { Get-Url $cfg.M.comfyui.url (Join-Path $Dl 'ComfyUI_portable.7z') $cfg.M.comfyui.sha256 $cfg.M.comfyui.label }
                }
                'comfy_unpack' {
                    if (Test-Path $Unpacked) { Log 'ComfyUI 있음 — 풀기 건너뜀' }
                    else {
                        $sync.FileLabel = 'ComfyUI 압축 푸는 중… (몇 분 걸립니다)'; $sync.FileCur = 0; $sync.FileTotal = 0
                        $z = Join-Path $Work '7zr.exe'
                        $p = Start-Process -FilePath $z -ArgumentList "x `"$(Join-Path $Dl 'ComfyUI_portable.7z')`" -o`"$Inst`" -y -bso0 -bsp0" -WindowStyle Hidden -PassThru
                        $null = $p.Handle
                        while (-not $p.HasExited) { Start-Sleep -Milliseconds 500; if ($sync.Cancel) { try { $p.Kill() } catch {}; throw 'CANCELLED' } }
                        $p.WaitForExit()
                        if ($p.ExitCode -ne 0 -and $null -ne $p.ExitCode) { throw "ComfyUI 압축을 풀지 못했습니다 (코드 $($p.ExitCode)). 공간이 충분한지 확인하세요." }
                        Set-Content -Path $Unpacked -Value (Get-Date -Format 's')   # 끝까지 풀었다는 표시 (중간에 멈춘 경우 다시 풂)
                        Remove-Item -Force (Join-Path $Dl 'ComfyUI_portable.7z')
                        Log 'ComfyUI 풀기 완료'
                    }
                }
                'manager' {
                    Run-Py "$PipBase -r `"ComfyUI\manager_requirements.txt`"" 'ComfyUI-Manager 켜기'
                }
                'node' { Install-Node $s.Node }
                'simple' {
                    $src = Join-Path $cfg.PackRoot 'cofoty5_onenode'
                    $dst = Join-Path $Comfy 'ComfyUI\custom_nodes\cofoty5_onenode'
                    New-Item -ItemType Directory -Force -Path $dst | Out-Null
                    # 코드만 덮어씀 — LoRA 세트 · 사전 · 번역 기록 같은 사용자 파일은 그대로
                    Copy-Item -Path (Join-Path $src '*') -Destination $dst -Recurse -Force
                    Log 'OneNode 노드 복사'
                    Run-Py "$PipBase -r `"$(Join-Path $dst 'requirements.txt')`"" 'OneNode 노드 (GPU 정보 표시)'
                }
                'model' {
                    $m = $s.Model
                    try { Get-Url $m.url (Join-Path $Comfy ("ComfyUI\" + ($m.path -replace '/', '\'))) $m.sha256 $m.label }
                    catch {
                        if ("$_" -match 'CANCELLED' -or $m.id -ne 'detail') { throw }
                        Log "건너뜀(없어도 그림은 만들어집니다): $($m.label) — $_"
                        $sync.Skipped = @($sync.Skipped) + $m.label
                    }
                }
                'finish' {
                    $sync.FileLabel = '바로가기 · 설정 만드는 중…'
                    # 처음 켤 때: 한국어 화면, 튜토리얼 창 생략 (이미 설정이 있으면 건드리지 않음)
                    $setDir = Join-Path $Comfy 'ComfyUI\user\default'
                    New-Item -ItemType Directory -Force -Path $setDir | Out-Null
                    $setFile = Join-Path $setDir 'comfy.settings.json'
                    if (-not (Test-Path $setFile)) {
                        [IO.File]::WriteAllText($setFile, '{ "Comfy.Locale": "ko", "Comfy.TutorialCompleted": true }', (New-Object Text.UTF8Encoding($false)))
                    }
                    # 시작 · 지우기 파일 (설치 폴더 맨 위)
                    Copy-Item -Force (Join-Path $cfg.Here 'files\Start_OneNode.bat') (Join-Path $Inst 'Start_OneNode.bat')
                    if ($cfg.CpuMode) {   # 그래픽카드 없이 설치: CPU로 켜기
                        $sb = Join-Path $Inst 'Start_OneNode.bat'
                        $t = [IO.File]::ReadAllText($sb, [Text.Encoding]::UTF8).Replace('--enable-manager', '--cpu --enable-manager')
                        [IO.File]::WriteAllText($sb, $t, (New-Object Text.UTF8Encoding($false)))
                        Log 'CPU 모드로 설치: Start_OneNode.bat에 --cpu를 넣었습니다 (그림 만들기가 매우 느립니다)'
                    }
                    Copy-Item -Force (Join-Path $cfg.Here 'files\Uninstall_OneNode.bat') (Join-Path $Inst 'Uninstall_OneNode.bat')
                    Copy-Item -Force (Join-Path $cfg.Here 'files\uninstall.ps1') (Join-Path $Work 'uninstall.ps1')
                    Copy-Item -Force (Join-Path $cfg.Here 'files\README_folder.txt') (Join-Path $Inst 'README_설치폴더.txt')   # zip 안 파일 이름은 영문(압축 풀 때 글자 깨짐 방지)
                    if ($cfg.Shortcut) {
                        $desk = [Environment]::GetFolderPath('Desktop')
                        $sh = New-Object -ComObject WScript.Shell
                        $lnk = $sh.CreateShortcut((Join-Path $desk 'CoFoTy5 OneNode.lnk'))
                        $lnk.TargetPath = Join-Path $Inst 'Start_OneNode.bat'
                        $lnk.WorkingDirectory = $Inst
                        $lnk.Description = 'CoFoTy5 OneNode (ComfyUI) 시작'
                        try {   # 도트 아이콘 (못 복사해도 바로가기는 기본 아이콘으로 만들어짐)
                            $ico = Join-Path $Work 'CoFoTy5.ico'
                            Copy-Item -Force (Join-Path $cfg.Here 'files\CoFoTy5.ico') $ico
                            $lnk.IconLocation = "$ico,0"
                        } catch { Log "바로가기 아이콘을 넣지 못했습니다(무시): $($_.Exception.Message)" }
                        $lnk.Save()
                        Log '바탕화면 바로가기 만듦'
                    }
                    $info = @{ version = $cfg.M.version; installed = (Get-Date -Format 's'); comfyui = $cfg.M.comfyui.label; detail = $cfg.Detail; lora = $cfg.Lora; shortcut = $cfg.Shortcut }
                    [IO.File]::WriteAllText((Join-Path $Work 'install_info.json'), ($info | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
                    if (Test-Path $Dl) { Get-ChildItem $Dl -Filter *.part -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue }
                }
            }
            Step $i 'done'
            $i++
        }
        Log '설치 완료'
        $sync.Done = $true
    } catch {
        $msg = "$_"
        if ($msg -match 'CANCELLED') { $sync.Error = 'CANCELLED'; Log '취소됨' }
        else { $sync.Error = $msg; Log "오류: $msg" }
        if ($sync.StepIdx -ge 0) { $sync.Steps[$sync.StepIdx].State = 'fail' }
        $sync.Changed = $true
    }
}

# ---------------------------------------------------------------- 단계 목록 만들기
function Build-Steps {
    $L = New-Object System.Collections.ArrayList
    function Add($label, $kind, $w, $extra = @{}) { $h = @{ Label = $label; Kind = $kind; W = $w; State = 'wait' }; foreach ($k in $extra.Keys) { $h[$k] = $extra[$k] }; [void]$L.Add($h) }
    Add '압축 풀기 도구 받기' 'tool' 5
    Add 'ComfyUI 받기 (약 2GB)' 'comfy_get' 2050
    Add 'ComfyUI 풀기' 'comfy_unpack' 600
    Add 'ComfyUI-Manager 켜기' 'manager' 60
    foreach ($n in $M.nodes) {
        if ($n.id -eq 'lora' -and -not $chkLora.Checked) { continue }
        if ($n.id -eq 'detail' -and -not $chkDetail.Checked) { continue }
        Add "노드: $($n.label)" 'node' 250 @{ Node = $n }
    }
    Add 'OneNode 노드 설치' 'simple' 20
    foreach ($m in $M.models) {
        if ($m.id -eq 'detail' -and -not $chkDetail.Checked) { continue }
        Add "모델: $($m.label)" 'model' ([double]$m.approx_mb) @{ Model = $m }
    }
    Add '시작 · 지우기 파일과 바로가기 만들기' 'finish' 5
    return , $L.ToArray()
}

# ---------------------------------------------------------------- 진행
$script:Page = 1
$script:Sync = $null; $script:PS = $null
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 200
$StateMark = @{ wait = '　'; run = '▶'; done = '✔'; fail = '✖' }

function Refresh-Steps {
    $s = $script:Sync
    $lstSteps.BeginUpdate(); $lstSteps.Items.Clear()
    foreach ($x in $s.Steps) { [void]$lstSteps.Items.Add(" $($StateMark[$x.State])  $($x.Label)") }
    $lstSteps.EndUpdate()
    if ($s.StepIdx -ge 0) { $lstSteps.TopIndex = [math]::Max(0, $s.StepIdx - 5) }
}
$timer.add_Tick({
    $s = $script:Sync; if (-not $s) { return }
    if ($s.Changed) { $s.Changed = $false; Refresh-Steps }
    $lblNow.Text = $(if ($s.Now) { $s.Now } else { '준비 중…' })
    $lblFile.Text = $s.FileLabel
    if ($s.FileTotal -gt 0) { $barFile.Style = 'Continuous'; $barFile.Value = [int][math]::Min(1000, 1000 * $s.FileCur / $s.FileTotal) }
    else { $barFile.Style = 'Marquee' }
    # 전체 진행: 끝난 단계 무게 + 지금 단계 진행
    $all = 0.0; $done = 0.0
    foreach ($x in $s.Steps) { $all += $x.W; if ($x.State -eq 'done') { $done += $x.W } }
    if ($s.StepIdx -ge 0 -and $s.Steps[$s.StepIdx].State -eq 'run' -and $s.FileTotal -gt 0) { $done += $s.Steps[$s.StepIdx].W * $s.FileCur / $s.FileTotal }
    if ($all -gt 0) { $barAll.Value = [int][math]::Min(1000, 1000 * $done / $all) }
    while ($s.Log.Count -gt 0) { $line = $s.Log[0]; $s.Log.RemoveAt(0); $txtLog.AppendText($line + "`r`n") }
    if ($s.Done -or $s.Error) { $timer.Stop(); Finish-Install }
})

function Start-Install {
    $inst = $txtDir.Text.Trim().TrimEnd('\')
    New-Item -ItemType Directory -Force -Path $inst | Out-Null
    $sync = [hashtable]::Synchronized(@{})
    $sync.Steps = Build-Steps; $sync.StepIdx = -1; $sync.Changed = $true
    $sync.Log = [System.Collections.ArrayList]::Synchronized((New-Object System.Collections.ArrayList))
    $sync.FileCur = 0; $sync.FileTotal = 0; $sync.FileLabel = ''; $sync.Now = ''
    $sync.Done = $false; $sync.Error = $null; $sync.Cancel = $false; $sync.Skipped = @()
    $script:Sync = $sync
    $cfg = @{ Inst = $inst; M = $M; Here = $Here; PackRoot = $PackRoot; Shortcut = $chkShortcut.Checked; Detail = $chkDetail.Checked; Lora = $chkLora.Checked; CpuMode = ($script:GpuMissing -and $chkCpu.Checked) }
    $rs = [runspacefactory]::CreateRunspace(); $rs.ApartmentState = 'STA'; $rs.Open()
    $ps = [powershell]::Create(); $ps.Runspace = $rs
    [void]$ps.AddScript($Worker.ToString()).AddArgument($sync).AddArgument($cfg)
    $script:PS = $ps; $script:Handle = $ps.BeginInvoke()
    $timer.Start()
}

function Finish-Install {
    $s = $script:Sync
    $inst = $txtDir.Text.Trim().TrimEnd('\')
    $script:Inst = $inst
    $script:DoneOk = [bool]$s.Done
    if ($s.Done) {
        $lblDoneT.Text = '설치가 끝났습니다!'; $lblDoneT.ForeColor = $ColOk
        $msg = @"
이제 [지금 시작하기]를 누르거나, 바탕화면의 [CoFoTy5 OneNode]를 두 번 누르면 됩니다.

  • 검은 창(ComfyUI)이 뜨고, 잠시 뒤 인터넷 창에 작업 화면이 열립니다.
  • 처음 켤 때는 모델을 읽느라 1~2분 걸릴 수 있습니다.
  • 검은 창을 닫으면 ComfyUI가 꺼집니다.
  • 만든 그림은 아래 폴더에 저장됩니다.
      $inst\ComfyUI_windows_portable\ComfyUI\output
  • 지우고 싶을 때: 설치 폴더의 Uninstall_OneNode.bat (또는 폴더째 삭제)
"@
        if (@($s.Skipped).Count -gt 0) {
            $msg += "`n`n※ 받지 못해 건너뛴 보정 모델: " + (@($s.Skipped) -join ', ') + "`n   그림 만들기에는 영향이 없고, 손·얼굴 보정 기능만 빠집니다. 필요하면 ComfyUI의 models\ultralytics\bbox 폴더에 해당 파일을 직접 넣으세요."
        }
        $lblDone.Text = $msg
        $btnRun.Visible = $true; $btnOpen.Visible = $true
    } else {
        $btnRun.Visible = $false; $btnOpen.Visible = $true
        if ($s.Error -eq 'CANCELLED') {
            $lblDoneT.Text = '설치를 멈췄습니다'; $lblDoneT.ForeColor = $ColWarn
            $lblDone.Text = "받은 파일은 그대로 남아 있습니다.`n설치 프로그램을 다시 실행하고 같은 폴더를 고르면 이어서 진행합니다."
        } else {
            $lblDoneT.Text = '설치 중 문제가 생겼습니다'; $lblDoneT.ForeColor = $ColBad
            $lblDone.Text = "$($s.Error)`n`n• 인터넷이 잠깐 끊긴 경우가 대부분입니다. 설치 프로그램을 다시 실행하면 이어서 진행합니다.`n• 계속 같은 곳에서 멈추면, 아래 기록 파일을 문의할 때 함께 보내 주세요:`n   $inst\_installer\install.log"
        }
    }
    Show-Page 5
}

# ---------------------------------------------------------------- 페이지 이동
$Titles = @{ 1 = '1 / 4  안내'; 2 = '2 / 4  이 PC 확인'; 3 = '3 / 4  설치 위치'; 4 = '4 / 4  설치 중'; 5 = '끝' }
function Show-Page($n) {
    foreach ($k in $pages.Keys) { $pages[$k].Visible = ($k -eq $n) }
    $script:Page = $n; $stepLbl.Text = $Titles[$n]
    if ($n -eq 5 -and $script:DoneOk -and $ImgDone) { $p5.BackgroundImage = $ImgDone } elseif ($ImgWelcome) { $p5.BackgroundImage = $ImgWelcome }   # 설치가 성공했을 때만 완료 그림
    $btnBack.Visible = ($n -eq 2 -or $n -eq 3); $btnNext.Visible = ($n -le 3)
    $btnNext.Text = $(if ($n -eq 3) { '설치 시작' } else { '다음 >' })
    $btnCancel.Text = $(if ($n -eq 5) { '닫기' } else { '취소' })
    switch ($n) {
        1 { $btnNext.Enabled = $chkLic.Checked }
        2 { Invoke-Checks }
        3 { [void](Test-InstallDir) }
        4 { $btnCancel.Enabled = $true }
    }
}
$chkLic.add_CheckedChanged({ if ($script:Page -eq 1) { $btnNext.Enabled = $chkLic.Checked } })
$btnNext.add_Click({
    if ($script:Page -eq 3) {
        if (-not (Test-InstallDir)) { return }
        Show-Page 4; Start-Install
    } else { Show-Page ($script:Page + 1) }
})
$btnBack.add_Click({ Show-Page ($script:Page - 1) })
$btnCancel.add_Click({
    if ($script:Page -eq 4 -and $script:Sync -and -not $script:Sync.Done -and -not $script:Sync.Error) {
        if ((Show-Msg "설치를 멈출까요?`n받은 파일은 남아 있어서, 다시 실행하면 이어서 합니다." 'Question' 'YesNo') -eq 'Yes') {
            $script:Sync.Cancel = $true; $btnCancel.Enabled = $false; $lblNow.Text = '멈추는 중…'
        }
        return
    }
    $form.Close()
})
$form.add_FormClosing({
    param($sender, $e)
    if ($script:Page -eq 4 -and $script:Sync -and -not $script:Sync.Done -and -not $script:Sync.Error) {
        if ((Show-Msg "설치 중입니다. 창을 닫을까요?`n다시 실행하면 이어서 합니다." 'Question' 'YesNo') -ne 'Yes') { $e.Cancel = $true; return }
        $script:Sync.Cancel = $true
    }
})
$btnRun.add_Click({
    Start-Process -FilePath (Join-Path $script:Inst 'Start_OneNode.bat') -WorkingDirectory $script:Inst
    $form.Close()
})
$btnOpen.add_Click({ Start-Process explorer.exe $script:Inst })

Show-Page 1
$script:Ready = $true
[void]$form.ShowDialog()
if ($script:PS) { try { $script:PS.Stop() } catch {} }
