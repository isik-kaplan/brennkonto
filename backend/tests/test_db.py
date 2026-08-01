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
