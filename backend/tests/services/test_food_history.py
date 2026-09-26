from datetime import UTC, datetime, timedelta

from app.db import session_factory
from app.models import FoodEntry, User
from app.services import food_history
from app.services.food_history import food_key, logged_foods_matching


def _entry(name: str, brand: str | None = None, barcode: str | None = None, **fields) -> FoodEntry:
    return FoodEntry(name=name, brand=brand, barcode=barcode, **fields)


def test_food_key_prefers_the_barcode() -> None:
    assert food_key(_entry("Nutella", "Ferrero", "301")) == "b:301"


def test_food_key_falls_back_to_trimmed_lowercased_name_and_brand() -> None:
    assert food_key(_entry("  Blueberry Muffin ", " Bakery ")) == "n:blueberry muffin|bakery"
    assert food_key(_entry("Muffin")) == "n:muffin|"


def test_food_key_folds_case_the_way_lowercase_does() -> None:
    # "ß" lowercases to itself but uppercases to "SS" - these are two different foods.
    assert food_key(_entry("Straße")) != food_key(_entry("Strasse"))
    assert food_key(_entry("Brot", "Straße")) != food_key(_entry("Brot", "Strasse"))


async def test_logged_foods_matching_only_scans_the_most_recent_window(monkeypatch) -> None:
    monkeypatch.setattr(food_history, "SCAN_LIMIT", 2)
    user = User(email="a@b.com", password_hash="x", display_name="A")
    start = datetime(2026, 8, 1, tzinfo=UTC)
    async with session_factory() as session:
        session.add(user)
        await session.flush()
        for offset, name in enumerate(["Oldest", "Middle", "Newest"]):
            session.add(
                FoodEntry(
                    user_id=user.id,
                    name=name,
                    grams=1,
                    input_amount=1,
                    calories_per_100g=1,
                    protein_per_100g=1,
                    carbs_per_100g=1,
                    fat_per_100g=1,
                    consumed_at=start + timedelta(days=offset),
                )
            )
        await session.commit()
        _, latest = await logged_foods_matching(session, user.id, "")
    assert [entry.name for entry in latest.values()] == ["Newest", "Middle"]
