from datetime import date

from hypothesis import given
from hypothesis import strategies as st

from app.models import FoodEntry


macro_values = st.floats(min_value=0, max_value=1000, allow_nan=False, allow_infinity=False)
grams_values = st.floats(min_value=0, max_value=5000, allow_nan=False, allow_infinity=False)


@given(grams=grams_values, per_100g=macro_values)
def test_calories_scales_linearly_with_grams(grams: float, per_100g: float) -> None:
    entry = FoodEntry(grams=grams, calories_per_100g=per_100g, protein_per_100g=0, carbs_per_100g=0, fat_per_100g=0)
    assert entry.calories == grams * per_100g / 100


@given(grams=grams_values, per_100g=macro_values)
def test_protein_scales_linearly_with_grams(grams: float, per_100g: float) -> None:
    entry = FoodEntry(grams=grams, calories_per_100g=0, protein_per_100g=per_100g, carbs_per_100g=0, fat_per_100g=0)
    assert entry.protein_g == grams * per_100g / 100


@given(grams=grams_values, per_100g=macro_values)
def test_carbs_scales_linearly_with_grams(grams: float, per_100g: float) -> None:
    entry = FoodEntry(grams=grams, calories_per_100g=0, protein_per_100g=0, carbs_per_100g=per_100g, fat_per_100g=0)
    assert entry.carbs_g == grams * per_100g / 100


@given(grams=grams_values, per_100g=macro_values)
def test_fat_scales_linearly_with_grams(grams: float, per_100g: float) -> None:
    entry = FoodEntry(grams=grams, calories_per_100g=0, protein_per_100g=0, carbs_per_100g=0, fat_per_100g=per_100g)
    assert entry.fat_g == grams * per_100g / 100


def test_zero_grams_gives_zero_macros() -> None:
    entry = FoodEntry(
        grams=0,
        calories_per_100g=539,
        protein_per_100g=6.3,
        carbs_per_100g=57.5,
        fat_per_100g=30.9,
        consumed_at=date(2026, 8, 1),
    )
    assert entry.calories == entry.protein_g == entry.carbs_g == entry.fat_g == 0
