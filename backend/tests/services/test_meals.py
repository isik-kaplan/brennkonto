import uuid
from datetime import UTC, datetime

from app.db import session_factory
from app.models import FoodEntry, Meal, MealGroup, User
from app.services.meals import link_group_by_name, meals_out


def _entry(user: User, group: MealGroup, n: int, name: str, day: int, hour: int) -> FoodEntry:
    return FoodEntry(
        id=uuid.UUID(int=n),
        user_id=user.id,
        meal_group_id=group.id,
        name=name,
        grams=100,
        input_amount=100,
        calories_per_100g=100,
        protein_per_100g=1,
        carbs_per_100g=1,
        fat_per_100g=1,
        consumed_at=datetime(2026, 8, day, hour, tzinfo=UTC),
    )


async def test_naming_a_group_snapshots_only_its_own_foods_in_time_then_id_order() -> None:
    async with session_factory() as session:
        user = User(email="a@b.com", password_hash="x", display_name="A")
        session.add(user)
        await session.flush()
        group, other = MealGroup(user_id=user.id), MealGroup(user_id=user.id)
        session.add_all([group, other])
        await session.flush()
        # Later but with the smallest id; then two at the same time, added in reverse id order.
        session.add(_entry(user, group, 1, "Dessert", 1, 20))
        session.add(_entry(user, group, 3, "Main", 1, 19))
        session.add(_entry(user, group, 2, "Starter", 1, 19))
        session.add(_entry(user, other, 4, "Someone else's snack", 1, 19))
        await session.flush()

        await link_group_by_name(session, group, "Dinner")
        meal = await session.get(Meal, group.meal_id)
    assert [item["name"] for item in meal.items] == ["Starter", "Main", "Dessert"]


async def test_meals_out_counts_each_time_a_meal_was_eaten_and_the_latest() -> None:
    async with session_factory() as session:
        user = User(email="a@b.com", password_hash="x", display_name="A")
        session.add(user)
        await session.flush()
        meal = Meal(user_id=user.id, name="Dinner", items=[])
        session.add(meal)
        await session.flush()
        latest, earlier, unrelated = (
            MealGroup(user_id=user.id, meal_id=meal.id),
            MealGroup(user_id=user.id, meal_id=meal.id),
            MealGroup(user_id=user.id),
        )
        session.add_all([latest, earlier, unrelated])
        await session.flush()
        # The latest time is added first, so "the last row seen" isn't "the latest".
        session.add(_entry(user, latest, 1, "Main", 9, 19))
        session.add(_entry(user, earlier, 2, "Main", 1, 19))
        session.add(_entry(user, earlier, 3, "Side", 1, 19))
        session.add(_entry(user, unrelated, 4, "Snack", 20, 19))
        await session.flush()

        [out] = await meals_out(session, [meal])
    assert out.times_logged == 2
    assert out.last_logged_at.day == 9
