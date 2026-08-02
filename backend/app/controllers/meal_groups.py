from uuid import UUID

from litestar import Request, Router, delete, get, patch, post
from litestar.exceptions import NotFoundException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FoodEntry, MealGroup, _utcnow
from app.schemas import CreateMealGroupRequest, MealGroupOut, UpdateMealGroupRequest
from app.serializers import meal_group_out


async def _get_owned_group(db_session: AsyncSession, request: Request, group_id: UUID) -> MealGroup:
    group = await db_session.get(MealGroup, group_id)
    if group is None or group.user_id != request.user.id:
        raise NotFoundException("No meal group found with this id.")
    return group


async def _get_owned_entries(db_session: AsyncSession, request: Request, entry_ids: list[UUID]) -> list[FoodEntry]:
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


async def _member_entry_ids(db_session: AsyncSession, group_id: UUID) -> list[UUID]:
    return list(await db_session.scalars(select(FoodEntry.id).where(FoodEntry.meal_group_id == group_id)))


async def assign_fresh_singleton_group(db_session: AsyncSession, entry: FoodEntry) -> None:
    """Gives `entry` a brand new group of its own - every entry always belongs to a real group,
    so this is how one leaves a group without landing in another (ungrouping, or being dropped
    from a membership-replace PATCH)."""
    group = MealGroup(user_id=entry.user_id)
    db_session.add(group)
    await db_session.flush()  # assigns group.id so it can be used as a FK value below
    entry.meal_group_id = group.id


async def delete_group_if_empty(db_session: AsyncSession, group_id: UUID) -> None:
    """Deletes `group_id` if it has no members left. Callers are responsible for their own
    commit."""
    if not await _member_entry_ids(db_session, group_id):
        group = await db_session.get(MealGroup, group_id)
        if group is not None:
            await db_session.delete(group)


@get("/")
async def list_meal_groups(db_session: AsyncSession, request: Request) -> list[MealGroupOut]:
    groups = list(await db_session.scalars(select(MealGroup).where(MealGroup.user_id == request.user.id)))
    return [meal_group_out(group, await _member_entry_ids(db_session, group.id)) for group in groups]


@post("/")
async def create_meal_group(data: CreateMealGroupRequest, db_session: AsyncSession, request: Request) -> MealGroupOut:
    entries = await _get_owned_entries(db_session, request, data.entry_ids)
    # Every entry already had its own group before this call - capture those so the ones that end
    # up empty (nothing else left in them) get cleaned up rather than lingering forever.
    old_group_ids = {entry.meal_group_id for entry in entries if entry.meal_group_id is not None}
    group = MealGroup(user_id=request.user.id, name=data.name)
    db_session.add(group)
    await db_session.flush()  # assigns group.id so it can be used as a FK value below
    for entry in entries:
        entry.meal_group_id = group.id
    for old_group_id in old_group_ids:
        await delete_group_if_empty(db_session, old_group_id)
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
        # Replace membership wholesale: whatever isn't in the new set gets its own fresh singleton
        # group (never left groupless), whatever is gets (re)linked - this single endpoint covers
        # both retroactive re-grouping and moving an entry in from a different group. Newly-added
        # entries' *previous* groups get cleaned up too, the same as the removed ones' new ones -
        # neither side should ever leave an empty group lying around.
        new_entries = await _get_owned_entries(db_session, request, data.entry_ids)
        new_ids = {entry.id for entry in new_entries}
        old_group_ids = {entry.meal_group_id for entry in new_entries if entry.meal_group_id not in (None, group.id)}
        cleared_query = select(FoodEntry).where(FoodEntry.meal_group_id == group.id)
        if new_ids:
            cleared_query = cleared_query.where(FoodEntry.id.notin_(new_ids))
        for entry in await db_session.scalars(cleared_query):
            await assign_fresh_singleton_group(db_session, entry)
        for entry in new_entries:
            entry.meal_group_id = group.id
        for old_group_id in old_group_ids:
            await delete_group_if_empty(db_session, old_group_id)
    group.updated_at = _utcnow()
    await db_session.commit()
    entry_ids = await _member_entry_ids(db_session, group.id)
    return meal_group_out(group, entry_ids)


@delete("/{group_id:uuid}")
async def delete_meal_group(group_id: UUID, db_session: AsyncSession, request: Request) -> None:
    # "Ungroup": gives every member a fresh singleton group of its own - entries always belong to
    # a real group, they just no longer share this one - then removes the now-empty group row.
    group = await _get_owned_group(db_session, request, group_id)
    members = list(await db_session.scalars(select(FoodEntry).where(FoodEntry.meal_group_id == group_id)))
    for entry in members:
        await assign_fresh_singleton_group(db_session, entry)
    await db_session.delete(group)
    await db_session.commit()


meal_groups_router = Router(
    path="/api/meal-groups",
    route_handlers=[list_meal_groups, create_meal_group, update_meal_group, delete_meal_group],
)
