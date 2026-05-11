"""
ZQCuidadoras backend
FastAPI + Postgres + JWT auth + optional static frontend serving
"""

import datetime
import asyncio
import os
import uuid
from typing import Any, Literal, Optional

import bcrypt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from pydantic import BaseModel

load_dotenv()


def get_database_url() -> str:
    for env_name in (
        "DATABASE_URL",
        "POSTGRES_URL",
        "POSTGRES_URL_NON_POOLING",
        "DATABASE_URL_UNPOOLED",
    ):
        value = os.getenv(env_name)
        if value:
            return value
    raise RuntimeError(
        "Database URL not configured. Set DATABASE_URL or POSTGRES_URL in the environment."
    )


SECRET_KEY = os.getenv(
    "SECRET_KEY", "troque-esta-chave-em-producao-por-algo-longo-e-aleatorio"
)
ALGORITHM = "HS256"
TOKEN_EXPIRE = int(os.getenv("TOKEN_EXPIRE_HOURS", "12"))
FRONTEND_DIR = os.getenv(
    "FRONTEND_DIR",
    os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"),
)
DB_POOL_MIN_SIZE = int(os.getenv("DB_POOL_MIN_SIZE", "1"))
DB_POOL_MAX_SIZE = int(os.getenv("DB_POOL_MAX_SIZE", "5"))

_raw_users = os.getenv("USERS", "admin:admin123")
USERS: dict[str, str] = {}
for pair in _raw_users.split(","):
    parts = pair.strip().split(":", 1)
    if len(parts) == 2:
        USERS[parts[0].strip()] = parts[1].strip()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
_hashed: dict[str, bytes] = {}


def _hash_users() -> None:
    for username, password in USERS.items():
        _hashed[username] = bcrypt.hashpw(password.encode(), bcrypt.gensalt())


def verify_user(username: str, password: str) -> bool:
    if not _hashed:
        _hash_users()
    hashed_password = _hashed.get(username)
    return bool(hashed_password and bcrypt.checkpw(password.encode(), hashed_password))


def create_token(username: str) -> str:
    expire = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
        hours=TOKEN_EXPIRE
    )
    return jwt.encode({"sub": username, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token invalido ou expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username or username not in USERS:
            raise exc
        return username
    except JWTError as err:
        raise exc from err


Auth = Depends(get_current_user)

app = FastAPI(title="ZQCuidadoras API", version="3.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS caregivers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        day_shift_value DOUBLE PRECISION NOT NULL DEFAULT 0,
        night_shift_value DOUBLE PRECISION NOT NULL DEFAULT 0,
        full_day_shift_value DOUBLE PRECISION NOT NULL DEFAULT 0,
        payment_type TEXT NOT NULL DEFAULT 'Weekly',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS shifts (
        id TEXT PRIMARY KEY,
        caregiver_id TEXT NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,
        shift_date TEXT NOT NULL,
        shift_type TEXT NOT NULL,
        value DOUBLE PRECISION NOT NULL,
        notes TEXT,
        payment_status TEXT NOT NULL DEFAULT 'Pending',
        payment_date TEXT,
        created_by TEXT,
        updated_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS extra_charges (
        id TEXT PRIMARY KEY,
        caregiver_id TEXT NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,
        charge_date TEXT NOT NULL,
        description TEXT NOT NULL,
        value DOUBLE PRECISION NOT NULL,
        payment_status TEXT NOT NULL DEFAULT 'Pending',
        payment_date TEXT,
        created_by TEXT,
        updated_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_shifts_shift_date ON shifts (shift_date)",
    "CREATE INDEX IF NOT EXISTS idx_shifts_caregiver_id ON shifts (caregiver_id)",
    "CREATE INDEX IF NOT EXISTS idx_extra_charges_charge_date ON extra_charges (charge_date)",
    "CREATE INDEX IF NOT EXISTS idx_extra_charges_caregiver_id ON extra_charges (caregiver_id)",
]

_pool_lock = asyncio.Lock()


def database_env_is_configured() -> bool:
    return any(
        os.getenv(env_name)
        for env_name in (
            "DATABASE_URL",
            "POSTGRES_URL",
            "POSTGRES_URL_NON_POOLING",
            "DATABASE_URL_UNPOOLED",
        )
    )


def database_not_available(detail: str) -> HTTPException:
    return HTTPException(status_code=503, detail=detail)


async def ensure_db_pool() -> AsyncConnectionPool:
    db_pool = getattr(app.state, "db_pool", None)
    if db_pool is not None:
        return db_pool

    if not database_env_is_configured():
        raise database_not_available(
            "Banco de dados nao configurado. Defina DATABASE_URL ou POSTGRES_URL na Vercel."
        )

    async with _pool_lock:
        db_pool = getattr(app.state, "db_pool", None)
        if db_pool is None:
            try:
                db_pool = AsyncConnectionPool(
                    conninfo=get_database_url(),
                    min_size=DB_POOL_MIN_SIZE,
                    max_size=DB_POOL_MAX_SIZE,
                    open=False,
                    kwargs={
                        "autocommit": True,
                        "row_factory": dict_row,
                        "prepare_threshold": None,
                    },
                )
                await db_pool.open()
                app.state.db_pool = db_pool
                await init_db()
            except HTTPException:
                raise
            except Exception as exc:
                raise database_not_available(
                    "Falha ao conectar no Postgres configurado. Verifique as variaveis da Vercel e o banco provisionado."
                ) from exc
    return db_pool


async def fetch_all(query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    db_pool = await ensure_db_pool()
    async with db_pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, params)
            return await cur.fetchall()


async def fetch_one(
    query: str, params: tuple[Any, ...] = ()
) -> Optional[dict[str, Any]]:
    db_pool = await ensure_db_pool()
    async with db_pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, params)
            return await cur.fetchone()


async def fetch_value(query: str, params: tuple[Any, ...] = ()) -> Any:
    row = await fetch_one(query, params)
    if not row:
        return None
    return next(iter(row.values()))


async def execute(query: str, params: tuple[Any, ...] = ()) -> None:
    db_pool = await ensure_db_pool()
    async with db_pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, params)


async def init_db() -> None:
    db_pool = getattr(app.state, "db_pool", None)
    if db_pool is None:
        raise RuntimeError("Database pool not initialized")
    async with db_pool.connection() as conn:
        async with conn.cursor() as cur:
            for statement in SCHEMA_STATEMENTS:
                await cur.execute(statement)


@app.on_event("startup")
async def startup() -> None:
    _hash_users()


@app.get("/health", tags=["health"])
async def health():
    return {
        "status": "ok",
        "database_configured": database_env_is_configured(),
    }


@app.on_event("shutdown")
async def shutdown() -> None:
    db_pool = getattr(app.state, "db_pool", None)
    if db_pool is not None:
        await db_pool.close()


def uid() -> str:
    return str(uuid.uuid4())


def now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    username: str


@app.post("/auth/login", response_model=TokenResponse, tags=["auth"])
async def login(form: OAuth2PasswordRequestForm = Depends()):
    if not verify_user(form.username, form.password):
        raise HTTPException(status_code=400, detail="Usuario ou senha incorretos")
    return {
        "access_token": create_token(form.username),
        "token_type": "bearer",
        "username": form.username,
    }


@app.get("/auth/me", tags=["auth"])
async def me(username: str = Auth):
    return {"username": username}


class CaregiverIn(BaseModel):
    name: str
    phone: Optional[str] = None
    day_shift_value: float = 0
    night_shift_value: float = 0
    full_day_shift_value: float = 0
    payment_type: Literal["Weekly", "Monthly"] = "Weekly"
    active: bool = True


class ShiftIn(BaseModel):
    caregiver_id: str
    shift_date: str
    shift_type: Literal["Day12h", "Night12h", "Full24h"]
    value: float
    notes: Optional[str] = None
    payment_status: Literal["Pending", "Paid"] = "Pending"
    payment_date: Optional[str] = None


class ExtraChargeIn(BaseModel):
    caregiver_id: str
    charge_date: str
    description: str
    value: float
    payment_status: Literal["Pending", "Paid"] = "Pending"
    payment_date: Optional[str] = None


class PayStatusUpdate(BaseModel):
    payment_status: Literal["Pending", "Paid"]
    payment_date: Optional[str] = None


@app.get("/caregivers", tags=["caregivers"])
async def list_caregivers(_: str = Auth):
    return await fetch_all("SELECT * FROM caregivers ORDER BY name")


@app.post("/caregivers", status_code=201, tags=["caregivers"])
async def create_caregiver(body: CaregiverIn, _: str = Auth):
    id_ = uid()
    ts = now()
    row = await fetch_one(
        """
        INSERT INTO caregivers (
            id, name, phone, day_shift_value, night_shift_value,
            full_day_shift_value, payment_type, active, created_at, updated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
        """,
        (
            id_,
            body.name,
            body.phone,
            body.day_shift_value,
            body.night_shift_value,
            body.full_day_shift_value,
            body.payment_type,
            body.active,
            ts,
            ts,
        ),
    )
    return row


@app.put("/caregivers/{id_}", tags=["caregivers"])
async def update_caregiver(id_: str, body: CaregiverIn, _: str = Auth):
    row = await fetch_one(
        """
        UPDATE caregivers
        SET name = %s,
            phone = %s,
            day_shift_value = %s,
            night_shift_value = %s,
            full_day_shift_value = %s,
            payment_type = %s,
            active = %s,
            updated_at = %s
        WHERE id = %s
        RETURNING *
        """,
        (
            body.name,
            body.phone,
            body.day_shift_value,
            body.night_shift_value,
            body.full_day_shift_value,
            body.payment_type,
            body.active,
            now(),
            id_,
        ),
    )
    if not row:
        raise HTTPException(status_code=404)
    return row


@app.get("/shifts", tags=["shifts"])
async def list_shifts(
    month: Optional[str] = None,
    caregiver_id: Optional[str] = None,
    _: str = Auth,
):
    conditions = ["1=1"]
    params: list[Any] = []
    if month:
        conditions.append("shift_date LIKE %s")
        params.append(f"{month}%")
    if caregiver_id:
        conditions.append("caregiver_id = %s")
        params.append(caregiver_id)
    query = f"SELECT * FROM shifts WHERE {' AND '.join(conditions)} ORDER BY shift_date DESC"
    return await fetch_all(query, tuple(params))


@app.post("/shifts", status_code=201, tags=["shifts"])
async def create_shift(body: ShiftIn, username: str = Auth):
    id_ = uid()
    ts = now()
    row = await fetch_one(
        """
        INSERT INTO shifts (
            id, caregiver_id, shift_date, shift_type, value, notes,
            payment_status, payment_date, created_by, updated_by, created_at, updated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
        """,
        (
            id_,
            body.caregiver_id,
            body.shift_date,
            body.shift_type,
            body.value,
            body.notes,
            body.payment_status,
            body.payment_date,
            username,
            username,
            ts,
            ts,
        ),
    )
    return row


@app.put("/shifts/{id_}", tags=["shifts"])
async def update_shift(id_: str, body: ShiftIn, username: str = Auth):
    row = await fetch_one(
        """
        UPDATE shifts
        SET caregiver_id = %s,
            shift_date = %s,
            shift_type = %s,
            value = %s,
            notes = %s,
            payment_status = %s,
            payment_date = %s,
            updated_by = %s,
            updated_at = %s
        WHERE id = %s
        RETURNING *
        """,
        (
            body.caregiver_id,
            body.shift_date,
            body.shift_type,
            body.value,
            body.notes,
            body.payment_status,
            body.payment_date,
            username,
            now(),
            id_,
        ),
    )
    if not row:
        raise HTTPException(status_code=404)
    return row


@app.patch("/shifts/{id_}/payment", tags=["shifts"])
async def patch_shift_payment(id_: str, body: PayStatusUpdate, username: str = Auth):
    row = await fetch_one(
        """
        UPDATE shifts
        SET payment_status = %s,
            payment_date = %s,
            updated_by = %s,
            updated_at = %s
        WHERE id = %s
        RETURNING *
        """,
        (body.payment_status, body.payment_date, username, now(), id_),
    )
    if not row:
        raise HTTPException(status_code=404)
    return row


@app.delete("/shifts/{id_}", status_code=204, tags=["shifts"])
async def delete_shift(id_: str, _: str = Auth):
    await execute("DELETE FROM shifts WHERE id = %s", (id_,))


@app.get("/extra-charges", tags=["extras"])
async def list_extra_charges(
    month: Optional[str] = None,
    caregiver_id: Optional[str] = None,
    _: str = Auth,
):
    conditions = ["1=1"]
    params: list[Any] = []
    if month:
        conditions.append("charge_date LIKE %s")
        params.append(f"{month}%")
    if caregiver_id:
        conditions.append("caregiver_id = %s")
        params.append(caregiver_id)
    query = (
        f"SELECT * FROM extra_charges WHERE {' AND '.join(conditions)} ORDER BY charge_date DESC"
    )
    return await fetch_all(query, tuple(params))


@app.post("/extra-charges", status_code=201, tags=["extras"])
async def create_extra_charge(body: ExtraChargeIn, username: str = Auth):
    id_ = uid()
    ts = now()
    row = await fetch_one(
        """
        INSERT INTO extra_charges (
            id, caregiver_id, charge_date, description, value,
            payment_status, payment_date, created_by, updated_by, created_at, updated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
        """,
        (
            id_,
            body.caregiver_id,
            body.charge_date,
            body.description,
            body.value,
            body.payment_status,
            body.payment_date,
            username,
            username,
            ts,
            ts,
        ),
    )
    return row


@app.put("/extra-charges/{id_}", tags=["extras"])
async def update_extra_charge(id_: str, body: ExtraChargeIn, username: str = Auth):
    row = await fetch_one(
        """
        UPDATE extra_charges
        SET caregiver_id = %s,
            charge_date = %s,
            description = %s,
            value = %s,
            payment_status = %s,
            payment_date = %s,
            updated_by = %s,
            updated_at = %s
        WHERE id = %s
        RETURNING *
        """,
        (
            body.caregiver_id,
            body.charge_date,
            body.description,
            body.value,
            body.payment_status,
            body.payment_date,
            username,
            now(),
            id_,
        ),
    )
    if not row:
        raise HTTPException(status_code=404)
    return row


@app.patch("/extra-charges/{id_}/payment", tags=["extras"])
async def patch_extra_payment(id_: str, body: PayStatusUpdate, username: str = Auth):
    row = await fetch_one(
        """
        UPDATE extra_charges
        SET payment_status = %s,
            payment_date = %s,
            updated_by = %s,
            updated_at = %s
        WHERE id = %s
        RETURNING *
        """,
        (body.payment_status, body.payment_date, username, now(), id_),
    )
    if not row:
        raise HTTPException(status_code=404)
    return row


@app.delete("/extra-charges/{id_}", status_code=204, tags=["extras"])
async def delete_extra_charge(id_: str, _: str = Auth):
    await execute("DELETE FROM extra_charges WHERE id = %s", (id_,))


@app.get("/dashboard", tags=["dashboard"])
async def dashboard(today: str, week_start: str, week_end: str, month: str, _: str = Auth):
    shifts_today = await fetch_value(
        "SELECT COALESCE(SUM(value), 0) AS total FROM shifts WHERE shift_date = %s",
        (today,),
    )
    extras_today = await fetch_value(
        "SELECT COALESCE(SUM(value), 0) AS total FROM extra_charges WHERE charge_date = %s",
        (today,),
    )
    shifts_week = await fetch_value(
        "SELECT COALESCE(SUM(value), 0) AS total FROM shifts WHERE shift_date BETWEEN %s AND %s",
        (week_start, week_end),
    )
    extras_week = await fetch_value(
        "SELECT COALESCE(SUM(value), 0) AS total FROM extra_charges WHERE charge_date BETWEEN %s AND %s",
        (week_start, week_end),
    )
    shifts_month = await fetch_value(
        "SELECT COALESCE(SUM(value), 0) AS total FROM shifts WHERE shift_date LIKE %s",
        (f"{month}%",),
    )
    extras_month = await fetch_value(
        "SELECT COALESCE(SUM(value), 0) AS total FROM extra_charges WHERE charge_date LIKE %s",
        (f"{month}%",),
    )
    shifts_pending = await fetch_value(
        "SELECT COALESCE(SUM(value), 0) AS total FROM shifts WHERE payment_status = 'Pending'"
    )
    extras_pending = await fetch_value(
        "SELECT COALESCE(SUM(value), 0) AS total FROM extra_charges WHERE payment_status = 'Pending'"
    )
    pending_by_caregiver = await fetch_all(
        """
        SELECT caregiver_id, SUM(value) AS total
        FROM (
            SELECT caregiver_id, value FROM shifts WHERE payment_status = 'Pending'
            UNION ALL
            SELECT caregiver_id, value FROM extra_charges WHERE payment_status = 'Pending'
        ) AS pending_items
        GROUP BY caregiver_id
        HAVING SUM(value) > 0
        """
    )
    return {
        "today": float(shifts_today or 0) + float(extras_today or 0),
        "week": float(shifts_week or 0) + float(extras_week or 0),
        "month": float(shifts_month or 0) + float(extras_month or 0),
        "pending": float(shifts_pending or 0) + float(extras_pending or 0),
        "pending_by_caregiver": pending_by_caregiver,
    }


_fe = os.path.abspath(FRONTEND_DIR)
if os.path.isdir(_fe):
    _assets = os.path.join(_fe, "assets")
    if os.path.isdir(_assets):
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")

    _api_prefixes = (
        "auth/",
        "caregivers",
        "shifts",
        "extra-charges",
        "dashboard",
        "docs",
        "openapi",
    )

    @app.get("/", include_in_schema=False)
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str = ""):
        if any(full_path.startswith(prefix) for prefix in _api_prefixes):
            raise HTTPException(status_code=404)
        index = os.path.join(_fe, "index.html")
        if os.path.exists(index):
            return FileResponse(index)
        raise HTTPException(status_code=404)
