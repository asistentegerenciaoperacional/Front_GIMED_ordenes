@echo off
setlocal
title GIMED - Prototipo de ordenes de compra
cd /d "%~dp0"
if not exist "runtime\node.exe" (
  echo Extrae el ZIP completo antes de iniciar la aplicacion.
  pause
  exit /b 1
)
"runtime\node.exe" "launch.mjs"
if errorlevel 1 (
  echo.
  echo No se pudo iniciar el prototipo. Revisa el mensaje anterior.
  pause
  exit /b 1
)
endlocal
