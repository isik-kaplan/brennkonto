from collections import OrderedDict
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FoodEntry


# How many of the user's most recent (non-deleted) entries to scan before deduplicating - bounds
# the query for a long-running account without needing "distinct on, latest row per key" support,
# which SQLite has none of. The resulting times_logged is therefore "times logged within this
# recent window", not a true all-time count - an approximation that's accurate for anything a
# user would plausibly want to re-log or see prioritized in search.
SCAN_LIMIT = 1000


def food_key(entry: FoodEntry) -> str:
    # Barcode is the natural identity for anything looked up via OFF - the only way an entry is
    # ever created today. name+brand is a defensive fallback for the barcode-less rows the model
    # still allows at the schema level.
    if entry.barcode:
        return f"b:{entry.barcode}"
    return f"n:{entry.name.strip().lower()}|{(entry.brand or '').strip().lower()}"


def matches_query(entry: FoodEntry, query: str) -> bool:
    return query in entry.name.lower() or (entry.brand is not None and query in entry.brand.lower())


async def logged_foods_matching(
    db_session: AsyncSession, user_id: UUID, query: str
) -> tuple[dict[str, int], "OrderedDict[str, FoodEntry]"]:
    """Scans the user's recent entries for ones matching `query` (already lowercased; an empty
    query matches everything), deduplicated to one FoodEntry per distinct food - the most
    recently logged instance, since entries are scanned most-recent-first. Returns
    (times_logged_by_key, latest_entry_by_key); the latter preserves that same most-recent-first
    order. Shared by the history browser (app/controllers/history.py) and the main product
    search's "prioritize what I've logged before" ordering (app/controllers/foods.py)."""
    entries = list(
        await db_session.scalars(
            select(FoodEntry)
            .where(FoodEntry.user_id == user_id, FoodEntry.deleted_at.is_(None))
            .order_by(FoodEntry.consumed_at.desc())
            .limit(SCAN_LIMIT)
        )
    )
    counts: dict[str, int] = {}
    latest_by_key: OrderedDict[str, FoodEntry] = OrderedDict()
    for entry in entries:
        if query and not matches_query(entry, query):
            continue
        key = food_key(entry)
        counts[key] = counts.get(key, 0) + 1
        latest_by_key.setdefault(key, entry)
    return counts, latest_by_key
