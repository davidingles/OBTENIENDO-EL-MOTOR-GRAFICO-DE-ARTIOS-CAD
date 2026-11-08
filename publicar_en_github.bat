@echo off
chcp 65001 > nul
title Publicar "Mi-artios-cad-personalizado" en GitHub Publico
cd /d "%~dp0"

echo ============================================================================
echo   PUBLICADOR AUTOMATICO EN GITHUB: Mi-artios-cad-personalizado
echo ============================================================================
echo.

set "GH_CMD=C:\Program Files\GitHub CLI\gh.exe"
if not exist "%GH_CMD%" (
    set "GH_CMD=gh"
)

"%GH_CMD%" auth status >nul 2>&1
if %errorlevel% neq 0 (
    echo [1/2] Iniciando sesion en tu cuenta de GitHub mediante el navegador...
    "%GH_CMD%" auth login --hostname github.com --git-protocol https --web
)

echo.
echo [2/2] Creando el repositorio publico "Mi-artios-cad-personalizado" y subiendo todos los commits...
git remote remove origin >nul 2>&1
"%GH_CMD%" repo create "Mi-artios-cad-personalizado" --public --source=. --remote=origin --push --description "Motor Grafico 3D y 2D de Packaging basado en Esko ArtiosCAD 12.0 + 116 Modelos FEFCO Parametricos (Escala 1:1 mm) con exportacion GLB para Blender"

if %errorlevel% neq 0 (
    echo Si el repositorio ya existia en tu cuenta, subiendo cambios a la rama main...
    git push -u origin main
)

echo.
echo ¡Listo! Tu repositorio publico ya esta publicado en tu GitHub.
pause
