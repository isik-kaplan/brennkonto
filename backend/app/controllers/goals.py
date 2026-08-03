from datetime import date, timedelta
from typing import NamedTuple
from uuid import UUID

from litestar import Request, Router, delete, get, post
from litestar.exceptions import NotFoundException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GoalVersion, _utcnow
from app.schemas import GoalVersionOut, UpsertGoalRequest
from app.serializers import goal_version_out


DEFAULT_CALORIE_GOAL = 2000
DEFAULT_PROTEIN_GOAL_G = 150
DEFAULT_CARBS_GOAL_G = 200
DEFAULT_FAT_GOAL_G = 65


class GoalSnapshot(NamedTuple):
    calorie_goal: int
    protein_goal_g: int
    carbs_goal_g: int
    fat_goal_g: int


async def resolve_goal_for_date(db_session: AsyncSession, user_id: UUID, target_date: date) -> GoalSnapshot:
    """The goal in effect on `target_date`: the latest version with effective_date <= target_date,
    or hardcoded defaults if the user has no version that old yet. Every date always resolves to
    something, which is what makes deleting any version (including the earliest) always safe."""
    version = await db_session.scalar(
        select(GoalVersion)
        .where(GoalVersion.user_id == user_id, GoalVersion.effective_date <= target_date)
        .order_by(GoalVersion.effective_date.desc())
        .limit(1)
    )
    if version is None:
        return GoalSnapshot(DEFAULT_CALORIE_GOAL, DEFAULT_PROTEIN_GOAL_G, DEFAULT_CARBS_GOAL_G, DEFAULT_FAT_GOAL_G)
    return GoalSnapshot(
        version.daily_calorie_goal, version.daily_protein_goal_g, version.daily_carbs_goal_g, version.daily_fat_goal_g
    )


async def _get_owned_goal_version(db_session: AsyncSession, request: Request, goal_id: UUID) -> GoalVersion:
    version = await db_session.get(GoalVersion, goal_id)
    if version is None or version.user_id != request.user.id:
        raise NotFoundException("No goal version found with this id.")
    return version


async def _list_versions_with_ranges(db_session: AsyncSession, user_id: UUID) -> list[GoalVersionOut]:
    # end_date is derived, not stored - each version runs until the day before whichever one
    # starts next, so it's always consistent with the effective_date ordering with no risk of the
    # two drifting apart. Only the most recent version (by effective_date) has no successor, so
    # it alone gets end_date=None, meaning "in effect indefinitely, until something supersedes it".
    versions = list(
        await db_session.scalars(
            select(GoalVersion).where(GoalVersion.user_id == user_id).order_by(GoalVersion.effective_date)
        )
    )
    return [
        goal_version_out(
            version, versions[index + 1].effective_date - timedelta(days=1) if index + 1 < len(versions) else None
        )
        for index, version in enumerate(versions)
    ]


@get("/")
async def list_goal_versions(db_session: AsyncSession, request: Request) -> list[GoalVersionOut]:
    return await _list_versions_with_ranges(db_session, request.user.id)


@post("/")
async def upsert_goal_version(data: UpsertGoalRequest, db_session: AsyncSession, request: Request) -> GoalVersionOut:
    # Setting a goal for a date that already has a version overwrites it in place - this is what
    # makes retroactively correcting a past goal and scheduling a future one the same operation:
    # both are just "set what the goal should be starting from this date".
    version = await db_session.scalar(
        select(GoalVersion).where(
            GoalVersion.user_id == request.user.id, GoalVersion.effective_date == data.effective_date
        )
    )
    if version is None:
        version = GoalVersion(user_id=request.user.id, effective_date=data.effective_date)
        db_session.add(version)
    else:
        version.updated_at = _utcnow()
    version.daily_calorie_goal = data.daily_calorie_goal
    version.daily_protein_goal_g = data.daily_protein_goal_g
    version.daily_carbs_goal_g = data.daily_carbs_goal_g
    version.daily_fat_goal_g = data.daily_fat_goal_g
    await db_session.commit()
    versions = await _list_versions_with_ranges(db_session, request.user.id)
    return next(candidate for candidate in versions if candidate.id == version.id)


@delete("/{goal_id:uuid}")
async def delete_goal_version(goal_id: UUID, db_session: AsyncSession, request: Request) -> None:
    version = await _get_owned_goal_version(db_session, request, goal_id)
    await db_session.delete(version)
    await db_session.commit()


goals_router = Router(path="/api/goals", route_handlers=[list_goal_versions, upsert_goal_version, delete_goal_version])
