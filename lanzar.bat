@echo off
setlocal

:: ==============================================================================
:: Script Diario: Lanzar Backend (FastAPI) y Frontend (React) Rápidamente
:: ==============================================================================

set "BACKEND_DIR=.\backend"
set "FRONTEND_DIR=.\frontend"

echo ======================================================
echo   Iniciando Plataforma Geoespacial Chubut (ETS) - Dev  
echo ======================================================

:: --- 1. Levantar Backend en nueva ventana ---
echo [+] Lanzando Backend (FastAPI)...
start "Backend - FastAPI" cmd /k "cd /d %BACKEND_DIR% && call venv\Scripts\activate.bat && set PYTHONPATH=%PYTHONPATH%;. && uvicorn main:app --reload --port 8000"

:: --- 2. Levantar Frontend en nueva ventana ---
echo [+] Lanzando Frontend (React/Vite)...
start "Frontend - React" cmd /k "cd /d %FRONTEND_DIR% && npm run dev"

echo ======================================================
echo  -> Servidores corriendo en ventanas independientes.
echo  -> Backend:   http://localhost:8000
echo  -> Frontend:  http://localhost:5173
echo ======================================================

pause