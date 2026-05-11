# 🧑‍⚕️ ZQCuidadoras

**Controle financeiro para famílias que contratam cuidadoras.**

ZQCuidadoras é um aplicativo web gratuito e de código aberto para registrar plantões, cobranças avulsas e acompanhar o fechamento semanal e mensal de pagamentos de cuidadoras. Ideal para quem cuida de um familiar e precisa de organização simples, sem planilhas complicadas.

> **100% gratuito.** Sem assinatura, sem limite de uso, sem anúncios.

---

## 💡 A ideia

Quem contrata cuidadoras informalmente lida com:

- Plantões diurnos, noturnos e de 24h com valores diferentes
- Cobranças avulsas (aplicações, procedimentos, transporte)
- Dificuldade em saber o total da semana ou do mês por cuidadora
- Controle de quem já foi pago e quem ainda está pendente

O ZQCuidadoras resolve isso com um painel simples, um calendário visual e relatórios de fechamento — tudo salvo localmente no seu servidor, sem enviar dados para terceiros.

---

## ✨ Funcionalidades

- **Dashboard** — totais do dia, semana e mês + pendências de pagamento
- **Cadastro de cuidadoras** — com valor configurável por tipo de plantão
- **Lançamento de plantões** — diurno, noturno ou 24h com valor preenchido automaticamente
- **Cobranças avulsas** — aplicações, procedimentos e outros gastos vinculados à cuidadora
- **Calendário mensal** — visualização com detalhe por dia
- **Fechamento semanal** — plantões + avulsos separados, com botão de marcar como pago
- **Fechamento mensal** — quebra por tipo de plantão + avulsos por cuidadora
- **Controle de pagamento** — marcar individual ou em lote
- **Banco SQLite** — persistência local, sem dependência de nuvem externa

---

## 🗂️ Estrutura do projeto

```
ZQCuidadoras/
├── backend/
│   ├── main.py              ← API FastAPI + SQLite
│   ├── requirements.txt     ← Dependências Python
│   ├── .env.example         ← Modelo de configuração
│   └── zqcuidadoras.db      ← Banco SQLite (criado automaticamente)
├── frontend/
│   ├── src/
│   │   ├── App.jsx          ← Aplicação React completa
│   │   └── main.jsx         ← Entry point
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── DEPLOY.md                ← Guia de deploy em VPS
└── README.md
```

---

## ✅ Pré-requisitos

| Ferramenta | Versão mínima | Como verificar      |
|------------|---------------|---------------------|
| Python     | 3.10+         | `python3 --version` |
| pip        | qualquer      | `pip --version`     |
| Node.js    | 18+           | `node --version`    |
| npm        | 8+            | `npm --version`     |

---

## 🚀 Como instalar e rodar localmente

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/ZQCuidadoras.git
cd ZQCuidadoras
```

### 2. Backend (abra um terminal)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

O backend sobe em **http://localhost:8000**  
Documentação interativa da API: **http://localhost:8000/docs**

### 3. Frontend (abra outro terminal)

```bash
cd frontend
npm install
npm run dev
```

O app abre em **http://localhost:3000**

---

## ⚙️ Configuração

Copie o arquivo de exemplo e ajuste as variáveis:

```bash
cp backend/.env.example backend/.env
```

Edite o `backend/.env`:

```env
# Chave secreta para autenticação — gere uma forte:
# python3 -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=cole-aqui-a-chave-gerada

# Tempo de expiração do token de login (em horas)
TOKEN_EXPIRE_HOURS=12

# Usuários do sistema — formato: usuario:senha,usuario2:senha2
USERS=ana:SuaSenhaForte1,joao:OutraSenha2

# Caminho do banco SQLite (opcional — padrão: pasta backend/)
# DB_PATH=/var/www/zqcuidadoras/backend/zqcuidadoras.db

# Pasta do frontend compilado (opcional — para servir via backend em produção)
# FRONTEND_DIR=/var/www/zqcuidadoras/frontend/dist
```

> O banco de dados `zqcuidadoras.db` é criado automaticamente na pasta `backend/` na primeira execução.

---

## 🗄️ Banco de dados

O SQLite é utilizado para armazenamento local — sem necessidade de configurar um servidor de banco de dados externo. O arquivo pode ser aberto com o [DB Browser for SQLite](https://sqlitebrowser.org/).

### Tabelas

| Tabela          | Descrição                             |
|-----------------|---------------------------------------|
| `caregivers`    | Cadastro das cuidadoras               |
| `shifts`        | Plantões (diurno, noturno, 24h)       |
| `extra_charges` | Cobranças avulsas (aplicações, etc.)  |

### Backup

Para fazer backup dos dados, basta copiar o arquivo:

```bash
cp backend/zqcuidadoras.db backup/zqcuidadoras-$(date +%Y%m%d).db
```

---

## 🌐 API — Principais endpoints

### Cuidadoras
```
GET    /caregivers          → Lista todas
POST   /caregivers          → Cria nova
PUT    /caregivers/{id}     → Atualiza
```

### Plantões
```
GET    /shifts              → Lista (filtros: ?month=2025-05&caregiver_id=...)
POST   /shifts              → Cria
PUT    /shifts/{id}         → Atualiza
PATCH  /shifts/{id}/payment → Atualiza status de pagamento
DELETE /shifts/{id}         → Remove
```

### Cobranças Avulsas
```
GET    /extra-charges              → Lista (filtros: ?month=2025-05&caregiver_id=...)
POST   /extra-charges              → Cria
PUT    /extra-charges/{id}         → Atualiza
PATCH  /extra-charges/{id}/payment → Atualiza status de pagamento
DELETE /extra-charges/{id}         → Remove
```

### Dashboard
```
GET    /dashboard?today=2025-05-10&week_start=2025-05-05&week_end=2025-05-11&month=2025-05
```

---

## ☁️ Deploy em servidor (VPS)

Consulte o guia completo em [`DEPLOY.md`](./DEPLOY.md) para instruções de deploy com:

- **Systemd** para manter o backend sempre ativo
- **Nginx** como proxy reverso
- **HTTPS gratuito** via Let's Encrypt

---

## 🔮 Roadmap futuro

- [ ] Exportação de relatórios em PDF
- [ ] Notificações de pagamentos pendentes
- [ ] Suporte a múltiplos pacientes/famílias
- [ ] App mobile (PWA)
- [ ] Migração opcional para PostgreSQL

---

## 📄 Licença

Este projeto é **gratuito e de código aberto**, distribuído sob a licença [MIT](LICENSE).  
Pode ser usado, modificado e distribuído livremente.
