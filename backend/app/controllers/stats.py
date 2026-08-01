from collections import defaultdict
from datetime import date, timedelta

from litestar import Request, Router, get
from litestar.exceptions import ValidationException
from litestar.params import Parameter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FoodEntry, User
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
    entries = list(
        await db_session.scalars(
            select(FoodEntry)
            .where(FoodEntry.user_id == request.user.id, FoodEntry.consumed_at == entry_date)
            .order_by(FoodEntry.created_at)
        )
    )
    user: User = request.user
    return DailyStatsOut(
        date=entry_date,
        calories=sum(entry.calories for entry in entries),
        protein_g=sum(entry.protein_g for entry in entries),
        carbs_g=sum(entry.carbs_g for entry in entries),
        fat_g=sum(entry.fat_g for entry in entries),
        calorie_goal=user.daily_calorie_goal,
        protein_goal_g=user.daily_protein_goal_g,
        carbs_goal_g=user.daily_carbs_goal_g,
        fat_goal_g=user.daily_fat_goal_g,
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

    entries = list(
        await db_session.scalars(
            select(FoodEntry).where(
                FoodEntry.user_id == request.user.id,
                FoodEntry.consumed_at >= start,
                FoodEntry.consumed_at <= end,
            )
        )
    )

    buckets: dict[date, list[FoodEntry]] = defaultdict(list)
    logged_days: set[date] = set()
    for entry in entries:
        buckets[_bucket_key(entry.consumed_at, group_by)].append(entry)
        logged_days.add(entry.consumed_at)

    points = []
    for key in sorted(buckets):
        bucket_entries = buckets[key]
        label, period_start, period_end = _bucket_label(key, group_by)
        points.append(
            RangeStatsPointOut(
                period_label=label,
                period_start=period_start,
                period_end=period_end,
                calories=sum(entry.calories for entry in bucket_entries),
                protein_g=sum(entry.protein_g for entry in bucket_entries),
                carbs_g=sum(entry.carbs_g for entry in bucket_entries),
                fat_g=sum(entry.fat_g for entry in bucket_entries),
                days_logged=len({entry.consumed_at for entry in bucket_entries}),
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
