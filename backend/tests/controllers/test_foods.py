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


async def test_search_caches_and_returns_the_suggested_unit(authed_client, monkeypatch) -> None:
    async def fake_search(query: str, page_size: int = 20) -> list[FoodSearchResultOut]:
        return [
            FoodSearchResultOut(
                barcode="4",
                name="Eggs",
                brand=None,
                calories_per_100g=155.0,
                protein_per_100g=13.0,
                carbs_per_100g=1.1,
                fat_per_100g=11.0,
                suggested_unit="count",
                unit_to_grams=53.0,
            )
        ]

    monkeypatch.setattr(off_client, "search", fake_search)

    response = await authed_client.get("/api/foods/search?q=eggs")
    assert response.json()[0]["suggested_unit"] == "count"
    assert response.json()[0]["unit_to_grams"] == 53.0

    cached = await authed_client.get("/api/foods/barcode/4")
    assert cached.json()["suggested_unit"] == "count"
    assert cached.json()["unit_to_grams"] == 53.0


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


async def test_search_boosts_a_previously_logged_result_above_new_ones(authed_client, monkeypatch) -> None:
    await authed_client.post(
        "/api/entries/",
        json={
            "name": "Nutella",
            "brand": "Ferrero",
            "barcode": "3017620422003",
            "grams": 30,
            "calories_per_100g": 539,
            "protein_per_100g": 6.3,
            "carbs_per_100g": 57.5,
            "fat_per_100g": 30.9,
            "consumed_at": "2026-08-01T08:00:00Z",
        },
    )

    async def fake_search(query: str, page_size: int = 20) -> list[FoodSearchResultOut]:
        return [
            FoodSearchResultOut(
                barcode="1",
                name="Unrelated Unbranded Spread",
                brand=None,
                calories_per_100g=100.0,
                protein_per_100g=1.0,
                carbs_per_100g=2.0,
                fat_per_100g=3.0,
            ),
            NUTELLA,
        ]

    monkeypatch.setattr(off_client, "search", fake_search)

    response = await authed_client.get("/api/foods/search?q=nutella")
    assert response.status_code == 200
    results = response.json()
    # Logged before, so it jumps ahead of the unbranded result despite OFF returning it second.
    assert results[0]["name"] == "Nutella"
    assert results[1]["name"] == "Unrelated Unbranded Spread"


async def test_search_orders_multiple_logged_results_by_times_logged_then_recency(authed_client, monkeypatch) -> None:
    # The entries below all carry a shared "widget" marker in their name so one query matches
    # all three in history - the response still reports OFF's own (unmarked) names, since a
    # "seen" logged item is returned straight from its OFF search result, not rebuilt from the
    # logged entry.

    # Logged once, a while ago.
    await authed_client.post(
        "/api/entries/",
        json={
            "name": "Widget Banana",
            "barcode": "4011",
            "grams": 120,
            "calories_per_100g": 89,
            "protein_per_100g": 1.1,
            "carbs_per_100g": 22.8,
            "fat_per_100g": 0.3,
            "consumed_at": "2026-08-01T08:00:00Z",
        },
    )
    # Logged three times, most recently after the banana.
    for i in range(3):
        await authed_client.post(
            "/api/entries/",
            json={
                "name": "Widget Nutella",
                "brand": "Ferrero",
                "barcode": "3017620422003",
                "grams": 30,
                "calories_per_100g": 539,
                "protein_per_100g": 6.3,
                "carbs_per_100g": 57.5,
                "fat_per_100g": 30.9,
                "consumed_at": f"2026-08-0{2 + i}T08:00:00Z",
            },
        )
    # Logged once, most recently of all.
    await authed_client.post(
        "/api/entries/",
        json={
            "name": "Widget Oat Milk",
            "barcode": "5000",
            "grams": 200,
            "calories_per_100g": 45,
            "protein_per_100g": 1.0,
            "carbs_per_100g": 6.5,
            "fat_per_100g": 1.5,
            "consumed_at": "2026-08-06T08:00:00Z",
        },
    )

    async def fake_search(query: str, page_size: int = 20) -> list[FoodSearchResultOut]:
        return [
            FoodSearchResultOut(
                barcode="4011",
                name="Banana",
                brand=None,
                calories_per_100g=89.0,
                protein_per_100g=1.1,
                carbs_per_100g=22.8,
                fat_per_100g=0.3,
            ),
            NUTELLA,
            FoodSearchResultOut(
                barcode="5000",
                name="Oat Milk",
                brand=None,
                calories_per_100g=45.0,
                protein_per_100g=1.0,
                carbs_per_100g=6.5,
                fat_per_100g=1.5,
            ),
        ]

    monkeypatch.setattr(off_client, "search", fake_search)

    response = await authed_client.get("/api/foods/search?q=widget")
    body = response.json()
    # Nutella (3x) beats both single-log foods regardless of OFF's own order; between the two
    # single-log foods, Oat Milk (logged most recently) beats Banana.
    assert [result["name"] for result in body] == ["Nutella", "Oat Milk", "Banana"]


async def test_search_surfaces_a_logged_food_off_search_does_not_return(authed_client, monkeypatch) -> None:
    await authed_client.post(
        "/api/entries/",
        json={
            "name": "Nutella",
            "brand": "Ferrero",
            "barcode": "3017620422003",
            "grams": 30,
            "calories_per_100g": 539,
            "protein_per_100g": 6.3,
            "carbs_per_100g": 57.5,
            "fat_per_100g": 30.9,
            "consumed_at": "2026-08-01T08:00:00Z",
        },
    )

    async def fake_search(query: str, page_size: int = 20) -> list[FoodSearchResultOut]:
        return []

    monkeypatch.setattr(off_client, "search", fake_search)

    response = await authed_client.get("/api/foods/search?q=nutella")
    body = response.json()
    assert len(body) == 1
    assert body[0]["name"] == "Nutella"
    assert body[0]["barcode"] == "3017620422003"


async def test_search_skips_boosting_a_barcode_less_logged_entry(authed_client, monkeypatch) -> None:
    payload = {
        "name": "Homemade Soup",
        "grams": 300,
        "calories_per_100g": 60,
        "protein_per_100g": 3.0,
        "carbs_per_100g": 8.0,
        "fat_per_100g": 1.5,
        "consumed_at": "2026-08-01T08:00:00Z",
    }
    await authed_client.post("/api/entries/", json=payload)

    async def fake_search(query: str, page_size: int = 20) -> list[FoodSearchResultOut]:
        return []

    monkeypatch.setattr(off_client, "search", fake_search)

    response = await authed_client.get("/api/foods/search?q=soup")
    assert response.json() == []


async def test_search_dedupes_results_sharing_a_name_and_brand(authed_client, monkeypatch) -> None:
    async def fake_search(query: str, page_size: int = 20) -> list[FoodSearchResultOut]:
        return [
            FoodSearchResultOut(
                barcode="1",
                name="Blueberry Muffin",
                brand=None,
                calories_per_100g=380.0,
                protein_per_100g=5.0,
                carbs_per_100g=50.0,
                fat_per_100g=15.0,
            ),
            # Same name+brand (case/whitespace aside), different barcode - a separate scan of
            # what reads as the same product in the list, and should be dropped.
            FoodSearchResultOut(
                barcode="2",
                name="  blueberry muffin  ",
                brand="",
                calories_per_100g=390.0,
                protein_per_100g=5.5,
                carbs_per_100g=49.0,
                fat_per_100g=16.0,
            ),
            # Same name, but a real distinguishing brand - a genuinely different product, kept.
            NUTELLA,
        ]

    monkeypatch.setattr(off_client, "search", fake_search)

    response = await authed_client.get("/api/foods/search?q=blueberry")
    assert response.status_code == 200
    results = response.json()
    barcodes = [result["barcode"] for result in results]
    assert barcodes == ["1", "3017620422003"]


async def test_search_paginates_without_gaps_or_repeats(authed_client, monkeypatch) -> None:
    all_results = [
        FoodSearchResultOut(
            barcode=str(i),
            name=f"Product {i}",
            brand="Brand",
            calories_per_100g=100.0,
            protein_per_100g=1.0,
            carbs_per_100g=2.0,
            fat_per_100g=3.0,
        )
        for i in range(60)
    ]

    async def fake_search(query: str, page_size: int = 20) -> list[FoodSearchResultOut]:
        return all_results[:page_size]

    monkeypatch.setattr(off_client, "search", fake_search)

    first_page = (await authed_client.get("/api/foods/search?q=product")).json()
    second_page = (await authed_client.get("/api/foods/search?q=product&page=2")).json()
    assert [r["barcode"] for r in first_page] == [str(i) for i in range(25)]
    assert [r["barcode"] for r in second_page] == [str(i) for i in range(25, 50)]
    # The two pages never repeat a result between them.
    assert not set(r["barcode"] for r in first_page) & set(r["barcode"] for r in second_page)


async def test_search_rejects_a_page_below_one(authed_client) -> None:
    response = await authed_client.get("/api/foods/search?q=nutella&page=0")
    assert response.status_code == 400


async def test_search_prioritizes_unbranded_results(authed_client, monkeypatch) -> None:
    async def fake_search(query: str, page_size: int = 20) -> list[FoodSearchResultOut]:
        return [
            FoodSearchResultOut(
                barcode="1",
                name="Branded Product 1",
                brand="Brand A",
                calories_per_100g=100.0,
                protein_per_100g=1.0,
                carbs_per_100g=2.0,
                fat_per_100g=3.0,
            ),
            FoodSearchResultOut(
                barcode="2",
                name="Unbranded Product 1",
                brand=None,
                calories_per_100g=100.0,
                protein_per_100g=1.0,
                carbs_per_100g=2.0,
                fat_per_100g=3.0,
            ),
            FoodSearchResultOut(
                barcode="3",
                name="Branded Product 2",
                brand="Brand B",
                calories_per_100g=100.0,
                protein_per_100g=1.0,
                carbs_per_100g=2.0,
                fat_per_100g=3.0,
            ),
            FoodSearchResultOut(
                barcode="4",
                name="Unbranded Product 2",
                brand="",
                calories_per_100g=100.0,
                protein_per_100g=1.0,
                carbs_per_100g=2.0,
                fat_per_100g=3.0,
            ),
        ]

    monkeypatch.setattr(off_client, "search", fake_search)

    response = await authed_client.get("/api/foods/search?q=test")
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 4
    # The two unbranded ones (None and "") should be first, preserving their relative order
    assert results[0]["name"] == "Unbranded Product 1"
    assert results[1]["name"] == "Unbranded Product 2"
    # The two branded ones should follow, preserving their relative order
    assert results[2]["name"] == "Branded Product 1"
    assert results[3]["name"] == "Branded Product 2"
