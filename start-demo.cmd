@echo off
rem Starts the Retentoor demo: backend, frontend and the ngrok tunnel, each in its own window.
rem Public link: https://headwear-composure-upbeat.ngrok-free.dev
cd /d "%~dp0"
start "Retentoor backend" /D backend cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
start "Retentoor frontend" /D frontend cmd /k "npm run dev -- --port 5173 --strictPort"
start "Retentoor ngrok" "%LOCALAPPDATA%\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe" http 5173
