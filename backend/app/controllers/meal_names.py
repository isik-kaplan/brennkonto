from collections import OrderedDict
from uuid import UUID

from litestar import Request, Router, delete, get, patch
from litestar.exceptions import NotFoundException, ValidationException
from litestar.params import Parameter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.meal_groups import assign_fresh_singleton_group
from app.models import FoodEntry, MealGroup, _utcnow
from app.schemas import MealNameOut, RenameMealNameRequest


# A "meal" here isn't its own table - it's the set of MealGroup rows that happen to share a name,
# the same identity history_groups (app/controllers/history.py) dedupes by. This management page
# operates on that whole set at once (rename/remove every occurrence of "Breakfast", not just one
# day's), matched case-insensitively so "Breakfast" and "breakfast" are treated as the same meal
# the same way history_groups' own dedup key does.
async def _named_groups(db_session: AsyncSession, request: Request) -> list[MealGroup]:
    return list(
        await db_session.scalars(
            select(MealGroup).where(MealGroup.user_id == request.user.id, MealGroup.name.is_not(None))
        )
    )


async def _matching_groups(db_session: AsyncSession, request: Request, name: str) -> list[MealGroup]:
    key = name.strip().lower()
    groups = [group for group in await _named_groups(db_session, request) if (group.name or "").strip().lower() == key]
    if not groups:
        raise NotFoundException("No meal found with this name.")
    return groups


@get("/")
async def list_meal_names(db_session: AsyncSession, request: Request) -> list[MealNameOut]:
    groups = await _named_groups(db_session, request)
    groups_by_key: OrderedDict[str, list[MealGroup]] = OrderedDict()
    for group in groups:
        key = (group.name or "").strip().lower()
        if not key:
            continue
        groups_by_key.setdefault(key, []).append(group)
    if not groups_by_key:
        return []

    all_group_ids = [group.id for group_list in groups_by_key.values() for group in group_list]
    entries = list(
        await db_session.scalars(
            select(FoodEntry).where(FoodEntry.meal_group_id.in_(all_group_ids), FoodEntry.deleted_at.is_(None))
        )
    )
    entries_by_group_id: dict[UUID, list[FoodEntry]] = {}
    for entry in entries:
        entries_by_group_id.setdefault(entry.meal_group_id, []).append(entry)

    results = []
    for name_groups in groups_by_key.values():
        member_entries = [entry for group in name_groups for entry in entries_by_group_id.get(group.id, [])]
        if not member_entries:
            # Every occurrence of this name is now empty (its entries were all deleted) - nothing
            # left to manage, same as history_groups implicitly excluding it.
            continue
        latest_group = max(name_groups, key=lambda group: group.created_at)
        results.append(
            MealNameOut(
                name=(latest_group.name or "").strip(),
                times_logged=len(name_groups),
                last_logged_at=max(entry.consumed_at for entry in member_entries),
                items=[entry.name for entry in entries_by_group_id.get(latest_group.id, [])],
            )
        )
    results.sort(key=lambda item: item.last_logged_at, reverse=True)
    return results


@patch("/")
async def rename_meal_name(
    data: RenameMealNameRequest, db_session: AsyncSession, request: Request, name: str = Parameter(query="name")
) -> None:
    new_name = data.new_name.strip()
    if not new_name:
        raise ValidationException("A meal needs a name - use remove instead to stop grouping it.")
    groups = await _matching_groups(db_session, request, name)
    for group in groups:
        group.name = new_name
        group.updated_at = _utcnow()
    await db_session.commit()


@delete("/")
async def remove_meal_name(db_session: AsyncSession, request: Request, name: str = Parameter(query="name")) -> None:
    # "Remove" only un-names/ungroups: every member entry gets a fresh singleton group of its own
    # (same as meal_groups.delete_meal_group's ungroup semantics), so it keeps showing up in
    # history individually - nothing is deleted, only the shared "meal" label goes away.
    groups = await _matching_groups(db_session, request, name)
    for group in groups:
        members = list(await db_session.scalars(select(FoodEntry).where(FoodEntry.meal_group_id == group.id)))
        for entry in members:
            await assign_fresh_singleton_group(db_session, entry)
        await db_session.delete(group)
    await db_session.commit()


meal_names_router = Router(path="/api/meal-names", route_handlers=[list_meal_names, rename_meal_name, remove_meal_name])
