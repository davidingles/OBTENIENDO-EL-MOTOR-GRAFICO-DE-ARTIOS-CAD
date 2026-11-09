@echo off
title Estudio local de troqueles
cd /d "%~dp0"
echo Iniciando el estudio local en http://localhost:8080 ...
start "" "http://localhost:8080"
node server.js
pause
