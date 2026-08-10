# Apilator Setup Script
# Checks the toolchain and installs dependencies

Write-Host "=== Apilator Setup ===" -ForegroundColor Cyan

# Checks
$errors = @()

# Bun
Write-Host "`nChecking Bun..." -ForegroundColor Yellow
$bunVersion = bun --version 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] Bun: $bunVersion" -ForegroundColor Green
}
else {
    $errors += "Bun not found. Install from: https://bun.sh"
    Write-Host "  [X] Bun not found" -ForegroundColor Red
}

# Rust
Write-Host "Checking Rust..." -ForegroundColor Yellow
$rustVersion = rustc --version 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] $rustVersion" -ForegroundColor Green
}
else {
    $errors += "Rust not found. Install from: https://rustup.rs"
    Write-Host "  [X] Rust not found" -ForegroundColor Red
}

# Cargo
Write-Host "Checking Cargo..." -ForegroundColor Yellow
$cargoVersion = cargo --version 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] $cargoVersion" -ForegroundColor Green
}
else {
    $errors += "Cargo not found"
    Write-Host "  [X] Cargo not found" -ForegroundColor Red
}

# Stop if anything is missing
if ($errors.Count -gt 0) {
    Write-Host "`n=== Errors ===" -ForegroundColor Red
    foreach ($err in $errors) {
        Write-Host "  - $err" -ForegroundColor Red
    }
    Write-Host "`nPlease install the missing dependencies and run setup again." -ForegroundColor Yellow
    exit 1
}

# Install dependencies
Write-Host "`n=== Installing Dependencies ===" -ForegroundColor Cyan

Write-Host "`nInstalling npm packages with Bun..." -ForegroundColor Yellow
bun install

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install npm packages" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Setup Complete ===" -ForegroundColor Green
Write-Host "`nTo start development:"
Write-Host "  bun run dev" -ForegroundColor Cyan
Write-Host "  # or"
Write-Host "  ./scripts/dev.ps1" -ForegroundColor Cyan
