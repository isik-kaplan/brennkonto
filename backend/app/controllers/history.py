from collections import OrderedDict
from uuid import UUID

from litestar import Request, Router, get
from litestar.params import Parameter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FoodEntry, MealGroup
from app.schemas import HistoryFoodOut, HistoryGroupItemOut, HistoryGroupOut


# How many of the user's most recent (non-deleted) entries to scan before deduplicating - bounds
# the query for a long-running account without needing "distinct on, latest row per key" support,
# which SQLite has none of. `times_logged` below is therefore "times logged within this recent
# window", not a true all-time count - an approximation that's accurate for anything a user would
# plausibly want to re-log.
_SCAN_LIMIT = 1000
_RESULT_LIMIT = 30


def _food_key(entry: FoodEntry) -> str:
    # Barcode is the natural identity for anything looked up via OFF - the only way an entry is
    # ever created today. name+brand is a defensive fallback for the barcode-less rows the model
    # still allows at the schema level.
    if entry.barcode:
        return f"b:{entry.barcode}"
    return f"n:{entry.name.strip().lower()}|{(entry.brand or '').strip().lower()}"


def _matches_query(entry: FoodEntry, query: str) -> bool:
    return query in entry.name.lower() or (entry.brand is not None and query in entry.brand.lower())


@get("/foods")
async def history_foods(
    db_session: AsyncSession, request: Request, q: str = Parameter(default="")
) -> list[HistoryFoodOut]:
    entries = list(
        await db_session.scalars(
            select(FoodEntry)
            .where(FoodEntry.user_id == request.user.id, FoodEntry.deleted_at.is_(None))
            .order_by(FoodEntry.consumed_at.desc())
            .limit(_SCAN_LIMIT)
        )
    )

    query = q.strip().lower()
    counts: dict[str, int] = {}
    # Insertion order here tracks first-seen order among `entries`, which is already sorted
    # most-recent-first - so the first entry seen for a key is also its most recently logged one.
    latest_by_key: OrderedDict[str, FoodEntry] = OrderedDict()
    for entry in entries:
        if query and not _matches_query(entry, query):
            continue
        key = _food_key(entry)
        counts[key] = counts.get(key, 0) + 1
        latest_by_key.setdefault(key, entry)

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
async def history_groups(
    db_session: AsyncSession, request: Request, q: str = Parameter(default="")
) -> list[HistoryGroupOut]:
    entries = list(
        await db_session.scalars(
            select(FoodEntry)
            .where(
                FoodEntry.user_id == request.user.id,
                FoodEntry.deleted_at.is_(None),
                FoodEntry.meal_group_id.is_not(None),
            )
            .order_by(FoodEntry.consumed_at.desc())
            .limit(_SCAN_LIMIT)
        )
    )
    if not entries:
        return []

    group_ids = {entry.meal_group_id for entry in entries}
    groups = list(await db_session.scalars(select(MealGroup).where(MealGroup.id.in_(group_ids))))
    # Only a deliberately-named combo is worth resurfacing here - an unnamed "group of one" is
    # already covered by history_foods above, and an unnamed multi-item group has no label to
    # browse or search by.
    name_by_group_id = {group.id: group.name.strip() for group in groups if group.name and group.name.strip()}

    # Clusters each named group's member entries together, in first-appearance order - since
    # `entries` is sorted most-recent-first, that's also each group's own recency order.
    members_by_group_id: OrderedDict[UUID, list[FoodEntry]] = OrderedDict()
    for entry in entries:
        if entry.meal_group_id not in name_by_group_id:
            continue
        members_by_group_id.setdefault(entry.meal_group_id, []).append(entry)

    query = q.strip().lower()
    counts: dict[str, int] = {}
    latest_by_name: OrderedDict[str, tuple[str, list[FoodEntry]]] = OrderedDict()
    for group_id, members in members_by_group_id.items():
        name = name_by_group_id[group_id]
        name_key = name.lower()
        if query and query not in name_key:
            continue
        counts[name_key] = counts.get(name_key, 0) + 1
        latest_by_name.setdefault(name_key, (name, members))

    results = []
    for name_key, (name, members) in latest_by_name.items():
        results.append(
            HistoryGroupOut(
                name=name,
                items=[
                    HistoryGroupItemOut(
                        name=member.name,
                        brand=member.brand,
                        barcode=member.barcode,
                        grams=member.grams,
                        input_unit=member.input_unit,
                        input_amount=member.input_amount,
                        unit_to_grams=member.unit_to_grams,
                        calories_per_100g=member.calories_per_100g,
                        protein_per_100g=member.protein_per_100g,
                        carbs_per_100g=member.carbs_per_100g,
                        fat_per_100g=member.fat_per_100g,
                    )
                    for member in members
                ],
                calories=sum(member.calories for member in members),
                last_logged_at=max(member.consumed_at for member in members),
                times_logged=counts[name_key],
            )
        )
        if len(results) >= _RESULT_LIMIT:
            break
    return results


history_router = Router(path="/api/history", route_handlers=[history_foods, history_groups])
