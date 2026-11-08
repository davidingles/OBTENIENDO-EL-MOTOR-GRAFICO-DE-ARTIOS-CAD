@echo off
title Motor Grafico 3D ArtiosCAD + 116 Modelos FEFCO (Escala 1:1 mm)
cd /d "%~dp0"
echo Iniciando Servidor CAD 3D + Solver Parametrico FEFCO en http://localhost:8080 ...
start "" "http://localhost:8080"
node server.js
pause
