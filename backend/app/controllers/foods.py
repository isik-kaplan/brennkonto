from litestar import Router, get
from litestar.exceptions import NotFoundException
from litestar.params import Parameter
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ProductCache
from app.schemas import FoodSearchResultOut
from app.services.off_client import off_client


def _cache_out(cache: ProductCache) -> FoodSearchResultOut:
    return FoodSearchResultOut(
        barcode=cache.barcode,
        name=cache.name,
        brand=cache.brand,
        calories_per_100g=cache.calories_per_100g,
        protein_per_100g=cache.protein_per_100g,
        carbs_per_100g=cache.carbs_per_100g,
        fat_per_100g=cache.fat_per_100g,
        suggested_unit=cache.suggested_unit,
        unit_to_grams=cache.unit_to_grams,
    )


async def _upsert_cache(db_session: AsyncSession, result: FoodSearchResultOut) -> None:
    cache = await db_session.get(ProductCache, result.barcode)
    if cache is None:
        cache = ProductCache(barcode=result.barcode, name=result.name)
        db_session.add(cache)
    cache.name = result.name
    cache.brand = result.brand
    cache.calories_per_100g = result.calories_per_100g
    cache.protein_per_100g = result.protein_per_100g
    cache.carbs_per_100g = result.carbs_per_100g
    cache.fat_per_100g = result.fat_per_100g
    cache.suggested_unit = result.suggested_unit
    cache.unit_to_grams = result.unit_to_grams
    await db_session.commit()


@get("/search")
async def search_foods(db_session: AsyncSession, q: str = Parameter(min_length=2)) -> list[FoodSearchResultOut]:
    results = await off_client.search(q, page_size=100)
    results.sort(key=lambda x: 0 if not x.brand else 1)
    top_results = results[:20]
    for result in top_results:
        await _upsert_cache(db_session, result)
    return top_results


@get("/barcode/{barcode:str}")
async def get_food_by_barcode(db_session: AsyncSession, barcode: str) -> FoodSearchResultOut:
    cache = await db_session.get(ProductCache, barcode)
    if cache is not None:
        return _cache_out(cache)

    result = await off_client.get_by_barcode(barcode)
    if result is None:
        raise NotFoundException("No product found for this barcode.")
    await _upsert_cache(db_session, result)
    return result


foods_router = Router(path="/api/foods", route_handlers=[search_foods, get_food_by_barcode])
