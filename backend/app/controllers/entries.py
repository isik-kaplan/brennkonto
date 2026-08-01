from datetime import date

from litestar import Request, Router, delete, get, patch, post
from litestar.exceptions import NotFoundException
from litestar.params import Parameter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FoodEntry
from app.schemas import CreateFoodEntryRequest, FoodEntryOut, UpdateFoodEntryRequest
from app.serializers import entry_out


async def _get_owned_entry(db_session: AsyncSession, request: Request, entry_id: int) -> FoodEntry:
    entry = await db_session.get(FoodEntry, entry_id)
    if entry is None or entry.user_id != request.user.id:
        raise NotFoundException("No entry found with this id.")
    return entry


@get("/")
async def list_entries(
    db_session: AsyncSession, request: Request, entry_date: date = Parameter(query="date")
) -> list[FoodEntryOut]:
    entries = await db_session.scalars(
        select(FoodEntry)
        .where(FoodEntry.user_id == request.user.id, FoodEntry.consumed_at == entry_date)
        .order_by(FoodEntry.created_at)
    )
    return [entry_out(entry) for entry in entries]


@post("/")
async def create_entry(data: CreateFoodEntryRequest, db_session: AsyncSession, request: Request) -> FoodEntryOut:
    entry = FoodEntry(user_id=request.user.id, **{field: getattr(data, field) for field in data.__struct_fields__})
    db_session.add(entry)
    await db_session.commit()
    return entry_out(entry)


@patch("/{entry_id:int}")
async def update_entry(
    entry_id: int, data: UpdateFoodEntryRequest, db_session: AsyncSession, request: Request
) -> FoodEntryOut:
    entry = await _get_owned_entry(db_session, request, entry_id)
    entry.grams = data.grams
    entry.consumed_at = data.consumed_at
    await db_session.commit()
    return entry_out(entry)


@delete("/{entry_id:int}")
async def delete_entry(entry_id: int, db_session: AsyncSession, request: Request) -> None:
    entry = await _get_owned_entry(db_session, request, entry_id)
    await db_session.delete(entry)
    await db_session.commit()


entries_router = Router(path="/api/entries", route_handlers=[list_entries, create_entry, update_entry, delete_entry])
