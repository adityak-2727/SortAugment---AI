@echo off
setlocal enabledelayedexpansion

echo ====================================================================
echo               SortAugment AI - Backend Startup Script
echo ====================================================================

cd /d "%~dp0"

:: 1. Check Python installation
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python was not found in your PATH.
    echo Please install Python 3.10, 3.11, or 3.12 from python.org and add it to PATH.
    pause
    exit /b 1
)

:: 2. Check virtual environment
if not exist "venv\Scripts\activate.bat" (
    echo [*] Creating virtual environment in venv...
    python -m venv venv
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo [*] Virtual environment created successfully.
)

:: 3. Check PyTorch installation
venv\Scripts\python.exe -c "import torch; print('[*] PyTorch detected:', torch.__version__, '| CUDA available:', torch.cuda.is_available())" 2>nul
if %ERRORLEVEL% neq 0 (
    echo --------------------------------------------------------------------
    echo [NOTICE] PyTorch is not yet installed in this virtual environment.
    echo.
    echo For GPU acceleration with your NVIDIA GPU, please visit:
    echo   https://pytorch.org/get-started/locally/
    echo.
    echo Select your OS (Windows), Package (Pip), and CUDA version matching your GPU driver.
    echo Run that pip command before continuing. For example:
    echo   venv\Scripts\pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126
    echo --------------------------------------------------------------------
    echo.
    set /p PROCEED_NO_TORCH="Proceed to install requirements anyway? (Y/N): "
    if /i not "!PROCEED_NO_TORCH!"=="Y" (
        echo Setup aborted. Please install PyTorch and re-run start-backend.bat.
        pause
        exit /b 1
    )
)

:: 4. Install requirements
echo [*] Checking and installing dependencies from requirements.txt...
venv\Scripts\pip.exe install -r requirements.txt --quiet
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Some dependencies failed to install. Continuing...
)

:: 5. Launch FastAPI server
echo ====================================================================
echo Starting SortAugment AI Backend on http://127.0.0.1:8000
echo Base URL: http://localhost:8000
echo CORS Origin: http://localhost:5173
echo Press Ctrl+C to stop the server.
echo ====================================================================

venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --reload

pause
