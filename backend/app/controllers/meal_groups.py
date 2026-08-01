from uuid import UUID

from litestar import Request, Router, delete, get, patch, post
from litestar.exceptions import NotFoundException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FoodEntry, MealGroup, _utcnow
from app.schemas import CreateMealGroupRequest, MealGroupOut, UpdateMealGroupRequest
from app.serializers import meal_group_out


async def _get_owned_group(db_session: AsyncSession, request: Request, group_id: UUID) -> MealGroup:
    group = await db_session.get(MealGroup, group_id)
    if group is None or group.user_id != request.user.id:
        raise NotFoundException("No meal group found with this id.")
    return group


async def _get_owned_entries(db_session: AsyncSession, request: Request, entry_ids: list[int]) -> list[FoodEntry]:
    if not entry_ids:
        return []
    entries = list(
        await db_session.scalars(
            select(FoodEntry).where(FoodEntry.id.in_(entry_ids), FoodEntry.user_id == request.user.id)
        )
    )
    if len(entries) != len(set(entry_ids)):
        raise NotFoundException("One or more entries were not found.")
    return entries


async def _member_entry_ids(db_session: AsyncSession, group_id: UUID) -> list[int]:
    return list(await db_session.scalars(select(FoodEntry.id).where(FoodEntry.meal_group_id == group_id)))


@get("/")
async def list_meal_groups(db_session: AsyncSession, request: Request) -> list[MealGroupOut]:
    groups = list(await db_session.scalars(select(MealGroup).where(MealGroup.user_id == request.user.id)))
    return [meal_group_out(group, await _member_entry_ids(db_session, group.id)) for group in groups]


@post("/")
async def create_meal_group(data: CreateMealGroupRequest, db_session: AsyncSession, request: Request) -> MealGroupOut:
    entries = await _get_owned_entries(db_session, request, data.entry_ids)
    group = MealGroup(user_id=request.user.id, name=data.name)
    db_session.add(group)
    await db_session.flush()  # assigns group.id so it can be used as a FK value below
    for entry in entries:
        entry.meal_group_id = group.id
    await db_session.commit()
    return meal_group_out(group, [entry.id for entry in entries])


@patch("/{group_id:uuid}")
async def update_meal_group(
    group_id: UUID, data: UpdateMealGroupRequest, db_session: AsyncSession, request: Request
) -> MealGroupOut:
    group = await _get_owned_group(db_session, request, group_id)
    if data.name is not None:
        group.name = data.name
    if data.entry_ids is not None:
        # Replace membership wholesale: whatever isn't in the new set gets unlinked, whatever is
        # gets (re)linked - this single endpoint covers both retroactive re-grouping and moving an
        # entry in from a different group.
        new_entries = await _get_owned_entries(db_session, request, data.entry_ids)
        new_ids = {entry.id for entry in new_entries}
        clear_query = update(FoodEntry).where(FoodEntry.meal_group_id == group.id).values(meal_group_id=None)
        if new_ids:
            clear_query = clear_query.where(FoodEntry.id.notin_(new_ids))
        await db_session.execute(clear_query)
        for entry in new_entries:
            entry.meal_group_id = group.id
    group.updated_at = _utcnow()
    await db_session.commit()
    entry_ids = await _member_entry_ids(db_session, group.id)
    return meal_group_out(group, entry_ids)


@delete("/{group_id:uuid}")
async def delete_meal_group(group_id: UUID, db_session: AsyncSession, request: Request) -> None:
    # "Ungroup": clears the link on every member so the entries survive untouched, then removes
    # the now-empty group row.
    group = await _get_owned_group(db_session, request, group_id)
    await db_session.execute(update(FoodEntry).where(FoodEntry.meal_group_id == group_id).values(meal_group_id=None))
    await db_session.delete(group)
    await db_session.commit()


meal_groups_router = Router(
    path="/api/meal-groups",
    route_handlers=[list_meal_groups, create_meal_group, update_meal_group, delete_meal_group],
)
