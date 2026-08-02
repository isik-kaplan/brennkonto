import uuid
from datetime import date, datetime

import msgspec


class RegisterRequest(msgspec.Struct):
    email: str
    password: str
    display_name: str


class LoginRequest(msgspec.Struct):
    # Matched against either User.email or User.username - see controllers/auth.py.
    identifier: str
    password: str


class UpdateProfileRequest(msgspec.Struct):
    display_name: str
    username: str | None = None
    email: str | None = None


class UpdateGoalsRequest(msgspec.Struct):
    daily_calorie_goal: int
    daily_protein_goal_g: int
    daily_carbs_goal_g: int
    daily_fat_goal_g: int


class ChangePasswordRequest(msgspec.Struct):
    current_password: str
    new_password: str


class UserOut(msgspec.Struct):
    id: uuid.UUID
    email: str
    username: str | None
    display_name: str
    daily_calorie_goal: int
    daily_protein_goal_g: int
    daily_carbs_goal_g: int
    daily_fat_goal_g: int
    updated_at: datetime | None


class FoodSearchResultOut(msgspec.Struct):
    barcode: str
    name: str
    brand: str | None
    calories_per_100g: float
    protein_per_100g: float
    carbs_per_100g: float
    fat_per_100g: float
    suggested_unit: str = "g"
    unit_to_grams: float = 1.0


class CreateFoodEntryRequest(msgspec.Struct):
    name: str
    grams: float
    calories_per_100g: float
    protein_per_100g: float
    carbs_per_100g: float
    fat_per_100g: float
    consumed_at: datetime
    brand: str | None = None
    barcode: str | None = None
    input_unit: str = "g"
    # Defaults to `grams` in the controller when omitted - kept optional here so any direct API
    # caller that only sends `grams` still works.
    input_amount: float | None = None
    unit_to_grams: float = 1.0


class UpdateFoodEntryRequest(msgspec.Struct):
    grams: float
    consumed_at: datetime


class FoodEntryOut(msgspec.Struct):
    id: uuid.UUID
    name: str
    brand: str | None
    barcode: str | None
    grams: float
    input_unit: str
    input_amount: float
    unit_to_grams: float
    calories_per_100g: float
    protein_per_100g: float
    carbs_per_100g: float
    fat_per_100g: float
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    consumed_at: datetime
    created_at: datetime
    updated_at: datetime | None
    meal_group_id: uuid.UUID | None
    deleted_at: datetime | None


class MealGroupOut(msgspec.Struct):
    id: uuid.UUID
    name: str | None
    entry_ids: list[uuid.UUID]


class CreateMealGroupRequest(msgspec.Struct):
    entry_ids: list[uuid.UUID]
    name: str | None = None


class UpdateMealGroupRequest(msgspec.Struct):
    entry_ids: list[uuid.UUID] | None = None
    name: str | None = None


class DailyStatsOut(msgspec.Struct):
    date: date
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    calorie_goal: int
    protein_goal_g: int
    carbs_goal_g: int
    fat_goal_g: int
    entries: list[FoodEntryOut]


class RangeStatsPointOut(msgspec.Struct):
    period_label: str
    period_start: date
    period_end: date
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    days_logged: int


class RangeStatsOut(msgspec.Struct):
    points: list[RangeStatsPointOut]
    average_calories: float
    average_protein_g: float
    average_carbs_g: float
    average_fat_g: float
    total_calories: float
    days_in_range: int
    days_logged: int
