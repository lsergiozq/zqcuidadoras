"""
ZQCuidadoras backend
FastAPI + Postgres + JWT auth + optional static frontend serving
"""

import datetime
import asyncio
import os
import re
import uuid
from typing import Any, Literal, Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

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
from pydantic import BaseModel, Field

BACKEND_DIR = os.path.dirname(__file__)
PROJECT_ROOT = os.path.abspath(os.path.join(BACKEND_DIR, ".."))

# Load the project env first and let backend/.env override it when present.
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))
load_dotenv(os.path.join(BACKEND_DIR, ".env"), override=True)


DB_CONNECT_TIMEOUT = float(os.getenv("DB_CONNECT_TIMEOUT_SECONDS", "5"))
DB_POOL_TIMEOUT = float(os.getenv("DB_POOL_TIMEOUT_SECONDS", "10"))


def with_connect_timeout(database_url: str) -> str:
    parsed = urlsplit(database_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.setdefault("connect_timeout", str(int(DB_CONNECT_TIMEOUT)))
    return urlunsplit(parsed._replace(query=urlencode(query)))


def get_database_url() -> str:
    for env_name in (
        "DATABASE_URL_UNPOOLED",
        "POSTGRES_URL_NON_POOLING",
        "DATABASE_URL",
        "POSTGRES_URL",
    ):
        value = os.getenv(env_name)
        if value:
            return with_connect_timeout(value)
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
    os.path.join(BACKEND_DIR, "..", "frontend", "dist"),
)
DB_POOL_MIN_SIZE = int(os.getenv("DB_POOL_MIN_SIZE", "1"))
DB_POOL_MAX_SIZE = int(os.getenv("DB_POOL_MAX_SIZE", "5"))

_raw_users = os.getenv("USERS", "").strip()
BOOTSTRAP_USERS: dict[str, str] = {}
for pair in _raw_users.split(","):
    parts = pair.strip().split(":", 1)
    if len(parts) == 2:
        BOOTSTRAP_USERS[parts[0].strip().lower()] = parts[1].strip()

DEFAULT_SERVICE_TYPES = [
    {
        "code": "measurement-application",
        "name": "Aplicacao com medicao",
        "requires_elder": True,
        "requires_glucose": True,
        "requires_period": True,
    }
]

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def normalize_username(username: str) -> str:
    return username.strip().lower()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def slugify_service_code(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower())
    return slug.strip("-") or uid()


async def get_user_by_username(username: str) -> Optional[dict[str, Any]]:
    return await fetch_one(
        """
        SELECT id, username, display_name, password_hash, role, caregiver_id, active
        FROM users
        WHERE username = %s
        """,
        (normalize_username(username),),
    )


async def users_are_configured() -> bool:
    if not database_env_is_configured():
        return bool(BOOTSTRAP_USERS)
    total = await fetch_value("SELECT COUNT(*) AS total FROM users WHERE active = TRUE")
    return bool(total)


def create_token(user: dict[str, Any]) -> str:
    expire = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
        hours=TOKEN_EXPIRE
    )
    return jwt.encode(
        {
            "sub": user["username"],
            "role": user["role"],
            "caregiver_id": user.get("caregiver_id"),
            "display_name": user.get("display_name"),
            "exp": expire,
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict[str, Any]:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token invalido ou expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise exc
        user = await get_user_by_username(username)
        if not user or not user["active"]:
            raise exc
        return user
    except JWTError as err:
        raise exc from err


Auth = Depends(get_current_user)


async def require_admin_user(user: dict[str, Any] = Auth) -> dict[str, Any]:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador")
    return user


AdminAuth = Depends(require_admin_user)


async def require_caregiver_user(user: dict[str, Any] = Auth) -> dict[str, Any]:
    if user["role"] != "caregiver" or not user.get("caregiver_id"):
        raise HTTPException(status_code=403, detail="Acesso restrito a cuidadora")
    return user


CaregiverAuth = Depends(require_caregiver_user)


def actor_username(user: dict[str, Any]) -> str:
    return str(user["username"])

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
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        caregiver_id TEXT UNIQUE REFERENCES caregivers(id) ON DELETE SET NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS elders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS service_types (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        requires_elder BOOLEAN NOT NULL DEFAULT FALSE,
        requires_glucose BOOLEAN NOT NULL DEFAULT FALSE,
        requires_period BOOLEAN NOT NULL DEFAULT FALSE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS caregiver_service_rates (
        caregiver_id TEXT NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,
        service_type_id TEXT NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
        value DOUBLE PRECISION NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (caregiver_id, service_type_id)
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
    "ALTER TABLE caregivers ADD COLUMN IF NOT EXISTS pix_key TEXT",
    "ALTER TABLE caregivers ADD COLUMN IF NOT EXISTS extra_hour_value DOUBLE PRECISION NOT NULL DEFAULT 0",
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
    "ALTER TABLE extra_charges ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'custom'",
    "ALTER TABLE extra_charges ADD COLUMN IF NOT EXISTS elder_id TEXT REFERENCES elders(id) ON DELETE SET NULL",
    "ALTER TABLE extra_charges ADD COLUMN IF NOT EXISTS service_type_id TEXT REFERENCES service_types(id) ON DELETE SET NULL",
    "ALTER TABLE extra_charges ADD COLUMN IF NOT EXISTS measurement_period TEXT",
    "ALTER TABLE extra_charges ADD COLUMN IF NOT EXISTS glucose_value DOUBLE PRECISION",
    "ALTER TABLE extra_charges ADD COLUMN IF NOT EXISTS start_time TEXT",
    "ALTER TABLE extra_charges ADD COLUMN IF NOT EXISTS end_time TEXT",
    "ALTER TABLE extra_charges ADD COLUMN IF NOT EXISTS duration_minutes INTEGER",
    "CREATE INDEX IF NOT EXISTS idx_users_username ON users (username)",
    "CREATE INDEX IF NOT EXISTS idx_users_caregiver_id ON users (caregiver_id)",
    "CREATE INDEX IF NOT EXISTS idx_elders_name ON elders (name)",
    "CREATE INDEX IF NOT EXISTS idx_service_types_code ON service_types (code)",
    "CREATE INDEX IF NOT EXISTS idx_shifts_shift_date ON shifts (shift_date)",
    "CREATE INDEX IF NOT EXISTS idx_shifts_caregiver_id ON shifts (caregiver_id)",
    "CREATE INDEX IF NOT EXISTS idx_extra_charges_charge_date ON extra_charges (charge_date)",
    "CREATE INDEX IF NOT EXISTS idx_extra_charges_caregiver_id ON extra_charges (caregiver_id)",
    "CREATE INDEX IF NOT EXISTS idx_extra_charges_entry_type ON extra_charges (entry_type)",
    "CREATE INDEX IF NOT EXISTS idx_extra_charges_elder_id ON extra_charges (elder_id)",
    "CREATE INDEX IF NOT EXISTS idx_extra_charges_service_type_id ON extra_charges (service_type_id)",
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
                    timeout=DB_POOL_TIMEOUT,
                    reconnect_timeout=DB_CONNECT_TIMEOUT,
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


def sql_placeholders(count: int) -> str:
    return ", ".join(["%s"] * count)


async def expand_caregiver_rows(
    caregivers: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not caregivers:
        return []

    caregiver_ids = [caregiver["id"] for caregiver in caregivers]
    placeholders = sql_placeholders(len(caregiver_ids))
    rate_rows = await fetch_all(
        f"""
        SELECT
            csr.caregiver_id,
            csr.service_type_id,
            csr.value,
            st.code AS service_type_code,
            st.name AS service_type_name
        FROM caregiver_service_rates AS csr
        JOIN service_types AS st ON st.id = csr.service_type_id
        WHERE csr.caregiver_id IN ({placeholders})
        ORDER BY st.name
        """,
        tuple(caregiver_ids),
    )
    login_rows = await fetch_all(
        f"""
        SELECT caregiver_id, username, display_name, active
        FROM users
        WHERE caregiver_id IN ({placeholders})
        """,
        tuple(caregiver_ids),
    )

    rate_map: dict[str, list[dict[str, Any]]] = {}
    for rate in rate_rows:
        rate_map.setdefault(rate["caregiver_id"], []).append(
            {
                "service_type_id": rate["service_type_id"],
                "service_type_code": rate["service_type_code"],
                "service_type_name": rate["service_type_name"],
                "value": rate["value"],
            }
        )

    login_map = {
        login["caregiver_id"]: {
            "username": login["username"],
            "display_name": login["display_name"],
            "active": login["active"],
        }
        for login in login_rows
    }

    return [
        {
            **caregiver,
            "service_rates": rate_map.get(caregiver["id"], []),
            "login": login_map.get(caregiver["id"]),
        }
        for caregiver in caregivers
    ]


async def get_caregiver_details(id_: str) -> Optional[dict[str, Any]]:
    caregiver = await fetch_one("SELECT * FROM caregivers WHERE id = %s", (id_,))
    if not caregiver:
        return None
    detailed = await expand_caregiver_rows([caregiver])
    return detailed[0]


async def ensure_caregiver_exists(id_: str) -> dict[str, Any]:
    caregiver = await fetch_one("SELECT * FROM caregivers WHERE id = %s", (id_,))
    if not caregiver:
        raise HTTPException(status_code=404, detail="Cuidadora nao encontrada")
    return caregiver


async def validate_service_type_ids(service_type_ids: list[str]) -> None:
    if not service_type_ids:
        return
    placeholders = sql_placeholders(len(service_type_ids))
    rows = await fetch_all(
        f"SELECT id FROM service_types WHERE id IN ({placeholders})",
        tuple(service_type_ids),
    )
    existing_ids = {row["id"] for row in rows}
    missing_ids = sorted(set(service_type_ids) - existing_ids)
    if missing_ids:
        raise HTTPException(
            status_code=400,
            detail="Um ou mais tipos de servico informados nao existem.",
        )


def minutes_from_hhmm(value: str) -> int:
    try:
        hour_str, minute_str = value.split(":", 1)
        hour = int(hour_str)
        minute = int(minute_str)
    except (AttributeError, ValueError) as err:
        raise HTTPException(
            status_code=400,
            detail="Horario invalido. Use o formato HH:MM.",
        ) from err
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        raise HTTPException(
            status_code=400,
            detail="Horario invalido. Use o formato HH:MM.",
        )
    return hour * 60 + minute


def resolve_duration_minutes(
    start_time: Optional[str],
    end_time: Optional[str],
    duration_minutes: Optional[int],
) -> int:
    if duration_minutes is not None:
        if duration_minutes <= 0:
            raise HTTPException(
                status_code=400,
                detail="A duracao deve ser maior que zero.",
            )
        return duration_minutes
    if not start_time or not end_time:
        raise HTTPException(
            status_code=400,
            detail="Informe hora inicial e final ou a duracao em minutos.",
        )
    start_minutes = minutes_from_hhmm(start_time)
    end_minutes = minutes_from_hhmm(end_time)
    if end_minutes <= start_minutes:
        raise HTTPException(
            status_code=400,
            detail="A hora final deve ser maior que a hora inicial.",
        )
    return end_minutes - start_minutes


async def normalize_extra_charge_payload(body: "ExtraChargeIn") -> dict[str, Any]:
    caregiver = await ensure_caregiver_exists(body.caregiver_id)
    entry_type = body.entry_type
    description = (body.description or "").strip() or None
    normalized: dict[str, Any] = {
        "caregiver_id": body.caregiver_id,
        "charge_date": body.charge_date,
        "entry_type": entry_type,
        "description": None,
        "value": None,
        "service_type_id": None,
        "elder_id": None,
        "measurement_period": None,
        "glucose_value": None,
        "start_time": None,
        "end_time": None,
        "duration_minutes": None,
        "payment_status": body.payment_status,
        "payment_date": body.payment_date,
    }

    if entry_type == "custom":
        if not description:
            raise HTTPException(status_code=400, detail="Informe a descricao do avulso.")
        if body.value is None:
            raise HTTPException(status_code=400, detail="Informe o valor do avulso.")
        normalized["description"] = description
        normalized["value"] = float(body.value)
        return normalized

    if entry_type == "service":
        if not body.service_type_id:
            raise HTTPException(status_code=400, detail="Selecione o tipo de servico.")
        service_type = await fetch_one(
            "SELECT * FROM service_types WHERE id = %s",
            (body.service_type_id,),
        )
        if not service_type or not service_type["active"]:
            raise HTTPException(status_code=400, detail="Tipo de servico invalido.")
        rate = await fetch_one(
            """
            SELECT value
            FROM caregiver_service_rates
            WHERE caregiver_id = %s AND service_type_id = %s
            """,
            (body.caregiver_id, body.service_type_id),
        )
        if not rate:
            raise HTTPException(
                status_code=400,
                detail="Essa cuidadora nao possui valor configurado para este tipo de servico.",
            )
        if body.elder_id:
            elder = await fetch_one(
                "SELECT id, active FROM elders WHERE id = %s",
                (body.elder_id,),
            )
            if not elder or not elder["active"]:
                raise HTTPException(status_code=400, detail="Idoso invalido.")
            normalized["elder_id"] = body.elder_id
        if service_type["requires_elder"] and not normalized["elder_id"]:
            raise HTTPException(status_code=400, detail="Selecione o idoso para este servico.")
        if service_type["requires_glucose"] and body.glucose_value is None:
            raise HTTPException(status_code=400, detail="Informe a glicose para este servico.")
        if service_type["requires_period"] and not (body.measurement_period or "").strip():
            raise HTTPException(status_code=400, detail="Informe o periodo da medicao.")
        normalized["description"] = description or service_type["name"]
        normalized["value"] = float(rate["value"])
        normalized["service_type_id"] = body.service_type_id
        normalized["measurement_period"] = (body.measurement_period or "").strip() or None
        normalized["glucose_value"] = body.glucose_value
        return normalized

    if entry_type == "extra_hour":
        duration_minutes = resolve_duration_minutes(
            body.start_time,
            body.end_time,
            body.duration_minutes,
        )
        normalized["description"] = description or "Hora avulsa"
        normalized["value"] = round(
            float(caregiver.get("extra_hour_value") or 0) * duration_minutes / 60,
            2,
        )
        normalized["start_time"] = body.start_time
        normalized["end_time"] = body.end_time
        normalized["duration_minutes"] = duration_minutes
        return normalized

    raise HTTPException(status_code=400, detail="Tipo de avulso invalido.")


async def init_db() -> None:
    db_pool = getattr(app.state, "db_pool", None)
    if db_pool is None:
        raise RuntimeError("Database pool not initialized")
    async with db_pool.connection() as conn:
        async with conn.cursor() as cur:
            for statement in SCHEMA_STATEMENTS:
                await cur.execute(statement)
            timestamp = now()
            for service in DEFAULT_SERVICE_TYPES:
                await cur.execute(
                    """
                    INSERT INTO service_types (
                        id, code, name, requires_elder, requires_glucose,
                        requires_period, active, created_at, updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, TRUE, %s, %s)
                    ON CONFLICT (code) DO NOTHING
                    """,
                    (
                        uid(),
                        service["code"],
                        service["name"],
                        service["requires_elder"],
                        service["requires_glucose"],
                        service["requires_period"],
                        timestamp,
                        timestamp,
                    ),
                )
            if BOOTSTRAP_USERS:
                await cur.execute("SELECT COUNT(*) AS total FROM users")
                total_row = await cur.fetchone()
                if total_row and not total_row["total"]:
                    for username, password in BOOTSTRAP_USERS.items():
                        await cur.execute(
                            """
                            INSERT INTO users (
                                id, username, display_name, password_hash, role,
                                caregiver_id, active, created_at, updated_at
                            )
                            VALUES (%s, %s, %s, %s, 'admin', NULL, TRUE, %s, %s)
                            ON CONFLICT (username) DO NOTHING
                            """,
                            (
                                uid(),
                                username,
                                username,
                                hash_password(password),
                                timestamp,
                                timestamp,
                            ),
                        )


@app.on_event("startup")
async def startup() -> None:
    if database_env_is_configured():
        try:
            await ensure_db_pool()
        except Exception:
            pass


@app.get("/health", tags=["health"])
async def health():
    database_connected = False
    users_configured = False
    if database_env_is_configured():
        try:
            database_connected = (await fetch_value("SELECT 1 AS ok")) == 1
            users_configured = await users_are_configured()
        except Exception:
            database_connected = False
            users_configured = False
    return {
        "status": "ok",
        "database_configured": database_env_is_configured(),
        "database_connected": database_connected,
        "users_configured": users_configured,
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
    display_name: str
    role: str
    caregiver_id: Optional[str] = None


@app.post("/auth/login", response_model=TokenResponse, tags=["auth"])
async def login(form: OAuth2PasswordRequestForm = Depends()):
    if not await users_are_configured():
        raise HTTPException(
            status_code=503,
            detail="Usuarios nao configurados. Crie o primeiro administrador ou confira o bootstrap inicial.",
        )
    user = await get_user_by_username(form.username)
    if not user or not user["active"] or not verify_password(form.password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Usuario ou senha incorretos")
    return {
        "access_token": create_token(user),
        "token_type": "bearer",
        "username": user["username"],
        "display_name": user["display_name"],
        "role": user["role"],
        "caregiver_id": user.get("caregiver_id"),
    }


@app.get("/auth/me", tags=["auth"])
async def me(user: dict[str, Any] = Auth):
    return {
        "username": user["username"],
        "display_name": user["display_name"],
        "role": user["role"],
        "caregiver_id": user.get("caregiver_id"),
    }


class CaregiverIn(BaseModel):
    name: str
    phone: Optional[str] = None
    pix_key: Optional[str] = None
    extra_hour_value: float = 0
    day_shift_value: float = 0
    night_shift_value: float = 0
    full_day_shift_value: float = 0
    payment_type: Literal["Weekly", "Monthly"] = "Weekly"
    active: bool = True


class CaregiverServiceRateIn(BaseModel):
    service_type_id: str
    value: float = 0


class CaregiverServiceRatesPayload(BaseModel):
    service_rates: list[CaregiverServiceRateIn] = Field(default_factory=list)


class CaregiverLoginIn(BaseModel):
    username: str
    display_name: Optional[str] = None
    password: Optional[str] = None
    active: bool = True


class ElderIn(BaseModel):
    name: str
    active: bool = True


class ServiceTypeIn(BaseModel):
    name: str
    code: Optional[str] = None
    requires_elder: bool = False
    requires_glucose: bool = False
    requires_period: bool = False
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
    entry_type: Literal["custom", "service", "extra_hour"] = "custom"
    description: Optional[str] = None
    value: Optional[float] = None
    service_type_id: Optional[str] = None
    elder_id: Optional[str] = None
    measurement_period: Optional[str] = None
    glucose_value: Optional[float] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    payment_status: Literal["Pending", "Paid"] = "Pending"
    payment_date: Optional[str] = None


class PayStatusUpdate(BaseModel):
    payment_status: Literal["Pending", "Paid"]
    payment_date: Optional[str] = None


class CaregiverShiftEntryIn(BaseModel):
    shift_date: str
    shift_type: Literal["Day12h", "Night12h", "Full24h"]
    notes: Optional[str] = None


class CaregiverServiceEntryIn(BaseModel):
    charge_date: str
    service_type_id: str
    elder_id: Optional[str] = None
    measurement_period: Optional[str] = None
    glucose_value: Optional[float] = None
    description: Optional[str] = None


class CaregiverExtraHourStartIn(BaseModel):
    charge_date: str
    start_time: str
    description: Optional[str] = None


class CaregiverExtraHourStopIn(BaseModel):
    end_time: str


@app.get("/caregivers", tags=["caregivers"])
async def list_caregivers(_: dict[str, Any] = AdminAuth):
    caregivers = await fetch_all("SELECT * FROM caregivers ORDER BY name")
    return await expand_caregiver_rows(caregivers)


@app.post("/caregivers", status_code=201, tags=["caregivers"])
async def create_caregiver(body: CaregiverIn, _: dict[str, Any] = AdminAuth):
    id_ = uid()
    ts = now()
    row = await fetch_one(
        """
        INSERT INTO caregivers (
            id, name, phone, pix_key, extra_hour_value,
            day_shift_value, night_shift_value, full_day_shift_value,
            payment_type, active, created_at, updated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
        """,
        (
            id_,
            body.name,
            body.phone,
            body.pix_key,
            body.extra_hour_value,
            body.day_shift_value,
            body.night_shift_value,
            body.full_day_shift_value,
            body.payment_type,
            body.active,
            ts,
            ts,
        ),
    )
    return await get_caregiver_details(row["id"])


@app.put("/caregivers/{id_}", tags=["caregivers"])
async def update_caregiver(id_: str, body: CaregiverIn, _: dict[str, Any] = AdminAuth):
    row = await fetch_one(
        """
        UPDATE caregivers
        SET name = %s,
            phone = %s,
            pix_key = %s,
            extra_hour_value = %s,
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
            body.pix_key,
            body.extra_hour_value,
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
    return await get_caregiver_details(row["id"])


@app.put("/caregivers/{id_}/service-rates", tags=["caregivers"])
async def put_caregiver_service_rates(
    id_: str,
    body: CaregiverServiceRatesPayload,
    _: dict[str, Any] = AdminAuth,
):
    await ensure_caregiver_exists(id_)
    service_type_ids = [rate.service_type_id for rate in body.service_rates]
    if len(service_type_ids) != len(set(service_type_ids)):
        raise HTTPException(
            status_code=400,
            detail="Nao envie o mesmo tipo de servico mais de uma vez para a mesma cuidadora.",
        )
    await validate_service_type_ids(service_type_ids)
    timestamp = now()
    for rate in body.service_rates:
        await execute(
            """
            INSERT INTO caregiver_service_rates (
                caregiver_id, service_type_id, value, created_at, updated_at
            )
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (caregiver_id, service_type_id) DO UPDATE
            SET value = EXCLUDED.value,
                updated_at = EXCLUDED.updated_at
            """,
            (id_, rate.service_type_id, rate.value, timestamp, timestamp),
        )
    if service_type_ids:
        placeholders = sql_placeholders(len(service_type_ids))
        await execute(
            f"DELETE FROM caregiver_service_rates WHERE caregiver_id = %s AND service_type_id NOT IN ({placeholders})",
            (id_, *service_type_ids),
        )
    else:
        await execute(
            "DELETE FROM caregiver_service_rates WHERE caregiver_id = %s",
            (id_,),
        )
    return await get_caregiver_details(id_)


@app.put("/caregivers/{id_}/login", tags=["caregivers"])
async def put_caregiver_login(
    id_: str,
    body: CaregiverLoginIn,
    _: dict[str, Any] = AdminAuth,
):
    caregiver = await ensure_caregiver_exists(id_)
    username = normalize_username(body.username)
    if not username:
        raise HTTPException(status_code=400, detail="Informe um username valido.")
    conflict = await fetch_one(
        "SELECT id FROM users WHERE username = %s AND caregiver_id IS DISTINCT FROM %s",
        (username, id_),
    )
    if conflict:
        raise HTTPException(status_code=400, detail="Este username ja esta em uso.")

    existing_login = await fetch_one(
        "SELECT id FROM users WHERE caregiver_id = %s",
        (id_,),
    )
    display_name = (body.display_name or caregiver["name"]).strip() or caregiver["name"]
    timestamp = now()
    if existing_login:
        if body.password:
            await execute(
                """
                UPDATE users
                SET username = %s,
                    display_name = %s,
                    password_hash = %s,
                    active = %s,
                    updated_at = %s
                WHERE caregiver_id = %s
                """,
                (
                    username,
                    display_name,
                    hash_password(body.password),
                    body.active,
                    timestamp,
                    id_,
                ),
            )
        else:
            await execute(
                """
                UPDATE users
                SET username = %s,
                    display_name = %s,
                    active = %s,
                    updated_at = %s
                WHERE caregiver_id = %s
                """,
                (username, display_name, body.active, timestamp, id_),
            )
    else:
        if not body.password:
            raise HTTPException(
                status_code=400,
                detail="Informe uma senha para criar o acesso da cuidadora.",
            )
        await execute(
            """
            INSERT INTO users (
                id, username, display_name, password_hash, role,
                caregiver_id, active, created_at, updated_at
            )
            VALUES (%s, %s, %s, %s, 'caregiver', %s, %s, %s, %s)
            """,
            (
                uid(),
                username,
                display_name,
                hash_password(body.password),
                id_,
                body.active,
                timestamp,
                timestamp,
            ),
        )
    return await get_caregiver_details(id_)


@app.get("/elders", tags=["elders"])
async def list_elders(active_only: bool = False, _: dict[str, Any] = Auth):
    query = "SELECT * FROM elders"
    if active_only:
        query += " WHERE active = TRUE"
    query += " ORDER BY name"
    return await fetch_all(query)


@app.post("/elders", status_code=201, tags=["elders"])
async def create_elder(body: ElderIn, _: dict[str, Any] = AdminAuth):
    timestamp = now()
    return await fetch_one(
        """
        INSERT INTO elders (id, name, active, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING *
        """,
        (uid(), body.name, body.active, timestamp, timestamp),
    )


@app.put("/elders/{id_}", tags=["elders"])
async def update_elder(id_: str, body: ElderIn, _: dict[str, Any] = AdminAuth):
    row = await fetch_one(
        """
        UPDATE elders
        SET name = %s,
            active = %s,
            updated_at = %s
        WHERE id = %s
        RETURNING *
        """,
        (body.name, body.active, now(), id_),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Idoso nao encontrado")
    return row


@app.get("/service-types", tags=["service-types"])
async def list_service_types(active_only: bool = False, _: dict[str, Any] = Auth):
    query = "SELECT * FROM service_types"
    if active_only:
        query += " WHERE active = TRUE"
    query += " ORDER BY name"
    return await fetch_all(query)


@app.post("/service-types", status_code=201, tags=["service-types"])
async def create_service_type(body: ServiceTypeIn, _: dict[str, Any] = AdminAuth):
    code = slugify_service_code(body.code or body.name)
    existing = await fetch_one(
        "SELECT id FROM service_types WHERE code = %s",
        (code,),
    )
    if existing:
        raise HTTPException(status_code=400, detail="Ja existe um tipo de servico com este codigo.")
    timestamp = now()
    return await fetch_one(
        """
        INSERT INTO service_types (
            id, code, name, requires_elder, requires_glucose,
            requires_period, active, created_at, updated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
        """,
        (
            uid(),
            code,
            body.name,
            body.requires_elder,
            body.requires_glucose,
            body.requires_period,
            body.active,
            timestamp,
            timestamp,
        ),
    )


@app.put("/service-types/{id_}", tags=["service-types"])
async def update_service_type(
    id_: str,
    body: ServiceTypeIn,
    _: dict[str, Any] = AdminAuth,
):
    current = await fetch_one(
        "SELECT * FROM service_types WHERE id = %s",
        (id_,),
    )
    if not current:
        raise HTTPException(status_code=404, detail="Tipo de servico nao encontrado")
    code = slugify_service_code(body.code) if body.code else current["code"]
    existing = await fetch_one(
        "SELECT id FROM service_types WHERE code = %s AND id <> %s",
        (code, id_),
    )
    if existing:
        raise HTTPException(status_code=400, detail="Ja existe um tipo de servico com este codigo.")
    return await fetch_one(
        """
        UPDATE service_types
        SET code = %s,
            name = %s,
            requires_elder = %s,
            requires_glucose = %s,
            requires_period = %s,
            active = %s,
            updated_at = %s
        WHERE id = %s
        RETURNING *
        """,
        (
            code,
            body.name,
            body.requires_elder,
            body.requires_glucose,
            body.requires_period,
            body.active,
            now(),
            id_,
        ),
    )


@app.get("/shifts", tags=["shifts"])
async def list_shifts(
    month: Optional[str] = None,
    caregiver_id: Optional[str] = None,
    _: dict[str, Any] = AdminAuth,
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
async def create_shift(body: ShiftIn, user: dict[str, Any] = AdminAuth):
    id_ = uid()
    ts = now()
    username = actor_username(user)
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
async def update_shift(id_: str, body: ShiftIn, user: dict[str, Any] = AdminAuth):
    username = actor_username(user)
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
async def patch_shift_payment(
    id_: str,
    body: PayStatusUpdate,
    user: dict[str, Any] = AdminAuth,
):
    username = actor_username(user)
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
async def delete_shift(id_: str, _: dict[str, Any] = AdminAuth):
    await execute("DELETE FROM shifts WHERE id = %s", (id_,))


@app.get("/extra-charges", tags=["extras"])
async def list_extra_charges(
    month: Optional[str] = None,
    caregiver_id: Optional[str] = None,
    _: dict[str, Any] = AdminAuth,
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
async def create_extra_charge(body: ExtraChargeIn, user: dict[str, Any] = AdminAuth):
    id_ = uid()
    ts = now()
    username = actor_username(user)
    payload = await normalize_extra_charge_payload(body)
    row = await fetch_one(
        """
        INSERT INTO extra_charges (
            id, caregiver_id, charge_date, entry_type, description, value,
            service_type_id, elder_id, measurement_period, glucose_value,
            start_time, end_time, duration_minutes,
            payment_status, payment_date, created_by, updated_by, created_at, updated_at
        )
        VALUES (
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s, %s, %s, %s
        )
        RETURNING *
        """,
        (
            id_,
            payload["caregiver_id"],
            payload["charge_date"],
            payload["entry_type"],
            payload["description"],
            payload["value"],
            payload["service_type_id"],
            payload["elder_id"],
            payload["measurement_period"],
            payload["glucose_value"],
            payload["start_time"],
            payload["end_time"],
            payload["duration_minutes"],
            payload["payment_status"],
            payload["payment_date"],
            username,
            username,
            ts,
            ts,
        ),
    )
    return row


@app.put("/extra-charges/{id_}", tags=["extras"])
async def update_extra_charge(
    id_: str,
    body: ExtraChargeIn,
    user: dict[str, Any] = AdminAuth,
):
    username = actor_username(user)
    payload = await normalize_extra_charge_payload(body)
    row = await fetch_one(
        """
        UPDATE extra_charges
        SET caregiver_id = %s,
            charge_date = %s,
            entry_type = %s,
            description = %s,
            value = %s,
            service_type_id = %s,
            elder_id = %s,
            measurement_period = %s,
            glucose_value = %s,
            start_time = %s,
            end_time = %s,
            duration_minutes = %s,
            payment_status = %s,
            payment_date = %s,
            updated_by = %s,
            updated_at = %s
        WHERE id = %s
        RETURNING *
        """,
        (
            payload["caregiver_id"],
            payload["charge_date"],
            payload["entry_type"],
            payload["description"],
            payload["value"],
            payload["service_type_id"],
            payload["elder_id"],
            payload["measurement_period"],
            payload["glucose_value"],
            payload["start_time"],
            payload["end_time"],
            payload["duration_minutes"],
            payload["payment_status"],
            payload["payment_date"],
            username,
            now(),
            id_,
        ),
    )
    if not row:
        raise HTTPException(status_code=404)
    return row


@app.patch("/extra-charges/{id_}/payment", tags=["extras"])
async def patch_extra_payment(
    id_: str,
    body: PayStatusUpdate,
    user: dict[str, Any] = AdminAuth,
):
    username = actor_username(user)
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
async def delete_extra_charge(id_: str, _: dict[str, Any] = AdminAuth):
    await execute("DELETE FROM extra_charges WHERE id = %s", (id_,))


@app.get("/dashboard", tags=["dashboard"])
async def dashboard(
    today: str,
    week_start: str,
    week_end: str,
    month: str,
    _: dict[str, Any] = AdminAuth,
):
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


@app.get("/caregiver/dashboard", tags=["caregiver"])
async def caregiver_dashboard(user: dict[str, Any] = CaregiverAuth):
    caregiver_id = user["caregiver_id"]
    caregiver = await get_caregiver_details(caregiver_id)
    if not caregiver:
        raise HTTPException(status_code=404, detail="Cuidadora nao encontrada")
    pending_shifts = await fetch_all(
        """
        SELECT * FROM shifts
        WHERE caregiver_id = %s AND payment_status = 'Pending'
        ORDER BY shift_date DESC, created_at DESC
        """,
        (caregiver_id,),
    )
    pending_extras = await fetch_all(
        """
        SELECT * FROM extra_charges
        WHERE caregiver_id = %s AND payment_status = 'Pending'
        ORDER BY charge_date DESC, created_at DESC
        """,
        (caregiver_id,),
    )
    open_extra_hour = await fetch_one(
        """
        SELECT * FROM extra_charges
        WHERE caregiver_id = %s AND entry_type = 'extra_hour' AND end_time IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (caregiver_id,),
    )
    pending_total = sum(float(item["value"] or 0) for item in pending_shifts) + sum(
        float(item["value"] or 0) for item in pending_extras
    )
    return {
        "caregiver": caregiver,
        "pending_total": pending_total,
        "pending_shifts": pending_shifts,
        "pending_extras": pending_extras,
        "open_extra_hour": open_extra_hour,
    }


@app.post("/caregiver/shifts", status_code=201, tags=["caregiver"])
async def caregiver_create_shift(
    body: CaregiverShiftEntryIn,
    user: dict[str, Any] = CaregiverAuth,
):
    caregiver = await ensure_caregiver_exists(user["caregiver_id"])
    shift_value = {
        "Day12h": caregiver["day_shift_value"],
        "Night12h": caregiver["night_shift_value"],
        "Full24h": caregiver["full_day_shift_value"],
    }[body.shift_type]
    timestamp = now()
    username = actor_username(user)
    return await fetch_one(
        """
        INSERT INTO shifts (
            id, caregiver_id, shift_date, shift_type, value, notes,
            payment_status, payment_date, created_by, updated_by, created_at, updated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, 'Pending', NULL, %s, %s, %s, %s)
        RETURNING *
        """,
        (
            uid(),
            user["caregiver_id"],
            body.shift_date,
            body.shift_type,
            shift_value,
            body.notes,
            username,
            username,
            timestamp,
            timestamp,
        ),
    )


@app.post("/caregiver/service-entries", status_code=201, tags=["caregiver"])
async def caregiver_create_service_entry(
    body: CaregiverServiceEntryIn,
    user: dict[str, Any] = CaregiverAuth,
):
    payload = await normalize_extra_charge_payload(
        ExtraChargeIn(
            caregiver_id=user["caregiver_id"],
            charge_date=body.charge_date,
            entry_type="service",
            description=body.description,
            service_type_id=body.service_type_id,
            elder_id=body.elder_id,
            measurement_period=body.measurement_period,
            glucose_value=body.glucose_value,
            payment_status="Pending",
            payment_date=None,
        )
    )
    timestamp = now()
    username = actor_username(user)
    return await fetch_one(
        """
        INSERT INTO extra_charges (
            id, caregiver_id, charge_date, entry_type, description, value,
            service_type_id, elder_id, measurement_period, glucose_value,
            start_time, end_time, duration_minutes,
            payment_status, payment_date, created_by, updated_by, created_at, updated_at
        )
        VALUES (
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s,
            NULL, NULL, NULL,
            'Pending', NULL, %s, %s, %s, %s
        )
        RETURNING *
        """,
        (
            uid(),
            payload["caregiver_id"],
            payload["charge_date"],
            payload["entry_type"],
            payload["description"],
            payload["value"],
            payload["service_type_id"],
            payload["elder_id"],
            payload["measurement_period"],
            payload["glucose_value"],
            username,
            username,
            timestamp,
            timestamp,
        ),
    )


@app.post("/caregiver/extra-hours/start", status_code=201, tags=["caregiver"])
async def caregiver_start_extra_hour(
    body: CaregiverExtraHourStartIn,
    user: dict[str, Any] = CaregiverAuth,
):
    open_extra_hour = await fetch_one(
        """
        SELECT id FROM extra_charges
        WHERE caregiver_id = %s AND entry_type = 'extra_hour' AND end_time IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (user["caregiver_id"],),
    )
    if open_extra_hour:
        raise HTTPException(
            status_code=400,
            detail="Ja existe uma hora avulsa em andamento para esta cuidadora.",
        )
    minutes_from_hhmm(body.start_time)
    timestamp = now()
    username = actor_username(user)
    return await fetch_one(
        """
        INSERT INTO extra_charges (
            id, caregiver_id, charge_date, entry_type, description, value,
            service_type_id, elder_id, measurement_period, glucose_value,
            start_time, end_time, duration_minutes,
            payment_status, payment_date, created_by, updated_by, created_at, updated_at
        )
        VALUES (
            %s, %s, %s, 'extra_hour', %s, 0,
            NULL, NULL, NULL, NULL,
            %s, NULL, NULL,
            'Pending', NULL, %s, %s, %s, %s
        )
        RETURNING *
        """,
        (
            uid(),
            user["caregiver_id"],
            body.charge_date,
            (body.description or "").strip() or "Hora avulsa",
            body.start_time,
            username,
            username,
            timestamp,
            timestamp,
        ),
    )


@app.post("/caregiver/extra-hours/stop", tags=["caregiver"])
async def caregiver_stop_extra_hour(
    body: CaregiverExtraHourStopIn,
    user: dict[str, Any] = CaregiverAuth,
):
    open_extra_hour = await fetch_one(
        """
        SELECT * FROM extra_charges
        WHERE caregiver_id = %s AND entry_type = 'extra_hour' AND end_time IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (user["caregiver_id"],),
    )
    if not open_extra_hour:
        raise HTTPException(
            status_code=404,
            detail="Nao existe hora avulsa em andamento para finalizar.",
        )
    payload = await normalize_extra_charge_payload(
        ExtraChargeIn(
            caregiver_id=user["caregiver_id"],
            charge_date=open_extra_hour["charge_date"],
            entry_type="extra_hour",
            description=open_extra_hour["description"],
            start_time=open_extra_hour["start_time"],
            end_time=body.end_time,
            payment_status=open_extra_hour["payment_status"],
            payment_date=open_extra_hour["payment_date"],
        )
    )
    username = actor_username(user)
    row = await fetch_one(
        """
        UPDATE extra_charges
        SET description = %s,
            value = %s,
            start_time = %s,
            end_time = %s,
            duration_minutes = %s,
            updated_by = %s,
            updated_at = %s
        WHERE id = %s
        RETURNING *
        """,
        (
            payload["description"],
            payload["value"],
            payload["start_time"],
            payload["end_time"],
            payload["duration_minutes"],
            username,
            now(),
            open_extra_hour["id"],
        ),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Hora avulsa nao encontrada")
    return row


@app.get("/reports/measurements", tags=["reports"])
async def measurement_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    elder_id: Optional[str] = None,
    _: dict[str, Any] = AdminAuth,
):
    conditions = ["ec.glucose_value IS NOT NULL"]
    params: list[Any] = []
    if start_date:
        conditions.append("ec.charge_date >= %s")
        params.append(start_date)
    if end_date:
        conditions.append("ec.charge_date <= %s")
        params.append(end_date)
    if elder_id:
        conditions.append("ec.elder_id = %s")
        params.append(elder_id)
    rows = await fetch_all(
        f"""
        SELECT
            ec.id,
            ec.charge_date,
            ec.description,
            ec.measurement_period,
            ec.glucose_value,
            ec.value,
            ec.payment_status,
            ec.created_by,
            e.id AS elder_id,
            e.name AS elder_name,
            c.id AS caregiver_id,
            c.name AS caregiver_name,
            st.id AS service_type_id,
            st.name AS service_type_name
        FROM extra_charges AS ec
        LEFT JOIN elders AS e ON e.id = ec.elder_id
        LEFT JOIN caregivers AS c ON c.id = ec.caregiver_id
        LEFT JOIN service_types AS st ON st.id = ec.service_type_id
        WHERE {' AND '.join(conditions)}
        ORDER BY e.name NULLS LAST, ec.charge_date DESC, ec.created_at DESC
        """,
        tuple(params),
    )
    return {"items": rows}


@app.get("/reports/caregiver-payments", tags=["reports"])
async def caregiver_payment_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    caregiver_id: Optional[str] = None,
    _: dict[str, Any] = AdminAuth,
):
    shift_conditions = ["s.payment_status = 'Pending'"]
    extra_conditions = ["ec.payment_status = 'Pending'"]
    shift_params: list[Any] = []
    extra_params: list[Any] = []
    if start_date:
        shift_conditions.append("s.shift_date >= %s")
        extra_conditions.append("ec.charge_date >= %s")
        shift_params.append(start_date)
        extra_params.append(start_date)
    if end_date:
        shift_conditions.append("s.shift_date <= %s")
        extra_conditions.append("ec.charge_date <= %s")
        shift_params.append(end_date)
        extra_params.append(end_date)
    if caregiver_id:
        shift_conditions.append("s.caregiver_id = %s")
        extra_conditions.append("ec.caregiver_id = %s")
        shift_params.append(caregiver_id)
        extra_params.append(caregiver_id)

    items = await fetch_all(
        f"""
        SELECT *
        FROM (
            SELECT
                c.id AS caregiver_id,
                c.name AS caregiver_name,
                c.pix_key,
                'shift' AS source,
                s.id AS source_id,
                s.shift_date AS event_date,
                s.shift_type AS label,
                s.value
            FROM shifts AS s
            JOIN caregivers AS c ON c.id = s.caregiver_id
            WHERE {' AND '.join(shift_conditions)}

            UNION ALL

            SELECT
                c.id AS caregiver_id,
                c.name AS caregiver_name,
                c.pix_key,
                ec.entry_type AS source,
                ec.id AS source_id,
                ec.charge_date AS event_date,
                ec.description AS label,
                ec.value
            FROM extra_charges AS ec
            JOIN caregivers AS c ON c.id = ec.caregiver_id
            WHERE {' AND '.join(extra_conditions)}
        ) AS pending_items
        ORDER BY caregiver_name, event_date DESC
        """,
        tuple(shift_params + extra_params),
    )

    summary_map: dict[str, dict[str, Any]] = {}
    for item in items:
        caregiver_summary = summary_map.setdefault(
            item["caregiver_id"],
            {
                "caregiver_id": item["caregiver_id"],
                "caregiver_name": item["caregiver_name"],
                "pix_key": item["pix_key"],
                "total": 0.0,
            },
        )
        caregiver_summary["total"] += float(item["value"] or 0)

    summary = sorted(summary_map.values(), key=lambda row: row["caregiver_name"])
    return {"items": items, "summary": summary}


_fe = os.path.abspath(FRONTEND_DIR)
if os.path.isdir(_fe):
    _assets = os.path.join(_fe, "assets")
    if os.path.isdir(_assets):
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")

    _api_prefixes = (
        "auth/",
        "caregivers",
        "elders",
        "service-types",
        "shifts",
        "extra-charges",
        "caregiver/",
        "dashboard",
        "reports/",
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
