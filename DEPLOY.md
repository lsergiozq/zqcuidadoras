# Deploy ZQCuidadoras na Vercel

## Visao geral

O projeto foi refatorado para rodar assim:

- **Frontend Vite** publicado como site estatico na Vercel
- **Backend FastAPI** publicado como Function Python via `api/index.py`
- **Postgres** externo conectado via Vercel Marketplace, normalmente Neon

O runtime nao depende mais de SQLite.

---

## 1. Provisionar o Postgres na Vercel

A Vercel nao cria mais um produto proprio chamado "Vercel Postgres" para novos projetos. O caminho atual e usar uma integracao Postgres no Marketplace, normalmente **Neon**.

Passos:

1. Abra seu projeto na Vercel.
2. Entre em **Storage** ou **Marketplace**.
3. Adicione uma integracao Postgres.
4. Conclua o provisionamento.

Depois disso, a Vercel injeta variaveis como:

- `POSTGRES_URL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_USER`
- `POSTGRES_HOST`
- `POSTGRES_DATABASE`

O backend ja foi preparado para aceitar automaticamente:

- `DATABASE_URL`
- `POSTGRES_URL`
- `POSTGRES_URL_NON_POOLING`
- `DATABASE_URL_UNPOOLED`

---

## 2. Configurar variaveis de ambiente

Defina no projeto da Vercel:

```env
SECRET_KEY=gere-uma-chave-forte
TOKEN_EXPIRE_HOURS=12
USERS=ana:SuaSenhaForte1,joao:OutraSenha2
DB_POOL_MIN_SIZE=1
DB_POOL_MAX_SIZE=5
```

Se a integracao do banco estiver conectada, normalmente **nao** e preciso definir `DATABASE_URL` manualmente.

Se preferir configurar a URL manualmente:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

---

## 3. Migrar dados antigos do SQLite

Se voce ja tem dados locais no SQLite legado, importe antes ou logo apos o primeiro deploy.

No projeto local:

```bash
cd backend
pip install -r requirements.txt
python migrate_sqlite_to_postgres.py --replace
```

O script procura automaticamente por:

- `backend/cuidarcontrol.db`
- `backend/zqcuidadoras.db`

Se o arquivo estiver em outro caminho:

```bash
python migrate_sqlite_to_postgres.py --sqlite-path /caminho/para/seu.db --replace
```

O backend cria o schema automaticamente no Postgres antes de importar os dados.

---

## 4. Como a Vercel vai publicar o projeto

O repositorio ja contem os arquivos necessarios:

- `vercel.json` define o build do frontend e o fallback da SPA
- `api/index.py` expoe o app FastAPI como Function Python
- `requirements.txt` na raiz informa as dependencias Python da Function

Com isso, o comportamento em producao fica:

- Frontend servido na raiz do dominio
- API servida em `/api/...`
- Frontend chamando `/api` automaticamente no build de producao

---

## 5. Deploy pela interface da Vercel

1. Conecte o repositorio GitHub/GitLab/Bitbucket ao projeto.
2. Use a raiz do repositorio como Root Directory.
3. Confirme as variaveis de ambiente.
4. Inicie o deploy.

Nao e necessario subir servidor separado, Nginx ou systemd.

---

## 6. Deploy com Vercel CLI

Na raiz do projeto:

```bash
vercel
```

Para publicar em producao:

```bash
vercel --prod
```

---

## 7. Validacao apos deploy

Confira os endpoints abaixo no dominio gerado pela Vercel:

```text
https://seu-projeto.vercel.app/
https://seu-projeto.vercel.app/api/docs
https://seu-projeto.vercel.app/api/auth/me
```

Se `api/docs` abrir e o login funcionar, o backend esta respondendo corretamente.

---

## 8. Observacoes operacionais

- O pool do backend foi configurado para trabalhar com URLs Postgres da Vercel/Neon.
- O driver foi trocado para `psycopg` com pool assincrono.
- O backend desabilita prepared statements no pool para reduzir atrito com URLs pooladas.
- O schema e criado automaticamente no startup da API.

---

## 9. Atualizar no futuro

Depois de novas alteracoes no codigo:

```bash
git push
```

A Vercel fara novo build automaticamente no branch conectado.
