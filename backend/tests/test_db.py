from datetime import UTC, date, datetime

from sqlalchemy import inspect, select, text
from uuid6 import uuid7

from app.db import Base, _users_table_needs_uuid_migration, create_tables, engine


async def test_create_tables_is_idempotent() -> None:
    await create_tables()
    await create_tables()  # everything already exists/migrated the second time - must not raise


async def test_users_table_needs_uuid_migration_is_false_when_users_table_does_not_exist_yet() -> None:
    # Not reachable through create_tables() itself (create_all always creates `users` first) -
    # this is the guard that keeps the migration a no-op if it were ever invoked before that.
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        needs_migration = await connection.run_sync(_users_table_needs_uuid_migration)
    assert needs_migration is False


async def test_create_tables_adds_username_column_to_a_pre_existing_users_table() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        # Simulates a deployment from before the `username` column existed on the model. A real
        # row (not a minimal stub) because the cascading UUID-id migration (further down the
        # chain, but always re-evaluated on every boot) needs every NOT NULL column populated.
        await connection.execute(
            text(
                """
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY,
                    email VARCHAR(255) UNIQUE,
                    password_hash VARCHAR(255),
                    display_name VARCHAR(120),
                    daily_calorie_goal INTEGER,
                    daily_protein_goal_g INTEGER,
                    daily_carbs_goal_g INTEGER,
                    daily_fat_goal_g INTEGER,
                    created_at DATETIME
                )
                """
            )
        )
        await connection.execute(
            text(
                "INSERT INTO users (id, email, password_hash, display_name, daily_calorie_goal, "
                "daily_protein_goal_g, daily_carbs_goal_g, daily_fat_goal_g, created_at) VALUES "
                "(1, 'a@b.com', 'hash', 'Ada', 2000, 150, 200, 65, '2026-07-01 09:00:00')"
            )
        )

    await create_tables()

    async with engine.begin() as connection:
        columns = await connection.run_sync(lambda conn: {c["name"] for c in inspect(conn).get_columns("users")})
        row = (await connection.execute(text("SELECT username FROM users WHERE email = 'a@b.com'"))).one()
    assert "username" in columns
    assert row.username is None


async def test_create_tables_adds_unit_input_columns_to_a_pre_existing_food_entries_table() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        # Simulates a deployment from before grams was the only way to log an amount.
        await connection.execute(
            text(
                """
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY,
                    email VARCHAR(255) UNIQUE,
                    username VARCHAR(120) UNIQUE,
                    password_hash VARCHAR(255),
                    display_name VARCHAR(120),
                    daily_calorie_goal INTEGER,
                    daily_protein_goal_g INTEGER,
                    daily_carbs_goal_g INTEGER,
                    daily_fat_goal_g INTEGER,
                    created_at DATETIME
                )
                """
            )
        )
        await connection.execute(
            text(
                "INSERT INTO users (id, email, username, password_hash, display_name, daily_calorie_goal, "
                "daily_protein_goal_g, daily_carbs_goal_g, daily_fat_goal_g, created_at) VALUES "
                "(1, 'a@b.com', 'ada', 'hash', 'Ada', 2000, 150, 200, 65, '2026-07-01 09:00:00')"
            )
        )
        await connection.execute(
            text(
                """
                CREATE TABLE food_entries (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER,
                    name VARCHAR(255),
                    brand VARCHAR(255),
                    barcode VARCHAR(64),
                    grams FLOAT,
                    calories_per_100g FLOAT,
                    protein_per_100g FLOAT,
                    carbs_per_100g FLOAT,
                    fat_per_100g FLOAT,
                    consumed_at DATE,
                    created_at DATETIME
                )
                """
            )
        )
        await connection.execute(
            text(
                "INSERT INTO food_entries "
                "(id, user_id, name, grams, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, "
                "consumed_at, created_at) "
                "VALUES (1, 1, 'Banana', 120, 89, 1.1, 22.8, 0.3, '2026-08-01', '2026-08-01 12:00:00')"
            )
        )

    await create_tables()

    async with engine.begin() as connection:
        columns = await connection.run_sync(lambda conn: {c["name"] for c in inspect(conn).get_columns("food_entries")})
        row = (
            await connection.execute(
                text("SELECT input_unit, input_amount, unit_to_grams FROM food_entries WHERE name = 'Banana'")
            )
        ).one()
    assert {"input_unit", "input_amount", "unit_to_grams"} <= columns
    assert row.input_unit == "g"
    assert row.input_amount == 120
    assert row.unit_to_grams == 1.0


async def test_create_tables_adds_meal_group_id_column_to_a_pre_existing_food_entries_table() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        # Simulates a deployment from before meal grouping existed.
        await connection.execute(
            text(
                """
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY,
                    email VARCHAR(255) UNIQUE,
                    username VARCHAR(120) UNIQUE,
                    password_hash VARCHAR(255),
                    display_name VARCHAR(120),
                    daily_calorie_goal INTEGER,
                    daily_protein_goal_g INTEGER,
                    daily_carbs_goal_g INTEGER,
                    daily_fat_goal_g INTEGER,
                    created_at DATETIME
                )
                """
            )
        )
        await connection.execute(
            text(
                "INSERT INTO users (id, email, username, password_hash, display_name, daily_calorie_goal, "
                "daily_protein_goal_g, daily_carbs_goal_g, daily_fat_goal_g, created_at) VALUES "
                "(1, 'a@b.com', 'ada', 'hash', 'Ada', 2000, 150, 200, 65, '2026-07-01 09:00:00')"
            )
        )
        await connection.execute(
            text(
                """
                CREATE TABLE food_entries (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER,
                    name VARCHAR(255),
                    grams FLOAT,
                    input_unit VARCHAR(16) DEFAULT 'g',
                    input_amount FLOAT,
                    unit_to_grams FLOAT DEFAULT 1.0,
                    calories_per_100g FLOAT,
                    protein_per_100g FLOAT,
                    carbs_per_100g FLOAT,
                    fat_per_100g FLOAT,
                    consumed_at DATE,
                    created_at DATETIME
                )
                """
            )
        )
        await connection.execute(
            text(
                "INSERT INTO food_entries "
                "(id, user_id, name, grams, input_unit, input_amount, unit_to_grams, calories_per_100g, "
                "protein_per_100g, carbs_per_100g, fat_per_100g, consumed_at, created_at) "
                "VALUES (1, 1, 'Banana', 120, 'g', 120, 1.0, 89, 1.1, 22.8, 0.3, '2026-08-01', '2026-08-01 12:00:00')"
            )
        )

    await create_tables()

    async with engine.begin() as connection:
        columns = await connection.run_sync(lambda conn: {c["name"] for c in inspect(conn).get_columns("food_entries")})
    assert "meal_group_id" in columns


async def test_create_tables_adds_deleted_at_column_to_a_pre_existing_food_entries_table() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        # Simulates a deployment from before soft delete existed.
        await connection.execute(
            text(
                """
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY,
                    email VARCHAR(255) UNIQUE,
                    username VARCHAR(120) UNIQUE,
                    password_hash VARCHAR(255),
                    display_name VARCHAR(120),
                    daily_calorie_goal INTEGER,
                    daily_protein_goal_g INTEGER,
                    daily_carbs_goal_g INTEGER,
                    daily_fat_goal_g INTEGER,
                    created_at DATETIME
                )
                """
            )
        )
        await connection.execute(
            text(
                "INSERT INTO users (id, email, username, password_hash, display_name, daily_calorie_goal, "
                "daily_protein_goal_g, daily_carbs_goal_g, daily_fat_goal_g, created_at) VALUES "
                "(1, 'a@b.com', 'ada', 'hash', 'Ada', 2000, 150, 200, 65, '2026-07-01 09:00:00')"
            )
        )
        await connection.execute(
            text(
                """
                CREATE TABLE food_entries (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER,
                    name VARCHAR(255),
                    grams FLOAT,
                    input_unit VARCHAR(16) DEFAULT 'g',
                    input_amount FLOAT,
                    unit_to_grams FLOAT DEFAULT 1.0,
                    calories_per_100g FLOAT,
                    protein_per_100g FLOAT,
                    carbs_per_100g FLOAT,
                    fat_per_100g FLOAT,
                    consumed_at DATE,
                    created_at DATETIME,
                    meal_group_id CHAR(32)
                )
                """
            )
        )
        await connection.execute(
            text(
                "INSERT INTO food_entries "
                "(id, user_id, name, grams, input_unit, input_amount, unit_to_grams, calories_per_100g, "
                "protein_per_100g, carbs_per_100g, fat_per_100g, consumed_at, created_at) "
                "VALUES (1, 1, 'Banana', 120, 'g', 120, 1.0, 89, 1.1, 22.8, 0.3, '2026-08-01', '2026-08-01 12:00:00')"
            )
        )

    await create_tables()

    async with engine.begin() as connection:
        columns = await connection.run_sync(lambda conn: {c["name"] for c in inspect(conn).get_columns("food_entries")})
    assert "deleted_at" in columns


async def test_create_tables_backfills_a_group_of_one_for_every_ungrouped_entry() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)

        users = Base.metadata.tables["users"]
        food_entries = Base.metadata.tables["food_entries"]
        user_id = uuid7()
        await connection.execute(
            users.insert(),
            {
                "id": user_id,
                "email": "a@b.com",
                "username": None,
                "password_hash": "hash",
                "display_name": "Ada",
                "created_at": datetime(2026, 7, 1, 9, tzinfo=UTC),
            },
        )
        # one live ungrouped entry, one soft-deleted ungrouped entry - both need backfilling, and
        # each needs its own group, not a shared one.
        live_entry_id = uuid7()
        deleted_entry_id = uuid7()
        for entry_id, deleted_at in [(live_entry_id, None), (deleted_entry_id, datetime(2026, 8, 2, tzinfo=UTC))]:
            await connection.execute(
                food_entries.insert(),
                {
                    "id": entry_id,
                    "user_id": user_id,
                    "name": "Banana",
                    "grams": 120,
                    "input_unit": "g",
                    "input_amount": 120,
                    "unit_to_grams": 1.0,
                    "calories_per_100g": 89,
                    "protein_per_100g": 1.1,
                    "carbs_per_100g": 22.8,
                    "fat_per_100g": 0.3,
                    "consumed_at": datetime(2026, 8, 1, 12, tzinfo=UTC),
                    "created_at": datetime(2026, 8, 1, 12, tzinfo=UTC),
                    "meal_group_id": None,
                    "deleted_at": deleted_at,
                },
            )

    await create_tables()

    async with engine.begin() as connection:
        food_entries = Base.metadata.tables["food_entries"]
        meal_groups = Base.metadata.tables["meal_groups"]
        rows = (await connection.execute(select(food_entries.c.id, food_entries.c.meal_group_id))).all()
        group_ids_by_entry = {row.id: row.meal_group_id for row in rows}
        all_groups = (await connection.execute(select(meal_groups.c.id))).all()

    assert group_ids_by_entry[live_entry_id] is not None
    assert group_ids_by_entry[deleted_entry_id] is not None
    assert group_ids_by_entry[live_entry_id] != group_ids_by_entry[deleted_entry_id]
    assert len(all_groups) == 2


async def test_create_tables_adds_unit_columns_to_a_pre_existing_product_cache_table() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.execute(
            text(
                """
                CREATE TABLE product_cache (
                    barcode VARCHAR(64) PRIMARY KEY,
                    name VARCHAR(255),
                    brand VARCHAR(255),
                    calories_per_100g FLOAT,
                    protein_per_100g FLOAT,
                    carbs_per_100g FLOAT,
                    fat_per_100g FLOAT,
                    fetched_at DATETIME
                )
                """
            )
        )

    await create_tables()

    async with engine.begin() as connection:
        columns = await connection.run_sync(
            lambda conn: {c["name"] for c in inspect(conn).get_columns("product_cache")}
        )
    assert {"suggested_unit", "unit_to_grams"} <= columns


async def test_backfill_goal_versions_skips_a_user_who_already_has_one() -> None:
    # Simulates a user who already got a goal_versions row through some other path (e.g. the
    # uuid-id migration's own backfill, or simply using the app) before the legacy columns were
    # dropped - the general column-presence backfill must not create a second, duplicate version.
    has_version_id = uuid7()
    needs_backfill_id = uuid7()
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.execute(
            text(
                """
                CREATE TABLE users (
                    id CHAR(32) PRIMARY KEY,
                    email VARCHAR(255) UNIQUE,
                    username VARCHAR(120) UNIQUE,
                    password_hash VARCHAR(255),
                    display_name VARCHAR(120),
                    daily_calorie_goal INTEGER,
                    daily_protein_goal_g INTEGER,
                    daily_carbs_goal_g INTEGER,
                    daily_fat_goal_g INTEGER,
                    created_at DATETIME
                )
                """
            )
        )
        for user_id, email in [(has_version_id, "a@b.com"), (needs_backfill_id, "c@d.com")]:
            await connection.execute(
                text(
                    "INSERT INTO users (id, email, username, password_hash, display_name, daily_calorie_goal, "
                    "daily_protein_goal_g, daily_carbs_goal_g, daily_fat_goal_g, created_at) VALUES "
                    "(:id, :email, NULL, 'hash', 'Ada', 2200, 160, 220, 70, '2026-07-01 09:00:00')"
                ),
                {"id": user_id.hex, "email": email},
            )
        goal_versions = Base.metadata.tables["goal_versions"]
        await connection.run_sync(lambda conn: goal_versions.create(conn))
        await connection.execute(
            goal_versions.insert(),
            {
                "id": uuid7(),
                "user_id": has_version_id,
                "effective_date": date(2026, 6, 1),
                "daily_calorie_goal": 1999,
                "daily_protein_goal_g": 100,
                "daily_carbs_goal_g": 100,
                "daily_fat_goal_g": 50,
                "created_at": datetime(2026, 6, 1, tzinfo=UTC),
                "updated_at": None,
            },
        )

    await create_tables()

    async with engine.begin() as connection:
        goal_versions = Base.metadata.tables["goal_versions"]
        rows = (await connection.execute(select(goal_versions))).all()
    rows_by_user = {row.user_id: row for row in rows}
    assert len(rows) == 2
    # untouched - not overwritten with the legacy-column values
    assert rows_by_user[has_version_id].daily_calorie_goal == 1999
    # backfilled fresh from the legacy columns
    assert rows_by_user[needs_backfill_id].daily_calorie_goal == 2200


async def test_create_tables_backfills_goal_versions_and_drops_legacy_columns() -> None:
    user_id = uuid7()
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        # Simulates a deployment from before goals were versioned - users.id is already UUID-shaped
        # (post uuid-migration) so this isolates just the goal-versions backfill/drop.
        await connection.execute(
            text(
                """
                CREATE TABLE users (
                    id CHAR(32) PRIMARY KEY,
                    email VARCHAR(255) UNIQUE,
                    username VARCHAR(120) UNIQUE,
                    password_hash VARCHAR(255),
                    display_name VARCHAR(120),
                    daily_calorie_goal INTEGER,
                    daily_protein_goal_g INTEGER,
                    daily_carbs_goal_g INTEGER,
                    daily_fat_goal_g INTEGER,
                    created_at DATETIME
                )
                """
            )
        )
        await connection.execute(
            text(
                "INSERT INTO users (id, email, username, password_hash, display_name, daily_calorie_goal, "
                "daily_protein_goal_g, daily_carbs_goal_g, daily_fat_goal_g, created_at) VALUES "
                "(:id, 'a@b.com', 'ada', 'hash', 'Ada', 2200, 160, 220, 70, '2026-07-01 09:00:00')"
            ),
            {"id": user_id.hex},
        )

    await create_tables()

    async with engine.begin() as connection:
        columns = await connection.run_sync(lambda conn: {c["name"] for c in inspect(conn).get_columns("users")})
        goal_versions = Base.metadata.tables["goal_versions"]
        rows = (await connection.execute(select(goal_versions))).all()

    assert not {"daily_calorie_goal", "daily_protein_goal_g", "daily_carbs_goal_g", "daily_fat_goal_g"} & columns
    assert len(rows) == 1
    assert rows[0].user_id == user_id
    assert rows[0].effective_date.isoformat() == "2026-07-01"
    assert rows[0].daily_calorie_goal == 2200
    assert rows[0].daily_protein_goal_g == 160
    assert rows[0].daily_carbs_goal_g == 220
    assert rows[0].daily_fat_goal_g == 70

    # idempotent: running again must not duplicate the backfilled version or error on the
    # already-dropped columns.
    await create_tables()
    async with engine.begin() as connection:
        rows_after_second_run = (await connection.execute(select(goal_versions))).all()
    assert len(rows_after_second_run) == 1


def _old_schema_ddl() -> list[str]:
    return [
        """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            email VARCHAR(255) UNIQUE,
            username VARCHAR(120) UNIQUE,
            password_hash VARCHAR(255),
            display_name VARCHAR(120),
            daily_calorie_goal INTEGER,
            daily_protein_goal_g INTEGER,
            daily_carbs_goal_g INTEGER,
            daily_fat_goal_g INTEGER,
            created_at DATETIME
        )
        """,
        """
        CREATE TABLE meal_groups (
            id CHAR(32) PRIMARY KEY,
            user_id INTEGER,
            name VARCHAR(120),
            created_at DATETIME,
            updated_at DATETIME
        )
        """,
        """
        CREATE TABLE food_entries (
            id INTEGER PRIMARY KEY,
            user_id INTEGER,
            name VARCHAR(255),
            brand VARCHAR(255),
            barcode VARCHAR(64),
            grams FLOAT,
            input_unit VARCHAR(16),
            input_amount FLOAT,
            unit_to_grams FLOAT,
            calories_per_100g FLOAT,
            protein_per_100g FLOAT,
            carbs_per_100g FLOAT,
            fat_per_100g FLOAT,
            consumed_at DATE,
            created_at DATETIME,
            meal_group_id CHAR(32)
        )
        """,
    ]


async def test_migrate_users_and_entries_to_uuid_ids_end_to_end() -> None:
    """The real dry-run: several users, each with many entries spread across many days and one
    meal group, all built on the exact pre-migration schema (int ids, date-only consumed_at,
    int-keyed meal_groups.user_id) - then runs the real migration and checks every relationship
    survived correctly, nothing was lost, and nothing got cross-linked to the wrong user."""
    num_users = 4
    days_per_user = 15
    entries_per_day = 1  # 4 * 15 * 1 = 60 entries total

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        for statement in _old_schema_ddl():
            await connection.execute(text(statement))

        for user_id in range(1, num_users + 1):
            await connection.execute(
                text(
                    "INSERT INTO users (id, email, username, password_hash, display_name, daily_calorie_goal, "
                    "daily_protein_goal_g, daily_carbs_goal_g, daily_fat_goal_g, created_at) VALUES "
                    "(:id, :email, :username, 'hash', :display_name, 2000, 150, 200, 65, '2026-07-01 09:00:00')"
                ),
                {
                    "id": user_id,
                    "email": f"user{user_id}@example.com",
                    "username": f"user{user_id}",
                    "display_name": f"User {user_id}",
                },
            )

        # one meal group, owned by user 1, over its first two entries of the first day
        group_id_hex = "1" * 32
        await connection.execute(
            text(
                "INSERT INTO meal_groups (id, user_id, name, created_at, updated_at) VALUES "
                "(:id, 1, 'Breakfast', '2026-07-01 08:00:00', NULL)"
            ),
            {"id": group_id_hex},
        )

        entry_id = 1
        entry_ids_by_user: dict[int, list[int]] = {user_id: [] for user_id in range(1, num_users + 1)}
        for user_id in range(1, num_users + 1):
            for day_offset in range(days_per_user):
                consumed_at = f"2026-07-{day_offset + 1:02d}"
                for meal_index in range(entries_per_day):
                    in_first_group = user_id == 1 and day_offset == 0 and meal_index < entries_per_day
                    await connection.execute(
                        text(
                            "INSERT INTO food_entries "
                            "(id, user_id, name, grams, input_unit, input_amount, unit_to_grams, "
                            "calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, consumed_at, "
                            "created_at, meal_group_id) "
                            "VALUES (:id, :user_id, :name, 100, 'g', 100, 1.0, 200, 10, 20, 5, :consumed_at, "
                            "'2026-07-01 12:00:00', :meal_group_id)"
                        ),
                        {
                            "id": entry_id,
                            "user_id": user_id,
                            "name": f"Food {entry_id}",
                            "consumed_at": consumed_at,
                            "meal_group_id": group_id_hex if in_first_group else None,
                        },
                    )
                    entry_ids_by_user[user_id].append(entry_id)
                    entry_id += 1

    total_entries = num_users * days_per_user * entries_per_day
    assert 50 <= total_entries <= 100
    assert 10 <= days_per_user <= 20

    await create_tables()

    async with engine.begin() as connection:
        user_rows = (await connection.execute(text("SELECT id, username FROM users"))).all()
        entry_rows = (
            await connection.execute(text("SELECT id, user_id, name, consumed_at, meal_group_id FROM food_entries"))
        ).all()
        group_rows = (await connection.execute(text("SELECT id, user_id, name FROM meal_groups"))).all()

    # every row survived the rebuild
    assert len(user_rows) == num_users
    assert len(entry_rows) == total_entries
    # every entry always belongs to a real group now - the one pre-existing "Breakfast" group plus
    # a fresh singleton backfilled for every other entry, which had none before the migration.
    assert len(group_rows) == total_entries

    # ids actually changed shape: 32-char UUID hex, not the original small integers
    for row in user_rows:
        assert len(row.id) == 32
    for row in entry_rows:
        assert len(row.id) == 32

    # every entry's user_id points at a real migrated user - no entry silently lost its owner or
    # got attached to a different one
    user_id_by_username = {row.username: row.id for row in user_rows}
    entries_by_new_user_id: dict[str, int] = {}
    for row in entry_rows:
        entries_by_new_user_id[row.user_id] = entries_by_new_user_id.get(row.user_id, 0) + 1
    for user_id in range(1, num_users + 1):
        new_id = user_id_by_username[f"user{user_id}"]
        assert entries_by_new_user_id[new_id] == days_per_user * entries_per_day

    # consumed_at was date-only before the migration - every row must now carry a real time (13:00)
    for row in entry_rows:
        assert "13:00:00" in row.consumed_at

    # the meal group's owner was remapped to the same migrated user id its entries now point to
    breakfast_group = next(row for row in group_rows if row.name == "Breakfast")
    assert breakfast_group.user_id == user_id_by_username["user1"]

    # every entry points at a real group, and none of the backfilled singletons collide
    entry_group_ids = [row.meal_group_id for row in entry_rows]
    assert all(group_id is not None for group_id in entry_group_ids)
    assert len(set(entry_group_ids)) == len(group_rows)

    # the goal-versions backfill ran after the uuid migration (it needs users.id already
    # UUID-shaped) and the legacy goal columns are gone from `users` afterward.
    async with engine.begin() as connection:
        goal_version_rows = (
            await connection.execute(text("SELECT user_id, effective_date, daily_calorie_goal FROM goal_versions"))
        ).all()
        remaining_user_columns = await connection.run_sync(
            lambda conn: {c["name"] for c in inspect(conn).get_columns("users")}
        )
    assert len(goal_version_rows) == num_users
    assert {row.user_id for row in goal_version_rows} == {row.id for row in user_rows}
    assert all(row.daily_calorie_goal == 2000 for row in goal_version_rows)
    assert all(row.effective_date == "2026-07-01" for row in goal_version_rows)
    assert not {"daily_calorie_goal", "daily_protein_goal_g", "daily_carbs_goal_g", "daily_fat_goal_g"} & (
        remaining_user_columns
    )
