"""
ZQCuidadoras – Backend
FastAPI + SQLite via aiosqlite
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Literal
import aiosqlite, asyncio, os, datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "zqcuidadoras.db")

app = FastAPI(title="ZQCuidadoras API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Schema ────────────────────────────────────────────────────────────────────

CREATE_SQL = """
CREATE TABLE IF NOT EXISTS caregivers (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    phone           TEXT,
    day_shift_value REAL NOT NULL DEFAULT 0,
    night_shift_value REAL NOT NULL DEFAULT 0,
    full_day_shift_value REAL NOT NULL DEFAULT 0,
    payment_type    TEXT NOT NULL DEFAULT 'Weekly',
    active          INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shifts (
    id              TEXT PRIMARY KEY,
    caregiver_id    TEXT NOT NULL REFERENCES caregivers(id),
    shift_date      TEXT NOT NULL,
    shift_type      TEXT NOT NULL,
    value           REAL NOT NULL,
    notes           TEXT,
    payment_status  TEXT NOT NULL DEFAULT 'Pending',
    payment_date    TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS extra_charges (
    id              TEXT PRIMARY KEY,
    caregiver_id    TEXT NOT NULL REFERENCES caregivers(id),
    charge_date     TEXT NOT NULL,
    description     TEXT NOT NULL,
    value           REAL NOT NULL,
    payment_status  TEXT NOT NULL DEFAULT 'Pending',
    payment_date    TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
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
        if s:
            await db.execute(s)
    await db.commit()
    await db.close()

@app.on_event("startup")
async def startup():
    await init_db()

def uid():
    import uuid
    return str(uuid.uuid4())

def now():
    return datetime.datetime.utcnow().isoformat()

# ── Pydantic Models ───────────────────────────────────────────────────────────

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

# ── Caregivers ────────────────────────────────────────────────────────────────

@app.get("/caregivers")
async def list_caregivers():
    db = await get_db()
    cur = await db.execute("SELECT * FROM caregivers ORDER BY name")
    rows = await cur.fetchall()
    await db.close()
    return [dict(r) for r in rows]

@app.post("/caregivers", status_code=201)
async def create_caregiver(body: CaregiverIn):
    db = await get_db()
    id_ = uid(); ts = now()
    await db.execute(
        "INSERT INTO caregivers VALUES (?,?,?,?,?,?,?,?,?,?)",
        (id_, body.name, body.phone, body.day_shift_value, body.night_shift_value,
         body.full_day_shift_value, body.payment_type, int(body.active), ts, ts)
    )
    await db.commit()
    cur = await db.execute("SELECT * FROM caregivers WHERE id=?", (id_,))
    row = await cur.fetchone()
    await db.close()
    return dict(row)

@app.put("/caregivers/{id_}")
async def update_caregiver(id_: str, body: CaregiverIn):
    db = await get_db()
    ts = now()
    await db.execute(
        "UPDATE caregivers SET name=?,phone=?,day_shift_value=?,night_shift_value=?,full_day_shift_value=?,payment_type=?,active=?,updated_at=? WHERE id=?",
        (body.name, body.phone, body.day_shift_value, body.night_shift_value,
         body.full_day_shift_value, body.payment_type, int(body.active), ts, id_)
    )
    await db.commit()
    cur = await db.execute("SELECT * FROM caregivers WHERE id=?", (id_,))
    row = await cur.fetchone()
    await db.close()
    if not row: raise HTTPException(404)
    return dict(row)

# ── Shifts ────────────────────────────────────────────────────────────────────

@app.get("/shifts")
async def list_shifts(month: Optional[str] = None, caregiver_id: Optional[str] = None):
    db = await get_db()
    q = "SELECT * FROM shifts WHERE 1=1"
    params = []
    if month:
        q += " AND shift_date LIKE ?"
        params.append(f"{month}%")
    if caregiver_id:
        q += " AND caregiver_id = ?"
        params.append(caregiver_id)
    q += " ORDER BY shift_date DESC"
    cur = await db.execute(q, params)
    rows = await cur.fetchall()
    await db.close()
    return [dict(r) for r in rows]

@app.post("/shifts", status_code=201)
async def create_shift(body: ShiftIn):
    db = await get_db()
    id_ = uid(); ts = now()
    await db.execute(
        "INSERT INTO shifts VALUES (?,?,?,?,?,?,?,?,?,?)",
        (id_, body.caregiver_id, body.shift_date, body.shift_type,
         body.value, body.notes, body.payment_status, body.payment_date, ts, ts)
    )
    await db.commit()
    cur = await db.execute("SELECT * FROM shifts WHERE id=?", (id_,))
    row = await cur.fetchone()
    await db.close()
    return dict(row)

@app.put("/shifts/{id_}")
async def update_shift(id_: str, body: ShiftIn):
    db = await get_db()
    ts = now()
    await db.execute(
        "UPDATE shifts SET caregiver_id=?,shift_date=?,shift_type=?,value=?,notes=?,payment_status=?,payment_date=?,updated_at=? WHERE id=?",
        (body.caregiver_id, body.shift_date, body.shift_type, body.value,
         body.notes, body.payment_status, body.payment_date, ts, id_)
    )
    await db.commit()
    cur = await db.execute("SELECT * FROM shifts WHERE id=?", (id_,))
    row = await cur.fetchone(); await db.close()
    if not row: raise HTTPException(404)
    return dict(row)

@app.patch("/shifts/{id_}/payment")
async def patch_shift_payment(id_: str, body: PayStatusUpdate):
    db = await get_db()
    await db.execute(
        "UPDATE shifts SET payment_status=?,payment_date=?,updated_at=? WHERE id=?",
        (body.payment_status, body.payment_date, now(), id_)
    )
    await db.commit()
    cur = await db.execute("SELECT * FROM shifts WHERE id=?", (id_,))
    row = await cur.fetchone(); await db.close()
    if not row: raise HTTPException(404)
    return dict(row)

@app.delete("/shifts/{id_}", status_code=204)
async def delete_shift(id_: str):
    db = await get_db()
    await db.execute("DELETE FROM shifts WHERE id=?", (id_,))
    await db.commit(); await db.close()

# ── Extra Charges ─────────────────────────────────────────────────────────────

@app.get("/extra-charges")
async def list_extra_charges(month: Optional[str] = None, caregiver_id: Optional[str] = None):
    db = await get_db()
    q = "SELECT * FROM extra_charges WHERE 1=1"
    params = []
    if month:
        q += " AND charge_date LIKE ?"
        params.append(f"{month}%")
    if caregiver_id:
        q += " AND caregiver_id = ?"
        params.append(caregiver_id)
    q += " ORDER BY charge_date DESC"
    cur = await db.execute(q, params)
    rows = await cur.fetchall(); await db.close()
    return [dict(r) for r in rows]

@app.post("/extra-charges", status_code=201)
async def create_extra_charge(body: ExtraChargeIn):
    db = await get_db()
    id_ = uid(); ts = now()
    await db.execute(
        "INSERT INTO extra_charges VALUES (?,?,?,?,?,?,?,?,?)",
        (id_, body.caregiver_id, body.charge_date, body.description,
         body.value, body.payment_status, body.payment_date, ts, ts)
    )
    await db.commit()
    cur = await db.execute("SELECT * FROM extra_charges WHERE id=?", (id_,))
    row = await cur.fetchone(); await db.close()
    return dict(row)

@app.put("/extra-charges/{id_}")
async def update_extra_charge(id_: str, body: ExtraChargeIn):
    db = await get_db()
    ts = now()
    await db.execute(
        "UPDATE extra_charges SET caregiver_id=?,charge_date=?,description=?,value=?,payment_status=?,payment_date=?,updated_at=? WHERE id=?",
        (body.caregiver_id, body.charge_date, body.description, body.value,
         body.payment_status, body.payment_date, ts, id_)
    )
    await db.commit()
    cur = await db.execute("SELECT * FROM extra_charges WHERE id=?", (id_,))
    row = await cur.fetchone(); await db.close()
    if not row: raise HTTPException(404)
    return dict(row)

@app.patch("/extra-charges/{id_}/payment")
async def patch_extra_payment(id_: str, body: PayStatusUpdate):
    db = await get_db()
    await db.execute(
        "UPDATE extra_charges SET payment_status=?,payment_date=?,updated_at=? WHERE id=?",
        (body.payment_status, body.payment_date, now(), id_)
    )
    await db.commit()
    cur = await db.execute("SELECT * FROM extra_charges WHERE id=?", (id_,))
    row = await cur.fetchone(); await db.close()
    if not row: raise HTTPException(404)
    return dict(row)

@app.delete("/extra-charges/{id_}", status_code=204)
async def delete_extra_charge(id_: str):
    db = await get_db()
    await db.execute("DELETE FROM extra_charges WHERE id=?", (id_,))
    await db.commit(); await db.close()

# ── Dashboard summary ─────────────────────────────────────────────────────────

@app.get("/dashboard")
async def dashboard(today: str, week_start: str, week_end: str, month: str):
    db = await get_db()

    async def sumq(table, date_col, where_extra, params):
        cur = await db.execute(
            f"SELECT COALESCE(SUM(value),0) as s FROM {table} WHERE {date_col} {where_extra}",
            params
        )
        r = await cur.fetchone(); return r["s"]

    today_shifts  = await sumq("shifts",        "shift_date",  "= ?", [today])
    today_extras  = await sumq("extra_charges", "charge_date", "= ?", [today])
    week_shifts   = await sumq("shifts",        "shift_date",  "BETWEEN ? AND ?", [week_start, week_end])
    week_extras   = await sumq("extra_charges", "charge_date", "BETWEEN ? AND ?", [week_start, week_end])
    month_shifts  = await sumq("shifts",        "shift_date",  "LIKE ?", [f"{month}%"])
    month_extras  = await sumq("extra_charges", "charge_date", "LIKE ?", [f"{month}%"])
    pend_shifts   = await sumq("shifts",        "payment_status", "= 'Pending' AND shift_date LIKE ?", [f"{month[:4]}%"])
    pend_extras   = await sumq("extra_charges", "payment_status", "= 'Pending' AND charge_date LIKE ?", [f"{month[:4]}%"])

    # pending by caregiver (all time)
    cur = await db.execute("""
        SELECT caregiver_id, SUM(value) as total FROM (
          SELECT caregiver_id, value FROM shifts WHERE payment_status='Pending'
          UNION ALL
          SELECT caregiver_id, value FROM extra_charges WHERE payment_status='Pending'
        ) GROUP BY caregiver_id HAVING total > 0
    """)
    pending_by_cg = [dict(r) for r in await cur.fetchall()]

    # today detail
    cur = await db.execute("SELECT * FROM shifts WHERE shift_date=? ORDER BY created_at", [today])
    today_shift_list = [dict(r) for r in await cur.fetchall()]
    cur = await db.execute("SELECT * FROM extra_charges WHERE charge_date=? ORDER BY created_at", [today])
    today_extra_list = [dict(r) for r in await cur.fetchall()]

    await db.close()
    return {
        "today":        today_shifts + today_extras,
        "week":         week_shifts  + week_extras,
        "month":        month_shifts + month_extras,
        "pending":      pend_shifts  + pend_extras,
        "pending_by_caregiver": pending_by_cg,
        "today_shifts": today_shift_list,
        "today_extras": today_extra_list,
    }
