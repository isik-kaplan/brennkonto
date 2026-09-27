from uuid import UUID

from litestar import Request, Router, delete, get, patch, post
from litestar.exceptions import NotFoundException, ValidationException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Meal, MealGroup, _utcnow
from app.schemas import MealOut, UpsertMealRequest
from app.services.meals import meal_key, meals_out


async def _get_owned_meal(db_session: AsyncSession, request: Request, meal_id: UUID) -> Meal:
    meal = await db_session.get(Meal, meal_id)
    if meal is None or meal.user_id != request.user.id:
        raise NotFoundException("No meal found with this id.")
    return meal


async def _validated(
    data: UpsertMealRequest, db_session: AsyncSession, request: Request, meal_id: UUID | None = None
) -> tuple[str, list[dict]]:
    name = data.name.strip()
    if not name:
        raise ValidationException("A meal needs a name.")
    if not data.items:
        raise ValidationException("A meal needs at least one food.")
    if any(item.input_amount <= 0 for item in data.items):
        raise ValidationException("Every food in a meal needs an amount above zero.")
    # Unique per user, case-insensitively - naming a group links it to a meal by name (see
    # app/services/meals.py's link_group_by_name), so two meals sharing one would be ambiguous.
    others = await db_session.scalars(select(Meal).where(Meal.user_id == request.user.id))
    if any(other.id != meal_id and meal_key(other.name) == meal_key(name) for other in others):
        raise ValidationException(f'You already have a meal called "{name}".')
    items = [
        {
            "name": item.name,
            "brand": item.brand,
            "barcode": item.barcode,
            # Same conversion the frontend uses when logging: unit_to_grams describes the food's
            # suggested unit, so an amount typed in grams is taken as-is.
            "grams": item.input_amount if item.input_unit == "g" else item.input_amount * item.unit_to_grams,
            "input_unit": item.input_unit,
            "input_amount": item.input_amount,
            "unit_to_grams": item.unit_to_grams,
            "calories_per_100g": item.calories_per_100g,
            "protein_per_100g": item.protein_per_100g,
            "carbs_per_100g": item.carbs_per_100g,
            "fat_per_100g": item.fat_per_100g,
        }
        for item in data.items
    ]
    return name, items


@get("/")
async def list_meals(db_session: AsyncSession, request: Request) -> list[MealOut]:
    meals = list(await db_session.scalars(select(Meal).where(Meal.user_id == request.user.id)))
    meals.sort(key=lambda meal: meal.name.lower())
    return await meals_out(db_session, meals)


@post("/")
async def create_meal(data: UpsertMealRequest, db_session: AsyncSession, request: Request) -> MealOut:
    name, items = await _validated(data, db_session, request)
    meal = Meal(user_id=request.user.id, name=name, items=items)
    db_session.add(meal)
    await db_session.commit()
    [out] = await meals_out(db_session, [meal])
    return out


@patch("/{meal_id:uuid}")
async def update_meal(meal_id: UUID, data: UpsertMealRequest, db_session: AsyncSession, request: Request) -> MealOut:
    # A rename is just this row: every time it was eaten is linked by id, so they follow it.
    meal = await _get_owned_meal(db_session, request, meal_id)
    meal.name, meal.items = await _validated(data, db_session, request, meal_id)
    meal.updated_at = _utcnow()
    await db_session.commit()
    [out] = await meals_out(db_session, [meal])
    return out


@delete("/{meal_id:uuid}")
async def delete_meal(meal_id: UUID, db_session: AsyncSession, request: Request) -> None:
    # Deletes the meal, never anything eaten: the groups it was logged as stay together in the log,
    # just unnamed. Unlinked explicitly - SQLite doesn't enforce the FK's ON DELETE SET NULL here.
    meal = await _get_owned_meal(db_session, request, meal_id)
    await db_session.execute(update(MealGroup).where(MealGroup.meal_id == meal.id).values(meal_id=None))
    await db_session.delete(meal)
    await db_session.commit()


meals_router = Router(path="/api/meals", route_handlers=[list_meals, create_meal, update_meal, delete_meal])
