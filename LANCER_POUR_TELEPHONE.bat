@echo off
cd /d "%~dp0"
title Serveur Ordre de Mission SRM TTA
color 0b
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
