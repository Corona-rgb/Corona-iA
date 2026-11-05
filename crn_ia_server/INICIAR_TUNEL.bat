@echo off
cd /d "%~dp0"
set NGROK_DOMAIN=
REM Pon aqui tu dominio fijo y gratis de ngrok (dashboard.ngrok.com, menu Domains), SIN https://
REM Si lo dejas vacio, funciona igual pero la direccion cambia cada vez que abras esto.

where ngrok >nul 2>&1
if errorlevel 1 (
  echo ngrok no esta instalado. En PowerShell ejecuta:  winget install ngrok -s msstore
  pause
  exit /b 1
)

if "%NGROK_DOMAIN%"=="" (
  ngrok http 3000
) else (
  echo Tu direccion fija es: https://%NGROK_DOMAIN%
  echo Copiala en PROXY_URL dentro de index.html.
  ngrok http 3000 --url %NGROK_DOMAIN%
)
echo.
echo El tunel se ha cerrado.
pause
