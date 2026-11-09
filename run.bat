@echo off
setlocal enabledelayedexpansion

:: ==============================================================================
:: Script de Ejecución Simultánea: Backend (FastAPI) + Frontend (React) - Windows
:: ==============================================================================

set "BACKEND_DIR=.\backend"
set "FRONTEND_DIR=.\frontend"
set "VENV_DIR=%BACKEND_DIR%\venv"
set "VENV_ACTIVATE=%VENV_DIR%\Scripts\activate.bat"
set "REQ_FILE=%BACKEND_DIR%\requirements.txt"

echo ======================================================
echo   Iniciando Plataforma Geoespacial Chubut (ETS)      
echo ======================================================

:: --- Backend ---
echo [+] Preparando Backend...

:: Verificar/crear entorno virtual
if not exist "%VENV_DIR%" (
    echo [i] Creando entorno virtual en %VENV_DIR%...
    python -m venv "%VENV_DIR%"
)

:: Activar entorno virtual e instalar dependencias
call "%VENV_ACTIVATE%"

if exist "%REQ_FILE%" (
    echo [i] Instalando/actualizando dependencias de Python...
    pip install -r "%REQ_FILE%"
) else (
    echo [!] No se encontro %REQ_FILE%. Omitiendo instalacion automatica.
)

cd /d "%BACKEND_DIR%" || (
    echo Error: No se encontro %BACKEND_DIR%
    exit /b 1
)

set "PYTHONPATH=%PYTHONPATH%;."
:: Iniciar Uvicorn en una nueva ventana de consola para que corra en paralelo
start "Backend - FastAPI" cmd /k "call venv\Scripts\activate.bat && uvicorn main:app --reload --port 8000"
cd ..

:: --- Frontend ---
echo [+] Preparando Frontend...
cd /d "%FRONTEND_DIR%" || (
    echo Error: No se encontro %FRONTEND_DIR%
    exit /b 1
)

if not exist "node_modules" (
    echo [i] Instalando dependencias de Node.js...
    call npm install
)

:: Iniciar npm run dev en otra ventana paralela
start "Frontend - React" cmd /k "npm run dev"
cd ..

echo ======================================================
echo  -> Backend iniciado en nueva ventana (Puerto 8000)
echo  -> Frontend iniciado en nueva ventana (Puerto 5173)
echo Cierra las ventanas individuales para detener los servicios.
echo ======================================================

pause