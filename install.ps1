# ==============================================================================
# QuotaLens One-Line Installer for Windows (PowerShell)
# Usage:
#   irm https://raw.githubusercontent.com/NourHayik/QuotaLens/main/install.ps1 | iex
# ==============================================================================

$ErrorActionPreference = 'Stop'

Write-Host "==> Installing QuotaLens..." -ForegroundColor Cyan

# 1. Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js is required but was not found in PATH." -ForegroundColor Red
    Write-Host "Please install Node.js 22 or later from https://nodejs.org or via winget:"
    Write-Host "  winget install OpenJS.NodeJS.LTS" -ForegroundColor Yellow
    exit 1
}

$InstallDir = if ($env:QUOTALENS_DIR) { $env:QUOTALENS_DIR } else { Join-Path $env:USERPROFILE ".quotalens" }
$BinDir = Join-Path $InstallDir "bin"
$ZipUrl = "https://github.com/NourHayik/QuotaLens/archive/refs/heads/main.zip"
$ZipFile = Join-Path $env:TEMP "quotalens-main.zip"
$ExtractTemp = Join-Path $env:TEMP "quotalens-extract-$([System.Guid]::NewGuid().ToString())"

Write-Host "==> Downloading latest QuotaLens release without git pull..." -ForegroundColor Cyan
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipFile -UseBasicParsing

Write-Host "==> Extracting files to $InstallDir..." -ForegroundColor Cyan
if (Test-Path $ExtractTemp) { Remove-Item -Recurse -Force $ExtractTemp }
Expand-Archive -Path $ZipFile -DestinationPath $ExtractTemp -Force

if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$ExtractedFolder = Join-Path $ExtractTemp "QuotaLens-main"
if (-not (Test-Path $ExtractedFolder)) {
    # Fallback if folder name varies
    $ExtractedFolder = Get-ChildItem -Path $ExtractTemp -Directory | Select-Object -First 1 -ExpandProperty FullName
}

Copy-Item -Path "$ExtractedFolder\*" -Destination $InstallDir -Recurse -Force
Remove-Item -Path $ZipFile -Force -ErrorAction SilentlyContinue
Remove-Item -Path $ExtractTemp -Recurse -Force -ErrorAction SilentlyContinue

# 2. Build QuotaLens
Write-Host "==> Building QuotaLens (installing dependencies & compiling)..." -ForegroundColor Cyan
Push-Location $InstallDir
try {
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        & pnpm install --prod=false
        & pnpm run build
    } elseif (Get-Command npm -ErrorAction SilentlyContinue) {
        & npm install
        & npm run build
    } else {
        Write-Host "[ERROR] Neither npm nor pnpm was found in PATH." -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}

# 3. Create Windows .cmd wrappers so quotalens & ai-limits run from ANY directory
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
}

$QuotalensCmd = @"
@ECHO off
node "%~dp0\..\bin\quotalens.js" %*
"@

$AiLimitsCmd = @"
@ECHO off
node "%~dp0\..\bin\ai-limits.js" %*
"@

Set-Content -Path (Join-Path $BinDir "quotalens.cmd") -Value $QuotalensCmd -Encoding ASCII
Set-Content -Path (Join-Path $BinDir "ai-limits.cmd") -Value $AiLimitsCmd -Encoding ASCII

# 4. Add BinDir to User PATH environment variable if not already present
$UserPath = [Environment]::GetEnvironmentVariable("Path", [EnvironmentVariableTarget]::User)
if ($UserPath -notlike "*$BinDir*") {
    $NewPath = "$BinDir;$UserPath"
    [Environment]::SetEnvironmentVariable("Path", $NewPath, [EnvironmentVariableTarget]::User)
    $env:Path = "$BinDir;$env:Path"
    Write-Host "==> Added $BinDir to User PATH." -ForegroundColor Green
}

Write-Host ""
Write-Host "✓ QuotaLens successfully installed to $InstallDir" -ForegroundColor Green
Write-Host "✓ Global commands 'quotalens' and 'ai-limits' are ready to use!" -ForegroundColor Green
Write-Host ""
Write-Host "Quick Start (runs from ANY directory):"
Write-Host "  quotalens status           # View AI subscription limits table"
Write-Host "  quotalens status --json    # Machine-readable JSON output"
Write-Host "  quotalens doctor           # Health check connected CLI tools"
Write-Host "  quotalens dashboard        # Launch web UI at http://127.0.0.1:3000"
Write-Host ""
