from sqlalchemy import inspect, text

from app.db import Base, create_tables, engine


async def test_create_tables_is_idempotent() -> None:
    await create_tables()
    await create_tables()  # username column already exists the second time - must not raise


async def test_create_tables_adds_username_column_to_a_pre_existing_users_table() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        # Simulates a deployment from before the `username` column existed on the model.
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

    await create_tables()

    async with engine.begin() as connection:
        columns = await connection.run_sync(lambda conn: {c["name"] for c in inspect(conn).get_columns("users")})
    assert "username" in columns


async def test_create_tables_adds_unit_input_columns_to_a_pre_existing_food_entries_table() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        # Simulates a deployment from before grams was the only way to log an amount.
        await connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
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
                text("SELECT input_unit, input_amount, unit_to_grams FROM food_entries WHERE id = 1")
            )
        ).one()
    assert {"input_unit", "input_amount", "unit_to_grams"} <= columns
    assert row.input_unit == "g"
    assert row.input_amount == 120
    assert row.unit_to_grams == 1.0


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
