#!/bin/bash
# Inicia o frontend CuidarControl
cd "$(dirname "$0")/frontend"

echo "📦 Instalando dependências Node..."
npm install

echo ""
echo "🚀 Iniciando frontend em http://localhost:3000"
echo ""
npm run dev
