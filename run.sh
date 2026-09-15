#!/bin/bash

# ==============================================================================
# Script de Ejecución Simultánea: Backend (FastAPI) + Frontend (React)
# ==============================================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

BACKEND_DIR="./backend"
FRONTEND_DIR="./frontend"
VENV_DIR="$BACKEND_DIR/venv"
VENV_ACTIVATE="$VENV_DIR/bin/activate"
REQ_FILE="$BACKEND_DIR/requirements.txt"

cleanup() {
    echo -e "\n${RED}[!] Deteniendo servidores...${NC}"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}
trap cleanup SIGINT

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}   Iniciando Plataforma Geoespacial Chubut (ETS)     ${NC}"
echo -e "${BLUE}======================================================${NC}"

# --- Backend ---
echo -e "${GREEN}[+] Preparando Backend...${NC}"

# Verificar/crear entorno virtual
if [ ! -d "$VENV_DIR" ]; then
    echo -e "${BLUE}[i] Creando entorno virtual en $VENV_DIR...${NC}"
    python3 -m venv "$VENV_DIR"
fi

source "$VENV_ACTIVATE"

# Instalar dependencias desde requirements.txt
if [ -f "$REQ_FILE" ]; then
    echo -e "${BLUE}[i] Instalando/actualizando dependencias de Python...${NC}"
    pip install -r "$REQ_FILE"
else
    echo -e "${RED}[!] No se encontró $REQ_FILE. Omitiendo instalación automática.${NC}"
fi

cd "$BACKEND_DIR" || { echo -e "${RED}Error: No se encontró $BACKEND_DIR${NC}"; exit 1; }
export PYTHONPATH=$PYTHONPATH:.
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

# --- Frontend ---
echo -e "${GREEN}[+] Preparando Frontend...${NC}"
cd "$FRONTEND_DIR" || { echo -e "${RED}Error: No se encontró $FRONTEND_DIR${NC}"; exit 1; }

if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}[i] Instalando dependencias de Node.js...${NC}"
    npm install
fi

npm run dev &
FRONTEND_PID=$!
cd ..

echo -e "${BLUE}======================================================${NC}"
echo -e "${GREEN} -> Backend corriendo en: http://localhost:8000${NC}"
echo -e "${GREEN} -> Frontend corriendo en: http://localhost:5173${NC}"
echo -e "${BLUE} Presiona [Ctrl + C] para detener ambos servicios.${NC}"
echo -e "${BLUE}======================================================${NC}"

wait
