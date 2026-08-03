NOT_FOUND_ID = "11111111-1111-1111-1111-111111111111"

FAVORITE_PAYLOAD = {
    "barcode": "123456",
    "name": "Greek yogurt",
    "brand": "Fage",
    "calories_per_100g": 59,
    "protein_per_100g": 10,
    "carbs_per_100g": 3.6,
    "fat_per_100g": 0.4,
}


async def test_list_favorites_is_empty_for_a_new_user(authed_client) -> None:
    response = await authed_client.get("/api/favorites")
    assert response.status_code == 200
    assert response.json() == []


async def test_upsert_favorite_creates_a_new_favorite_without_a_default_amount(authed_client) -> None:
    response = await authed_client.post("/api/favorites", json=FAVORITE_PAYLOAD)
    assert response.status_code == 201
    body = response.json()
    assert body["barcode"] == "123456"
    assert body["name"] == "Greek yogurt"
    assert body["brand"] == "Fage"
    assert body["default_input_unit"] is None
    assert body["default_input_amount"] is None
    assert body["default_unit_to_grams"] is None

    listing = await authed_client.get("/api/favorites")
    assert len(listing.json()) == 1


async def test_upsert_favorite_can_set_a_default_amount(authed_client) -> None:
    response = await authed_client.post(
        "/api/favorites",
        json={
            **FAVORITE_PAYLOAD,
            "default_input_unit": "g",
            "default_input_amount": 150,
            "default_unit_to_grams": 1.0,
        },
    )
    body = response.json()
    assert body["default_input_unit"] == "g"
    assert body["default_input_amount"] == 150
    assert body["default_unit_to_grams"] == 1.0


async def test_upsert_favorite_overwrites_the_existing_favorite_for_the_same_barcode(authed_client) -> None:
    first = await authed_client.post("/api/favorites", json=FAVORITE_PAYLOAD)
    second = await authed_client.post(
        "/api/favorites",
        json={
            **FAVORITE_PAYLOAD,
            "name": "Greek yogurt 0%",
            "default_input_unit": "g",
            "default_input_amount": 200,
            "default_unit_to_grams": 1.0,
        },
    )

    assert first.json()["id"] == second.json()["id"]
    assert second.json()["name"] == "Greek yogurt 0%"
    assert second.json()["default_input_amount"] == 200

    listing = (await authed_client.get("/api/favorites")).json()
    assert len(listing) == 1
    assert listing[0]["name"] == "Greek yogurt 0%"


async def test_upsert_favorite_can_clear_a_previously_set_default_amount(authed_client) -> None:
    await authed_client.post(
        "/api/favorites",
        json={**FAVORITE_PAYLOAD, "default_input_unit": "g", "default_input_amount": 150, "default_unit_to_grams": 1.0},
    )
    # Re-saving without the default_* fields clears them, rather than leaving the old ones in place.
    response = await authed_client.post("/api/favorites", json=FAVORITE_PAYLOAD)
    assert response.json()["default_input_amount"] is None


async def test_list_favorites_is_sorted_by_name(authed_client) -> None:
    await authed_client.post("/api/favorites", json={**FAVORITE_PAYLOAD, "barcode": "2", "name": "Zucchini"})
    await authed_client.post("/api/favorites", json={**FAVORITE_PAYLOAD, "barcode": "1", "name": "Almonds"})

    listing = (await authed_client.get("/api/favorites")).json()
    assert [favorite["name"] for favorite in listing] == ["Almonds", "Zucchini"]


async def test_delete_favorite(authed_client) -> None:
    created = await authed_client.post("/api/favorites", json=FAVORITE_PAYLOAD)
    favorite_id = created.json()["id"]

    response = await authed_client.delete(f"/api/favorites/{favorite_id}")
    assert response.status_code == 204
    assert (await authed_client.get("/api/favorites")).json() == []


async def test_delete_favorite_not_found(authed_client) -> None:
    response = await authed_client.delete(f"/api/favorites/{NOT_FOUND_ID}")
    assert response.status_code == 404


async def test_delete_favorite_owned_by_another_user_is_not_found(authed_client) -> None:
    created = await authed_client.post("/api/favorites", json=FAVORITE_PAYLOAD)
    favorite_id = created.json()["id"]

    await authed_client.post(
        "/api/auth/register", json={"email": "other@b.com", "password": "correcthorsebattery", "display_name": "Bob"}
    )
    response = await authed_client.delete(f"/api/favorites/{favorite_id}")
    assert response.status_code == 404


async def test_list_favorites_only_returns_the_current_users_favorites(authed_client) -> None:
    await authed_client.post("/api/favorites", json=FAVORITE_PAYLOAD)

    await authed_client.post(
        "/api/auth/register", json={"email": "other@b.com", "password": "correcthorsebattery", "display_name": "Bob"}
    )
    response = await authed_client.get("/api/favorites")
    assert response.json() == []
