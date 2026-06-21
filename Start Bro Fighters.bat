@echo off
setlocal

cd /d "%~dp0"

echo.
echo Starting Bro Fighters...
echo.

set "ICON_PATH=%CD%\assets\icons\bro-fighters.ico"
if exist "%ICON_PATH%" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$desktop = [Environment]::GetFolderPath('Desktop'); $shortcutPath = Join-Path $desktop 'Bro Fighters.lnk'; $shell = New-Object -ComObject WScript.Shell; $shortcut = $shell.CreateShortcut($shortcutPath); $shortcut.TargetPath = '%~f0'; $shortcut.WorkingDirectory = '%CD%'; $shortcut.Description = 'Start Bro Fighters'; $shortcut.IconLocation = '%ICON_PATH%'; $shortcut.Save()" >nul 2>nul
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or is not on PATH.
  echo Install Node.js LTS from https://nodejs.org/ then run this file again.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not installed or is not on PATH.
  echo Install Node.js LTS from https://nodejs.org/ then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo First run detected. Installing project dependencies...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo Dependency install failed.
    pause
    exit /b 1
  )
)

echo.
echo Opening http://localhost:5173
echo Keep this window open while playing.
echo Press Ctrl+C in this window to stop the game server.
echo.

start "" "http://localhost:5173"
call npm run dev

echo.
echo Bro Fighters server stopped.
pause
