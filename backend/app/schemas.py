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
    email: str | None = None


class ChangePasswordRequest(msgspec.Struct):
    current_password: str
    new_password: str


class UserOut(msgspec.Struct):
    id: uuid.UUID
    email: str
    username: str | None
    display_name: str
    updated_at: datetime | None


class UpsertGoalRequest(msgspec.Struct):
    effective_date: date
    daily_calorie_goal: int
    daily_protein_goal_g: int
    daily_carbs_goal_g: int
    daily_fat_goal_g: int


class GoalVersionOut(msgspec.Struct):
    id: uuid.UUID
    effective_date: date
    # None only for the most recent version (by effective_date) - in effect indefinitely, until a
    # later version supersedes it. Every other version has a real end_date, the day before
    # whichever version starts next.
    end_date: date | None
    daily_calorie_goal: int
    daily_protein_goal_g: int
    daily_carbs_goal_g: int
    daily_fat_goal_g: int


class UpsertFavoriteRequest(msgspec.Struct):
    barcode: str
    name: str
    calories_per_100g: float
    protein_per_100g: float
    carbs_per_100g: float
    fat_per_100g: float
    brand: str | None = None
    # All three omitted (None) means "no default amount, always ask". Sending a fresh upsert with
    # these omitted clears a previously-set default, rather than leaving the old one in place.
    default_input_unit: str | None = None
    default_input_amount: float | None = None
    default_unit_to_grams: float | None = None


class FavoriteOut(msgspec.Struct):
    id: uuid.UUID
    barcode: str
    name: str
    brand: str | None
    calories_per_100g: float
    protein_per_100g: float
    carbs_per_100g: float
    fat_per_100g: float
    default_input_unit: str | None
    default_input_amount: float | None
    default_unit_to_grams: float | None


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
    # Set together with `grams` when the user retroactively edits how much they logged, so the
    # displayed amount ("2 count", "1.5 l") stays consistent with the canonical gram figure.
    # Omitted (None) on a time-only edit, which leaves the previously-logged amount untouched.
    input_amount: float | None = None


class MoveEntryToGroupRequest(msgspec.Struct):
    # None means "give this entry a fresh group of its own" - the drag-and-drop merge always
    # provides a real target group id; omitting it exists for API completeness/defensiveness.
    target_group_id: uuid.UUID | None = None


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


class HistoryFoodOut(msgspec.Struct):
    """A distinct food the user has logged before, deduplicated to its most recently logged
    instance - see app/controllers/history.py's history_foods for how the dedup key and
    `times_logged` are computed."""

    barcode: str
    name: str
    brand: str | None
    calories_per_100g: float
    protein_per_100g: float
    carbs_per_100g: float
    fat_per_100g: float
    suggested_unit: str
    unit_to_grams: float
    last_input_amount: float
    last_logged_at: datetime
    times_logged: int


class MealNameOut(msgspec.Struct):
    """A meal grouping name, aggregated across every past occurrence - the management-page
    counterpart to HistoryGroupOut, which only ever surfaces the most recent occurrence. See
    app/controllers/meal_names.py."""

    name: str
    times_logged: int
    last_logged_at: datetime
    # Ingredient names from the most recently logged occurrence only, for a quick preview - not
    # every occurrence's items, which could differ meal to meal.
    items: list[str]


class RenameMealNameRequest(msgspec.Struct):
    new_name: str


class HistoryGroupItemOut(msgspec.Struct):
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


class HistoryGroupOut(msgspec.Struct):
    """A previously-logged, named combo of foods (a "meal") - deduplicated by name to its most
    recently logged occurrence. See app/controllers/history.py's history_groups."""

    name: str
    items: list[HistoryGroupItemOut]
    calories: float
    last_logged_at: datetime
    times_logged: int


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
    calorie_goal: int


class RangeStatsOut(msgspec.Struct):
    points: list[RangeStatsPointOut]
    average_calories: float
    average_protein_g: float
    average_carbs_g: float
    average_fat_g: float
    total_calories: float
    days_in_range: int
    days_logged: int
