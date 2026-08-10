# Development script
Write-Host "Starting Apilator in development mode..." -ForegroundColor Cyan
Set-Location $PSScriptRoot/..
bun run dev
