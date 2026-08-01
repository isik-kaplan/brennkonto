import httpx

from app.config import settings
from app.schemas import FoodSearchResultOut


def _normalize_brand(brand: str | list[str] | None) -> str | None:
    if isinstance(brand, list):
        return ", ".join(brand) or None
    return brand or None


def _extract_macros(product: dict) -> dict | None:
    nutriments = product.get("nutriments") or {}
    calories = nutriments.get("energy-kcal_100g")
    if calories is None:
        energy_kj = nutriments.get("energy_100g")
        calories = energy_kj / 4.184 if energy_kj is not None else None
    if calories is None:
        return None
    return {
        "calories_per_100g": float(calories),
        "protein_per_100g": float(nutriments.get("proteins_100g") or 0),
        "carbs_per_100g": float(nutriments.get("carbohydrates_100g") or 0),
        "fat_per_100g": float(nutriments.get("fat_100g") or 0),
    }


def _to_result(product: dict) -> FoodSearchResultOut | None:
    macros = _extract_macros(product)
    barcode = product.get("code")
    name = product.get("product_name") or product.get("product_name_en")
    if macros is None or not barcode or not name:
        return None
    return FoodSearchResultOut(barcode=barcode, name=name, brand=_normalize_brand(product.get("brands")), **macros)


class OpenFoodFactsClient:
    """Client over the public Open Food Facts APIs - the live query surface for the dataset
    described at https://world.openfoodfacts.org/data. Search goes through the Search-a-licious
    service (search.openfoodfacts.org); single-product lookups go through the stable v2 product
    API on world.openfoodfacts.org. Products missing usable energy data are dropped rather than
    surfaced as zero-calorie entries."""

    _fields = "code,product_name,product_name_en,brands,nutriments"

    def __init__(self) -> None:
        self._headers = {"User-Agent": settings.OFF_USER_AGENT}

    async def search(self, query: str, page_size: int = 20) -> list[FoodSearchResultOut]:
        async with httpx.AsyncClient(
            base_url=settings.OFF_SEARCH_BASE_URL, headers=self._headers, timeout=10
        ) as client:
            response = await client.get("/search", params={"q": query, "page_size": page_size, "fields": self._fields})
            response.raise_for_status()
            hits = response.json().get("hits", [])
        results = (_to_result(hit) for hit in hits)
        return [result for result in results if result is not None]

    async def get_by_barcode(self, barcode: str) -> FoodSearchResultOut | None:
        async with httpx.AsyncClient(base_url=settings.OFF_BASE_URL, headers=self._headers, timeout=10) as client:
            response = await client.get(f"/api/v2/product/{barcode}.json", params={"fields": self._fields})
            if response.status_code == 404:
                return None
            response.raise_for_status()
            payload = response.json()
        if payload.get("status") != 1:
            return None
        return _to_result(payload["product"])


off_client = OpenFoodFactsClient()
