from collections import defaultdict
from datetime import UTC, date, datetime, timedelta

from litestar import Request, Router, get
from litestar.exceptions import ValidationException
from litestar.params import Parameter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.goals import resolve_goal_for_date
from app.models import FoodEntry
from app.schemas import DailyStatsOut, RangeStatsOut, RangeStatsPointOut
from app.serializers import entry_out


def _bucket_key(entry_date: date, group_by: str) -> date:
    if group_by == "day":
        return entry_date
    if group_by == "week":
        return entry_date - timedelta(days=entry_date.weekday())
    if group_by == "month":
        return entry_date.replace(day=1)
    raise ValidationException(f"Unsupported group_by: {group_by!r}. Use 'day', 'week', or 'month'.")


def _bucket_label(key: date, group_by: str) -> tuple[str, date, date]:
    if group_by == "day":
        return key.strftime("%a %d %b"), key, key
    if group_by == "week":
        end = key + timedelta(days=6)
        return f"{key.strftime('%d %b')} – {end.strftime('%d %b')}", key, end
    next_month = key.replace(day=28) + timedelta(days=4)
    month_end = next_month.replace(day=1) - timedelta(days=1)
    return key.strftime("%B %Y"), key, month_end


@get("/daily")
async def daily_stats(
    db_session: AsyncSession, request: Request, entry_date: date = Parameter(query="date")
) -> DailyStatsOut:
    # consumed_at is a full timestamp now, not a plain date - "which day" means a half-open range
    # rather than exact equality.
    day_start = datetime.combine(entry_date, datetime.min.time(), tzinfo=UTC)
    day_end = day_start + timedelta(days=1)
    entries = list(
        await db_session.scalars(
            select(FoodEntry)
            .where(
                FoodEntry.user_id == request.user.id,
                FoodEntry.consumed_at >= day_start,
                FoodEntry.consumed_at < day_end,
                FoodEntry.deleted_at.is_(None),
            )
            .order_by(FoodEntry.created_at)
        )
    )
    goal = await resolve_goal_for_date(db_session, request.user.id, entry_date)
    return DailyStatsOut(
        date=entry_date,
        calories=sum(entry.calories for entry in entries),
        protein_g=sum(entry.protein_g for entry in entries),
        carbs_g=sum(entry.carbs_g for entry in entries),
        fat_g=sum(entry.fat_g for entry in entries),
        calorie_goal=goal.calorie_goal,
        protein_goal_g=goal.protein_goal_g,
        carbs_goal_g=goal.carbs_goal_g,
        fat_goal_g=goal.fat_goal_g,
        entries=[entry_out(entry) for entry in entries],
    )


@get("/range")
async def range_stats(
    db_session: AsyncSession,
    request: Request,
    start: date = Parameter(query="start"),
    end: date = Parameter(query="end"),
    group_by: str = Parameter(query="group_by", default="day"),
) -> RangeStatsOut:
    if start > end:
        raise ValidationException("start must be on or before end.")
    if group_by not in ("day", "week", "month"):
        # Validated here rather than left to _bucket_key alone - that check only fires once per
        # entry, so an empty range (valid dates, no logged days yet) would silently accept a
        # bogus group_by and return an empty result instead of rejecting the request.
        raise ValidationException(f"Unsupported group_by: {group_by!r}. Use 'day', 'week', or 'month'.")

    # consumed_at is a full timestamp - `<= end` would silently exclude anything logged after
    # midnight on the end day, so the upper bound is exclusive at the start of the following day.
    range_start = datetime.combine(start, datetime.min.time(), tzinfo=UTC)
    range_end = datetime.combine(end + timedelta(days=1), datetime.min.time(), tzinfo=UTC)
    entries = list(
        await db_session.scalars(
            select(FoodEntry).where(
                FoodEntry.user_id == request.user.id,
                FoodEntry.consumed_at >= range_start,
                FoodEntry.consumed_at < range_end,
                FoodEntry.deleted_at.is_(None),
            )
        )
    )

    buckets: dict[date, list[FoodEntry]] = defaultdict(list)
    logged_days: set[date] = set()
    for entry in entries:
        entry_date = entry.consumed_at.date()
        buckets[_bucket_key(entry_date, group_by)].append(entry)
        logged_days.add(entry_date)

    points = []
    for key in sorted(buckets):
        bucket_entries = buckets[key]
        label, period_start, period_end = _bucket_label(key, group_by)
        # The goal as of the close of the bucket - unambiguous for day buckets (period_start ==
        # period_end); for week/month buckets that span a goal change, this is "the goal in effect
        # by the time this period ended".
        goal = await resolve_goal_for_date(db_session, request.user.id, period_end)
        points.append(
            RangeStatsPointOut(
                period_label=label,
                period_start=period_start,
                period_end=period_end,
                calories=sum(entry.calories for entry in bucket_entries),
                protein_g=sum(entry.protein_g for entry in bucket_entries),
                carbs_g=sum(entry.carbs_g for entry in bucket_entries),
                fat_g=sum(entry.fat_g for entry in bucket_entries),
                days_logged=len({entry.consumed_at.date() for entry in bucket_entries}),
                calorie_goal=goal.calorie_goal,
                protein_goal_g=goal.protein_goal_g,
                carbs_goal_g=goal.carbs_goal_g,
                fat_goal_g=goal.fat_goal_g,
            )
        )

    days_logged = len(logged_days)
    return RangeStatsOut(
        points=points,
        average_calories=sum(entry.calories for entry in entries) / days_logged if days_logged else 0,
        average_protein_g=sum(entry.protein_g for entry in entries) / days_logged if days_logged else 0,
        average_carbs_g=sum(entry.carbs_g for entry in entries) / days_logged if days_logged else 0,
        average_fat_g=sum(entry.fat_g for entry in entries) / days_logged if days_logged else 0,
        total_calories=sum(entry.calories for entry in entries),
        days_in_range=(end - start).days + 1,
        days_logged=days_logged,
    )


stats_router = Router(path="/api/stats", route_handlers=[daily_stats, range_stats])
