import uuid
from datetime import UTC, date, datetime

import pytest

from app.models import Favorite, FoodEntry, GoalVersion, MealGroup, User
from app.schemas import FavoriteOut, FoodEntryOut, GoalVersionOut, MealGroupOut, UserOut
from app.serializers import entry_out, favorite_out, goal_version_out, meal_group_out, user_out


# Every serializer is compared against a whole expected struct, so a field that's dropped, swapped
# or nulled can't slip past an assertion that only checked the others.

ID = uuid.UUID(int=7)
WHEN = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)
LATER = datetime(2026, 8, 2, 9, 30, tzinfo=UTC)


def test_user_out_maps_all_fields_and_never_the_password() -> None:
    user = User(id=ID, email="a@b.com", username="ada", password_hash="hashed", display_name="Ada", updated_at=LATER)
    assert user_out(user) == UserOut(id=ID, email="a@b.com", username="ada", display_name="Ada", updated_at=LATER)
    assert not hasattr(user_out(user), "password_hash")


def test_goal_version_out_maps_all_fields() -> None:
    version = GoalVersion(
        id=ID,
        user_id=ID,
        effective_date=date(2026, 8, 1),
        daily_calorie_goal=2000,
        daily_protein_goal_g=150,
        daily_carbs_goal_g=200,
        daily_fat_goal_g=65,
    )
    assert goal_version_out(version, date(2026, 8, 31)) == GoalVersionOut(
        id=ID,
        effective_date=date(2026, 8, 1),
        end_date=date(2026, 8, 31),
        daily_calorie_goal=2000,
        daily_protein_goal_g=150,
        daily_carbs_goal_g=200,
        daily_fat_goal_g=65,
    )


def test_favorite_out_maps_all_fields() -> None:
    favorite = Favorite(
        id=ID,
        user_id=ID,
        barcode="123",
        name="Oats",
        brand="Kölln",
        calories_per_100g=380,
        protein_per_100g=13,
        carbs_per_100g=60,
        fat_per_100g=7,
        default_input_unit="g",
        default_input_amount=60,
        default_unit_to_grams=1,
    )
    assert favorite_out(favorite) == FavoriteOut(
        id=ID,
        barcode="123",
        name="Oats",
        brand="Kölln",
        calories_per_100g=380,
        protein_per_100g=13,
        carbs_per_100g=60,
        fat_per_100g=7,
        default_input_unit="g",
        default_input_amount=60,
        default_unit_to_grams=1,
    )


def test_entry_out_maps_fields_and_computed_macros() -> None:
    group_id = uuid.UUID(int=9)
    entry = FoodEntry(
        id=ID,
        user_id=ID,
        name="Banana",
        brand="Chiquita",
        barcode="123",
        grams=120,
        input_unit="count",
        input_amount=2,
        unit_to_grams=60,
        calories_per_100g=89,
        protein_per_100g=1.1,
        carbs_per_100g=22.8,
        fat_per_100g=0.3,
        consumed_at=WHEN,
        created_at=WHEN,
        updated_at=LATER,
        meal_group_id=group_id,
        deleted_at=LATER,
    )
    assert entry_out(entry) == FoodEntryOut(
        id=ID,
        name="Banana",
        brand="Chiquita",
        barcode="123",
        grams=120,
        input_unit="count",
        input_amount=2,
        unit_to_grams=60,
        calories_per_100g=89,
        protein_per_100g=1.1,
        carbs_per_100g=22.8,
        fat_per_100g=0.3,
        calories=pytest.approx(106.8),
        protein_g=pytest.approx(1.32),
        carbs_g=pytest.approx(27.36),
        fat_g=pytest.approx(0.36),
        consumed_at=WHEN,
        created_at=WHEN,
        updated_at=LATER,
        meal_group_id=group_id,
        deleted_at=LATER,
    )


def test_meal_group_out_maps_all_fields() -> None:
    entry_ids = [uuid.UUID(int=1), uuid.UUID(int=2)]
    meal_id = uuid.UUID(int=8)
    group = MealGroup(id=ID, user_id=ID, meal_id=meal_id)
    assert meal_group_out(group, "Breakfast", entry_ids) == MealGroupOut(
        id=ID, meal_id=meal_id, name="Breakfast", entry_ids=entry_ids
    )
