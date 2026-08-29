from datetime import datetime

from litestar import Request, Router, get
from litestar.exceptions import NotFoundException
from litestar.params import Parameter
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ProductCache
from app.schemas import FoodSearchResultOut
from app.services.food_history import logged_foods_matching
from app.services.off_client import off_client


# Cap on returned results - kept a bit above the historical 20 so a handful of boosted "you've
# logged this before" items don't crowd out fresh OFF matches entirely.
_RESULT_LIMIT = 25


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
async def search_foods(
    db_session: AsyncSession, request: Request, q: str = Parameter(min_length=2)
) -> list[FoodSearchResultOut]:
    counts, latest_by_key = await logged_foods_matching(db_session, request.user.id, q.strip().lower())

    results = await off_client.search(q, page_size=100)
    results.sort(key=lambda x: 0 if not x.brand else 1)

    # Split OFF's results into things this user has logged before (barcode-keyed, same identity
    # as history's food_key) and everything else, so the logged ones can be boosted to the top
    # without disturbing OFF's own relevance order for the rest.
    logged_tier: list[FoodSearchResultOut] = []
    new_tier: list[FoodSearchResultOut] = []
    seen_keys: set[str] = set()
    for result in results:
        key = f"b:{result.barcode}"
        if key in latest_by_key:
            logged_tier.append(result)
            seen_keys.add(key)
        else:
            new_tier.append(result)

    # Anything logged before that OFF's own text search didn't surface at all (different wording,
    # or a product OFF has since delisted) still deserves to show up here rather than be dropped -
    # built straight from the logged entry. Barcode-less entries (the name+brand fallback) are
    # skipped: there's no stable barcode to key a search result or a future re-log by.
    for key, entry in latest_by_key.items():
        if key in seen_keys or entry.barcode is None:
            continue
        logged_tier.append(
            FoodSearchResultOut(
                barcode=entry.barcode,
                name=entry.name,
                brand=entry.brand,
                calories_per_100g=entry.calories_per_100g,
                protein_per_100g=entry.protein_per_100g,
                carbs_per_100g=entry.carbs_per_100g,
                fat_per_100g=entry.fat_per_100g,
                suggested_unit=entry.input_unit,
                unit_to_grams=entry.unit_to_grams,
            )
        )

    def _logged_sort_key(result: FoodSearchResultOut) -> tuple[int, datetime]:
        key = f"b:{result.barcode}"
        return (counts[key], latest_by_key[key].consumed_at)

    # Most-logged first; ties broken by whichever was logged most recently.
    logged_tier.sort(key=_logged_sort_key, reverse=True)

    top_results = (logged_tier + new_tier)[:_RESULT_LIMIT]
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
