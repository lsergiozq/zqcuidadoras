# Deploy ZQCuidadoras no VPS

## O que vai rodar no servidor

- Backend Python (FastAPI) servindo a API **e** os arquivos estáticos do frontend
- Nginx como proxy reverso (HTTPS, porta 80/443)
- Systemd mantendo o backend vivo automaticamente

---

## 1. Enviar arquivos para o VPS

No seu computador (PowerShell):

```powershell
# Substitua usuario@ip pelo seu VPS
scp -r C:\Git\Cuidadoras\zqcuidadoras usuario@SEU_IP:/var/www/
```

Ou use FileZilla / WinSCP se preferir interface gráfica.

---

## 2. No VPS — instalar dependências

```bash
ssh usuario@SEU_IP

# Instalar Python 3 e pip (se não tiver)
sudo apt update && sudo apt install -y python3 python3-pip nginx

# Instalar dependências do app
cd /var/www/zqcuidadoras/backend
pip3 install -r requirements.txt
```

---

## 3. Buildar o frontend

No seu **computador Windows** (precisa do Node instalado):

```powershell
cd C:\Git\Cuidadoras\zqcuidadoras\frontend
npm install
npm run build
```

Isso gera a pasta `frontend/dist/`. Envie ela para o VPS:

```powershell
scp -r C:\Git\Cuidadoras\zqcuidadoras\frontend\dist usuario@SEU_IP:/var/www/zqcuidadoras/frontend/
```

---

## 4. Configurar o .env no VPS

```bash
cd /var/www/zqcuidadoras/backend
cp .env.example .env
nano .env
```

Edite o arquivo `.env`:

```env
# Gere uma chave forte:
# python3 -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=cole-aqui-a-chave-gerada

TOKEN_EXPIRE_HOURS=12

# Seus usuários — troque as senhas!
USERS=ana:SuaSenhaForte1,joao:OutraSenha2

DB_PATH=/var/www/zqcuidadoras/backend/zqcuidadoras.db
FRONTEND_DIR=/var/www/zqcuidadoras/frontend/dist
```

---

## 5. Criar serviço systemd

```bash
sudo nano /etc/systemd/system/zqcuidadoras.service
```

Cole o conteúdo abaixo (ajuste o usuário se necessário):

```ini
[Unit]
Description=ZQCuidadoras Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/zqcuidadoras/backend
ExecStart=/usr/bin/python3 -m uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
```

Ativar e iniciar:

```bash
sudo systemctl daemon-reload
sudo systemctl enable zqcuidadoras
sudo systemctl start zqcuidadoras

# Verificar se está rodando:
sudo systemctl status zqcuidadoras
```

---

## 6. Configurar Nginx

```bash
sudo nano /etc/nginx/sites-available/zqcuidadoras
```

**Sem HTTPS (mais simples, HTTP):**

```nginx
server {
    listen 80;
    server_name SEU_IP_OU_DOMINIO;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 60s;
    }
}
```

**Com HTTPS (recomendado se tiver domínio):**

```nginx
server {
    listen 80;
    server_name seudominio.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name seudominio.com;

    ssl_certificate     /etc/letsencrypt/live/seudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seudominio.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 60s;
    }
}
```

Ativar o site:

```bash
sudo ln -s /etc/nginx/sites-available/zqcuidadoras /etc/nginx/sites-enabled/
sudo nginx -t          # testar configuração
sudo systemctl reload nginx
```

**Para gerar certificado HTTPS gratuito (Let's Encrypt):**

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d seudominio.com
```

---

## 7. Ajustar permissões do banco

```bash
sudo chown www-data:www-data /var/www/zqcuidadoras/backend
sudo chmod 755 /var/www/zqcuidadoras/backend
```

---

## 8. Testar

Acesse no navegador: `http://SEU_IP` ou `https://seudominio.com`

Login padrão (mude no .env!):
- Usuário: `ana`
- Senha: conforme definido no .env

---

## Atualizar o app no futuro

```bash
# 1. No Windows — fazer o build novo
cd C:\Git\Cuidadoras\zqcuidadoras\frontend
npm run build

# 2. Enviar para o VPS
scp -r frontend\dist usuario@SEU_IP:/var/www/zqcuidadoras/frontend/

# Se mudou o backend:
scp backend\main.py usuario@SEU_IP:/var/www/zqcuidadoras/backend/
ssh usuario@SEU_IP "sudo systemctl restart zqcuidadoras"
```

---

## Backup do banco de dados

```bash
# No VPS — fazer backup
cp /var/www/zqcuidadoras/backend/zqcuidadoras.db /var/backups/zqcuidadoras-$(date +%Y%m%d).db

# Ou baixar para o Windows
scp usuario@SEU_IP:/var/www/zqcuidadoras/backend/zqcuidadoras.db C:\Git\Cuidadoras\backup\
```

Recomendo criar um cron diário:

```bash
sudo crontab -e
# Adicionar linha:
0 3 * * * cp /var/www/zqcuidadoras/backend/zqcuidadoras.db /var/backups/zqcuidadoras-$(date +\%Y\%m\%d).db
```
