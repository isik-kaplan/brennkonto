ENTRY_PAYLOAD = {
    "name": "Banana",
    "grams": 120,
    "calories_per_100g": 89,
    "protein_per_100g": 1.1,
    "carbs_per_100g": 22.8,
    "fat_per_100g": 0.3,
    "consumed_at": "2026-08-01",
}


async def test_create_entry(authed_client) -> None:
    response = await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Banana"
    assert body["calories"] == 106.8
    assert body["protein_g"] == 1.32
    assert body["brand"] is None
    assert body["barcode"] is None


async def test_create_entry_defaults_input_amount_to_grams(authed_client) -> None:
    response = await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    body = response.json()
    assert body["input_unit"] == "g"
    assert body["input_amount"] == 120
    assert body["unit_to_grams"] == 1.0


async def test_create_entry_with_a_count_based_unit(authed_client) -> None:
    payload = {**ENTRY_PAYLOAD, "input_unit": "count", "input_amount": 2, "unit_to_grams": 60}
    response = await authed_client.post("/api/entries/", json=payload)
    body = response.json()
    assert body["input_unit"] == "count"
    assert body["input_amount"] == 2
    assert body["unit_to_grams"] == 60


async def test_create_entry_requires_authentication(client) -> None:
    response = await client.post("/api/entries/", json=ENTRY_PAYLOAD)
    assert response.status_code == 401


async def test_list_entries_for_a_date(authed_client) -> None:
    await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    await authed_client.post("/api/entries/", json={**ENTRY_PAYLOAD, "consumed_at": "2026-08-02"})

    response = await authed_client.get("/api/entries/?date=2026-08-01")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["consumed_at"] == "2026-08-01"


async def test_list_entries_only_returns_the_current_users_entries(authed_client) -> None:
    await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)

    # registering switches this same client's session to the new user - a clean way to assert
    # cross-user isolation without standing up a second TestClient.
    await authed_client.post(
        "/api/auth/register", json={"email": "other@b.com", "password": "correcthorsebattery", "display_name": "Bob"}
    )
    response = await authed_client.get("/api/entries/?date=2026-08-01")
    assert response.status_code == 200
    assert response.json() == []


async def test_update_entry(authed_client) -> None:
    created = await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    entry_id = created.json()["id"]

    response = await authed_client.patch(f"/api/entries/{entry_id}", json={"grams": 200, "consumed_at": "2026-08-03"})
    assert response.status_code == 200
    body = response.json()
    assert body["grams"] == 200
    assert body["consumed_at"] == "2026-08-03"
    assert body["calories"] == 89 * 2


async def test_update_entry_not_found(authed_client) -> None:
    response = await authed_client.patch("/api/entries/999999", json={"grams": 200, "consumed_at": "2026-08-03"})
    assert response.status_code == 404


async def test_update_entry_owned_by_another_user_is_not_found(authed_client) -> None:
    created = await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    entry_id = created.json()["id"]

    await authed_client.post(
        "/api/auth/register", json={"email": "other@b.com", "password": "correcthorsebattery", "display_name": "Bob"}
    )
    response = await authed_client.patch(f"/api/entries/{entry_id}", json={"grams": 1, "consumed_at": "2026-08-01"})
    assert response.status_code == 404


async def test_delete_entry(authed_client) -> None:
    created = await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    entry_id = created.json()["id"]

    response = await authed_client.delete(f"/api/entries/{entry_id}")
    assert response.status_code == 204

    listing = await authed_client.get("/api/entries/?date=2026-08-01")
    assert listing.json() == []


async def test_delete_entry_not_found(authed_client) -> None:
    response = await authed_client.delete("/api/entries/999999")
    assert response.status_code == 404


async def test_delete_entry_owned_by_another_user_is_not_found(authed_client) -> None:
    created = await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    entry_id = created.json()["id"]

    await authed_client.post(
        "/api/auth/register", json={"email": "other@b.com", "password": "correcthorsebattery", "display_name": "Bob"}
    )
    response = await authed_client.delete(f"/api/entries/{entry_id}")
    assert response.status_code == 404
