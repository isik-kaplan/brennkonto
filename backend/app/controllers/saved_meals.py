from uuid import UUID

from litestar import Request, Router, delete, get, patch, post
from litestar.exceptions import NotFoundException, ValidationException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.meal_names import logged_groups_named, rename_groups
from app.models import SavedMeal, _utcnow
from app.schemas import SavedMealOut, UpsertSavedMealRequest
from app.serializers import saved_meal_out


async def _get_owned_meal(db_session: AsyncSession, request: Request, meal_id: UUID) -> SavedMeal:
    meal = await db_session.get(SavedMeal, meal_id)
    if meal is None or meal.user_id != request.user.id:
        raise NotFoundException("No saved meal found with this id.")
    return meal


async def _validated(
    data: UpsertSavedMealRequest, db_session: AsyncSession, request: Request, meal_id: UUID | None = None
) -> tuple[str, list[dict]]:
    name = data.name.strip()
    if not name:
        raise ValidationException("A meal needs a name.")
    if not data.items:
        raise ValidationException("A meal needs at least one food.")
    if any(item.input_amount <= 0 for item in data.items):
        raise ValidationException("Every food in a meal needs an amount above zero.")
    # Names are unique per user, case-insensitively - the history picker merges saved and logged
    # meals by name (see history_groups), so two saved meals sharing one would be ambiguous.
    others = await db_session.scalars(select(SavedMeal).where(SavedMeal.user_id == request.user.id))
    if any(other.id != meal_id and other.name.strip().lower() == name.lower() for other in others):
        raise ValidationException(f'You already have a saved meal called "{name}".')
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
async def list_saved_meals(db_session: AsyncSession, request: Request) -> list[SavedMealOut]:
    meals = await db_session.scalars(
        select(SavedMeal).where(SavedMeal.user_id == request.user.id).order_by(SavedMeal.name)
    )
    return [saved_meal_out(meal) for meal in meals]


@post("/")
async def create_saved_meal(data: UpsertSavedMealRequest, db_session: AsyncSession, request: Request) -> SavedMealOut:
    name, items = await _validated(data, db_session, request)
    meal = SavedMeal(user_id=request.user.id, name=name, items=items)
    db_session.add(meal)
    await db_session.commit()
    return saved_meal_out(meal)


@patch("/{meal_id:uuid}")
async def update_saved_meal(
    meal_id: UUID, data: UpsertSavedMealRequest, db_session: AsyncSession, request: Request
) -> SavedMealOut:
    meal = await _get_owned_meal(db_session, request, meal_id)
    old_name = meal.name
    meal.name, meal.items = await _validated(data, db_session, request, meal_id)
    if meal.name != old_name:
        # Logged occurrences are the same meal (matched by name) - renaming only the template
        # would split it in two on the Meals page and in the history picker.
        rename_groups(await logged_groups_named(db_session, request, old_name), meal.name)
    meal.updated_at = _utcnow()
    await db_session.commit()
    return saved_meal_out(meal)


@delete("/{meal_id:uuid}")
async def delete_saved_meal(meal_id: UUID, db_session: AsyncSession, request: Request) -> None:
    # Only the template goes - anything already logged from it stays in history as its own meal.
    meal = await _get_owned_meal(db_session, request, meal_id)
    await db_session.delete(meal)
    await db_session.commit()


saved_meals_router = Router(
    path="/api/saved-meals",
    route_handlers=[list_saved_meals, create_saved_meal, update_saved_meal, delete_saved_meal],
)
