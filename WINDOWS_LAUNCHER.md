# Windows Launcher

Use this when you want Bro Fighters to open from the desktop without typing commands.

## For Players And Collaborators

1. Install **Node.js LTS** from <https://nodejs.org/>.
2. Pull or download the repo.
3. Double-click `Start Bro Fighters.bat`.
4. The launcher creates or updates a **Bro Fighters** desktop shortcut with the game
   icon.
5. If Windows asks whether to run it, choose **Run**.
6. Leave the PowerShell or Command Prompt window open while playing.

The first launch may take a minute because it installs project dependencies. After that,
the launcher starts faster.

## Put It On Your Desktop

The launcher normally does this automatically. If you need to do it by hand:

1. Right-click `Start Bro Fighters.bat`.
2. Choose **Show more options** if needed.
3. Choose **Create shortcut**.
4. Move the shortcut to your Desktop.
5. Right-click the shortcut and choose **Properties**.
6. Choose **Change Icon...**.
7. Pick `assets\icons\bro-fighters.ico`.

## Recreate The `.bat` File

If the launcher is missing after a fresh setup, create a file named:

```text
Start Bro Fighters.bat
```

Put it in the repo root, beside `package.json`, with this content:

```bat
@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul || (
  echo Install Node.js LTS from https://nodejs.org/ then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\" call npm install

start "" "http://localhost:5173"
call npm run dev
pause
```

That minimal launcher starts the game, but it does not create the desktop shortcut or
apply the icon. Use the repo's included `Start Bro Fighters.bat` for the full version.

## About `.exe` Files

For now, prefer the `.bat` launcher because it is simple, readable, and safe to keep in
Git. A generated `.exe` would hide the commands and usually requires an extra packaging
tool, so it is better as a later polish step.
