from collections.abc import AsyncIterator
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


def _make_engine():
    database_path = Path(settings.DATABASE_PATH)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    return create_async_engine(f"sqlite+aiosqlite:///{database_path}")


engine = _make_engine()
session_factory = async_sessionmaker(engine, expire_on_commit=False)


def _add_username_column_if_missing(connection: Connection) -> None:
    # Base.metadata.create_all only creates tables that don't exist yet - it never alters an
    # existing `users` table, so a column added to the model after the app has already been
    # deployed once (and has real rows) needs this instead of a full migration framework.
    columns = {column["name"] for column in inspect(connection).get_columns("users")}
    if "username" not in columns:
        connection.execute(text("ALTER TABLE users ADD COLUMN username VARCHAR(120)"))
        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users (username)"))


def _add_unit_input_columns_if_missing(connection: Connection) -> None:
    columns = {column["name"] for column in inspect(connection).get_columns("food_entries")}
    if "input_unit" not in columns:
        connection.execute(text("ALTER TABLE food_entries ADD COLUMN input_unit VARCHAR(16) DEFAULT 'g'"))
        connection.execute(text("ALTER TABLE food_entries ADD COLUMN input_amount FLOAT"))
        connection.execute(text("ALTER TABLE food_entries ADD COLUMN unit_to_grams FLOAT DEFAULT 1.0"))
        # Every pre-existing entry was always logged in grams - input_amount mirrors grams for
        # those rows rather than being left null.
        connection.execute(text("UPDATE food_entries SET input_amount = grams WHERE input_amount IS NULL"))


def _add_product_cache_unit_columns_if_missing(connection: Connection) -> None:
    columns = {column["name"] for column in inspect(connection).get_columns("product_cache")}
    if "suggested_unit" not in columns:
        connection.execute(text("ALTER TABLE product_cache ADD COLUMN suggested_unit VARCHAR(16) DEFAULT 'g'"))
        connection.execute(text("ALTER TABLE product_cache ADD COLUMN unit_to_grams FLOAT DEFAULT 1.0"))


def _add_meal_group_id_column_if_missing(connection: Connection) -> None:
    columns = {column["name"] for column in inspect(connection).get_columns("food_entries")}
    if "meal_group_id" not in columns:
        # No inline REFERENCES/index - the app doesn't turn on SQLite foreign-key enforcement, so
        # this only needs to satisfy the ORM's own FK/cascade handling, matching the minimal-ALTER
        # pattern used everywhere else in this file.
        connection.execute(text("ALTER TABLE food_entries ADD COLUMN meal_group_id CHAR(32)"))


async def create_tables() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await connection.run_sync(_add_username_column_if_missing)
        await connection.run_sync(_add_unit_input_columns_if_missing)
        await connection.run_sync(_add_product_cache_unit_columns_if_missing)
        await connection.run_sync(_add_meal_group_id_column_if_missing)


async def get_db_session() -> AsyncIterator[AsyncSession]:
    async with session_factory() as session:
        yield session
