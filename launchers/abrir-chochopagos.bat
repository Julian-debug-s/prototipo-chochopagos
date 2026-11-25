@echo off
rem Inicia el backend de ChochoPagos (API + app + bot de Telegram) y abre el navegador.
set "BACKEND=%~dp0..\backend"
set "PORT=3000"
where node >nul 2>nul || (echo Se necesita Node.js 22.13 o superior: https://nodejs.org & pause & exit /b 1)
if not exist "%BACKEND%\node_modules" (pushd "%BACKEND%" & call npm install --omit=dev & popd)
if not exist "%BACKEND%\.env" copy "%BACKEND%\.env.example" "%BACKEND%\.env" >nul
start "ChochoPagos servidor" /min /d "%BACKEND%" node --env-file-if-exists=.env src/server.js
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/"
echo ChochoPagos abierto en http://127.0.0.1:%PORT%/
