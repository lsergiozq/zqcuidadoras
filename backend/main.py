"""
ZQCuidadoras – Backend
FastAPI + SQLite + JWT Auth + serve frontend estático
"""

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, Literal
from jose import JWTError, jwt
import bcrypt
from dotenv import load_dotenv
import aiosqlite, os, datetime, uuid

load_dotenv()

# ── Config via .env ───────────────────────────────────────────────────────────
SECRET_KEY   = os.getenv("SECRET_KEY", "troque-esta-chave-em-producao-por-algo-longo-e-aleatorio")
ALGORITHM    = "HS256"
TOKEN_EXPIRE = int(os.getenv("TOKEN_EXPIRE_HOURS", "12"))
DB_PATH      = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "zqcuidadoras.db"))
FRONTEND_DIR = os.getenv("FRONTEND_DIR", os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))

# Usuários fixos no .env — formato: USERS=nome1:senha1,nome2:senha2
_raw_users = os.getenv("USERS", "admin:admin123")
USERS: dict = {}
for pair in _raw_users.split(","):
    parts = pair.strip().split(":", 1)
    if len(parts) == 2:
        USERS[parts[0].strip()] = parts[1].strip()

# ── Auth helpers ──────────────────────────────────────────────────────────────
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
_hashed: dict = {}

def _hash_users():
    for username, password in USERS.items():
        _hashed[username] = bcrypt.hashpw(password.encode(), bcrypt.gensalt())

def verify_user(username: str, password: str) -> bool:
    h = _hashed.get(username)
    return bool(h and bcrypt.checkpw(password.encode(), h))

def create_token(username: str) -> str:
    expire = datetime.datetime.utcnow() + datetime.timedelta(hours=TOKEN_EXPIRE)
    return jwt.encode({"sub": username, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
    exc = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Token inválido ou expirado",
                        headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username or username not in USERS:
            raise exc
        return username
    except JWTError:
        raise exc

Auth = Depends(get_current_user)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="ZQCuidadoras API", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── DB ────────────────────────────────────────────────────────────────────────
CREATE_SQL = """
CREATE TABLE IF NOT EXISTS caregivers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT,
    day_shift_value REAL NOT NULL DEFAULT 0, night_shift_value REAL NOT NULL DEFAULT 0,
    full_day_shift_value REAL NOT NULL DEFAULT 0, payment_type TEXT NOT NULL DEFAULT 'Weekly',
    active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS shifts (
    id TEXT PRIMARY KEY, caregiver_id TEXT NOT NULL REFERENCES caregivers(id),
    shift_date TEXT NOT NULL, shift_type TEXT NOT NULL, value REAL NOT NULL,
    notes TEXT, payment_status TEXT NOT NULL DEFAULT 'Pending',
    payment_date TEXT, created_by TEXT, updated_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS extra_charges (
    id TEXT PRIMARY KEY, caregiver_id TEXT NOT NULL REFERENCES caregivers(id),
    charge_date TEXT NOT NULL, description TEXT NOT NULL, value REAL NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'Pending',
    payment_date TEXT, created_by TEXT, updated_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
"""

async def get_db():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    return db

async def init_db():
    db = await get_db()
    for stmt in CREATE_SQL.strip().split(";"):
        s = stmt.strip()
        if s: await db.execute(s)
    # Migration: adiciona created_by em tabelas existentes (ignora se já existir)
    for migration in [
        "ALTER TABLE shifts ADD COLUMN created_by TEXT",
        "ALTER TABLE shifts ADD COLUMN updated_by TEXT",
        "ALTER TABLE extra_charges ADD COLUMN created_by TEXT",
        "ALTER TABLE extra_charges ADD COLUMN updated_by TEXT",
    ]:
        try:
            await db.execute(migration)
        except Exception:
            pass
    await db.commit(); await db.close()

@app.on_event("startup")
async def startup():
    _hash_users()
    await init_db()

def uid():  return str(uuid.uuid4())
def now():  return datetime.datetime.utcnow().isoformat()

# ── Auth endpoints ────────────────────────────────────────────────────────────
class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    username: str

@app.post("/auth/login", response_model=TokenResponse, tags=["auth"])
async def login(form: OAuth2PasswordRequestForm = Depends()):
    if not verify_user(form.username, form.password):
        raise HTTPException(status_code=400, detail="Usuário ou senha incorretos")
    return {"access_token": create_token(form.username), "token_type": "bearer", "username": form.username}

@app.get("/auth/me", tags=["auth"])
async def me(username: str = Auth):
    return {"username": username}

# ── Models ────────────────────────────────────────────────────────────────────
class CaregiverIn(BaseModel):
    name: str; phone: Optional[str] = None
    day_shift_value: float = 0; night_shift_value: float = 0; full_day_shift_value: float = 0
    payment_type: Literal["Weekly", "Monthly"] = "Weekly"; active: bool = True

class ShiftIn(BaseModel):
    caregiver_id: str; shift_date: str; shift_type: Literal["Day12h", "Night12h", "Full24h"]
    value: float; notes: Optional[str] = None
    payment_status: Literal["Pending", "Paid"] = "Pending"; payment_date: Optional[str] = None

class ExtraChargeIn(BaseModel):
    caregiver_id: str; charge_date: str; description: str; value: float
    payment_status: Literal["Pending", "Paid"] = "Pending"; payment_date: Optional[str] = None

class PayStatusUpdate(BaseModel):
    payment_status: Literal["Pending", "Paid"]; payment_date: Optional[str] = None

# ── Caregivers ────────────────────────────────────────────────────────────────
@app.get("/caregivers", tags=["caregivers"])
async def list_caregivers(_: str = Auth):
    db = await get_db()
    cur = await db.execute("SELECT * FROM caregivers ORDER BY name")
    rows = await cur.fetchall(); await db.close(); return [dict(r) for r in rows]

@app.post("/caregivers", status_code=201, tags=["caregivers"])
async def create_caregiver(body: CaregiverIn, _: str = Auth):
    db = await get_db(); id_ = uid(); ts = now()
    await db.execute("INSERT INTO caregivers VALUES (?,?,?,?,?,?,?,?,?,?)",
        (id_, body.name, body.phone, body.day_shift_value, body.night_shift_value,
         body.full_day_shift_value, body.payment_type, int(body.active), ts, ts))
    await db.commit()
    cur = await db.execute("SELECT * FROM caregivers WHERE id=?", (id_,))
    row = await cur.fetchone(); await db.close(); return dict(row)

@app.put("/caregivers/{id_}", tags=["caregivers"])
async def update_caregiver(id_: str, body: CaregiverIn, _: str = Auth):
    db = await get_db(); ts = now()
    await db.execute("UPDATE caregivers SET name=?,phone=?,day_shift_value=?,night_shift_value=?,full_day_shift_value=?,payment_type=?,active=?,updated_at=? WHERE id=?",
        (body.name, body.phone, body.day_shift_value, body.night_shift_value,
         body.full_day_shift_value, body.payment_type, int(body.active), ts, id_))
    await db.commit()
    cur = await db.execute("SELECT * FROM caregivers WHERE id=?", (id_,))
    row = await cur.fetchone(); await db.close()
    if not row: raise HTTPException(404)
    return dict(row)

# ── Shifts ────────────────────────────────────────────────────────────────────
@app.get("/shifts", tags=["shifts"])
async def list_shifts(month: Optional[str] = None, caregiver_id: Optional[str] = None, _: str = Auth):
    db = await get_db()
    q = "SELECT * FROM shifts WHERE 1=1"; params = []
    if month:        q += " AND shift_date LIKE ?";  params.append(f"{month}%")
    if caregiver_id: q += " AND caregiver_id = ?";   params.append(caregiver_id)
    q += " ORDER BY shift_date DESC"
    cur = await db.execute(q, params); rows = await cur.fetchall(); await db.close()
    return [dict(r) for r in rows]

@app.post("/shifts", status_code=201, tags=["shifts"])
async def create_shift(body: ShiftIn, username: str = Auth):
    db = await get_db(); id_ = uid(); ts = now()
    await db.execute("INSERT INTO shifts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (id_, body.caregiver_id, body.shift_date, body.shift_type,
         body.value, body.notes, body.payment_status, body.payment_date, username, username, ts, ts))
    await db.commit()
    cur = await db.execute("SELECT * FROM shifts WHERE id=?", (id_,))
    row = await cur.fetchone(); await db.close(); return dict(row)

@app.put("/shifts/{id_}", tags=["shifts"])
async def update_shift(id_: str, body: ShiftIn, username: str = Auth):
    db = await get_db(); ts = now()
    await db.execute("UPDATE shifts SET caregiver_id=?,shift_date=?,shift_type=?,value=?,notes=?,payment_status=?,payment_date=?,updated_by=?,updated_at=? WHERE id=?",
        (body.caregiver_id, body.shift_date, body.shift_type, body.value,
         body.notes, body.payment_status, body.payment_date, username, ts, id_))
    await db.commit()
    cur = await db.execute("SELECT * FROM shifts WHERE id=?", (id_,))
    row = await cur.fetchone(); await db.close()
    if not row: raise HTTPException(404)
    return dict(row)

@app.patch("/shifts/{id_}/payment", tags=["shifts"])
async def patch_shift_payment(id_: str, body: PayStatusUpdate, username: str = Auth):
    db = await get_db()
    await db.execute("UPDATE shifts SET payment_status=?,payment_date=?,updated_by=?,updated_at=? WHERE id=?",
                     (body.payment_status, body.payment_date, username, now(), id_))
    await db.commit()
    cur = await db.execute("SELECT * FROM shifts WHERE id=?", (id_,))
    row = await cur.fetchone(); await db.close()
    if not row: raise HTTPException(404)
    return dict(row)

@app.delete("/shifts/{id_}", status_code=204, tags=["shifts"])
async def delete_shift(id_: str, _: str = Auth):
    db = await get_db()
    await db.execute("DELETE FROM shifts WHERE id=?", (id_,)); await db.commit(); await db.close()

# ── Extra Charges ─────────────────────────────────────────────────────────────
@app.get("/extra-charges", tags=["extras"])
async def list_extra_charges(month: Optional[str] = None, caregiver_id: Optional[str] = None, _: str = Auth):
    db = await get_db()
    q = "SELECT * FROM extra_charges WHERE 1=1"; params = []
    if month:        q += " AND charge_date LIKE ?";  params.append(f"{month}%")
    if caregiver_id: q += " AND caregiver_id = ?";    params.append(caregiver_id)
    q += " ORDER BY charge_date DESC"
    cur = await db.execute(q, params); rows = await cur.fetchall(); await db.close()
    return [dict(r) for r in rows]

@app.post("/extra-charges", status_code=201, tags=["extras"])
async def create_extra_charge(body: ExtraChargeIn, username: str = Auth):
    db = await get_db(); id_ = uid(); ts = now()
    await db.execute("INSERT INTO extra_charges VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        (id_, body.caregiver_id, body.charge_date, body.description,
         body.value, body.payment_status, body.payment_date, username, username, ts, ts))
    await db.commit()
    cur = await db.execute("SELECT * FROM extra_charges WHERE id=?", (id_,))
    row = await cur.fetchone(); await db.close(); return dict(row)

@app.put("/extra-charges/{id_}", tags=["extras"])
async def update_extra_charge(id_: str, body: ExtraChargeIn, username: str = Auth):
    db = await get_db(); ts = now()
    await db.execute("UPDATE extra_charges SET caregiver_id=?,charge_date=?,description=?,value=?,payment_status=?,payment_date=?,updated_by=?,updated_at=? WHERE id=?",
        (body.caregiver_id, body.charge_date, body.description, body.value,
         body.payment_status, body.payment_date, username, ts, id_))
    await db.commit()
    cur = await db.execute("SELECT * FROM extra_charges WHERE id=?", (id_,))
    row = await cur.fetchone(); await db.close()
    if not row: raise HTTPException(404)
    return dict(row)

@app.patch("/extra-charges/{id_}/payment", tags=["extras"])
async def patch_extra_payment(id_: str, body: PayStatusUpdate, username: str = Auth):
    db = await get_db()
    await db.execute("UPDATE extra_charges SET payment_status=?,payment_date=?,updated_by=?,updated_at=? WHERE id=?",
                     (body.payment_status, body.payment_date, username, now(), id_))
    await db.commit()
    cur = await db.execute("SELECT * FROM extra_charges WHERE id=?", (id_,))
    row = await cur.fetchone(); await db.close()
    if not row: raise HTTPException(404)
    return dict(row)

@app.delete("/extra-charges/{id_}", status_code=204, tags=["extras"])
async def delete_extra_charge(id_: str, _: str = Auth):
    db = await get_db()
    await db.execute("DELETE FROM extra_charges WHERE id=?", (id_,)); await db.commit(); await db.close()

# ── Dashboard ─────────────────────────────────────────────────────────────────
@app.get("/dashboard", tags=["dashboard"])
async def dashboard(today: str, week_start: str, week_end: str, month: str, _: str = Auth):
    db = await get_db()
    async def s(table, col, cond, params):
        cur = await db.execute(f"SELECT COALESCE(SUM(value),0) as v FROM {table} WHERE {col} {cond}", params)
        return (await cur.fetchone())["v"]
    result = {
        "today":   await s("shifts","shift_date","=?",[today])            + await s("extra_charges","charge_date","=?",[today]),
        "week":    await s("shifts","shift_date","BETWEEN ? AND ?",[week_start,week_end]) + await s("extra_charges","charge_date","BETWEEN ? AND ?",[week_start,week_end]),
        "month":   await s("shifts","shift_date","LIKE ?",[f"{month}%"])  + await s("extra_charges","charge_date","LIKE ?",[f"{month}%"]),
        "pending": await s("shifts","payment_status","='Pending' AND 1=1",[]) + await s("extra_charges","payment_status","='Pending' AND 1=1",[]),
    }
    cur = await db.execute("""
        SELECT caregiver_id, SUM(value) as total FROM (
          SELECT caregiver_id, value FROM shifts WHERE payment_status='Pending'
          UNION ALL SELECT caregiver_id, value FROM extra_charges WHERE payment_status='Pending'
        ) GROUP BY caregiver_id HAVING total > 0
    """)
    result["pending_by_caregiver"] = [dict(r) for r in await cur.fetchall()]
    await db.close(); return result

# ── Serve frontend (produção) ─────────────────────────────────────────────────
_fe = os.path.abspath(FRONTEND_DIR)
if os.path.isdir(_fe):
    _assets = os.path.join(_fe, "assets")
    if os.path.isdir(_assets):
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")

    _api_prefixes = ("auth/","caregivers","shifts","extra-charges","dashboard","docs","openapi")

    @app.get("/", include_in_schema=False)
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str = ""):
        if any(full_path.startswith(p) for p in _api_prefixes):
            raise HTTPException(404)
        index = os.path.join(_fe, "index.html")
        if os.path.exists(index):
            return FileResponse(index)
        raise HTTPException(404)
