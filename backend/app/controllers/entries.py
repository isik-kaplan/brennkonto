from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from litestar import Request, Router, delete, get, patch, post
from litestar.exceptions import NotFoundException
from litestar.params import Parameter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FoodEntry, _utcnow
from app.schemas import CreateFoodEntryRequest, FoodEntryOut, UpdateFoodEntryRequest
from app.serializers import entry_out


async def _get_owned_entry(db_session: AsyncSession, request: Request, entry_id: UUID) -> FoodEntry:
    entry = await db_session.get(FoodEntry, entry_id)
    if entry is None or entry.user_id != request.user.id:
        raise NotFoundException("No entry found with this id.")
    return entry


@get("/")
async def list_entries(
    db_session: AsyncSession, request: Request, entry_date: date = Parameter(query="date")
) -> list[FoodEntryOut]:
    # consumed_at is a full timestamp now, not a plain date - "which day" means a half-open range
    # rather than exact equality.
    day_start = datetime.combine(entry_date, datetime.min.time(), tzinfo=UTC)
    day_end = day_start + timedelta(days=1)
    entries = await db_session.scalars(
        select(FoodEntry)
        .where(
            FoodEntry.user_id == request.user.id,
            FoodEntry.consumed_at >= day_start,
            FoodEntry.consumed_at < day_end,
        )
        .order_by(FoodEntry.created_at)
    )
    return [entry_out(entry) for entry in entries]


@post("/")
async def create_entry(data: CreateFoodEntryRequest, db_session: AsyncSession, request: Request) -> FoodEntryOut:
    fields = {field: getattr(data, field) for field in data.__struct_fields__}
    if fields["input_amount"] is None:
        fields["input_amount"] = fields["grams"]
    entry = FoodEntry(user_id=request.user.id, **fields)
    db_session.add(entry)
    await db_session.commit()
    return entry_out(entry)


@patch("/{entry_id:uuid}")
async def update_entry(
    entry_id: UUID, data: UpdateFoodEntryRequest, db_session: AsyncSession, request: Request
) -> FoodEntryOut:
    entry = await _get_owned_entry(db_session, request, entry_id)
    entry.grams = data.grams
    entry.consumed_at = data.consumed_at
    entry.updated_at = _utcnow()
    await db_session.commit()
    return entry_out(entry)


@delete("/{entry_id:uuid}")
async def delete_entry(entry_id: UUID, db_session: AsyncSession, request: Request) -> None:
    entry = await _get_owned_entry(db_session, request, entry_id)
    await db_session.delete(entry)
    await db_session.commit()


entries_router = Router(path="/api/entries", route_handlers=[list_entries, create_entry, update_entry, delete_entry])
