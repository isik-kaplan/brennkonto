NUTELLA_PAYLOAD = {
    "name": "Nutella",
    "brand": "Ferrero",
    "barcode": "3017620422003",
    "grams": 30,
    "calories_per_100g": 539,
    "protein_per_100g": 6.3,
    "carbs_per_100g": 57.5,
    "fat_per_100g": 30.9,
    "consumed_at": "2026-08-01T08:00:00Z",
}

BANANA_PAYLOAD = {
    "name": "Banana",
    "barcode": "4011",
    "grams": 120,
    "calories_per_100g": 89,
    "protein_per_100g": 1.1,
    "carbs_per_100g": 22.8,
    "fat_per_100g": 0.3,
    "consumed_at": "2026-08-02T08:00:00Z",
}


async def test_history_foods_dedupes_by_barcode_keeping_the_most_recent(authed_client) -> None:
    await authed_client.post("/api/entries/", json=NUTELLA_PAYLOAD)
    await authed_client.post(
        "/api/entries/", json={**NUTELLA_PAYLOAD, "grams": 45, "consumed_at": "2026-08-05T08:00:00Z"}
    )

    response = await authed_client.get("/api/history/foods")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["barcode"] == "3017620422003"
    assert body[0]["last_input_amount"] == 45
    assert body[0]["last_logged_at"].startswith("2026-08-05")
    assert body[0]["times_logged"] == 2


async def test_history_foods_orders_most_recently_logged_first(authed_client) -> None:
    await authed_client.post("/api/entries/", json=NUTELLA_PAYLOAD)
    await authed_client.post("/api/entries/", json=BANANA_PAYLOAD)

    response = await authed_client.get("/api/history/foods")
    body = response.json()
    assert [food["name"] for food in body] == ["Banana", "Nutella"]


async def test_history_foods_filters_by_query_against_name_and_brand(authed_client) -> None:
    await authed_client.post("/api/entries/", json=NUTELLA_PAYLOAD)
    await authed_client.post("/api/entries/", json=BANANA_PAYLOAD)

    response = await authed_client.get("/api/history/foods?q=ferrero")
    body = response.json()
    assert len(body) == 1
    assert body[0]["name"] == "Nutella"

    response = await authed_client.get("/api/history/foods?q=nothing-matches-this")
    assert response.json() == []


async def test_history_foods_excludes_soft_deleted_entries(authed_client) -> None:
    create_response = await authed_client.post("/api/entries/", json=NUTELLA_PAYLOAD)
    entry_id = create_response.json()["id"]
    await authed_client.delete(f"/api/entries/{entry_id}")

    response = await authed_client.get("/api/history/foods")
    assert response.json() == []


async def test_history_foods_only_returns_the_current_users_entries(authed_client, client) -> None:
    await authed_client.post("/api/entries/", json=NUTELLA_PAYLOAD)

    await client.post(
        "/api/auth/register",
        json={"email": "other@brennkonto.local", "password": "correcthorsebattery", "display_name": "Other"},
    )
    response = await client.get("/api/history/foods")
    assert response.json() == []


async def test_history_groups_ignores_unnamed_groups(authed_client) -> None:
    await authed_client.post("/api/entries/", json=NUTELLA_PAYLOAD)

    response = await authed_client.get("/api/history/groups")
    assert response.status_code == 200
    assert response.json() == []


async def test_history_groups_returns_a_named_combo_with_its_items(authed_client) -> None:
    nutella = (await authed_client.post("/api/entries/", json=NUTELLA_PAYLOAD)).json()
    banana = (await authed_client.post("/api/entries/", json=BANANA_PAYLOAD)).json()
    await authed_client.post(
        "/api/meal-groups/", json={"entry_ids": [nutella["id"], banana["id"]], "name": "Breakfast"}
    )

    response = await authed_client.get("/api/history/groups")
    body = response.json()
    assert len(body) == 1
    assert body[0]["name"] == "Breakfast"
    assert {item["name"] for item in body[0]["items"]} == {"Nutella", "Banana"}
    assert body[0]["calories"] == nutella["calories"] + banana["calories"]
    assert body[0]["times_logged"] == 1


async def test_history_groups_dedupes_by_name_keeping_the_most_recent_occurrence(authed_client) -> None:
    first = (await authed_client.post("/api/entries/", json=NUTELLA_PAYLOAD)).json()
    await authed_client.post("/api/meal-groups/", json={"entry_ids": [first["id"]], "name": "Snack"})

    second = (
        await authed_client.post("/api/entries/", json={**NUTELLA_PAYLOAD, "consumed_at": "2026-08-10T08:00:00Z"})
    ).json()
    await authed_client.post("/api/meal-groups/", json={"entry_ids": [second["id"]], "name": "Snack"})

    response = await authed_client.get("/api/history/groups")
    body = response.json()
    assert len(body) == 1
    assert body[0]["times_logged"] == 2
    assert body[0]["last_logged_at"].startswith("2026-08-10")


async def test_history_groups_filters_by_query_against_name(authed_client) -> None:
    nutella = (await authed_client.post("/api/entries/", json=NUTELLA_PAYLOAD)).json()
    await authed_client.post("/api/meal-groups/", json={"entry_ids": [nutella["id"]], "name": "Breakfast"})

    response = await authed_client.get("/api/history/groups?q=break")
    assert len(response.json()) == 1

    response = await authed_client.get("/api/history/groups?q=dinner")
    assert response.json() == []


async def test_history_endpoints_require_authentication(client) -> None:
    assert (await client.get("/api/history/foods")).status_code == 401
    assert (await client.get("/api/history/groups")).status_code == 401
