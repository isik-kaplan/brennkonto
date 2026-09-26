from datetime import date
from uuid import UUID

from app.models import Favorite, FoodEntry, GoalVersion, MealGroup, SavedMeal, User
from app.schemas import (
    FavoriteOut,
    FoodEntryOut,
    GoalVersionOut,
    HistoryGroupItemOut,
    MealGroupOut,
    SavedMealOut,
    UserOut,
)


def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        updated_at=user.updated_at,
    )


def goal_version_out(version: GoalVersion, end_date: date | None) -> GoalVersionOut:
    return GoalVersionOut(
        id=version.id,
        effective_date=version.effective_date,
        end_date=end_date,
        daily_calorie_goal=version.daily_calorie_goal,
        daily_protein_goal_g=version.daily_protein_goal_g,
        daily_carbs_goal_g=version.daily_carbs_goal_g,
        daily_fat_goal_g=version.daily_fat_goal_g,
    )


def favorite_out(favorite: Favorite) -> FavoriteOut:
    return FavoriteOut(
        id=favorite.id,
        barcode=favorite.barcode,
        name=favorite.name,
        brand=favorite.brand,
        calories_per_100g=favorite.calories_per_100g,
        protein_per_100g=favorite.protein_per_100g,
        carbs_per_100g=favorite.carbs_per_100g,
        fat_per_100g=favorite.fat_per_100g,
        default_input_unit=favorite.default_input_unit,
        default_input_amount=favorite.default_input_amount,
        default_unit_to_grams=favorite.default_unit_to_grams,
    )


def entry_out(entry: FoodEntry) -> FoodEntryOut:
    return FoodEntryOut(
        id=entry.id,
        name=entry.name,
        brand=entry.brand,
        barcode=entry.barcode,
        grams=entry.grams,
        input_unit=entry.input_unit,
        input_amount=entry.input_amount,
        unit_to_grams=entry.unit_to_grams,
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
        updated_at=entry.updated_at,
        meal_group_id=entry.meal_group_id,
        deleted_at=entry.deleted_at,
    )


def meal_group_out(group: MealGroup, entry_ids: list[UUID]) -> MealGroupOut:
    return MealGroupOut(id=group.id, name=group.name, entry_ids=entry_ids)


def saved_meal_items_out(meal: SavedMeal) -> list[HistoryGroupItemOut]:
    return [HistoryGroupItemOut(**item) for item in meal.items]


def saved_meal_out(meal: SavedMeal) -> SavedMealOut:
    items = saved_meal_items_out(meal)
    return SavedMealOut(
        id=meal.id,
        name=meal.name,
        items=items,
        calories=sum(item.grams * item.calories_per_100g / 100 for item in items),
        protein_g=sum(item.grams * item.protein_per_100g / 100 for item in items),
        carbs_g=sum(item.grams * item.carbs_per_100g / 100 for item in items),
        fat_g=sum(item.grams * item.fat_per_100g / 100 for item in items),
    )
