from app.schemas import FoodSearchResultOut
from app.services.off_client import off_client


NUTELLA = FoodSearchResultOut(
    barcode="3017620422003",
    name="Nutella",
    brand="Ferrero",
    calories_per_100g=539.0,
    protein_per_100g=6.3,
    carbs_per_100g=57.5,
    fat_per_100g=30.9,
)


async def test_search_returns_and_caches_results(authed_client, monkeypatch) -> None:
    async def fake_search(query: str, page_size: int = 20) -> list[FoodSearchResultOut]:
        return [NUTELLA]

    monkeypatch.setattr(off_client, "search", fake_search)

    response = await authed_client.get("/api/foods/search?q=nutella")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["name"] == "Nutella"

    # a barcode lookup for the same product should now be served from the cache, not the client
    async def fail_get_by_barcode(barcode: str):
        raise AssertionError("should not hit the OFF client - the cache should serve this")

    monkeypatch.setattr(off_client, "get_by_barcode", fail_get_by_barcode)
    cached = await authed_client.get("/api/foods/barcode/3017620422003")
    assert cached.status_code == 200
    assert cached.json()["name"] == "Nutella"


async def test_search_requires_at_least_two_characters(authed_client) -> None:
    response = await authed_client.get("/api/foods/search?q=a")
    assert response.status_code == 400


async def test_search_requires_authentication(client) -> None:
    response = await client.get("/api/foods/search?q=nutella")
    assert response.status_code == 401


async def test_barcode_lookup_hits_the_client_on_a_cache_miss(authed_client, monkeypatch) -> None:
    async def fake_get_by_barcode(barcode: str) -> FoodSearchResultOut:
        assert barcode == "3017620422003"
        return NUTELLA

    monkeypatch.setattr(off_client, "get_by_barcode", fake_get_by_barcode)

    response = await authed_client.get("/api/foods/barcode/3017620422003")
    assert response.status_code == 200
    assert response.json()["name"] == "Nutella"


async def test_barcode_lookup_returns_404_when_not_found(authed_client, monkeypatch) -> None:
    async def fake_get_by_barcode(barcode: str) -> None:
        return None

    monkeypatch.setattr(off_client, "get_by_barcode", fake_get_by_barcode)

    response = await authed_client.get("/api/foods/barcode/0000000000000")
    assert response.status_code == 404


async def test_repeated_search_updates_an_existing_cache_entry(authed_client, monkeypatch) -> None:
    call_count = 0

    async def fake_search(query: str, page_size: int = 20) -> list[FoodSearchResultOut]:
        nonlocal call_count
        call_count += 1
        calories = 539.0 if call_count == 1 else 550.0
        return [
            FoodSearchResultOut(
                barcode="3017620422003",
                name="Nutella",
                brand="Ferrero",
                calories_per_100g=calories,
                protein_per_100g=6.3,
                carbs_per_100g=57.5,
                fat_per_100g=30.9,
            )
        ]

    monkeypatch.setattr(off_client, "search", fake_search)

    first = await authed_client.get("/api/foods/search?q=nutella")
    assert first.json()[0]["calories_per_100g"] == 539.0

    # OFF's own data changed between requests - the second search should overwrite the cached
    # row (the update branch in _upsert_cache), not just skip re-inserting it.
    second = await authed_client.get("/api/foods/search?q=nutella")
    assert second.json()[0]["calories_per_100g"] == 550.0

    cached = await authed_client.get("/api/foods/barcode/3017620422003")
    assert cached.json()["calories_per_100g"] == 550.0
