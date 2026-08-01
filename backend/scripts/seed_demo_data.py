"""Seed a demo account with ~2 years of realistic daily food logs, for exercising the
weekly/monthly/custom-range aggregates against a non-trivial amount of data.

Usage (inside the backend environment, with the app's DATABASE_PATH already configured):

    uv run python scripts/seed_demo_data.py [email] [password] [display_name] [days]

Idempotent-ish: re-running with the same email adds another account error (users are unique by
email) - use a fresh email or clear the row first if re-seeding.
"""

import asyncio
import random
import sys
from datetime import date, timedelta

from app.auth import hash_password
from app.db import Base, engine, session_factory
from app.models import FoodEntry, User


# (name, brand, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g)
FOOD_POOL = [
    ("Chicken breast", None, 165, 31.0, 0.0, 3.6),
    ("White rice", None, 130, 2.7, 28.0, 0.3),
    ("Broccoli", None, 34, 2.8, 7.0, 0.4),
    ("Oats", "Quaker", 379, 13.2, 67.7, 6.5),
    ("Banana", None, 89, 1.1, 22.8, 0.3),
    ("Whole milk", None, 61, 3.2, 4.8, 3.3),
    ("Eggs", None, 155, 13.0, 1.1, 11.0),
    ("Salmon", None, 208, 20.0, 0.0, 13.0),
    ("Greek yogurt", "Fage", 59, 10.0, 3.6, 0.4),
    ("Almonds", None, 579, 21.0, 22.0, 50.0),
    ("Sweet potato", None, 86, 1.6, 20.0, 0.1),
    ("Ground beef 85/15", None, 250, 26.0, 0.0, 17.0),
    ("Pasta", "Barilla", 131, 5.0, 25.0, 1.1),
    ("Avocado", None, 160, 2.0, 8.5, 14.7),
    ("Apple", None, 52, 0.3, 14.0, 0.2),
    ("Peanut butter", "Skippy", 588, 25.0, 20.0, 50.0),
    ("Nutella", "Ferrero", 539, 6.3, 57.5, 30.9),
    ("Whole wheat bread", None, 247, 13.0, 41.0, 3.4),
    ("Cheddar cheese", None, 403, 25.0, 1.3, 33.0),
    ("Black beans", None, 132, 8.9, 24.0, 0.5),
]


def _generate_day(target_calories: float) -> list[tuple[str, str | None, float, float, float, float, float]]:
    entries = []
    running_calories = 0.0
    meal_count = random.randint(3, 5)
    for _ in range(meal_count):
        name, brand, cal100, protein100, carbs100, fat100 = random.choice(FOOD_POOL)
        grams = round(random.uniform(60, 280))
        calories = cal100 * grams / 100
        entries.append((name, brand, grams, cal100, protein100, carbs100, fat100))
        running_calories += calories
        if running_calories >= target_calories and len(entries) >= 2:
            break
    return entries


async def seed(email: str, password: str, display_name: str, days: int) -> None:
    random.seed(42)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        user = User(
            email=email,
            password_hash=hash_password(password),
            display_name=display_name,
            daily_calorie_goal=2200,
            daily_protein_goal_g=160,
            daily_carbs_goal_g=220,
            daily_fat_goal_g=70,
        )
        session.add(user)
        await session.flush()

        today = date.today()
        total_entries = 0
        for day_offset in range(days, -1, -1):
            day = today - timedelta(days=day_offset)
            # a handful of realistic gaps - nobody logs every single day for two years straight
            if random.random() < 0.05:
                continue

            target = max(1200, random.gauss(2200, 350))
            for name, brand, grams, cal100, protein100, carbs100, fat100 in _generate_day(target):
                session.add(
                    FoodEntry(
                        user_id=user.id,
                        name=name,
                        brand=brand,
                        barcode=None,
                        grams=grams,
                        calories_per_100g=cal100,
                        protein_per_100g=protein100,
                        carbs_per_100g=carbs100,
                        fat_per_100g=fat100,
                        consumed_at=day,
                    )
                )
                total_entries += 1

            if day_offset % 60 == 0:
                await session.commit()

        await session.commit()

    print(f"Seeded {email} with {total_entries} entries across {days} days.")


if __name__ == "__main__":
    email = sys.argv[1] if len(sys.argv) > 1 else "history@brennkonto.local"
    password = sys.argv[2] if len(sys.argv) > 2 else "two-years-of-oatmeal"
    display_name = sys.argv[3] if len(sys.argv) > 3 else "History Demo"
    days = int(sys.argv[4]) if len(sys.argv) > 4 else 730
    asyncio.run(seed(email, password, display_name, days))
