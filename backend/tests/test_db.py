from sqlalchemy import inspect, text

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
        entry_rows = (await connection.execute(text("SELECT id, user_id, name, consumed_at FROM food_entries"))).all()
        group_rows = (await connection.execute(text("SELECT id, user_id FROM meal_groups"))).all()

    # every row survived the rebuild
    assert len(user_rows) == num_users
    assert len(entry_rows) == total_entries
    assert len(group_rows) == 1

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
    assert group_rows[0].user_id == user_id_by_username["user1"]
