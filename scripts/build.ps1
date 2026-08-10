# Production build script for Apilator
# Creates standalone EXE and optionally MSI installer

param(
    [switch]$ExeOnly,    # Skip MSI installer, only build EXE (faster)
    [switch]$OpenFolder  # Open output folder after build
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot/..

# Read version from tauri.conf.json
$tauriConfig = Get-Content "src-tauri/tauri.conf.json" | ConvertFrom-Json
$version = $tauriConfig.version

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Apilator Production Build" -ForegroundColor Cyan
Write-Host "  Version: $version" -ForegroundColor Yellow
if ($ExeOnly) {
    Write-Host "  Mode: EXE only (no installer)" -ForegroundColor Gray
}
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Kill running instance if any
$process = Get-Process -Name "apilator" -ErrorAction SilentlyContinue
if ($process) {
    Write-Host "Stopping running Apilator..." -ForegroundColor Yellow
    Stop-Process -Name "apilator" -Force
    Start-Sleep -Milliseconds 500
}

# Build
Write-Host "Building..." -ForegroundColor White
$startTime = Get-Date

if ($ExeOnly) {
    # Build without bundler - only creates EXE
    bunx tauri build --no-bundle
} else {
    # Full build with MSI installer
    bun run build
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

$elapsed = (Get-Date) - $startTime
Write-Host ""
Write-Host "Build completed in $($elapsed.Minutes)m $($elapsed.Seconds)s" -ForegroundColor Green
Write-Host ""

# Output paths (project root/target)
$exePath = "target/release/apilator.exe"
$msiDir = "target/release/bundle/msi"

Write-Host "Output files:" -ForegroundColor Cyan
if (Test-Path $exePath) {
    $exeSize = [math]::Round((Get-Item $exePath).Length / 1MB, 2)
    Write-Host "  EXE: $exePath ($exeSize MB)" -ForegroundColor White
    Write-Host "       (Standalone - futtatható installation nelkul)" -ForegroundColor Gray
}
if (-not $ExeOnly -and (Test-Path $msiDir)) {
    $msiFiles = Get-ChildItem $msiDir -Filter "*.msi"
    foreach ($msi in $msiFiles) {
        $msiSize = [math]::Round($msi.Length / 1MB, 2)
        Write-Host "  MSI: $($msi.FullName) ($msiSize MB)" -ForegroundColor White
    }
}

Write-Host ""

# Open folder if requested
if ($OpenFolder) {
    if ($ExeOnly) {
        explorer.exe "target\release"
    } elseif (Test-Path "target/release/bundle") {
        explorer.exe "target\release\bundle"
    }
}
