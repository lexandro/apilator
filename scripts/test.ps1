# Test script
Write-Host "Running tests..." -ForegroundColor Cyan
Set-Location $PSScriptRoot/..
bun run test
