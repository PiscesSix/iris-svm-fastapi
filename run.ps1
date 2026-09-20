# One-shot bootstrap for PowerShell: create the virtualenv, install, start the API.
#
#   .\run.ps1          serve the API on http://127.0.0.1:8000
#   .\run.ps1 train    install dev dependencies, retrain the model, redraw figures
#
# PowerShell twin of run.sh, for people who do not have Git Bash open.

param([ValidateSet('serve', 'train')][string]$Mode = 'serve', [int]$Port = 8000)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Say($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Die($msg) { Write-Host "`nLOI: $msg" -ForegroundColor Red; exit 1 }

# --- 1. Locate a Python interpreter -------------------------------------------
$py = $null
foreach ($c in @(@('py', '-3'), @('python'), @('python3'))) {
    $exe = $c[0]
    if (Get-Command $exe -ErrorAction SilentlyContinue) {
        $rest = @($c[1..($c.Length - 1)])
        & $exe @rest -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" 2>$null
        if ($LASTEXITCODE -eq 0) { $py = $c; break }
    }
}
if (-not $py) { Die "Khong tim thay Python 3.10+. Cai tai https://www.python.org/downloads/ va tich 'Add python.exe to PATH'." }

# --- 2. Create the virtualenv on first run ------------------------------------
if (-not (Test-Path '.venv')) {
    Say 'Tao moi truong ao .venv (chi lan dau)'
    & $py[0] @($py[1..($py.Length - 1)]) -m venv .venv
}
$vpy = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $vpy)) { Die 'Moi truong ao hong. Xoa thu muc .venv roi chay lai lenh nay.' }

# --- 3. Install dependencies ---------------------------------------------------
& $vpy -m pip install --quiet --upgrade pip

if ($Mode -eq 'train') {
    Say 'Cai thu vien huan luyen (requirements-dev.txt)'
    & $vpy -m pip install --quiet -r requirements-dev.txt
    Say 'Huan luyen lai mo hinh'
    & $vpy train.py
    Say 'Ve lai hinh cho bao cao'
    & $vpy figures.py
    Say "Xong. Chay '.\run.ps1' de khoi dong dich vu."
    exit 0
}

Say 'Cai thu vien cho API (requirements.txt)'
& $vpy -m pip install --quiet -r requirements.txt

if (-not (Test-Path 'svm_model.pkl')) { Die "Thieu svm_model.pkl. Chay '.\run.ps1 train' de huan luyen lai." }

# --- 4. Serve ------------------------------------------------------------------
Say "Khoi dong API tai http://127.0.0.1:$Port  (Ctrl+C de dung)"
Write-Host "    Giao dien web : http://127.0.0.1:$Port/"
Write-Host "    Swagger UI    : http://127.0.0.1:$Port/docs`n"

# Open the browser once the server is actually listening.
Start-Job -ScriptBlock {
    param($p)
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $c = New-Object Net.Sockets.TcpClient('127.0.0.1', $p)
            $c.Close(); Start-Process "http://127.0.0.1:$p/"; break
        } catch { Start-Sleep -Milliseconds 500 }
    }
} -ArgumentList $Port | Out-Null

& $vpy -m uvicorn app:app --host 127.0.0.1 --port $Port --reload
