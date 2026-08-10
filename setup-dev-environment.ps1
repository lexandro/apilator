# ============================================================
# Apilator Dev Environment Setup - Windows 11
# ============================================================
# Run: open PowerShell AS ADMINISTRATOR, then:
#   Set-ExecutionPolicy Bypass -Scope Process -Force
#   .\setup-dev-environment.ps1
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Apilator Dev Environment Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------
# 1. Check: administrator rights
# ------------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] This script must be run AS ADMINISTRATOR" -ForegroundColor Red
    Write-Host "       Jobb klikk PowerShell -> Run as Administrator" -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] Admin jogok megvannak" -ForegroundColor Green

# ------------------------------------------------------------
# 2. Check: winget
# ------------------------------------------------------------
Write-Host ""
Write-Host "[1/6] Winget ellenorzese..." -ForegroundColor Yellow
if (Get-Command winget -ErrorAction SilentlyContinue) {
    $wingetVersion = winget --version
    Write-Host "      Winget: $wingetVersion" -ForegroundColor Green
} else {
    Write-Host "[ERROR] winget not found. It ships with Windows 11 by default." -ForegroundColor Red
    Write-Host "       Microsoft Store-bol telepitsd: 'App Installer'" -ForegroundColor Yellow
    exit 1
}

# ------------------------------------------------------------
# 3. Visual Studio Build Tools (C++ workload)
# ------------------------------------------------------------
Write-Host ""
Write-Host "[2/6] Visual Studio Build Tools telepitese..." -ForegroundColor Yellow
Write-Host "      (Ez a leghosszabb lepes, 5-15 perc)" -ForegroundColor Gray

# Skip if it is already installed
$vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vsInstalled = $false

if (Test-Path $vsWhere) {
    $vsInstallations = & $vsWhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -format json | ConvertFrom-Json
    if ($vsInstallations.Count -gt 0) {
        $vsInstalled = $true
        Write-Host "      Visual Studio Build Tools already installed" -ForegroundColor Green
    }
}

if (-not $vsInstalled) {
    Write-Host "      Telepites indul... (ne zard be az ablakot!)" -ForegroundColor Cyan
    
    # Install Build Tools via winget
    winget install Microsoft.VisualStudio.2022.BuildTools --silent --accept-package-agreements --accept-source-agreements
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[FIGYELEM] A Build Tools alaptelepites befejezodott." -ForegroundColor Yellow
        Write-Host "           The C++ components must now be added MANUALLY:" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  1. Open: Visual Studio Installer" -ForegroundColor White
        Write-Host "     (Start menu -> 'Visual Studio Installer')" -ForegroundColor Gray
        Write-Host ""
        Write-Host "  2. Build Tools 2022 -> Modify" -ForegroundColor White
        Write-Host ""
        Write-Host "  3. Pipald ki: 'Desktop development with C++'" -ForegroundColor White
        Write-Host "     (Bal oldali Workloads tab)" -ForegroundColor Gray
        Write-Host ""
        Write-Host "  4. Kattints 'Modify' gombra jobb alul" -ForegroundColor White
        Write-Host ""
        Write-Host "  5. Varod meg mig telepul (5-10 perc)" -ForegroundColor White
        Write-Host ""
        Read-Host "Nyomj ENTER-t ha kesz a C++ workload telepites"
    }
}

# Add the C++ workload if it is missing
Write-Host "      C++ workload ellenorzese es telepitese..." -ForegroundColor Cyan
$vsInstallerPath = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vs_installer.exe"

if (Test-Path $vsInstallerPath) {
    # Silent install a C++ workload-hoz
    Start-Process -FilePath $vsInstallerPath -ArgumentList "modify", "--installPath", "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools", "--add", "Microsoft.VisualStudio.Workload.VCTools", "--includeRecommended", "--quiet", "--norestart" -Wait -NoNewWindow
    Write-Host "      C++ workload telepitve/frissitve" -ForegroundColor Green
} else {
    Write-Host "      [INFO] VS Installer not found where expected" -ForegroundColor Yellow
    Write-Host "             Manual installation may be required" -ForegroundColor Yellow
}

# ------------------------------------------------------------
# 4. Install Rust (rustup)
# ------------------------------------------------------------
Write-Host ""
Write-Host "[3/6] Rust telepitese (rustup)..." -ForegroundColor Yellow

if (Get-Command rustc -ErrorAction SilentlyContinue) {
    $rustVersion = rustc --version
    Write-Host "      Rust already installed: $rustVersion" -ForegroundColor Green
} else {
    Write-Host "      Rust telepitese indul..." -ForegroundColor Cyan
    
    # Download and run rustup
    $rustupUrl = "https://win.rustup.rs/x86_64"
    $rustupExe = "$env:TEMP\rustup-init.exe"
    
    Write-Host "      Rustup letoltese..." -ForegroundColor Gray
    Invoke-WebRequest -Uri $rustupUrl -OutFile $rustupExe
    
    Write-Host "      Rustup futtatasa (stable toolchain)..." -ForegroundColor Gray
    # -y = no prompts, default options
    Start-Process -FilePath $rustupExe -ArgumentList "-y", "--default-toolchain", "stable" -Wait -NoNewWindow
    
    # Refresh the environment variables for this session
    $env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path
    
    # Verify
    if (Get-Command rustc -ErrorAction SilentlyContinue) {
        $rustVersion = rustc --version
        Write-Host "      Rust sikeresen telepitve: $rustVersion" -ForegroundColor Green
    } else {
        Write-Host "      [WARNING] Rust installed, but a new terminal is needed to reach it" -ForegroundColor Yellow
    }
    
    Remove-Item $rustupExe -ErrorAction SilentlyContinue
}

# ------------------------------------------------------------
# 5. Check: WebView2 Runtime
# ------------------------------------------------------------
Write-Host ""
Write-Host "[4/6] WebView2 Runtime ellenorzese..." -ForegroundColor Yellow

$webview2Key = "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
$webview2Installed = Test-Path $webview2Key

if ($webview2Installed) {
    Write-Host "      WebView2 Runtime is installed" -ForegroundColor Green
} else {
    Write-Host "      WebView2 telepitese..." -ForegroundColor Cyan
    winget install Microsoft.EdgeWebView2Runtime --silent --accept-package-agreements
    Write-Host "      WebView2 telepitve" -ForegroundColor Green
}

# ------------------------------------------------------------
# 6. Check: Bun
# ------------------------------------------------------------
Write-Host ""
Write-Host "[5/6] Bun ellenorzese..." -ForegroundColor Yellow

if (Get-Command bun -ErrorAction SilentlyContinue) {
    $bunVersion = bun --version
    Write-Host "      Bun: v$bunVersion" -ForegroundColor Green
} else {
    Write-Host "      Bun telepitese..." -ForegroundColor Cyan
    winget install Oven-sh.Bun --silent --accept-package-agreements
    Write-Host "      Bun installed (a new terminal is needed to use it)" -ForegroundColor Green
}

# ------------------------------------------------------------
# 7. Check: Git
# ------------------------------------------------------------
Write-Host ""
Write-Host "[6/6] Git ellenorzese..." -ForegroundColor Yellow

if (Get-Command git -ErrorAction SilentlyContinue) {
    $gitVersion = git --version
    Write-Host "      $gitVersion" -ForegroundColor Green
} else {
    Write-Host "      Git telepitese..." -ForegroundColor Cyan
    winget install Git.Git --silent --accept-package-agreements
    Write-Host "      Git telepitve" -ForegroundColor Green
}

# ------------------------------------------------------------
# Summary
# ------------------------------------------------------------
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Telepites befejezve!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Telepitett komponensek:" -ForegroundColor White
Write-Host "  - Visual Studio Build Tools 2022 (C++ workload)" -ForegroundColor Gray
Write-Host "  - Rust (rustup, stable toolchain)" -ForegroundColor Gray
Write-Host "  - WebView2 Runtime" -ForegroundColor Gray
Write-Host "  - Bun" -ForegroundColor Gray
Write-Host "  - Git" -ForegroundColor Gray
Write-Host ""
Write-Host "Telepitesi helyek:" -ForegroundColor White
Write-Host "  Rust:  $env:USERPROFILE\.cargo" -ForegroundColor Gray
Write-Host "         $env:USERPROFILE\.rustup" -ForegroundColor Gray
Write-Host ""
Write-Host "[FONTOS] INDITSD UJRA A TERMINALT / VS CODE-ot!" -ForegroundColor Yellow
Write-Host "         Or run: refreshenv (if you have Chocolatey)" -ForegroundColor Yellow
Write-Host ""
Write-Host "Ellenorzes uj terminalban:" -ForegroundColor White
Write-Host "  rustc --version" -ForegroundColor Cyan
Write-Host "  cargo --version" -ForegroundColor Cyan
Write-Host "  bun --version" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------
# Optional: install the Tauri CLI
# ------------------------------------------------------------
Write-Host "Szeretned most telepiteni a Tauri CLI-t is? (I/N): " -ForegroundColor Yellow -NoNewline
$installTauri = Read-Host

if ($installTauri -eq "I" -or $installTauri -eq "i") {
    Write-Host ""
    Write-Host "Tauri CLI telepitese cargo-val..." -ForegroundColor Cyan
    Write-Host "(Ez 2-5 percig tarthat, Rust-bol fordit)" -ForegroundColor Gray
    
    # Refresh PATH so cargo is reachable
    $env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path
    
    cargo install tauri-cli --version "^2.0.0"
    
    Write-Host ""
    Write-Host "Tauri CLI telepitve!" -ForegroundColor Green
    Write-Host "Ellenorzes: cargo tauri --version" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Setup KESZ! Inditsd ujra a terminalt es kezdheted a fejlesztest." -ForegroundColor Green
Write-Host ""
