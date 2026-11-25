@echo off
echo ====================================================================
echo             SortAugment AI - Full Stack Launcher
echo ====================================================================
echo Starting Backend (FastAPI on http://127.0.0.1:8000)...
start "SortAugment Backend" cmd /k "cd /d "%~dp0backend" && call start-backend.bat"

echo Starting Frontend (Vite on http://localhost:5173)...
start "SortAugment Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Both servers are launching in separate windows!
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo ====================================================================
