#!/bin/bash
# Inicia o backend CuidarControl
cd "$(dirname "$0")/backend"

echo "📦 Instalando dependências Python..."
pip install -r requirements.txt

echo ""
echo "🚀 Iniciando backend em http://localhost:8000"
echo "   Documentação da API: http://localhost:8000/docs"
echo ""
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
