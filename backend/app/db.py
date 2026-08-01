import uuid as uuid_module
from collections.abc import AsyncIterator
from datetime import UTC, datetime, time
from pathlib import Path

from sqlalchemy import MetaData, inspect, select, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from uuid6 import uuid7

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


def _column_type_str(connection: Connection, table_name: str, column_name: str) -> str:
    columns = {column["name"]: column for column in inspect(connection).get_columns(table_name)}
    column = columns.get(column_name)
    return str(column["type"]).upper() if column else ""


def _users_table_needs_uuid_migration(connection: Connection) -> bool:
    if "users" not in inspect(connection).get_table_names():
        return False  # fresh DB - create_all already built it on the current (UUID) schema
    return "INT" in _column_type_str(connection, "users", "id")


def _migrate_users_and_entries_to_uuid_ids(connection: Connection) -> None:
    if not _users_table_needs_uuid_migration(connection):
        return

    table_names = inspect(connection).get_table_names()
    migrate_meal_groups = "meal_groups" in table_names and "INT" in _column_type_str(
        connection, "meal_groups", "user_id"
    )

    old_metadata = MetaData()
    reflect_tables = ["users", "food_entries"] + (["meal_groups"] if migrate_meal_groups else [])
    old_metadata.reflect(bind=connection, only=reflect_tables)

    old_users = [dict(row._mapping) for row in connection.execute(select(old_metadata.tables["users"]))]
    old_entries = [dict(row._mapping) for row in connection.execute(select(old_metadata.tables["food_entries"]))]
    old_groups = (
        [dict(row._mapping) for row in connection.execute(select(old_metadata.tables["meal_groups"]))]
        if migrate_meal_groups
        else []
    )

    user_id_map = {row["id"]: uuid7() for row in old_users}
    entry_id_map = {row["id"]: uuid7() for row in old_entries}

    # DROP not RENAME: SQLite index names are global, so a rename would leave the old indexes
    # bound to the old table names, colliding with the new tables' same-named indexes. Nothing
    # destructive has happened before this point - everything above only reads.
    connection.execute(text("DROP TABLE food_entries"))
    if migrate_meal_groups:
        connection.execute(text("DROP TABLE meal_groups"))
    connection.execute(text("DROP TABLE users"))

    new_users = Base.metadata.tables["users"]
    new_meal_groups = Base.metadata.tables["meal_groups"]
    new_entries = Base.metadata.tables["food_entries"]
    new_users.create(connection)
    # checkfirst: either just dropped above (migrate_meal_groups) and needs recreating, or was
    # left alone because it's already on the new schema (or never existed yet) - either way this
    # only creates it when it isn't already there, before food_entries' FK needs it to exist.
    new_meal_groups.create(connection, checkfirst=True)
    new_entries.create(connection)

    for row in old_users:
        connection.execute(new_users.insert(), {**row, "id": user_id_map[row["id"]], "updated_at": None})
    for row in old_groups:
        # meal_groups.id was already a Uuid column before this migration (introduced UUID-native
        # in the same release that added meal grouping) - reflection reads it back as a plain hex
        # string rather than a uuid.UUID object, which the new (also Uuid-typed) column's bind
        # processor requires.
        connection.execute(
            new_meal_groups.insert(),
            {**row, "id": uuid_module.UUID(row["id"]), "user_id": user_id_map[row["user_id"]]},
        )
    for row in old_entries:
        # Same string-vs-UUID-object issue as meal_groups.id above, for any entry that was
        # already linked to a group before this migration ran.
        old_meal_group_id = row["meal_group_id"]
        if old_meal_group_id is not None:
            old_meal_group_id = uuid_module.UUID(old_meal_group_id)
        connection.execute(
            new_entries.insert(),
            {
                **row,
                "id": entry_id_map[row["id"]],
                "user_id": user_id_map[row["user_id"]],
                # consumed_at was date-only before this migration (reflection gives back a real
                # date object for a DATE-affinity column, not a string) - every pre-existing row
                # is backfilled to 13:00 on its original date, since no real time-of-day was ever
                # recorded for it. New entries capture the actual logged time going forward.
                "consumed_at": datetime.combine(row["consumed_at"], time(13, 0), tzinfo=UTC),
                "updated_at": None,
                "meal_group_id": old_meal_group_id,
            },
        )


async def create_tables() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await connection.run_sync(_add_username_column_if_missing)
        await connection.run_sync(_add_unit_input_columns_if_missing)
        await connection.run_sync(_add_product_cache_unit_columns_if_missing)
        await connection.run_sync(_add_meal_group_id_column_if_missing)
        await connection.run_sync(_migrate_users_and_entries_to_uuid_ids)


async def get_db_session() -> AsyncIterator[AsyncSession]:
    async with session_factory() as session:
        yield session
