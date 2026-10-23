@echo off
setlocal
cd /d "%~dp0"
set "ELECTRON=%~dp0node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON%" (
  echo.
  echo  Electron не найден: %ELECTRON%
  echo  Установите зависимости командой  npm install  в этой папке.
  echo.
  pause
  exit /b 1
)
start "" "%ELECTRON%" "%~dp0"
