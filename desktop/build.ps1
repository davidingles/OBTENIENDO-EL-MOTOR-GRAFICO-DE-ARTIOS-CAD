$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
    & npm.cmd run desktop:build
    if ($LASTEXITCODE -ne 0) { throw 'Error compilando Tauri v2.' }
    New-Item -ItemType Directory -Path dist -Force | Out-Null
    Copy-Item -LiteralPath 'src-tauri\target\release\troqueles-vicente.exe' -Destination 'dist\Troqueles-Vicente-Tauri-v2.exe' -Force
    Get-Item -LiteralPath 'dist\Troqueles-Vicente-Tauri-v2.exe' | Select-Object FullName, Length
} finally { Pop-Location }
