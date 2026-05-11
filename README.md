# 🧑‍⚕️ ZQCuidadoras

**Controle financeiro para famílias que contratam cuidadoras.**

ZQCuidadoras é um aplicativo web gratuito e de código aberto para registrar plantões, cobranças avulsas e acompanhar o fechamento semanal e mensal de pagamentos de cuidadoras. A aplicação agora usa **Postgres compatível com Vercel/Neon**, sem dependência de SQLite no runtime.

> **100% gratuito.** Sem assinatura, sem limite de uso, sem anúncios.

---

## 💡 A ideia

Quem contrata cuidadoras informalmente lida com:

- Plantões diurnos, noturnos e de 24h com valores diferentes
- Cobranças avulsas (aplicações, procedimentos, transporte)
- Dificuldade em saber o total da semana ou do mês por cuidadora
- Controle de quem já foi pago e quem ainda está pendente

O ZQCuidadoras resolve isso com um painel simples, um calendário visual e relatórios de fechamento, agora preparado para rodar na Vercel com backend FastAPI e Postgres.

---

## ✨ Funcionalidades

- **Dashboard** — totais do dia, semana e mês + pendências de pagamento
- **Cadastro de cuidadoras** — com valor configurável por tipo de plantão
- **Lançamento de plantões** — diurno, noturno ou 24h com valor preenchido automaticamente
- **Cobranças avulsas** — aplicações, procedimentos e outros gastos vinculados à cuidadora
- **Calendário mensal** — visualização com detalhe por dia
- **Fechamento semanal** — plantões + avulsos separados, com botão de marcar como pago
- **Fechamento mensal** — quebra por tipo de plantão + avulsos por cuidadora
- **Controle de pagamento** — marcar individualmente ou em lote
- **Banco Postgres** — persistência compatível com deploy serverless na Vercel

---

## 🗂️ Estrutura do projeto

```text
ZQCuidadoras/
├── api/
│   └── index.py                         ← Entry point ASGI da Vercel
├── backend/
│   ├── main.py                          ← API FastAPI + Postgres
│   ├── migrate_sqlite_to_postgres.py    ← Migração dos dados legados
│   ├── requirements.txt                 ← Dependências Python locais
│   └── .env.example                     ← Modelo de configuração
├── frontend/
│   ├── src/
│   │   ├── App.jsx                      ← Aplicação React
│   │   └── main.jsx                     ← Entry point do frontend
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── requirements.txt                     ← Dependências Python da Vercel
├── vercel.json                          ← Build do frontend + routing SPA
├── DEPLOY.md                            ← Guia de deploy na Vercel
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
| Postgres   | 14+           | conexão via URL     |

---

## 🚀 Como instalar e rodar localmente

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/ZQCuidadoras.git
cd ZQCuidadoras
```

### 2. Configure o backend

Copie o exemplo de ambiente:

```bash
cp backend/.env.example backend/.env
```

Edite `backend/.env` com a URL do seu Postgres local ou do banco provisionado para a Vercel:

```env
SECRET_KEY=cole-aqui-uma-chave-forte
TOKEN_EXPIRE_HOURS=12
USERS=ana:SuaSenhaForte1,joao:OutraSenha2
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

> Se a integração da Vercel/Neon já injeta `POSTGRES_URL`, o backend também aceita essa variável automaticamente.

### 3. Suba o backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

O backend sobe em **http://localhost:8000**  
Documentação interativa da API: **http://localhost:8000/docs**

### 4. Suba o frontend

Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

O app abre em **http://localhost:3000**.

No modo de desenvolvimento, o frontend usa `http://localhost:8000`. Em produção, o build usa `/api` automaticamente, compatível com a Vercel.

---

## 🔁 Migrar dados legados do SQLite

Se você já tem dados em um banco SQLite antigo, rode a migração antes do deploy final:

```bash
cd backend
python migrate_sqlite_to_postgres.py --replace
```

O script procura automaticamente por:

- `backend/cuidarcontrol.db`
- `backend/zqcuidadoras.db`

Se o arquivo estiver em outro local:

```bash
python migrate_sqlite_to_postgres.py --sqlite-path /caminho/para/seu.db --replace
```

---

## 🗄️ Banco de dados

O backend usa Postgres com criação automática de schema no startup. As tabelas principais continuam as mesmas:

| Tabela          | Descrição                             |
|-----------------|---------------------------------------|
| `caregivers`    | Cadastro das cuidadoras               |
| `shifts`        | Plantões (diurno, noturno, 24h)       |
| `extra_charges` | Cobranças avulsas (aplicações, etc.)  |

Variáveis aceitas pelo backend:

- `DATABASE_URL`
- `POSTGRES_URL`
- `POSTGRES_URL_NON_POOLING`
- `DATABASE_URL_UNPOOLED`
- `DB_POOL_MIN_SIZE`
- `DB_POOL_MAX_SIZE`

---

## 🌐 API — Principais endpoints

### Cuidadoras

```text
GET    /caregivers
POST   /caregivers
PUT    /caregivers/{id}
```

### Plantões

```text
GET    /shifts
POST   /shifts
PUT    /shifts/{id}
PATCH  /shifts/{id}/payment
DELETE /shifts/{id}
```

### Cobranças avulsas

```text
GET    /extra-charges
POST   /extra-charges
PUT    /extra-charges/{id}
PATCH  /extra-charges/{id}/payment
DELETE /extra-charges/{id}
```

### Dashboard

```text
GET /dashboard?today=2025-05-10&week_start=2025-05-05&week_end=2025-05-11&month=2025-05
```

Na Vercel, essas rotas ficam acessíveis sob o prefixo `/api`.

---

## ☁️ Deploy na Vercel

Consulte [DEPLOY.md](./DEPLOY.md) para o passo a passo completo com:

- integração Postgres via Marketplace/Neon
- variáveis de ambiente do backend
- build do frontend Vite
- deploy do monorepo com `api/index.py`
- migração dos dados legados do SQLite

---

## 🔮 Roadmap futuro

- [ ] Exportação de relatórios em PDF
- [ ] Notificações de pagamentos pendentes
- [ ] Suporte a múltiplos pacientes/famílias
- [ ] App mobile (PWA)

---

## 📄 Licença

Este projeto é gratuito e de código aberto, distribuído sob a licença MIT.
