from datetime import UTC, date, datetime

from app.models import FoodEntry, GoalVersion, User
from app.serializers import entry_out, goal_version_out, user_out


def test_user_out_maps_all_fields() -> None:
    user = User(
        id=1,
        email="a@b.com",
        username="ada",
        password_hash="hashed",
        display_name="Ada",
    )
    out = user_out(user)
    assert out.id == 1
    assert out.email == "a@b.com"
    assert out.username == "ada"
    assert out.display_name == "Ada"
    assert not hasattr(out, "password_hash")


def test_goal_version_out_maps_all_fields() -> None:
    version = GoalVersion(
        id=1,
        user_id=1,
        effective_date=date(2026, 8, 1),
        daily_calorie_goal=2000,
        daily_protein_goal_g=150,
        daily_carbs_goal_g=200,
        daily_fat_goal_g=65,
    )
    out = goal_version_out(version, date(2026, 8, 31))
    assert out.id == 1
    assert out.effective_date == date(2026, 8, 1)
    assert out.end_date == date(2026, 8, 31)
    assert out.daily_calorie_goal == 2000
    assert out.daily_protein_goal_g == 150
    assert out.daily_carbs_goal_g == 200
    assert out.daily_fat_goal_g == 65


def test_entry_out_maps_fields_and_computed_macros() -> None:
    entry = FoodEntry(
        id=7,
        user_id=1,
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
        consumed_at=date(2026, 8, 1),
        created_at=datetime(2026, 8, 1, 12, 0, tzinfo=UTC),
    )
    out = entry_out(entry)
    assert out.id == 7
    assert out.name == "Banana"
    assert out.brand == "Chiquita"
    assert out.barcode == "123"
    assert out.grams == 120
    assert out.input_unit == "count"
    assert out.input_amount == 2
    assert out.unit_to_grams == 60
    assert out.calories == 106.8
    assert out.protein_g == 1.32
    assert out.carbs_g == 27.36
    assert out.fat_g == 0.36
    assert out.consumed_at == date(2026, 8, 1)
