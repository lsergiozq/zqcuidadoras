import argparse
import os
import sqlite3
from typing import Any

import psycopg

from main import SCHEMA_STATEMENTS, get_database_url


TABLES = {
    "caregivers": [
        "id",
        "name",
        "phone",
        "day_shift_value",
        "night_shift_value",
        "full_day_shift_value",
        "payment_type",
        "active",
        "created_at",
        "updated_at",
    ],
    "shifts": [
        "id",
        "caregiver_id",
        "shift_date",
        "shift_type",
        "value",
        "notes",
        "payment_status",
        "payment_date",
        "created_by",
        "updated_by",
        "created_at",
        "updated_at",
    ],
    "extra_charges": [
        "id",
        "caregiver_id",
        "charge_date",
        "description",
        "value",
        "payment_status",
        "payment_date",
        "created_by",
        "updated_by",
        "created_at",
        "updated_at",
    ],
}

TABLE_ORDER = ["caregivers", "shifts", "extra_charges"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Migra dados de um SQLite legado para o Postgres usado pelo backend."
    )
    parser.add_argument(
        "--sqlite-path",
        help="Caminho do arquivo SQLite de origem. Se omitido, procura cuidarcontrol.db e zqcuidadoras.db.",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Apaga os dados atuais do Postgres antes de importar.",
    )
    return parser.parse_args()


def resolve_sqlite_path(explicit_path: str | None) -> str:
    candidates = [
        explicit_path,
        os.getenv("SQLITE_PATH"),
        os.path.join(os.path.dirname(__file__), "cuidarcontrol.db"),
        os.path.join(os.path.dirname(__file__), "zqcuidadoras.db"),
    ]
    for candidate in candidates:
        if candidate and os.path.exists(candidate):
            return os.path.abspath(candidate)
    raise FileNotFoundError(
        "Nenhum arquivo SQLite encontrado. Use --sqlite-path ou defina SQLITE_PATH."
    )


def sqlite_table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def sqlite_columns(conn: sqlite3.Connection, table_name: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {row[1] for row in rows}


def load_rows(sqlite_conn: sqlite3.Connection, table_name: str) -> list[tuple[Any, ...]]:
    target_columns = TABLES[table_name]
    source_columns = sqlite_columns(sqlite_conn, table_name)
    selectable_columns = [column for column in target_columns if column in source_columns]
    if not selectable_columns:
        return []

    raw_rows = sqlite_conn.execute(
        f"SELECT {', '.join(selectable_columns)} FROM {table_name}"
    ).fetchall()
    normalized_rows: list[tuple[Any, ...]] = []
    for raw_row in raw_rows:
        record = dict(zip(selectable_columns, raw_row))
        values: list[Any] = []
        for column in target_columns:
            value = record.get(column)
            if column == "active" and value is not None:
                value = bool(value)
            values.append(value)
        normalized_rows.append(tuple(values))
    return normalized_rows


def ensure_schema(pg_conn: psycopg.Connection[Any]) -> None:
    with pg_conn.cursor() as cur:
        for statement in SCHEMA_STATEMENTS:
            cur.execute(statement)


def truncate_tables(pg_conn: psycopg.Connection[Any]) -> None:
    with pg_conn.cursor() as cur:
        cur.execute("TRUNCATE TABLE extra_charges, shifts, caregivers")


def insert_rows(
    pg_conn: psycopg.Connection[Any], table_name: str, rows: list[tuple[Any, ...]]
) -> None:
    if not rows:
        return
    columns = TABLES[table_name]
    placeholders = ", ".join(["%s"] * len(columns))
    column_list = ", ".join(columns)
    assignments = ", ".join(
        f"{column} = EXCLUDED.{column}" for column in columns if column != "id"
    )
    query = f"""
        INSERT INTO {table_name} ({column_list})
        VALUES ({placeholders})
        ON CONFLICT (id) DO UPDATE SET {assignments}
    """
    with pg_conn.cursor() as cur:
        cur.executemany(query, rows)


def main() -> None:
    args = parse_args()
    sqlite_path = resolve_sqlite_path(args.sqlite_path)
    database_url = get_database_url()

    sqlite_conn = sqlite3.connect(sqlite_path)
    try:
        with psycopg.connect(database_url) as pg_conn:
            ensure_schema(pg_conn)
            if args.replace:
                truncate_tables(pg_conn)

            for table_name in TABLE_ORDER:
                if not sqlite_table_exists(sqlite_conn, table_name):
                    print(f"[skip] tabela ausente no SQLite: {table_name}")
                    continue
                rows = load_rows(sqlite_conn, table_name)
                insert_rows(pg_conn, table_name, rows)
                print(f"[ok] {table_name}: {len(rows)} registro(s) migrado(s)")

            pg_conn.commit()
            print(f"Migracao concluida a partir de {sqlite_path}")
    finally:
        sqlite_conn.close()


if __name__ == "__main__":
    main()