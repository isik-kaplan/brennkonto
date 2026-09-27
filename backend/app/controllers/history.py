from math import inf

from litestar import Request, Router, get
from litestar.params import Parameter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Meal
from app.schemas import HistoryFoodOut, MealOut
from app.services.food_history import logged_foods_matching
from app.services.meals import meals_out


_RESULT_LIMIT = 30


@get("/foods")
async def history_foods(
    db_session: AsyncSession, request: Request, q: str = Parameter(default="")
) -> list[HistoryFoodOut]:
    counts, latest_by_key = await logged_foods_matching(db_session, request.user.id, q.strip().lower())

    results = []
    for key, entry in latest_by_key.items():
        results.append(
            HistoryFoodOut(
                barcode=entry.barcode or key,
                name=entry.name,
                brand=entry.brand,
                calories_per_100g=entry.calories_per_100g,
                protein_per_100g=entry.protein_per_100g,
                carbs_per_100g=entry.carbs_per_100g,
                fat_per_100g=entry.fat_per_100g,
                suggested_unit=entry.input_unit,
                unit_to_grams=entry.unit_to_grams,
                last_input_amount=entry.input_amount,
                last_logged_at=entry.consumed_at,
                times_logged=counts[key],
            )
        )
        if len(results) >= _RESULT_LIMIT:
            break
    return results


@get("/groups")
async def history_groups(db_session: AsyncSession, request: Request, q: str = Parameter(default="")) -> list[MealOut]:
    query = q.strip().lower()
    meals = [
        meal
        for meal in await db_session.scalars(select(Meal).where(Meal.user_id == request.user.id))
        if query in meal.name.lower()
    ]
    results = await meals_out(db_session, meals)
    # Not eaten yet first - it was most likely just set up to be logged - then most recent first.
    results.sort(key=lambda meal: meal.last_logged_at.timestamp() if meal.last_logged_at else inf, reverse=True)
    return results[:_RESULT_LIMIT]


history_router = Router(path="/api/history", route_handlers=[history_foods, history_groups])
