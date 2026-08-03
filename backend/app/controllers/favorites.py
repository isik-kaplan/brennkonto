from uuid import UUID

from litestar import Request, Router, delete, get, post
from litestar.exceptions import NotFoundException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Favorite, _utcnow
from app.schemas import FavoriteOut, UpsertFavoriteRequest
from app.serializers import favorite_out


async def _get_owned_favorite(db_session: AsyncSession, request: Request, favorite_id: UUID) -> Favorite:
    favorite = await db_session.get(Favorite, favorite_id)
    if favorite is None or favorite.user_id != request.user.id:
        raise NotFoundException("No favorite found with this id.")
    return favorite


@get("/")
async def list_favorites(db_session: AsyncSession, request: Request) -> list[FavoriteOut]:
    favorites = list(
        await db_session.scalars(select(Favorite).where(Favorite.user_id == request.user.id).order_by(Favorite.name))
    )
    return [favorite_out(favorite) for favorite in favorites]


@post("/")
async def upsert_favorite(data: UpsertFavoriteRequest, db_session: AsyncSession, request: Request) -> FavoriteOut:
    # Saving over an existing favorite (same barcode) overwrites it in place - this is what makes
    # "favorite a search result" and "update a favorite's default amount from the amount form" the
    # same call, and what keeps re-favoriting from ever creating a duplicate.
    favorite = await db_session.scalar(
        select(Favorite).where(Favorite.user_id == request.user.id, Favorite.barcode == data.barcode)
    )
    if favorite is None:
        favorite = Favorite(user_id=request.user.id, barcode=data.barcode)
        db_session.add(favorite)
    else:
        favorite.updated_at = _utcnow()
    favorite.name = data.name
    favorite.brand = data.brand
    favorite.calories_per_100g = data.calories_per_100g
    favorite.protein_per_100g = data.protein_per_100g
    favorite.carbs_per_100g = data.carbs_per_100g
    favorite.fat_per_100g = data.fat_per_100g
    favorite.default_input_unit = data.default_input_unit
    favorite.default_input_amount = data.default_input_amount
    favorite.default_unit_to_grams = data.default_unit_to_grams
    await db_session.commit()
    return favorite_out(favorite)


@delete("/{favorite_id:uuid}")
async def delete_favorite(favorite_id: UUID, db_session: AsyncSession, request: Request) -> None:
    favorite = await _get_owned_favorite(db_session, request, favorite_id)
    await db_session.delete(favorite)
    await db_session.commit()


favorites_router = Router(path="/api/favorites", route_handlers=[list_favorites, upsert_favorite, delete_favorite])
