from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FoodEntry, Meal, MealGroup
from app.schemas import MealItemOut, MealOut


def meal_key(name: str) -> str:
    # Case-insensitive, and lowercase rather than uppercase: "Straße" and "Strasse" are different
    # names, and only a lowercase comparison keeps them apart ("ß" uppercases to "SS").
    return name.strip().lower()


def item_from_entry(entry: FoodEntry) -> dict:
    """An entry's food and amount, the shape Meal.items stores."""
    return {
        "name": entry.name,
        "brand": entry.brand,
        "barcode": entry.barcode,
        "grams": entry.grams,
        "input_unit": entry.input_unit,
        "input_amount": entry.input_amount,
        "unit_to_grams": entry.unit_to_grams,
        "calories_per_100g": entry.calories_per_100g,
        "protein_per_100g": entry.protein_per_100g,
        "carbs_per_100g": entry.carbs_per_100g,
        "fat_per_100g": entry.fat_per_100g,
    }


async def meal_named(db_session: AsyncSession, user_id: UUID, name: str) -> Meal | None:
    key = meal_key(name)
    meals = await db_session.scalars(select(Meal).where(Meal.user_id == user_id))
    return next((meal for meal in meals if meal_key(meal.name) == key), None)


async def link_group_by_name(db_session: AsyncSession, group: MealGroup, name: str | None) -> None:
    """Names a group: links it to the meal called `name`, creating that meal - with the group's own
    foods as its items - if there's none yet. A blank name unlinks it."""
    if not name or not name.strip():
        group.meal_id = None
        return
    meal = await meal_named(db_session, group.user_id, name)
    if meal is None:
        entries = await db_session.scalars(
            select(FoodEntry)
            .where(FoodEntry.meal_group_id == group.id, FoodEntry.deleted_at.is_(None))
            .order_by(FoodEntry.consumed_at, FoodEntry.id)
        )
        meal = Meal(user_id=group.user_id, name=name.strip(), items=[item_from_entry(entry) for entry in entries])
        db_session.add(meal)
        await db_session.flush()  # assigns meal.id so it can be used as a FK value below
    group.meal_id = meal.id


async def meals_out(db_session: AsyncSession, meals: list[Meal]) -> list[MealOut]:
    """Each meal with its foods and how often it's been eaten: its linked groups that still have a
    live entry. A group whose entries were all deleted counts for nothing until one is restored."""
    if not meals:
        return []
    rows = await db_session.execute(
        select(MealGroup.meal_id, MealGroup.id, FoodEntry.consumed_at)
        # On food_entries.meal_group_id, the only foreign key between the two.
        .join(FoodEntry)
        .where(MealGroup.meal_id.in_([meal.id for meal in meals]), FoodEntry.deleted_at.is_(None))
    )
    groups_by_meal: dict[UUID, set[UUID]] = {}
    last_by_meal = {}
    for meal_id, group_id, consumed_at in rows:
        groups_by_meal.setdefault(meal_id, set()).add(group_id)
        last_by_meal[meal_id] = max(last_by_meal.get(meal_id, consumed_at), consumed_at)
    return [meal_out(meal, len(groups_by_meal.get(meal.id, ())), last_by_meal.get(meal.id)) for meal in meals]


def meal_out(meal: Meal, times_logged: int, last_logged_at) -> MealOut:
    items = [MealItemOut(**item) for item in meal.items]
    return MealOut(
        id=meal.id,
        name=meal.name,
        items=items,
        calories=sum(item.grams * item.calories_per_100g / 100 for item in items),
        protein_g=sum(item.grams * item.protein_per_100g / 100 for item in items),
        carbs_g=sum(item.grams * item.carbs_per_100g / 100 for item in items),
        fat_g=sum(item.grams * item.fat_per_100g / 100 for item in items),
        times_logged=times_logged,
        last_logged_at=last_logged_at,
    )
