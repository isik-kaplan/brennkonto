from app.models import FoodEntry, User
from app.schemas import FoodEntryOut, UserOut


def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        daily_calorie_goal=user.daily_calorie_goal,
        daily_protein_goal_g=user.daily_protein_goal_g,
        daily_carbs_goal_g=user.daily_carbs_goal_g,
        daily_fat_goal_g=user.daily_fat_goal_g,
    )


def entry_out(entry: FoodEntry) -> FoodEntryOut:
    return FoodEntryOut(
        id=entry.id,
        name=entry.name,
        brand=entry.brand,
        barcode=entry.barcode,
        grams=entry.grams,
        calories_per_100g=entry.calories_per_100g,
        protein_per_100g=entry.protein_per_100g,
        carbs_per_100g=entry.carbs_per_100g,
        fat_per_100g=entry.fat_per_100g,
        calories=entry.calories,
        protein_g=entry.protein_g,
        carbs_g=entry.carbs_g,
        fat_g=entry.fat_g,
        consumed_at=entry.consumed_at,
        created_at=entry.created_at,
    )
