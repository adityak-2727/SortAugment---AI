@echo off
echo ====================================================================
echo             SortAugment AI - Stopping Servers
echo ====================================================================

echo [*] Stopping backend processes on port 8000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo [*] Stopping frontend processes on port 5173...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo [*] Stopping any leftover uvicorn processes...
taskkill /f /im uvicorn.exe >nul 2>&1

echo ====================================================================
echo All SortAugment servers have been stopped.
echo ====================================================================
