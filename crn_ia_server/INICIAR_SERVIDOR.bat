@echo off
cd /d "%~dp0"
REM Pon aqui tu clave gratuita de https://aistudio.google.com/apikey
set GOOGLE_API_KEY=pega_aqui_tu_clave_de_gemini

REM Cierra cualquier servidor Node antiguo que siga ocupando el puerto 3000
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $p.Id -Force; Write-Host 'Servidor antiguo cerrado.' } }"

if "%GOOGLE_API_KEY%"=="pega_aqui_tu_clave_de_gemini" (
  echo [ERROR] Edita este archivo y pon tu clave real en GOOGLE_API_KEY.
  echo Consiguela gratis en https://aistudio.google.com/apikey
  pause
  exit /b 1
)

if not exist node_modules call npm install
node server.js
pause
