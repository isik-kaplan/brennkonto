from collections import OrderedDict
from uuid import UUID

from litestar import Request, Router, delete, get, patch
from litestar.exceptions import NotFoundException, ValidationException
from litestar.params import Parameter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.meal_groups import assign_fresh_singleton_group
from app.models import FoodEntry, MealGroup, SavedMeal, _utcnow
from app.schemas import HistoryGroupItemOut, MealNameOut, RenameMealNameRequest
from app.serializers import saved_meal_items_out


# A "meal" here is identified by its name, not a row: it's a SavedMeal (set up on the Meals page)
# and/or the set of MealGroup rows that happen to share that name (logged ad hoc), the same
# identity history_groups (app/controllers/history.py) dedupes by. This page operates on all of
# them at once (rename/remove every occurrence of "Breakfast", not just one day's), matched
# case-insensitively so "Breakfast" and "breakfast" are treated as the same meal.
def _key(name: str) -> str:
    # Never None: _named_groups only returns named groups, and saved meals always have a name.
    return name.strip().lower()


async def _named_groups(db_session: AsyncSession, request: Request) -> list[MealGroup]:
    return list(
        await db_session.scalars(
            select(MealGroup).where(MealGroup.user_id == request.user.id, MealGroup.name.is_not(None))
        )
    )


async def _saved_meals(db_session: AsyncSession, request: Request) -> list[SavedMeal]:
    return list(await db_session.scalars(select(SavedMeal).where(SavedMeal.user_id == request.user.id)))


async def _matching(db_session: AsyncSession, request: Request, name: str) -> tuple[list[MealGroup], SavedMeal | None]:
    key = _key(name)
    groups = [group for group in await _named_groups(db_session, request) if _key(group.name) == key]
    saved = next((meal for meal in await _saved_meals(db_session, request) if _key(meal.name) == key), None)
    if not groups and saved is None:
        raise NotFoundException("No meal found with this name.")
    return groups, saved


def _item_out(entry: FoodEntry) -> HistoryGroupItemOut:
    return HistoryGroupItemOut(
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
    )


def _meal_out(
    name: str, items: list[HistoryGroupItemOut], times_logged: int, last_logged_at, saved_meal_id: UUID | None
) -> MealNameOut:
    return MealNameOut(
        name=name,
        items=items,
        calories=sum(item.grams * item.calories_per_100g / 100 for item in items),
        protein_g=sum(item.grams * item.protein_per_100g / 100 for item in items),
        carbs_g=sum(item.grams * item.carbs_per_100g / 100 for item in items),
        fat_g=sum(item.grams * item.fat_per_100g / 100 for item in items),
        times_logged=times_logged,
        last_logged_at=last_logged_at,
        saved_meal_id=saved_meal_id,
    )


@get("/")
async def list_meal_names(db_session: AsyncSession, request: Request) -> list[MealNameOut]:
    groups_by_key: OrderedDict[str, list[MealGroup]] = OrderedDict()
    for group in await _named_groups(db_session, request):
        key = _key(group.name)
        if key:
            groups_by_key.setdefault(key, []).append(group)

    all_group_ids = [group.id for group_list in groups_by_key.values() for group in group_list]
    entries_by_group_id: dict[UUID, list[FoodEntry]] = {}
    if all_group_ids:
        entries = await db_session.scalars(
            select(FoodEntry).where(FoodEntry.meal_group_id.in_(all_group_ids), FoodEntry.deleted_at.is_(None))
        )
        for entry in entries:
            entries_by_group_id.setdefault(entry.meal_group_id, []).append(entry)

    saved_by_key = {_key(meal.name): meal for meal in await _saved_meals(db_session, request)}

    results = []
    for key in {*groups_by_key, *saved_by_key}:
        # Only occurrences that still have entries count - one whose entries were all deleted
        # has nothing left in it, the same as history_groups implicitly excluding it.
        logged = [group for group in groups_by_key.get(key, []) if entries_by_group_id.get(group.id)]
        saved = saved_by_key.get(key)
        if not logged and saved is None:
            continue
        last_logged_at = None
        if logged:
            latest_group = max(logged, key=lambda group: group.created_at)
            last_logged_at = max(entry.consumed_at for group in logged for entry in entries_by_group_id[group.id])
        if saved is not None:
            # The saved meal is the definition - its foods win over whatever was logged last.
            results.append(_meal_out(saved.name, saved_meal_items_out(saved), len(logged), last_logged_at, saved.id))
        else:
            items = [_item_out(entry) for entry in entries_by_group_id[latest_group.id]]
            results.append(_meal_out((latest_group.name or "").strip(), items, len(logged), last_logged_at, None))
    results.sort(key=lambda meal: meal.name.lower())
    return results


@patch("/")
async def rename_meal_name(
    data: RenameMealNameRequest, db_session: AsyncSession, request: Request, name: str = Parameter(query="name")
) -> None:
    new_name = data.new_name.strip()
    if not new_name:
        raise ValidationException("A meal needs a name - use remove instead to stop grouping it.")
    groups, saved = await _matching(db_session, request, name)
    if saved is not None:
        others = await _saved_meals(db_session, request)
        if any(meal.id != saved.id and _key(meal.name) == _key(new_name) for meal in others):
            raise ValidationException(f'You already have a saved meal called "{new_name}".')
        saved.name = new_name
        saved.updated_at = _utcnow()
    rename_groups(groups, new_name)
    await db_session.commit()


def rename_groups(groups: list[MealGroup], new_name: str) -> None:
    for group in groups:
        group.name = new_name
        group.updated_at = _utcnow()


async def logged_groups_named(db_session: AsyncSession, request: Request, name: str) -> list[MealGroup]:
    return [group for group in await _named_groups(db_session, request) if _key(group.name) == _key(name)]


@delete("/")
async def remove_meal_name(db_session: AsyncSession, request: Request, name: str = Parameter(query="name")) -> None:
    # Removes the meal itself, not anything eaten: a saved meal's definition is deleted, and every
    # logged occurrence is un-named/ungrouped - each member entry gets a fresh singleton group of
    # its own (same as meal_groups.delete_meal_group's ungroup semantics), so it keeps showing up
    # in history individually.
    groups, saved = await _matching(db_session, request, name)
    for group in groups:
        members = list(await db_session.scalars(select(FoodEntry).where(FoodEntry.meal_group_id == group.id)))
        for entry in members:
            await assign_fresh_singleton_group(db_session, entry)
        await db_session.delete(group)
    if saved is not None:
        await db_session.delete(saved)
    await db_session.commit()


meal_names_router = Router(path="/api/meal-names", route_handlers=[list_meal_names, rename_meal_name, remove_meal_name])
