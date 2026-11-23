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

# 1쪽(설치 방식)에는 맞이 그림, 2쪽부터는 진행 그림, 끝 쪽(설치 완료)에는 완료 그림을 쪽 배경으로 깔음
# (오른쪽 그림이 왼쪽 흰색으로 섞이도록 미리 만들어 둔 1000x430 그림). 그림 파일이 없거나 못 읽어도 설치는 그대로 진행됨
function Get-Art($name) { try { $p = Join-Path $Here "img\$name"; if (Test-Path $p) { return [System.Drawing.Image]::FromFile($p) } } catch {} return $null }
$ImgWelcome = Get-Art 'bg_welcome.jpg'
$ImgStep = Get-Art 'bg_step.jpg'; if (-not $ImgStep) { $ImgStep = $ImgWelcome }
$ImgDone = Get-Art 'bg_done.jpg'
$script:DoneOk = $false

$btnBack = New-Button '< 이전' 650 512
$btnNext = New-Button '다음 >' 765 512
$btnCancel = New-Button '취소' 880 512
$form.Controls.AddRange(@($btnBack, $btnNext, $btnCancel))

# 맨 아래 버튼 줄 왼쪽: 제작자 · GitHub (누르면 이동)
$name = '완성형5번유형'; $gh = 'github.com/CoFoTy5/CoFoTy5-OneNode'
$pre1 = '제작 : '; $pre2 = '   GitHub : '
$credit = New-Object System.Windows.Forms.LinkLabel
$credit.Text = $pre1 + $name + $pre2 + $gh; $credit.Font = $FontS; $credit.AutoSize = $false
$credit.Location = New-Object System.Drawing.Point(24, 521); $credit.Size = New-Object System.Drawing.Size(560, 20)
$credit.BackColor = [System.Drawing.Color]::White; $credit.ForeColor = $ColDim
$credit.LinkColor = $ColAccent; $credit.ActiveLinkColor = $ColAccent
[void]$credit.Links.Add($pre1.Length, $name.Length, 'https://cft5.pages.dev/')
[void]$credit.Links.Add(($pre1 + $name + $pre2).Length, $gh.Length, 'https://github.com/CoFoTy5/CoFoTy5-OneNode')
$credit.add_LinkClicked({ param($s, $e) Start-Process ([string]$e.Link.LinkData) })
$form.Controls.Add($credit)

$pages = @{}
function New-Page($img = $ImgStep) { $p = New-Object System.Windows.Forms.Panel; $p.Dock = 'Fill'; $p.Visible = $false
    if ($img) { $p.BackgroundImage = $img; $p.BackgroundImageLayout = 'None' }   # 1쪽만 맞이 그림, 끝 쪽은 설치가 성공하면 완료 그림
    $body.Controls.Add($p); return $p }
$script:Mode = 'new'   # 'new' = 새로 설치, 'addon' = 이미 쓰는 ComfyUI에 추가


# ================================================================ 1. 설치 방식 · 라이선스
$p1 = New-Page $ImgWelcome; $pages[1] = $p1
$p1.Controls.Add((New-Label '어떻게 설치할까요?' 30 18 560 26 $FontB))
function New-Radio($text, $y) {
    $r = New-Object System.Windows.Forms.RadioButton
    $r.Text = $text; $r.Location = New-Object System.Drawing.Point(30, $y); $r.Size = New-Object System.Drawing.Size(540, 26)
    $r.Font = $FontB; $r.BackColor = [System.Drawing.Color]::Transparent
    $p1.Controls.Add($r); return $r
}
$radNew = New-Radio '새로 설치  —  ComfyUI를 처음 쓰는 분' 54
$radNew.Checked = $true
$p1.Controls.Add((New-Label '폴더 하나에 ComfyUI · OneNode · 모델을 새로 설치합니다.' 52 84 520 22 $FontS $ColDim))
$radAdd = New-Radio '이미 쓰는 ComfyUI에 추가  —  ComfyUI 사용자' 134
$p1.Controls.Add((New-Label '쓰던 ComfyUI에 OneNode를 더하고, 빠진 것만 받습니다.' 52 164 520 22 $FontS $ColDim))

# 라이선스는 아래쪽에 맞춤
$p1.Controls.Add((New-Label '모델 라이선스' 30 284 540 24 $FontB))
$p1.Controls.Add((New-Label "Anima 모델은 비상업 라이선스입니다. 만든 그림에는 적용되지 않지만,`n모델 파일을 판매하거나 상업 서비스에 쓸 수는 없습니다." 30 310 540 40 $FontS $ColDim))
$licLink = New-Object System.Windows.Forms.LinkLabel
$licLink.Text = '라이선스 전문 보기 (Hugging Face)'; $licLink.Location = New-Object System.Drawing.Point(30, 352)
$licLink.Size = New-Object System.Drawing.Size(400, 22); $licLink.Font = $FontS; $licLink.BackColor = [System.Drawing.Color]::Transparent
$licLink.add_LinkClicked({ Start-Process 'https://huggingface.co/circlestone-labs/Anima/blob/main/LICENSE.md' })
$p1.Controls.Add($licLink)
$chkLic = New-Object System.Windows.Forms.CheckBox
$chkLic.Text = '위 내용을 확인했고 동의합니다'; $chkLic.Location = New-Object System.Drawing.Point(30, 382)
$chkLic.Size = New-Object System.Drawing.Size(500, 26); $chkLic.Font = $FontB; $chkLic.BackColor = [System.Drawing.Color]::Transparent
$p1.Controls.Add($chkLic)

# ================================================================ 2. 안내 (고른 방식에 따라 내용이 바뀜: 왼쪽 제목 · 오른쪽 설명 표)
$p2i = New-Page; $pages[2] = $p2i
$lblIntroT = New-Label '' 30 16 560 26 $FontB
$lblIntroS = New-Label '' 30 44 560 22 $FontS $ColDim
$introPanel = New-Object System.Windows.Forms.Panel
$introPanel.Location = New-Object System.Drawing.Point(0, 76); $introPanel.Size = New-Object System.Drawing.Size(640, 350)
$introPanel.BackColor = [System.Drawing.Color]::Transparent
$p2i.Controls.AddRange(@($lblIntroT, $lblIntroS, $introPanel))
# 한 줄에 들어가는 글자 수(대략 35자)로 줄 수를 어림해서 칸 높이를 정함
function Set-Intro($title, $sub, $rows) {
    $lblIntroT.Text = $title; $lblIntroS.Text = $sub
    $introPanel.Controls.Clear()
    $y = 0
    foreach ($r in $rows) {
        $lines = 0
        foreach ($ln in ([string]$r[1]).Split("`n")) { $lines += [math]::Max(1, [math]::Ceiling($ln.Length / 35.0)) }
        $h = $lines * 19 + 4
        $sep = New-Object System.Windows.Forms.Panel
        $sep.Location = New-Object System.Drawing.Point(30, $y); $sep.Size = New-Object System.Drawing.Size(600, 1)
        $sep.BackColor = [System.Drawing.Color]::FromArgb(225, 225, 225)
        $introPanel.Controls.Add($sep)
        $introPanel.Controls.Add((New-Label $r[0] 30 ($y + 6) 128 22 $FontB $ColAccent))
        $introPanel.Controls.Add((New-Label $r[1] 162 ($y + 6) 468 $h $FontN))
        $y += $h + 8
    }
}
$IntroNewT = '새로 설치'
$IntroNewS = 'ComfyUI(공식 포터블판)를 새로 설치하고, OneNode를 바로 쓸 수 있게 준비합니다.'
$IntroNew = @(
    @('받는 것', "ComfyUI · Anima 모델 3개`n(고르면) 손·얼굴 보정 · LoRA Manager · 가속"),
    @('받을 양 · 시간', '약 8GB (설치 후 약 18GB) · 20분~1시간'),
    @('설치 위치', '고른 폴더 하나 안에만 설치합니다. 관리자 권한이 필요 없고, 윈도우 설정은 바꾸지 않습니다.'),
    @('끊겼을 때', '다시 실행하면 받은 데까지 이어서 합니다.'),
    @('다시 설치하면', '같은 폴더를 고르면 빠진 것만 채우고 노드를 최신으로 고칩니다. (그림 · LoRA · 모델은 그대로)'),
    @('지우기', '설치 폴더의 Uninstall_OneNode.bat 또는 폴더째 삭제')
)
$IntroAddT = '이미 쓰는 ComfyUI에 추가'
$IntroAddS = '다음 쪽에서 ComfyUI를 찾아 점검하고, 받을 것을 보여 드린 뒤에 시작합니다.'
$IntroAdd = @(
    @('넣는 것', 'OneNode 노드 · 시작용 워크플로(★ 즐겨찾기)'),
    @('없을 때만 받는 것', 'Anima 모델 3개(약 5.5GB) · 손·얼굴 보정 · LoRA Manager (이미 있거나 꺼 둔 것은 그대로)'),
    @('바꾸지 않는 것', 'ComfyUI 본체 · PyTorch · 설정 · 실행 파일 · 다른 노드와 모델'),
    @('파이썬 부품', '새 부품만 더합니다. 버전을 바꿔야 하는 노드는 건너뛰고, 시작 전 부품 목록을 백업합니다.'),
    @('가속 기능', '새로 설치하지 않고, 이미 있으면 시험만 합니다.'),
    @('시작 전에', 'ComfyUI는 꺼 두세요. 끝나면 처음 켤 때 워크플로가 새 탭으로 한 번 열립니다.'),
    @('지우기', '기록 폴더의 Uninstall_OneNode.bat (OneNode가 더한 것만 지움)')
)

# ================================================================ 3. 이 PC 확인
$p2 = New-Page; $pages[3] = $p2
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
$chkCpu.add_CheckedChanged({ if ($script:Page -eq 3) { Update-NextP2 } })

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

# ================================================================ 4. 설치 위치 · 선택 (새로 설치)
$p3 = New-Page; $pages[4] = $p3
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
$chkAccel = New-Check '가속 기능 (그림 만들기가 빨라질 수 있음 · RTX 30 이상 권장)' 328 $true '설치 끝에 이 PC에서 되는지 시험하고, 안 되면 가속만 저절로 꺼 둡니다.'
$chkAccel.Size = New-Object System.Drawing.Size(470, 24)
$btnAccelInfo = New-Button '자세한 설명' 510 326 100 26
$btnAccelInfo.Font = $FontS; $btnAccelInfo.BackColor = [System.Drawing.Color]::White
$p3.Controls.Add($btnAccelInfo)
$AccelInfo = @"
■ 무슨 기능인가요
   그림을 만드는 계산 일부를 더 빠른 방식(Sage Attention)으로 바꿉니다.
   그래픽카드에 따라 그림 만들기가 빨라집니다. 결과 그림은 아주 조금 달라질 수 있습니다.

■ 무엇이 설치되나요
   • Triton · SageAttention (계산을 빠르게 하는 부품, 수십 MB)
   • 파이썬 보조 파일 (include · libs 폴더, Triton이 씀)
   ComfyUI 본체 · 그림 모델 · PyTorch는 건드리지 않습니다.

■ 안 될 수 있는 경우
   • 그래픽카드가 오래된 경우 (주로 RTX 20 시리즈 이하는 지원하지 않음)
   • 부품끼리 버전이 맞지 않는 경우 (ComfyUI를 업데이트한 뒤 등)
   • 인터넷 · 백신이 받기를 막은 경우

■ 안 되면 어떻게 되나요
   설치 끝에 이 PC에서 직접 시험해 보고, 안 되면 가속만 '사용 불가'로 꺼 둡니다.
   그림 만들기는 평소처럼 됩니다. 노드의 [⚡ 가속] 표시를 눌러 켜고 끌 수 있고, 안 될 때는 [다시 시험]으로 다시 확인할 수 있습니다.
"@
$btnAccelInfo.add_Click({
    $f = New-Object System.Windows.Forms.Form
    $f.Text = '가속 기능 — 자세한 설명'; $f.ClientSize = New-Object System.Drawing.Size(620, 440)
    $f.StartPosition = 'CenterParent'; $f.FormBorderStyle = 'FixedDialog'; $f.MaximizeBox = $false; $f.MinimizeBox = $false
    $f.BackColor = [System.Drawing.Color]::White; $f.Font = $FontN
    $f.Controls.Add((New-Label $AccelInfo 20 16 590 370))
    $ok = New-Button '확인' 500 392 100 34
    $ok.add_Click({ $f.Close() }); $f.AcceptButton = $ok
    $f.Controls.Add($ok)
    [void]$f.ShowDialog($form)
})
$lblNeed = New-Label '' 30 376 700 44 $FontS
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

# ================================================================ 4. ComfyUI 찾기 · 점검 (이미 쓰는 ComfyUI에 추가)
$p4a = New-Page; $pages[40] = $p4a
$p4a.Controls.Add((New-Label 'OneNode를 추가할 ComfyUI' 30 14 460 24 $FontB))
$cmbComfy = New-Object System.Windows.Forms.ComboBox
$cmbComfy.DropDownStyle = 'DropDownList'; $cmbComfy.Location = New-Object System.Drawing.Point(30, 42)
$cmbComfy.Size = New-Object System.Drawing.Size(462, 28); $cmbComfy.Font = $FontN
$btnABrowse = New-Button '찾아보기…' 498 40 96 30
$btnACheck = New-Button '다시 점검' 598 40 96 30
$lblAInfo = New-Label '' 30 74 520 20 $FontS $ColDim
$lblAInfo.AutoEllipsis = $true
$btnAPy = New-Button 'python.exe 고르기' 556 70 138 24
$btnAPy.Font = $FontS; $btnAPy.Visible = $false
$aList = New-Object System.Windows.Forms.Panel
$aList.Location = New-Object System.Drawing.Point(30, 98); $aList.Size = New-Object System.Drawing.Size(664, 226)
$aList.BackColor = [System.Drawing.Color]::Transparent
$p4a.Controls.AddRange(@($cmbComfy, $btnABrowse, $btnACheck, $lblAInfo, $btnAPy, $aList))
function New-ACheck($text, $y, $checked) {
    $c = New-Object System.Windows.Forms.CheckBox
    $c.Text = $text; $c.Location = New-Object System.Drawing.Point(34, $y); $c.Size = New-Object System.Drawing.Size(640, 22)
    $c.Checked = $checked; $c.Font = $FontN; $c.BackColor = [System.Drawing.Color]::Transparent
    $p4a.Controls.Add($c); return $c
}
$chkADetail = New-ACheck '손 · 얼굴 보정 (없으면 Impact Pack · 감지 모델 받기)' 328 $true
$chkALora = New-ACheck 'LoRA Manager (없으면 받기)' 350 $true
$chkAShortcut = New-ACheck '바탕화면 바로가기 만들기 (평소 쓰던 실행 파일로 켜기)' 372 $false
$lblANeed = New-Label '' 30 398 664 30 $FontS
$p4a.Controls.Add($lblANeed)

$KindName = @{ portable = '포터블판'; git = '직접 설치(git)'; desktop = '데스크톱 앱' }
$script:Cands = New-Object System.Collections.ArrayList
$script:Searched = $false
$script:AC = $null; $script:Plan = $null

function Test-Dir($p) { try { return [IO.Directory]::Exists([string]$p) } catch { return $false } }
function Test-File($p) { try { return [IO.File]::Exists([string]$p) } catch { return $false } }

# 고른(찾은) 폴더가 어떤 ComfyUI인지 알아내기. ComfyUI가 아니면 $null
#  Root = 사용자가 보는 맨 위 폴더, Comfy = custom_nodes · models · user 가 있는 폴더, Py = 그 ComfyUI가 쓰는 python.exe
function New-Target($kind, $root, $cui, $py) {
    $t = @{ Kind = $kind; Root = $root; Comfy = $cui; Py = $py; Launch = $null; OneNodeFull = $false }
    if ($kind -eq 'portable') {
        foreach ($b in @('run_nvidia_gpu.bat', 'run_nvidia_gpu_fast_fp16_accumulation.bat', 'run_nvidia_gpu_fast.bat', 'run_cpu.bat')) {
            $c = Join-Path $root $b; if (Test-File $c) { $t.Launch = $c; break }
        }
        $par = Split-Path -Parent $root
        if ($par -and (Test-File (Join-Path $par '_installer\install_info.json'))) {
            $t.OneNodeFull = $true
            $sb = Join-Path $par 'Start_OneNode.bat'; if (Test-File $sb) { $t.Launch = $sb }
        }
    } elseif ($kind -eq 'desktop') {
        foreach ($c in @((Join-Path $env:LOCALAPPDATA 'Programs\@comfyorgcomfyui-electron\ComfyUI.exe'), (Join-Path $env:LOCALAPPDATA 'Programs\ComfyUI\ComfyUI.exe'))) {
            if (Test-File $c) { $t.Launch = $c; break }
        }
    }
    return $t
}
function Resolve-Comfy([string]$p) {
    if (-not $p) { return $null }
    $p = $p.Trim().TrimEnd('\')
    if ($p.Length -eq 2 -and $p.EndsWith(':')) { $p += '\' }
    if (-not (Test-Dir $p)) { return $null }
    # 포터블판 맨 위 폴더
    if ((Test-File (Join-Path $p 'python_embeded\python.exe')) -and (Test-File (Join-Path $p 'ComfyUI\main.py'))) {
        return New-Target 'portable' $p (Join-Path $p 'ComfyUI') (Join-Path $p 'python_embeded\python.exe')
    }
    # 포터블판 안의 ComfyUI 폴더를 고른 경우
    $par = Split-Path -Parent $p
    if ($par -and (Test-File (Join-Path $p 'main.py')) -and (Test-File (Join-Path $par 'python_embeded\python.exe'))) {
        return New-Target 'portable' $par $p (Join-Path $par 'python_embeded\python.exe')
    }
    # 직접 설치(git · Stability Matrix 등): main.py + comfy + custom_nodes
    if ((Test-File (Join-Path $p 'main.py')) -and (Test-Dir (Join-Path $p 'comfy')) -and (Test-Dir (Join-Path $p 'custom_nodes'))) {
        $py = $null
        foreach ($v in @('venv', '.venv', 'env')) { $c = Join-Path $p "$v\Scripts\python.exe"; if (Test-File $c) { $py = $c; break } }
        return New-Target 'git' $p $p $py
    }
    # 데스크톱 앱이 쓰는 폴더: custom_nodes · models · .venv
    if ((Test-File (Join-Path $p '.venv\Scripts\python.exe')) -and (Test-Dir (Join-Path $p 'custom_nodes')) -and (Test-Dir (Join-Path $p 'models'))) {
        return New-Target 'desktop' $p $p (Join-Path $p '.venv\Scripts\python.exe')
    }
    return $null
}

# 자주 두는 곳만 얕게 찾음 (디스크 전체를 뒤지지 않음 — 없으면 [찾아보기])
function Find-ComfyCandidates {
    $found = New-Object System.Collections.ArrayList
    $seen = @{}
    function Try-Add($path) {
        $t = Resolve-Comfy $path
        if ($t) { $k = ([string]$t.Comfy).ToLower(); if (-not $seen.ContainsKey($k)) { $seen[$k] = $true; [void]$found.Add($t) } }
    }
    function Try-Packages($dir) {
        foreach ($sub in @('Data\Packages', 'Packages')) {
            $pk = Join-Path $dir $sub
            if (Test-Dir $pk) { foreach ($d in @(Get-ChildItem -LiteralPath $pk -Directory -ErrorAction SilentlyContinue)) { Try-Add $d.FullName } }
        }
    }
    # 1) 지금 켜져 있는 ComfyUI (python 위치에서 거슬러 올라가며)
    foreach ($pr in @(Get-Process -Name python, pythonw -ErrorAction SilentlyContinue)) {
        $d = $null; try { $d = Split-Path -Parent ([string]$pr.Path) } catch {}
        for ($k = 0; $d -and $k -lt 4; $k++) { Try-Add $d; try { $d = Split-Path -Parent $d } catch { $d = $null } }
    }
    # 2) ComfyUI 데스크톱 앱 설정
    try {
        $cf = Join-Path $env:APPDATA 'ComfyUI\config.json'
        if (Test-File $cf) { $bp = [string](Get-Content -Raw -Encoding UTF8 -LiteralPath $cf | ConvertFrom-Json).basePath; if ($bp) { Try-Add $bp } }
    } catch {}
    Try-Add (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'ComfyUI')
    Try-Packages (Join-Path $env:APPDATA 'StabilityMatrix')
    # 3) 각 드라이브 맨 위 · 바탕화면 · 문서 · 다운로드 · 사용자 폴더 (2단계 아래까지)
    $bases = New-Object System.Collections.ArrayList
    foreach ($dv in [IO.DriveInfo]::GetDrives()) { try { if ($dv.DriveType -eq 'Fixed' -and $dv.IsReady) { [void]$bases.Add($dv.RootDirectory.FullName) } } catch {} }
    foreach ($f in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('MyDocuments'), (Join-Path $env:USERPROFILE 'Downloads'), $env:USERPROFILE)) { if ($f) { [void]$bases.Add($f) } }
    $skip = '^(Windows|Program Files.*|ProgramData|\$.*|System Volume Information|Recovery|PerfLogs|AppData|MSOCache|Config\.Msi|node_modules|\..*)$'
    foreach ($b in $bases) {
        Try-Add $b
        $lv1 = @(Get-ChildItem -LiteralPath $b -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch $skip -and -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) })
        foreach ($d1 in $lv1) {
            Try-Add $d1.FullName
            if ($d1.Name -like 'StabilityMatrix*') { Try-Packages $d1.FullName }
            $lv2 = @(Get-ChildItem -LiteralPath $d1.FullName -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch $skip -and -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) } | Select-Object -First 300)
            foreach ($d2 in $lv2) {
                Try-Add $d2.FullName
                if ($d2.Name -like 'StabilityMatrix*') { Try-Packages $d2.FullName }
            }
        }
        [System.Windows.Forms.Application]::DoEvents()
    }
    return , $found.ToArray()
}

# 모델이 이미 있는지: ComfyUI\models 와 extra_model_paths.yaml 에 적힌 곳에서, 알맞은 종류 폴더 안을 파일 이름으로 찾음
$ModelDirOk = @{ diffusion_models = @('diffusion_models', 'unet'); text_encoders = @('text_encoders', 'clip'); vae = @('vae'); ultralytics = @('bbox') }
function Get-ModelRoots($t) {
    $roots = New-Object System.Collections.ArrayList
    [void]$roots.Add((Join-Path $t.Comfy 'models'))
    $yamls = @((Join-Path $t.Comfy 'extra_model_paths.yaml'))
    if ($t.Kind -eq 'desktop') { $yamls += (Join-Path $env:APPDATA 'ComfyUI\extra_models_config.yaml') }
    foreach ($y in $yamls) {
        if (-not (Test-File $y)) { continue }
        $base = $null
        foreach ($line in @(Get-Content -LiteralPath $y -Encoding UTF8 -ErrorAction SilentlyContinue)) {
            try {
                $l = ([string]$line -replace '\s#.*$', '').Trim()
                if ($l -match '^base_path:\s*(.+)$') {
                    $base = $Matches[1].Trim().Trim('"', "'")
                    if (-not [IO.Path]::IsPathRooted($base)) { $base = Join-Path (Split-Path -Parent $y) $base }
                    [void]$roots.Add($base); [void]$roots.Add((Join-Path $base 'models')); continue
                }
                $v = $l; if ($l -match '^[A-Za-z0-9_\-]+:\s*(.+)$') { $v = $Matches[1] }
                $v = $v.Trim().TrimStart('-').Trim().Trim('"', "'")
                if (-not $v -or $v -eq '|' -or $v -match ':$') { continue }
                if ([IO.Path]::IsPathRooted($v)) { [void]$roots.Add($v) } elseif ($base) { [void]$roots.Add((Join-Path $base $v)) }
            } catch {}
        }
    }
    return @($roots | Where-Object { Test-Dir $_ } | Select-Object -Unique)
}
function Find-ModelFile($roots, $m) {
    $parts = ([string]$m.path) -split '/'
    $leaf = $parts[-1]; $ok = $ModelDirOk[$parts[1]]
    foreach ($r in $roots) {
        $cands = New-Object System.Collections.ArrayList
        try { if ($ok -contains (Split-Path -Leaf $r).ToLower()) { [void]$cands.Add($r) } } catch {}
        foreach ($o in $ok) { $c = Join-Path $r $o; if (Test-Dir $c) { [void]$cands.Add($c) } }
        if ($parts[1] -eq 'ultralytics') { $c = Join-Path $r 'ultralytics\bbox'; if (Test-Dir $c) { [void]$cands.Add($c) } }
        foreach ($c in $cands) {
            $f = Get-ChildItem -LiteralPath $c -Recurse -File -Filter $leaf -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($f) { return $f.FullName }
        }
    }
    return $null
}
# 노드가 이미 있는지 (ComfyUI-Manager로 받은 소문자 이름 · 꺼 둔 노드(.disabled)까지)
$NodePat = @{ 'ComfyUI-Lora-Manager' = 'lora[-_ ]?manager'; 'ComfyUI-Impact-Pack' = 'impact[-_ ]?pack'; 'ComfyUI-Impact-Subpack' = 'impact[-_ ]?subpack' }
function Find-NodeDir($t, $folder) {
    $cn = Join-Path $t.Comfy 'custom_nodes'; $pat = $NodePat[$folder]
    $res = @{ Active = $null; Disabled = $null }
    $list = @(Get-ChildItem -LiteralPath $cn -Directory -ErrorAction SilentlyContinue)
    $dis = Join-Path $cn '.disabled'
    if (Test-Dir $dis) { $list += @(Get-ChildItem -LiteralPath $dis -Directory -ErrorAction SilentlyContinue) }
    foreach ($d in $list) {
        $nm = $d.Name.ToLower()
        if ($nm -notmatch $pat) { continue }
        if ($folder -eq 'ComfyUI-Impact-Pack' -and $nm -match 'subpack') { continue }
        if ($nm.EndsWith('.disabled') -or ($d.Parent.Name -eq '.disabled')) { $res.Disabled = $d.FullName }
        elseif (Test-File (Join-Path $d.FullName '__init__.py')) { $res.Active = $d.FullName }
    }
    return $res
}
# 그 ComfyUI 폴더 안의 프로그램(파이썬)이 지금 돌고 있는지
function Get-RunningIn($root) {
    $pre = ([string]$root).TrimEnd('\') + '\'
    return @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $pp = $null; try { $pp = $_.Path } catch {}; $pp -and $pp.StartsWith($pre, [StringComparison]::OrdinalIgnoreCase) })
}
function Test-Port8188 {
    try { $c = New-Object Net.Sockets.TcpClient; $a = $c.BeginConnect('127.0.0.1', 8188, $null, $null); $ok = $a.AsyncWaitHandle.WaitOne(600); if ($ok) { $c.EndConnect($a) }; $c.Close(); return [bool]$ok } catch { return $false }
}
function Test-Writable($dir) {
    try { $f = Join-Path $dir ('.cofoty5_write_test_' + [guid]::NewGuid().ToString('N')); [IO.File]::WriteAllText($f, 'x'); Remove-Item -LiteralPath $f -Force; return $true } catch { return $false }
}
# 파이썬 · PyTorch 확인 (읽기만 함 — 아무것도 설치하지 않음)
$PyProbe = @'
import sys, json
import importlib.util as u
d = {"py": sys.version.split()[0]}
for m in ("pip", "ensurepip", "triton", "sageattention"):
    try:
        d["has_" + m] = u.find_spec(m) is not None
    except Exception:
        d["has_" + m] = False
try:
    import torch
    d["torch"] = str(torch.__version__)
    d["cuda"] = str(torch.version.cuda or "")
    d["cuda_ok"] = bool(torch.cuda.is_available())
except Exception as e:
    d["torch_err"] = str(e)[:200]
print("CFT5JSON" + json.dumps(d))
'@
function Get-PyInfo($py) {
    $r = @{ ok = $false; err = '' }
    if (-not $py -or -not (Test-File $py)) { $r.err = '파이썬 없음'; return $r }
    $f = Join-Path $env:TEMP 'cofoty5_probe.py'; $o = Join-Path $env:TEMP 'cofoty5_probe.txt'
    try {
        [IO.File]::WriteAllText($f, $PyProbe, (New-Object Text.UTF8Encoding($false)))
        Remove-Item -Force $o, "$o.err" -ErrorAction SilentlyContinue
        $p = Start-Process -FilePath $py -ArgumentList "-s `"$f`"" -WindowStyle Hidden -PassThru -RedirectStandardOutput $o -RedirectStandardError "$o.err"
        $null = $p.Handle
        $t0 = [DateTime]::Now
        while (-not $p.HasExited -and ([DateTime]::Now - $t0).TotalSeconds -lt 120) { Start-Sleep -Milliseconds 200; [System.Windows.Forms.Application]::DoEvents() }
        if (-not $p.HasExited) { try { $p.Kill() } catch {}; $r.err = '파이썬이 2분 동안 응답하지 않습니다'; return $r }
        $line = @(Get-Content -LiteralPath $o -ErrorAction SilentlyContinue | Where-Object { $_ -like 'CFT5JSON*' }) | Select-Object -Last 1
        if ($line) {
            $j = $line.Substring(8) | ConvertFrom-Json
            foreach ($pp in $j.PSObject.Properties) { $r[$pp.Name] = $pp.Value }
            $r.ok = $true
        } else { $r.err = [string](@(Get-Content -LiteralPath "$o.err" -ErrorAction SilentlyContinue) | Select-Object -Last 1) }
    } catch { $r.err = $_.Exception.Message }
    return $r
}
function Get-ComfyVersion($t) {
    try {
        $f = Join-Path $t.Comfy 'comfyui_version.py'
        if (Test-File $f) { $txt = [IO.File]::ReadAllText($f); if ($txt -match '__version__\s*=\s*[''"]([^''"]+)') { return $Matches[1] } }
    } catch {}
    return $null
}
function Test-AnimaSupport($t) {
    $f = Join-Path $t.Comfy 'comfy\supported_models.py'
    if (-not (Test-File $f)) { return $null }
    try { return [bool](Select-String -LiteralPath $f -Pattern 'anima' -SimpleMatch -Quiet) } catch { return $null }
}

function Add-ARow($i, $state, $text) {
    $y = $i * 20
    $mark = @{ ok = '✔'; warn = '!'; bad = '✖'; info = '•' }[$state]
    $col = @{ ok = $ColOk; warn = $ColWarn; bad = $ColBad; info = $ColAccent }[$state]
    $aList.Controls.Add((New-Label $mark 0 $y 18 20 $FontB $col))
    $l = New-Label $text 20 ($y + 1) 644 19 $FontS
    $l.AutoEllipsis = $true
    $tip = New-Object System.Windows.Forms.ToolTip; $tip.SetToolTip($l, $text)
    $aList.Controls.Add($l)
}

# 무거운 점검(파이썬 실행 · 파일 찾기)은 여기서 한 번만, 화면 표시는 Show-AddonCheck
function Invoke-AddonCheck {
    $script:AC = $null
    $i = $cmbComfy.SelectedIndex
    if ($i -lt 0 -or $i -ge $script:Cands.Count) { Show-AddonCheck; return }
    $t = $script:Cands[$i]
    $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
    $btnNext.Enabled = $false; $aList.Controls.Clear(); $lblANeed.Text = ''
    $lblAInfo.Text = '점검 중… (파이썬 · PyTorch 확인에 몇 초 걸립니다)'; $lblAInfo.ForeColor = $ColDim
    [System.Windows.Forms.Application]::DoEvents()
    try {
        $ac = @{ T = $t }
        $ac.PyInfo = Get-PyInfo $t.Py
        $ac.Version = Get-ComfyVersion $t
        $ac.Anima = Test-AnimaSupport $t
        $ac.Running = (@(Get-RunningIn $t.Root).Count -gt 0)
        $ac.Port = $(if ($ac.Running) { $false } else { Test-Port8188 })
        $ac.HasOneNode = Test-File (Join-Path $t.Comfy 'custom_nodes\cofoty5_onenode\__init__.py')
        $ac.CNWritable = Test-Writable (Join-Path $t.Comfy 'custom_nodes')
        $roots = Get-ModelRoots $t
        $ac.Models = @{}
        foreach ($m in $M.models) { $ac.Models[[string]$m.path] = Find-ModelFile $roots $m }
        $ac.Nodes = @{}
        foreach ($n in $M.nodes) { $ac.Nodes[[string]$n.folder] = Find-NodeDir $t $n.folder }
        $ac.FreeGB = -1
        try { $dv = New-Object System.IO.DriveInfo([IO.Path]::GetPathRoot($t.Comfy)); if ($dv.IsReady) { $ac.FreeGB = [math]::Round($dv.AvailableFreeSpace / 1GB, 1) } } catch {}
        $script:AC = $ac
    } catch {
        $lblAInfo.Text = "점검 중 문제가 생겼습니다: $($_.Exception.Message)"; $lblAInfo.ForeColor = $ColBad
    } finally { $form.Cursor = [System.Windows.Forms.Cursors]::Default }
    Show-AddonCheck
}

function Show-AddonCheck {
    $aList.Controls.Clear(); $script:Plan = $null; $btnAPy.Visible = $false
    $ac = $script:AC
    if (-not $ac) {
        if ($script:Cands.Count -eq 0) { $lblAInfo.Text = 'ComfyUI를 찾지 못했습니다. [찾아보기]로 ComfyUI 폴더를 직접 골라 주세요.'; $lblAInfo.ForeColor = $ColWarn }
        $lblANeed.Text = ''; $btnNext.Enabled = $false; return
    }
    $t = $ac.T; $pi = $ac.PyInfo; $i = 0; $hard = $false
    $lblAInfo.Text = "$($KindName[$t.Kind])  ·  $($t.Comfy)"; $lblAInfo.ForeColor = $ColDim
    # 파이썬 · PyTorch (바꾸지 않음)
    if (-not $t.Py) {
        Add-ARow $i 'bad' '이 ComfyUI가 쓰는 파이썬을 찾지 못했습니다 — 오른쪽 위 [python.exe 고르기]로 골라 주세요'
        $btnAPy.Visible = $true; $hard = $true
    } elseif (-not $pi.ok) {
        Add-ARow $i 'bad' "파이썬을 실행하지 못했습니다: $($pi.err)"; $btnAPy.Visible = $true; $hard = $true
    } elseif ($pi.torch_err -or -not $pi.torch) {
        Add-ARow $i 'bad' "PyTorch를 불러오지 못했습니다 — 이 ComfyUI가 정상으로 켜지는지 먼저 확인해 주세요 ($($pi.torch_err))"; $hard = $true
    } else {
        $cu = $(if ($pi.cuda_ok) { "CUDA $($pi.cuda)" } else { 'CUDA 사용 불가(CPU)' })
        Add-ARow $i $(if ($pi.cuda_ok) { 'ok' } else { 'warn' }) "Python $($pi.py) · PyTorch $($pi.torch) · $cu  — 바꾸지 않습니다"
    }
    $i++
    if ($pi.ok -and -not $pi.has_pip) {
        if ($pi.has_ensurepip) { Add-ARow $i 'warn' 'pip(부품 설치 도구)이 없습니다 → 설치할 때 pip만 더합니다 (다른 부품은 그대로)' }
        else { Add-ARow $i 'warn' 'pip이 없어 파이썬 부품이 필요한 노드는 건너뜁니다' }
        $i++
    }
    # ComfyUI 버전 · Anima 지원
    $vt = $(if ($ac.Version) { "ComfyUI v$($ac.Version)" } else { 'ComfyUI 버전 알 수 없음' })
    if ($ac.Anima -eq $true) { Add-ARow $i 'ok' "$vt · Anima 모델 지원 — 본체는 바꾸지 않습니다" }
    else { Add-ARow $i 'warn' "$vt · Anima 지원 여부를 확인하지 못함 — 그림이 안 만들어지면 ComfyUI를 업데이트하세요" }
    $i++
    # 켜져 있는지
    if ($ac.Running) { Add-ARow $i 'bad' '이 ComfyUI가 켜져 있습니다 — 끈 뒤 [다시 점검]을 눌러 주세요'; $hard = $true }
    elseif ($ac.Port) { Add-ARow $i 'warn' '127.0.0.1:8188 에서 ComfyUI가 켜져 있습니다 — 고른 ComfyUI라면 끈 뒤 [다시 점검]' }
    else { Add-ARow $i 'ok' 'ComfyUI 꺼져 있음' }
    $i++
    # OneNode
    if (-not $ac.CNWritable) { Add-ARow $i 'bad' 'custom_nodes 폴더에 쓸 수 없습니다 (권한 · 읽기 전용) — 다른 ComfyUI를 고르거나 권한을 확인하세요'; $hard = $true; $i++ }
    if ($t.OneNodeFull) { Add-ARow $i 'warn' "OneNode '새로 설치'로 만든 ComfyUI입니다 — 고치기는 1쪽 [새로 설치]에서 같은 폴더를 고르는 게 맞습니다"; $i++ }
    if ($ac.HasOneNode) { Add-ARow $i 'info' "OneNode 노드 있음 → v$($M.version) 노드 파일로 바꿈 (LoRA 세트 · 사전 등 사용자 파일은 그대로)" }
    else { Add-ARow $i 'info' 'OneNode 노드 → 새로 넣음 · 시작용 워크플로를 ★ 즐겨찾기에 넣음' }
    $i++
    # Anima 모델
    $needM = @(); $needN = @(); $needMB = 0.0
    $base = @($M.models | Where-Object { $_.id -eq 'base' })
    $miss = @($base | Where-Object { -not $ac.Models[[string]$_.path] })
    if ($miss.Count -eq 0) { Add-ARow $i 'ok' "Anima 모델 $($base.Count)개 모두 있음 → 받지 않음" }
    else {
        foreach ($m in $miss) { $needM += $m; $needMB += [double]$m.approx_mb }
        $nm = @($miss | ForEach-Object { ([string]$_.label -replace '\s*\(.*$', '') }) -join ', '
        Add-ARow $i 'info' ("Anima 모델 {0}개 중 {1}개 받음 (약 {2:N1}GB): {3}" -f $base.Count, $miss.Count, (($miss | Measure-Object -Property approx_mb -Sum).Sum / 1024), $nm)
    }
    $i++
    # 손·얼굴 보정
    if ($chkADetail.Checked) {
        $parts = @(); $st = 'ok'
        foreach ($n in @($M.nodes | Where-Object { $_.id -eq 'detail' })) {
            $nd = $ac.Nodes[[string]$n.folder]; $short = ([string]$n.folder -replace '^ComfyUI-', '')
            if ($nd.Active) { $parts += "$short 있음" }
            elseif ($nd.Disabled) { $parts += "$short 꺼져 있음(그대로 둠)"; $st = 'warn' }
            else { $parts += "$short 받음"; $needN += $n; if ($st -eq 'ok') { $st = 'info' } }
        }
        $dm = @($M.models | Where-Object { $_.id -eq 'detail' -and -not $ac.Models[[string]$_.path] })
        foreach ($m in $dm) { $needM += $m; $needMB += [double]$m.approx_mb }
        if ($dm.Count -gt 0) { $parts += "감지 모델 $($dm.Count)개 받음"; if ($st -eq 'ok') { $st = 'info' } } else { $parts += '감지 모델 있음' }
        $txt = '손·얼굴 보정: ' + ($parts -join ' · ')
        if ($st -eq 'warn') { $txt += ' — 꺼 둔 노드는 Manager에서 켜 주세요' }
        Add-ARow $i $st $txt
    } else { Add-ARow $i 'info' '손·얼굴 보정: 고르지 않음 (받지 않음)' }
    $i++
    # LoRA Manager
    if ($chkALora.Checked) {
        foreach ($n in @($M.nodes | Where-Object { $_.id -eq 'lora' })) {
            $nd = $ac.Nodes[[string]$n.folder]
            if ($nd.Active) { Add-ARow $i 'ok' 'LoRA Manager 있음 → 받지 않음' }
            elseif ($nd.Disabled) { Add-ARow $i 'warn' 'LoRA Manager 꺼져 있음 → 그대로 둠 (Manager에서 켜 주세요)' }
            else { Add-ARow $i 'info' "LoRA Manager 없음 → 받음 ($($n.label))"; $needN += $n }
        }
    } else { Add-ARow $i 'info' 'LoRA Manager: 고르지 않음 (받지 않음)' }
    $i++
    # 남은 공간
    $needGB = [math]::Round(($needMB + 300 * $needN.Count + 300) / 1024, 1)
    if ($ac.FreeGB -lt 0) { Add-ARow $i 'warn' "남은 공간을 확인하지 못했습니다 · 필요 약 $needGB GB" }
    elseif ($ac.FreeGB -lt ($needGB + 1)) { Add-ARow $i 'bad' "남은 공간이 부족합니다: $($ac.FreeGB) GB (필요 약 $needGB GB + 여유 1GB)"; $hard = $true }
    else { Add-ARow $i 'ok' "남은 공간 $($ac.FreeGB) GB · 필요 약 $needGB GB" }
    $i++
    # 가속
    $accel = [bool]($pi.ok -and $pi.has_triton -and $pi.has_sageattention)
    if ($accel) { Add-ARow $i 'info' '가속: Triton · SageAttention 있음 → 되는지 시험만 함 (설치하지 않음)' }
    else { Add-ARow $i 'info' '가속: 부품 없음 → 설치하지 않음 (그림 만들기에는 영향 없음)' }
    $i++

    $chkAShortcut.Enabled = [bool]$t.Launch
    if (-not $t.Launch) { $chkAShortcut.Checked = $false }
    $script:Plan = @{ Nodes = $needN; Models = $needM; Accel = $accel; NeedGB = $needGB }
    if ($hard) { $lblANeed.Text = '✖ 표시를 해결한 뒤 [다시 점검]을 눌러 주세요.'; $lblANeed.ForeColor = $ColBad }
    else {
        $sum = "받을 것: 노드 $($needN.Count)개 · 모델 $($needM.Count)개 (약 $needGB GB)"
        if ($needN.Count -eq 0 -and $needM.Count -eq 0) { $sum = '받을 것 없음 — OneNode 노드만 넣습니다' }
        $lblANeed.Text = "$sum   ·   [설치 시작]을 누르면 진행합니다."; $lblANeed.ForeColor = $ColOk
    }
    $btnNext.Enabled = -not $hard
}

function Add-Cand($t) {
    $idx = -1
    for ($k = 0; $k -lt $script:Cands.Count; $k++) { if (([string]$script:Cands[$k].Comfy).ToLower() -eq ([string]$t.Comfy).ToLower()) { $idx = $k } }
    if ($idx -lt 0) {
        [void]$script:Cands.Add($t)
        [void]$cmbComfy.Items.Add("[$($KindName[$t.Kind])]  $($t.Root)")
        $idx = $script:Cands.Count - 1
    }
    if ($cmbComfy.SelectedIndex -eq $idx) { Invoke-AddonCheck } else { $cmbComfy.SelectedIndex = $idx }
}
function Enter-AddonPage {
    if ($script:Searched) { Show-AddonCheck; return }
    $script:Searched = $true
    $btnNext.Enabled = $false
    $lblAInfo.Text = 'ComfyUI를 찾는 중… (자주 두는 곳만 찾습니다)'; $lblAInfo.ForeColor = $ColDim
    $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor; [System.Windows.Forms.Application]::DoEvents()
    $list = @()
    try { $list = @(Find-ComfyCandidates) } catch {}
    $form.Cursor = [System.Windows.Forms.Cursors]::Default
    foreach ($t in $list) { [void]$script:Cands.Add($t); [void]$cmbComfy.Items.Add("[$($KindName[$t.Kind])]  $($t.Root)") }
    if ($script:Cands.Count -gt 0) { $cmbComfy.SelectedIndex = 0 } else { Show-AddonCheck }
}
$cmbComfy.add_SelectedIndexChanged({ if ($script:Page -eq 4 -and $script:Mode -eq 'addon') { Invoke-AddonCheck } })
$btnACheck.add_Click({ Invoke-AddonCheck })
$chkADetail.add_CheckedChanged({ if ($script:Page -eq 4 -and $script:AC) { Show-AddonCheck } })
$chkALora.add_CheckedChanged({ if ($script:Page -eq 4 -and $script:AC) { Show-AddonCheck } })
$btnABrowse.add_Click({
    $d = New-Object System.Windows.Forms.FolderBrowserDialog
    $d.Description = 'ComfyUI 폴더를 고르세요. (포터블판: ComfyUI_windows_portable 폴더 · 데스크톱 앱: 처음에 정한 ComfyUI 폴더 · 직접 설치: main.py가 있는 폴더)'
    if ($d.ShowDialog() -ne 'OK') { return }
    $t = Resolve-Comfy $d.SelectedPath
    if (-not $t) { [void](Show-Msg "ComfyUI 폴더가 아닌 것 같습니다.`n$($d.SelectedPath)`n`nmain.py · custom_nodes 가 있는 폴더(포터블판은 그 위 폴더)를 골라 주세요." 'Warning'); return }
    Add-Cand $t
})
$btnAPy.add_Click({
    $i = $cmbComfy.SelectedIndex; if ($i -lt 0) { return }
    $d = New-Object System.Windows.Forms.OpenFileDialog
    $d.Title = '이 ComfyUI를 켤 때 쓰는 python.exe를 고르세요 (보통 venv\Scripts\python.exe)'
    $d.Filter = 'python.exe|python.exe'
    if ($d.ShowDialog() -ne 'OK') { return }
    $script:Cands[$i].Py = $d.FileName
    Invoke-AddonCheck
})
# [설치 시작] 직전: 켜져 있는지 한 번 더 보고, 무엇을 할지 확인받음
function Confirm-Addon {
    if (-not $script:AC -or -not $script:Plan) { return $false }
    $t = $script:AC.T
    if (@(Get-RunningIn $t.Root).Count -gt 0) { [void](Show-Msg 'ComfyUI가 켜져 있습니다. 끈 뒤 다시 눌러 주세요.' 'Warning'); Invoke-AddonCheck; return $false }
    $nodes = @($script:Plan.Nodes | ForEach-Object { [string]$_.label })
    $models = @($script:Plan.Models | ForEach-Object { [string]$_.label })
    $txt = "이 ComfyUI에 OneNode를 추가합니다.`n$($t.Root)`n`n" +
        "• 넣는 것: OneNode 노드 · 시작용 워크플로`n" +
        "• 받을 노드: " + $(if ($nodes.Count) { $nodes -join ', ' } else { '없음' }) + "`n" +
        "• 받을 모델: " + $(if ($models.Count) { $models -join ', ' } else { '없음' }) + "`n`n" +
        "ComfyUI 본체 · PyTorch · 설정 · 이미 있는 노드와 모델은 바꾸지 않습니다.`n계속할까요?"
    return ((Show-Msg $txt 'Question' 'YesNo') -eq 'Yes')
}

# ================================================================ 5. 설치 진행
$p4 = New-Page; $pages[5] = $p4
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

# ================================================================ 6. 끝
$p5 = New-Page; $pages[6] = $p5
$lblDoneT = New-Label '' 30 24 700 30 $FontT
$lblDone = New-Label '' 30 62 700 232
$btnRun = New-Button '지금 시작하기' 30 300 160 40
$btnOpen = New-Button '설치 폴더 열기' 200 300 160 40
$btnRun.Font = $FontB
$p5.Controls.AddRange(@($lblDoneT, $lblDone, $btnRun, $btnOpen))

# ================================================================ 설치 작업 (뒤에서 돌아감)
$Worker = {
    param($sync, $cfg)
    $ErrorActionPreference = 'Stop'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $Inst = $cfg.Inst
    $Addon = ($cfg.Mode -eq 'addon')
    if ($Addon) {
        # 이미 쓰는 ComfyUI에 추가: 그 ComfyUI의 파이썬을 쓰고, 기록은 <ComfyUI>\user\cofoty5_onenode_addon 에만 둠
        $Comfy = $null; $CUI = $cfg.T.Comfy; $PyExe = $cfg.T.Py; $PyCwd = $CUI
        $Work = Join-Path $CUI 'user\cofoty5_onenode_addon'
    } else {
        $Comfy = Join-Path $Inst 'ComfyUI_windows_portable'; $CUI = Join-Path $Comfy 'ComfyUI'
        $PyExe = Join-Path $Comfy 'python_embeded\python.exe'; $PyCwd = $Comfy
        $Work = Join-Path $Inst '_installer'
    }
    $CN = Join-Path $CUI 'custom_nodes'
    $Dl = Join-Path $Work 'downloads'
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
        $py = $PyExe
        $out = Join-Path $Work 'pip_out.txt'
        $sync.FileLabel = "$label — 설치 중 (몇 분 걸릴 수 있습니다)…"; $sync.FileCur = 0; $sync.FileTotal = 0
        Log "실행: python $argList"
        $p = Start-Process -FilePath $py -ArgumentList $argList -WorkingDirectory $PyCwd -WindowStyle Hidden -PassThru `
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

    # ---------------- 기존 ComfyUI에 추가할 때만 쓰는 도구 (이미 있는 것은 바꾸지 않게)
    function Ledger($kind, $val) {   # 더한 것을 바로바로 적어 둠 (중간에 멈춰도 지우기가 알 수 있게)
        try { Add-Content -LiteralPath (Join-Path $Work 'added_ledger.txt') -Value "$kind`t$val" -Encoding UTF8 } catch {}
    }
    function Run-PyOut($argList, $outFile) {
        $p = Start-Process -FilePath $PyExe -ArgumentList $argList -WorkingDirectory $PyCwd -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput $outFile -RedirectStandardError "$outFile.err"
        $null = $p.Handle
        while (-not $p.HasExited) { Start-Sleep -Milliseconds 300; if ($sync.Cancel) { try { $p.Kill() } catch {}; throw 'CANCELLED' } }
        $p.WaitForExit()
        $code = $p.ExitCode; if ($null -eq $code) { $code = 0 }
        return $code
    }
    function Norm($n) { return (([string]$n).ToLower() -replace '[-_.]+', '-') }
    # 같은 이름의 모듈을 쓰는 부품 묶음: 하나라도 이미 있으면 다른 것을 더하지 않음 (더하면 같은 파일을 덮어써서 원래 것이 망가짐)
    $Families = @(
        @('opencv-python', 'opencv-python-headless', 'opencv-contrib-python', 'opencv-contrib-python-headless'),
        @('onnxruntime', 'onnxruntime-gpu', 'onnxruntime-directml'),
        @('pynvml', 'nvidia-ml-py', 'nvidia-ml-py3')
    )
    function Get-Installed {
        $f = Join-Path $Work 'pip_list.txt'
        $code = Run-PyOut '-s -m pip list --format=freeze --disable-pip-version-check' $f
        if ($code -ne 0) { throw 'PIPSKIP: 설치된 파이썬 부품 목록을 읽지 못했습니다' }
        $h = @{}
        foreach ($l in @(Get-Content -LiteralPath $f -ErrorAction SilentlyContinue)) {
            if ($l -match '^([A-Za-z0-9_.\-]+)==([0-9][0-9A-Za-z.+!_\-]*)\s*$') { $h[(Norm $Matches[1])] = "$($Matches[1])==$($Matches[2])" }
        }
        if ($h.Count -eq 0) { throw 'PIPSKIP: 설치된 파이썬 부품 목록이 비어 있습니다' }
        return $h
    }
    function Read-Req($path) {
        return @(Get-Content -LiteralPath $path -Encoding UTF8 -ErrorAction SilentlyContinue | ForEach-Object { ([string]$_).Trim() } |
            Where-Object { $_ -and -not $_.StartsWith('#') -and $_ -notmatch '^git\+' -and $_ -notmatch '^-(r|c|e)\s' -and $_ -notmatch '^--(requirement|constraint|editable)' })
    }
    # 새 부품만 더하기: 지금 깔린 모든 부품의 버전을 그대로 묶어(constraints) 두고 설치 → 하나라도 바꿔야 하면 pip이 멈추고 아무것도 바꾸지 않음
    function Pip-Add($reqLines, $label) {
        if ($sync.NoPip) { throw 'PIPSKIP: pip이 없어 파이썬 부품을 설치할 수 없습니다' }
        $have = Get-Installed
        $keep = New-Object System.Collections.ArrayList
        foreach ($l in @($reqLines | Where-Object { $_ })) {
            $nm = ''; if ($l -match '^\s*([A-Za-z0-9_.\-]+)') { $nm = Norm $Matches[1] }
            $drop = $false
            foreach ($fam in $Families) {
                $famN = @($fam | ForEach-Object { Norm $_ })
                if ($famN -contains $nm) { foreach ($x in $famN) { if ($have.ContainsKey($x)) { $drop = $true } } }
            }
            if ($drop) { Log "  같은 역할의 부품이 이미 있어 뺌: $l" } else { [void]$keep.Add($l) }
        }
        if ($keep.Count -eq 0) { Log "$label — 더할 파이썬 부품 없음"; return }
        $req = Join-Path $Work 'req_now.txt'
        Set-Content -LiteralPath $req -Value @($keep) -Encoding ASCII
        $cons = Join-Path $Work 'constraints.txt'
        Set-Content -LiteralPath $cons -Value @($have.Values) -Encoding ASCII
        try { Run-Py "$PipBase -r `"$req`" -c `"$cons`"" $label }
        catch {
            if ("$_" -match 'CANCELLED') { throw }
            throw 'PIPSKIP: 파이썬 부품을 더하지 못했습니다 (이미 있는 부품의 버전을 바꿔야 하거나 받기에 실패 — 아무것도 바꾸지 않았습니다)'
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
                'accel' {
                    # 가속은 '덤': 어디서 실패해도 설치는 계속하고, 가속만 '사용 불가'로 기록함
                    $stateF = Join-Path $Comfy 'ComfyUI\user\cofoty5_accel.json'
                    $py = Join-Path $Comfy 'python_embeded\python.exe'
                    try {
                        $A = $cfg.M.accel
                        # 1) PyTorch 버전에 맞는 Triton 고르기 (PyTorch 2.10 → Triton 3.6 …)
                        $sync.FileLabel = '가속: PyTorch 버전 확인 중…'; $sync.FileCur = 0; $sync.FileTotal = 0
                        $tv = ''
                        try { $tv = [string](& $py -s -c "import torch;print(torch.__version__)" 2>$null | Select-Object -Last 1) } catch {}
                        $pin = [string]$A.triton_default
                        if ($tv -match '^2\.(\d+)\.') { $mn = [int]$Matches[1]; if ($mn -ge 9) { $pin = "triton-windows<3.$($mn - 3)" } }
                        Log "가속: PyTorch $tv → $pin"
                        Run-Py "$PipBase `"$pin`"" 'Triton (가속)'
                        # 2) SageAttention (다른 부품은 건드리지 않게 --no-deps)
                        $whl = Join-Path $Dl ([string]$A.sage_file)
                        Get-Url $A.sage_url $whl $A.sage_sha256 'SageAttention (가속)'
                        Run-Py "$PipBase --no-deps `"$whl`"" 'SageAttention (가속)'
                        # 3) Triton이 쓰는 파이썬 보조 파일 (include · libs) — 이미 있으면 그대로
                        $pe = Join-Path $Comfy 'python_embeded'
                        if (-not (Test-Path (Join-Path $pe 'include\Python.h')) -or -not (Test-Path (Join-Path $pe 'libs'))) {
                            $zip = Join-Path $Dl 'python_include_libs.zip'
                            Get-Url $A.pyinc_url $zip $A.pyinc_sha256 '파이썬 보조 파일 (가속)'
                            $tmp = Join-Path $Work 'unzip_pyinc'
                            if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
                            Expand-Archive -Path $zip -DestinationPath $tmp -Force
                            foreach ($nm in @('include', 'libs')) {
                                $src = Get-ChildItem $tmp -Directory -Recurse | Where-Object { $_.Name -eq $nm } | Select-Object -First 1
                                if ($src) {
                                    $dst = Join-Path $pe $nm
                                    New-Item -ItemType Directory -Force -Path $dst | Out-Null
                                    Copy-Item -Path (Join-Path $src.FullName '*') -Destination $dst -Recurse -Force
                                    Log "가속: 파이썬 보조 파일 넣음 ($nm)"
                                } else { Log "가속: 보조 파일 안에 $nm 폴더가 없습니다" }
                            }
                            Remove-Item -Recurse -Force $tmp
                        } else { Log '가속: 파이썬 보조 파일 있음' }
                        # 4) 이 PC에서 실제로 되는지 시험 → 결과 파일 (노드가 읽음)
                        $sync.FileLabel = '가속: 이 PC에서 되는지 시험하는 중… (1분 정도)'
                        $test = Join-Path $Comfy 'ComfyUI\custom_nodes\cofoty5_onenode\accel_test.py'
                        $tOut = Join-Path $Work 'accel_test.txt'
                        $tp = Start-Process -FilePath $py -ArgumentList "-s `"$test`" --out `"$stateF`"" -WorkingDirectory $Comfy -WindowStyle Hidden -PassThru `
                            -RedirectStandardOutput $tOut -RedirectStandardError "$tOut.err"
                        $null = $tp.Handle
                        while (-not $tp.HasExited) { Start-Sleep -Milliseconds 500; if ($sync.Cancel) { try { $tp.Kill() } catch {}; throw 'CANCELLED' } }
                        $tp.WaitForExit()
                        try { Log ("가속 시험: " + [string](Get-Content $tOut -ErrorAction SilentlyContinue | Select-Object -Last 1)) } catch {}
                        try { Get-Content "$tOut.err" -ErrorAction SilentlyContinue | Select-Object -Last 5 | ForEach-Object { Log "  ! $_" } } catch {}
                        $st = $null; try { $st = Get-Content -Raw -Encoding UTF8 $stateF | ConvertFrom-Json } catch {}
                        if ($st -and $st.ok) { $sync.Accel = 'ok'; Log '가속: 사용 가능' }
                        else {
                            $why = $(if ($st -and $st.reason) { [string]$st.reason } else { '시험 결과를 읽지 못했습니다' })
                            $sync.Accel = $why; Log "가속: 사용 불가 — $why"
                            if ($st -and $st.stage -eq 'import') {   # 불러오기부터 안 되면 ComfyUI 시작을 방해하지 않게 지움
                                try { Run-Py '-s -m pip uninstall -y --disable-pip-version-check sageattention' 'SageAttention 지우기 (가속 불가)' } catch { Log "가속: SageAttention을 지우지 못했습니다: $_" }
                            }
                        }
                    } catch {
                        if ("$_" -match 'CANCELLED') { throw }
                        $why = "가속 부품을 설치하지 못했습니다 ($($_.Exception.Message))"
                        Log "가속: 사용 불가(그림 만들기에는 영향 없음) — $why"
                        $sync.Accel = $why
                        try {
                            $d = @{ installed = $true; ok = $false; reason = $why; enabled = $true; tested = (Get-Date -Format 'yyyy-MM-dd HH:mm') }
                            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $stateF) | Out-Null
                            [IO.File]::WriteAllText($stateF, ($d | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
                        } catch {}
                    }
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
                'a_prepare' {
                    $sync.NoPip = $false
                    if (-not $cfg.HasPip) {
                        try { Run-Py '-s -m ensurepip --default-pip' 'pip 더하기 (ensurepip)' }
                        catch { if ("$_" -match 'CANCELLED') { throw }; $sync.NoPip = $true; Log "pip을 준비하지 못했습니다 — 파이썬 부품이 필요한 것은 건너뜁니다: $_" }
                    }
                    if (-not $sync.NoPip) {
                        $bk = Join-Path $Work ('pip_before_{0}.txt' -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
                        $code = Run-PyOut '-s -m pip freeze --disable-pip-version-check' $bk
                        if ($code -eq 0) { Log "파이썬 부품 목록 백업: $bk" } else { Log '파이썬 부품 목록을 백업하지 못했습니다' }
                        Remove-Item -Force "$bk.err" -ErrorAction SilentlyContinue
                    }
                }
                'a_node' {
                    $n = $s.Node
                    $dest = Join-Path $CN $n.folder
                    if (Test-Path -LiteralPath $dest) {
                        Log "같은 이름의 폴더가 이미 있어 건드리지 않음: $dest"
                        $sync.SkippedNodes = @($sync.SkippedNodes) + "$($n.label) — 같은 이름의 폴더가 이미 있어 그대로 둠"
                    } else {
                        $zip = Join-Path $Dl "$($n.folder).zip"
                        if (Test-Path $zip) { Remove-Item -Force $zip }
                        Get-Url $n.url $zip $null $n.label
                        $tmp = Join-Path $Work "unzip_$($n.folder)"
                        if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
                        $sync.FileLabel = "$($n.label) — 압축 푸는 중…"
                        Expand-Archive -Path $zip -DestinationPath $tmp -Force
                        $inner = Get-ChildItem $tmp -Directory | Select-Object -First 1
                        # 부품부터 넣어 보고, 실패하면 노드 폴더를 넣지 않음 (반쯤 깔린 노드가 ComfyUI 시작을 방해하지 않게)
                        $okN = $true
                        $req = Join-Path $inner.FullName 'requirements.txt'
                        if (Test-Path -LiteralPath $req) {
                            try { Pip-Add (Read-Req $req) $n.label }
                            catch {
                                if ("$_" -match 'CANCELLED') { throw }
                                $okN = $false; $why = ("$_" -replace '^PIPSKIP:\s*', '')
                                Log "노드 건너뜀: $($n.label) — $why"
                                $sync.SkippedNodes = @($sync.SkippedNodes) + "$($n.label) — $why"
                            }
                        }
                        if ($okN) {
                            Move-Item -LiteralPath $inner.FullName -Destination $dest
                            Ledger 'node' $n.folder
                            $sync.AddedNodes = @($sync.AddedNodes) + $n.label
                            Log "노드 넣음: $dest"
                        }
                        Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
                        Remove-Item -Force $zip -ErrorAction SilentlyContinue
                    }
                }
                'a_simple' {
                    $src = Join-Path $cfg.PackRoot 'cofoty5_onenode'
                    $dst = Join-Path $CN 'cofoty5_onenode'
                    try { Pip-Add (Read-Req (Join-Path $src 'requirements.txt')) 'OneNode 노드 (GPU 정보 표시)' }
                    catch {
                        if ("$_" -match 'CANCELLED') { throw }
                        Log "GPU 정보 부품을 넣지 못했습니다 (VRAM만 표시): $_"
                        $sync.Warn = @($sync.Warn) + 'GPU 사용률·온도 표시 부품을 넣지 못해 VRAM만 표시됩니다'
                    }
                    $isNew = -not (Test-Path -LiteralPath (Join-Path $dst '__init__.py'))
                    New-Item -ItemType Directory -Force -Path $dst | Out-Null
                    # 코드만 덮어씀 — LoRA 세트 · 사전 · 번역 기록 같은 사용자 파일은 그대로
                    Copy-Item -Path (Join-Path $src '*') -Destination $dst -Recurse -Force
                    if ($isNew) { Ledger 'onenode' 'new' }
                    # 기존 사용자 화면은 절대 지우지 않음: '처음 켤 때 빈 화면에 노드 놓기'는 끄고, 대신 워크플로를 새 탭으로 한 번 열기
                    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
                    $fr = Join-Path $dst 'first_run.done'
                    if (-not (Test-Path -LiteralPath $fr)) { Set-Content -LiteralPath $fr -Value $stamp -Encoding ASCII }
                    Set-Content -LiteralPath (Join-Path $dst 'open_workflow.once') -Value $stamp -Encoding ASCII
                    Log 'OneNode 노드 넣음'
                }
                'a_accel' {
                    # 설치는 하지 않고, 이미 있는 Triton · SageAttention이 이 PC에서 되는지 시험만 (결과는 OneNode만 읽음)
                    try {
                        $stateF = Join-Path $CUI 'user\cofoty5_accel.json'
                        if (-not (Test-Path -LiteralPath $stateF)) { Ledger 'accel' $stateF }
                        $sync.FileLabel = '가속: 이 PC에서 되는지 시험하는 중… (1분 정도)'; $sync.FileCur = 0; $sync.FileTotal = 0
                        $test = Join-Path $CN 'cofoty5_onenode\accel_test.py'
                        $null = Run-PyOut "-s `"$test`" --out `"$stateF`"" (Join-Path $Work 'accel_test.txt')
                        $st = $null; try { $st = Get-Content -Raw -Encoding UTF8 $stateF | ConvertFrom-Json } catch {}
                        if ($st -and $st.ok) { $sync.Accel = 'ok'; Log '가속: 사용 가능' }
                        else { $sync.Accel = $(if ($st -and $st.reason) { [string]$st.reason } else { '시험 결과를 읽지 못했습니다' }); Log "가속: 사용 불가 — $($sync.Accel)" }
                    } catch { if ("$_" -match 'CANCELLED') { throw }; Log "가속 시험 건너뜀: $_" }
                }
                'a_model' {
                    $m = $s.Model
                    $dest = Join-Path $CUI ($m.path -replace '/', '\')
                    if (Test-Path -LiteralPath $dest) { Log "모델 있음 (받지 않음): $dest" }
                    else {
                        try { Get-Url $m.url $dest $m.sha256 $m.label; Ledger 'model' $dest; $sync.AddedModels = @($sync.AddedModels) + $m.label }
                        catch {
                            if ("$_" -match 'CANCELLED' -or $m.id -ne 'detail') { throw }
                            Log "건너뜀(없어도 그림은 만들어집니다): $($m.label) — $_"
                            $sync.Skipped = @($sync.Skipped) + $m.label
                        }
                    }
                }
                'a_finish' {
                    $sync.FileLabel = '설치 기록 · 지우기 파일 만드는 중…'
                    Copy-Item -Force (Join-Path $cfg.Here 'files\uninstall_addon.ps1') (Join-Path $Work 'uninstall_addon.ps1')
                    Copy-Item -Force (Join-Path $cfg.Here 'files\Uninstall_OneNode_addon.bat') (Join-Path $Work 'Uninstall_OneNode.bat')
                    Copy-Item -Force (Join-Path $cfg.Here 'files\README_addon.txt') (Join-Path $Work 'README_OneNode.txt')
                    Copy-Item -Force (Join-Path $cfg.Here 'files\CoFoTy5.ico') (Join-Path $Work 'CoFoTy5.ico')
                    $lnkPath = $null
                    if ($cfg.Shortcut -and $cfg.T.Launch) {
                        try {
                            $lnkPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'ComfyUI (OneNode).lnk'
                            $sh = New-Object -ComObject WScript.Shell
                            if ((Test-Path -LiteralPath $lnkPath) -and ($sh.CreateShortcut($lnkPath).TargetPath -ne $cfg.T.Launch)) {
                                Log "같은 이름의 바로가기가 이미 있어 만들지 않음: $lnkPath"; $lnkPath = $null
                            } else {
                                $lnk = $sh.CreateShortcut($lnkPath)
                                $lnk.TargetPath = $cfg.T.Launch; $lnk.WorkingDirectory = (Split-Path -Parent $cfg.T.Launch)
                                $lnk.Description = 'ComfyUI 켜기 (CoFoTy5 OneNode)'
                                $lnk.IconLocation = (Join-Path $Work 'CoFoTy5.ico') + ',0'
                                $lnk.Save(); Ledger 'shortcut' $lnkPath; Log '바탕화면 바로가기 만듦'
                            }
                        } catch { Log "바로가기를 만들지 못했습니다(무시): $($_.Exception.Message)"; $lnkPath = $null }
                    }
                    $wfSha = ''
                    try { $wfSha = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $CN 'cofoty5_onenode\CoFoTy5 OneNode.json')).Hash.ToLower() } catch {}
                    $info = [ordered]@{
                        mode = 'addon'; version = $cfg.M.version; installed = (Get-Date -Format 's')
                        kind = $cfg.T.Kind; root = $cfg.T.Root; comfy = $CUI; python = $PyExe; launch = $cfg.T.Launch
                        workflow_sha = $wfSha
                    }
                    [IO.File]::WriteAllText((Join-Path $Work 'addon_info.json'), ($info | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding($false)))
                    if (Test-Path $Dl) { Remove-Item -Recurse -Force $Dl -ErrorAction SilentlyContinue }
                    Remove-Item -Force (Join-Path $Work 'req_now.txt'), (Join-Path $Work 'constraints.txt'), (Join-Path $Work 'pip_list.txt'), (Join-Path $Work 'pip_list.txt.err') -ErrorAction SilentlyContinue
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
                    # 실행 파일(CoFoTy5_OneNode.exe) 만들기: 이 PC의 .NET(csc.exe)으로 바로 컴파일 (실패해도 .bat으로 시작할 수 있음)
                    $Exe = Join-Path $Inst 'CoFoTy5_OneNode.exe'
                    try {
                        $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
                        if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
                        if (Test-Path $csc) {
                            $src = Join-Path $cfg.Here 'files\launcher.cs'; $icoSrc = Join-Path $cfg.Here 'files\CoFoTy5.ico'
                            $cscOut = Join-Path $Work 'csc_out.txt'
                            $cscArgs = "/nologo /target:exe `"/win32icon:$icoSrc`" `"/out:$Exe`" `"$src`""
                            $pr = Start-Process -FilePath $csc -ArgumentList $cscArgs -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput $cscOut
                            if ($pr.ExitCode -eq 0 -and (Test-Path $Exe)) { Log '실행 파일 만듦: CoFoTy5_OneNode.exe' }
                            else { Log ('실행 파일을 만들지 못했습니다(Start_OneNode.bat으로 시작합니다): ' + ((Get-Content $cscOut -ErrorAction SilentlyContinue) -join ' ')) }
                        } else { Log '.NET 컴파일러를 찾지 못해 실행 파일은 만들지 않았습니다(Start_OneNode.bat으로 시작합니다)' }
                    } catch { Log "실행 파일 만들기 건너뜀: $($_.Exception.Message)" }
                    Copy-Item -Force (Join-Path $cfg.Here 'files\Uninstall_OneNode.bat') (Join-Path $Inst 'Uninstall_OneNode.bat')
                    Copy-Item -Force (Join-Path $cfg.Here 'files\uninstall.ps1') (Join-Path $Work 'uninstall.ps1')
                    Copy-Item -Force (Join-Path $cfg.Here 'files\README_folder.txt') (Join-Path $Inst 'README_설치폴더.txt')   # zip 안 파일 이름은 영문(압축 풀 때 글자 깨짐 방지)
                    if ($cfg.Shortcut) {
                        $desk = [Environment]::GetFolderPath('Desktop')
                        $sh = New-Object -ComObject WScript.Shell
                        $lnk = $sh.CreateShortcut((Join-Path $desk 'CoFoTy5 OneNode.lnk'))
                        $lnk.TargetPath = $(if (Test-Path $Exe) { $Exe } else { Join-Path $Inst 'Start_OneNode.bat' })
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
    if ($script:Mode -eq 'addon') {
        Add '준비: 파이썬 부품 목록 백업' 'a_prepare' 10
        foreach ($n in @($script:Plan.Nodes)) { Add "노드: $($n.label)" 'a_node' 250 @{ Node = $n } }
        Add 'OneNode 노드 · 시작용 워크플로 넣기' 'a_simple' 20
        if ($script:Plan.Accel) { Add '가속 기능 시험 (설치 없이)' 'a_accel' 30 }
        foreach ($m in @($script:Plan.Models)) { Add "모델: $($m.label)" 'a_model' ([double]$m.approx_mb) @{ Model = $m } }
        Add '설치 기록 · 지우기 파일 만들기' 'a_finish' 5
        return , $L.ToArray()
    }
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
    if ($chkAccel.Checked -and $chkAccel.Enabled) { Add '가속 기능 설치 · 시험 (Triton · SageAttention)' 'accel' 150 }
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
    if ($script:Mode -eq 'addon') { $inst = $script:AC.T.Comfy }
    else {
        $inst = $txtDir.Text.Trim().TrimEnd('\')
        New-Item -ItemType Directory -Force -Path $inst | Out-Null
    }
    $sync = [hashtable]::Synchronized(@{})
    $sync.Steps = Build-Steps; $sync.StepIdx = -1; $sync.Changed = $true
    $sync.Log = [System.Collections.ArrayList]::Synchronized((New-Object System.Collections.ArrayList))
    $sync.FileCur = 0; $sync.FileTotal = 0; $sync.FileLabel = ''; $sync.Now = ''
    $sync.Done = $false; $sync.Error = $null; $sync.Cancel = $false; $sync.Skipped = @(); $sync.Accel = ''
    $sync.NoPip = $false; $sync.AddedNodes = @(); $sync.AddedModels = @(); $sync.SkippedNodes = @(); $sync.Warn = @()
    $script:Sync = $sync
    if ($script:Mode -eq 'addon') {
        $cfg = @{ Mode = 'addon'; Inst = $inst; T = $script:AC.T; HasPip = [bool]$script:AC.PyInfo.has_pip; M = $M; Here = $Here; PackRoot = $PackRoot
            Shortcut = ($chkAShortcut.Checked -and $chkAShortcut.Enabled); Detail = $chkADetail.Checked; Lora = $chkALora.Checked }
    } else {
        $cfg = @{ Mode = 'new'; Inst = $inst; M = $M; Here = $Here; PackRoot = $PackRoot; Shortcut = $chkShortcut.Checked; Detail = $chkDetail.Checked; Lora = $chkLora.Checked; CpuMode = ($script:GpuMissing -and $chkCpu.Checked) }
    }
    $rs = [runspacefactory]::CreateRunspace(); $rs.ApartmentState = 'STA'; $rs.Open()
    $ps = [powershell]::Create(); $ps.Runspace = $rs
    [void]$ps.AddScript($Worker.ToString()).AddArgument($sync).AddArgument($cfg)
    $script:PS = $ps; $script:Handle = $ps.BeginInvoke()
    $timer.Start()
}

function Finish-Install {
    $s = $script:Sync
    if ($script:Mode -eq 'addon') { Finish-Addon; return }
    $inst = $txtDir.Text.Trim().TrimEnd('\')
    $script:Inst = $inst
    $script:DoneOk = [bool]$s.Done
    if ($s.Done) {
        $lblDoneT.Text = '설치가 끝났습니다!'; $lblDoneT.ForeColor = $ColOk
        $msg = @"
이제 [지금 시작하기]를 누르거나, 바탕화면의 [CoFoTy5 OneNode]를 두 번 누르면 됩니다.

  • 검은 창(ComfyUI)이 뜨고, 작업 화면이 열리면 검은 창은 작업 표시줄로 내려갑니다.
  • 처음 켤 때는 모델을 읽느라 1~2분 걸릴 수 있습니다.
  • 그 검은 창을 닫으면 ComfyUI가 꺼집니다.
  • 만든 그림은 아래 폴더에 저장됩니다.
      $inst\ComfyUI_windows_portable\ComfyUI\output
  • 지우고 싶을 때: 설치 폴더의 Uninstall_OneNode.bat (또는 폴더째 삭제)
"@
        if (@($s.Skipped).Count -gt 0) {
            $msg += "`n`n※ 받지 못해 건너뛴 보정 모델: " + (@($s.Skipped) -join ', ') + "`n   그림 만들기에는 영향이 없고, 손·얼굴 보정 기능만 빠집니다. 필요하면 ComfyUI의 models\ultralytics\bbox 폴더에 해당 파일을 직접 넣으세요."
        }
        if ($s.Accel -eq 'ok') { $msg += "`n`n⚡ 가속 기능: 사용 가능 (노드의 [⚡ 가속] 표시로 켜고 끕니다)" }
        elseif ($s.Accel) { $msg += "`n`n⚡ 가속 기능: 이 PC에서는 쓸 수 없어 꺼 두었습니다. 그림 만들기는 평소처럼 됩니다.`n   이유: " + $(if ($s.Accel.Length -gt 90) { $s.Accel.Substring(0, 90) + '…' } else { $s.Accel }) }
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
    Show-Page 6
}

function Finish-Addon {
    $s = $script:Sync; $t = $script:AC.T
    $work = Join-Path $t.Comfy 'user\cofoty5_onenode_addon'
    $script:Inst = $work
    $script:DoneOk = [bool]$s.Done
    $btnOpen.Text = '기록 폴더 열기'; $btnRun.Text = 'ComfyUI 켜기'
    if ($s.Done) {
        $lblDoneT.Text = 'OneNode를 추가했습니다!'; $lblDoneT.ForeColor = $ColOk
        $how = $(if ($t.Launch) { '[ComfyUI 켜기]를 누르거나 평소처럼 ComfyUI를 켜세요.' } else { '평소처럼 ComfyUI를 켜세요.' })
        $added = @('OneNode 노드') + @($s.AddedNodes) + @($s.AddedModels)
        $msg = @"
$how
  • 처음 켜면 OneNode 워크플로가 새 탭으로 한 번 열립니다.
     다음부터는 왼쪽 [워크플로] ★ 즐겨찾기의 'CoFoTy5 OneNode'를 누르세요.
  • 원래 있던 탭 · 노드 · 모델 · 설정은 그대로입니다.
  • 넣은 것: $($added -join ', ')
  • 지우고 싶을 때: 기록 폴더의 Uninstall_OneNode.bat (OneNode가 더한 것만 지움)
"@
        if (@($s.SkippedNodes).Count -gt 0) { $msg += "`n※ 건너뛴 노드: " + (@($s.SkippedNodes) -join ' / ') }
        if (@($s.Skipped).Count -gt 0) { $msg += "`n※ 받지 못한 보정 모델: " + (@($s.Skipped) -join ', ') + ' (손·얼굴 보정만 빠짐)' }
        foreach ($w in @($s.Warn)) { $msg += "`n※ $w" }
        if ($s.Accel -eq 'ok') { $msg += "`n⚡ 가속: 사용 가능 (노드의 [⚡ 가속] 표시로 켜고 끕니다)" }
        elseif ($s.Accel) { $msg += "`n⚡ 가속: 이 PC에서는 쓸 수 없어 꺼 두었습니다 (그림 만들기는 평소처럼)" }
        $lblDone.Text = $msg
        $btnRun.Visible = [bool]$t.Launch; $btnOpen.Visible = $true
    } else {
        $btnRun.Visible = $false; $btnOpen.Visible = (Test-Path -LiteralPath $work)
        if ($s.Error -eq 'CANCELLED') {
            $lblDoneT.Text = '설치를 멈췄습니다'; $lblDoneT.ForeColor = $ColWarn
            $lblDone.Text = "그때까지 넣은 것은 그대로 있고, ComfyUI는 원래대로 켜집니다.`n설치 프로그램을 다시 실행하고 같은 ComfyUI를 고르면 남은 것만 이어서 합니다."
        } else {
            $lblDoneT.Text = '설치 중 문제가 생겼습니다'; $lblDoneT.ForeColor = $ColBad
            $lblDone.Text = "$($s.Error)`n`n• ComfyUI 본체와 원래 있던 것은 바꾸지 않았습니다.`n• 인터넷이 잠깐 끊긴 경우가 대부분입니다. 다시 실행하면 남은 것만 이어서 합니다.`n• 계속 같은 곳에서 멈추면, 아래 기록 파일을 문의할 때 함께 보내 주세요:`n   $work\install.log"
        }
    }
    Show-Page 6
}

# ---------------------------------------------------------------- 페이지 이동
$TitlesNew = @{ 1 = '1 / 5  설치 방식'; 2 = '2 / 5  안내'; 3 = '3 / 5  이 PC 확인'; 4 = '4 / 5  설치 위치'; 5 = '5 / 5  설치 중'; 6 = '끝' }
$TitlesAdd = @{ 1 = '1 / 5  설치 방식'; 2 = '2 / 5  안내'; 3 = '3 / 5  이 PC 확인'; 4 = '4 / 5  ComfyUI 찾기 · 점검'; 5 = '5 / 5  추가하는 중'; 6 = '끝' }
function Show-Page($n) {
    $key = $n; if ($n -eq 4 -and $script:Mode -eq 'addon') { $key = 40 }
    foreach ($k in $pages.Keys) { $pages[$k].Visible = ($k -eq $key) }
    $script:Page = $n
    $stepLbl.Text = $(if ($script:Mode -eq 'addon') { $TitlesAdd[$n] } else { $TitlesNew[$n] })
    if ($n -eq 6) { if ($script:DoneOk -and $ImgDone) { $p5.BackgroundImage = $ImgDone } elseif ($ImgStep) { $p5.BackgroundImage = $ImgStep } }   # 설치가 성공했을 때만 완료 그림
    $btnBack.Visible = ($n -ge 2 -and $n -le 4); $btnNext.Visible = ($n -le 4)
    $btnNext.Text = $(if ($n -eq 4) { '설치 시작' } else { '다음 >' })
    $btnCancel.Text = $(if ($n -eq 6) { '닫기' } else { '취소' })
    switch ($n) {
        1 { $btnNext.Enabled = $chkLic.Checked }
        2 {
            $btnNext.Enabled = $true
            if ($script:Mode -eq 'addon') { Set-Intro $IntroAddT $IntroAddS $IntroAdd } else { Set-Intro $IntroNewT $IntroNewS $IntroNew }
        }
        3 { Invoke-Checks }
        4 {
            if ($script:Mode -eq 'addon') { Enter-AddonPage }
            else {
                if ($script:GpuMissing) { $chkAccel.Checked = $false; $chkAccel.Enabled = $false; $btnAccelInfo.Enabled = $true }   # CPU 모드: 가속 없음
                else { $chkAccel.Enabled = $true }
                [void](Test-InstallDir)
            }
        }
        5 { $btnCancel.Enabled = $true }
    }
}
$radAdd.add_CheckedChanged({ $script:Mode = $(if ($radAdd.Checked) { 'addon' } else { 'new' }) })
$chkLic.add_CheckedChanged({ if ($script:Page -eq 1) { $btnNext.Enabled = $chkLic.Checked } })
$btnNext.add_Click({
    if ($script:Page -eq 4) {
        if ($script:Mode -eq 'addon') { if (-not (Confirm-Addon)) { return } }
        elseif (-not (Test-InstallDir)) { return }
        Show-Page 5; Start-Install
    } else { Show-Page ($script:Page + 1) }
})
$btnBack.add_Click({ Show-Page ($script:Page - 1) })
$btnCancel.add_Click({
    if ($script:Page -eq 5 -and $script:Sync -and -not $script:Sync.Done -and -not $script:Sync.Error) {
        if ((Show-Msg "설치를 멈출까요?`n받은 파일은 남아 있어서, 다시 실행하면 이어서 합니다." 'Question' 'YesNo') -eq 'Yes') {
            $script:Sync.Cancel = $true; $btnCancel.Enabled = $false; $lblNow.Text = '멈추는 중…'
        }
        return
    }
    $form.Close()
})
$form.add_FormClosing({
    param($sender, $e)
    if ($script:Page -eq 5 -and $script:Sync -and -not $script:Sync.Done -and -not $script:Sync.Error) {
        if ((Show-Msg "설치 중입니다. 창을 닫을까요?`n다시 실행하면 이어서 합니다." 'Question' 'YesNo') -ne 'Yes') { $e.Cancel = $true; return }
        $script:Sync.Cancel = $true
    }
})
$btnRun.add_Click({
    if ($script:Mode -eq 'addon') {
        $go = [string]$script:AC.T.Launch
        if ($go -and (Test-Path -LiteralPath $go)) { Start-Process -FilePath $go -WorkingDirectory (Split-Path -Parent $go) }
        $form.Close(); return
    }
    $go = Join-Path $script:Inst 'CoFoTy5_OneNode.exe'; if (-not (Test-Path $go)) { $go = Join-Path $script:Inst 'Start_OneNode.bat' }
    Start-Process -FilePath $go -WorkingDirectory $script:Inst
    $form.Close()
})
$btnOpen.add_Click({ Start-Process explorer.exe $script:Inst })

Show-Page 1
$script:Ready = $true
[void]$form.ShowDialog()
if ($script:PS) { try { $script:PS.Stop() } catch {} }
