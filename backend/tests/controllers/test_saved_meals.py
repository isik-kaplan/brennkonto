import pytest


OATS = {
    "name": "Oats",
    "barcode": "5000",
    "input_amount": 60,
    "calories_per_100g": 380,
    "protein_per_100g": 13,
    "carbs_per_100g": 60,
    "fat_per_100g": 7,
}

EGG = {
    "name": "Egg",
    "barcode": "6000",
    "input_unit": "count",
    "input_amount": 2,
    "unit_to_grams": 50,
    "calories_per_100g": 155,
    "protein_per_100g": 13,
    "carbs_per_100g": 1,
    "fat_per_100g": 11,
}


async def test_create_saved_meal_computes_grams_and_totals(authed_client) -> None:
    response = await authed_client.post("/api/saved-meals/", json={"name": " Breakfast ", "items": [OATS, EGG]})
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Breakfast"
    assert [item["grams"] for item in body["items"]] == [60, 100]
    assert body["calories"] == 60 * 3.8 + 100 * 1.55
    assert body["protein_g"] == 60 * 0.13 + 100 * 0.13


async def test_list_saved_meals_returns_only_the_current_users_meals(authed_client) -> None:
    await authed_client.post("/api/saved-meals/", json={"name": "Breakfast", "items": [OATS]})
    assert [meal["name"] for meal in (await authed_client.get("/api/saved-meals/")).json()] == ["Breakfast"]

    await authed_client.post(
        "/api/auth/register", json={"email": "other@b.com", "password": "correcthorsebattery", "display_name": "Bob"}
    )
    assert (await authed_client.get("/api/saved-meals/")).json() == []


@pytest.mark.parametrize(
    ("payload", "detail"),
    [
        ({"name": "  ", "items": [OATS]}, "A meal needs a name."),
        ({"name": "Empty", "items": []}, "A meal needs at least one food."),
        ({"name": "Zero", "items": [{**OATS, "input_amount": 0}]}, "Every food in a meal needs an amount above zero."),
    ],
)
async def test_create_saved_meal_rejects_invalid_input(authed_client, payload, detail) -> None:
    response = await authed_client.post("/api/saved-meals/", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == detail


async def test_create_saved_meal_accepts_a_fractional_amount(authed_client) -> None:
    response = await authed_client.post(
        "/api/saved-meals/", json={"name": "Half an egg", "items": [{**EGG, "input_amount": 0.5}]}
    )
    assert response.status_code == 201
    assert response.json()["items"][0]["grams"] == 25


async def test_create_saved_meal_takes_a_gram_amount_as_is_whatever_the_conversion(authed_client) -> None:
    eggs_in_grams = {**EGG, "input_unit": "g", "input_amount": 120}
    response = await authed_client.post("/api/saved-meals/", json={"name": "Eggs", "items": [eggs_in_grams]})
    assert response.json()["items"][0]["grams"] == 120


async def test_saved_meal_names_are_unique_case_insensitively(authed_client) -> None:
    await authed_client.post("/api/saved-meals/", json={"name": "Breakfast", "items": [OATS]})
    response = await authed_client.post("/api/saved-meals/", json={"name": "breakfast", "items": [EGG]})
    assert response.status_code == 400
    assert response.json()["detail"] == 'You already have a saved meal called "breakfast".'


async def test_update_saved_meal_replaces_name_and_items(authed_client) -> None:
    meal = (await authed_client.post("/api/saved-meals/", json={"name": "Breakfast", "items": [OATS]})).json()

    # Re-saving under its own name isn't a duplicate of itself.
    response = await authed_client.patch(f"/api/saved-meals/{meal['id']}", json={"name": "Breakfast", "items": [EGG]})
    assert response.status_code == 200
    assert [item["name"] for item in response.json()["items"]] == ["Egg"]

    response = await authed_client.patch(f"/api/saved-meals/{meal['id']}", json={"name": "Brunch", "items": [EGG]})
    assert response.json()["name"] == "Brunch"


async def test_delete_saved_meal(authed_client) -> None:
    meal = (await authed_client.post("/api/saved-meals/", json={"name": "Breakfast", "items": [OATS]})).json()
    assert (await authed_client.delete(f"/api/saved-meals/{meal['id']}")).status_code == 204
    assert (await authed_client.get("/api/saved-meals/")).json() == []
    assert (await authed_client.delete(f"/api/saved-meals/{meal['id']}")).status_code == 404


async def test_saved_meals_cannot_be_touched_by_another_user(authed_client) -> None:
    meal = (await authed_client.post("/api/saved-meals/", json={"name": "Breakfast", "items": [OATS]})).json()
    await authed_client.post(
        "/api/auth/register", json={"email": "other@b.com", "password": "correcthorsebattery", "display_name": "Bob"}
    )
    response = await authed_client.patch(f"/api/saved-meals/{meal['id']}", json={"name": "Mine", "items": [EGG]})
    assert response.status_code == 404
    assert (await authed_client.delete(f"/api/saved-meals/{meal['id']}")).status_code == 404


async def test_saved_meals_require_authentication(client) -> None:
    assert (await client.get("/api/saved-meals/")).status_code == 401


async def test_history_groups_lists_an_unlogged_saved_meal(authed_client) -> None:
    meal = (await authed_client.post("/api/saved-meals/", json={"name": "Breakfast", "items": [OATS, EGG]})).json()

    body = (await authed_client.get("/api/history/groups")).json()
    assert len(body) == 1
    assert body[0]["name"] == "Breakfast"
    assert body[0]["saved_meal_id"] == meal["id"]
    assert body[0]["times_logged"] == 0
    assert body[0]["last_logged_at"] is None
    assert [item["name"] for item in body[0]["items"]] == ["Oats", "Egg"]

    assert (await authed_client.get("/api/history/groups?q=lunch")).json() == []


async def test_history_groups_merges_a_logged_saved_meal_keeping_its_saved_items(authed_client) -> None:
    await authed_client.post("/api/saved-meals/", json={"name": "Breakfast", "items": [OATS, EGG]})
    entry = await authed_client.post(
        "/api/entries/",
        json={**OATS, "grams": 90, "input_amount": 90, "consumed_at": "2026-08-01T08:00:00Z"},
    )
    await authed_client.post("/api/meal-groups/", json={"entry_ids": [entry.json()["id"]], "name": "breakfast"})

    body = (await authed_client.get("/api/history/groups")).json()
    assert len(body) == 1
    assert body[0]["times_logged"] == 1
    assert body[0]["last_logged_at"].startswith("2026-08-01")
    assert [item["input_amount"] for item in body[0]["items"]] == [60, 2]


async def test_renaming_a_saved_meal_renames_its_logged_occurrences(authed_client) -> None:
    meal = (await authed_client.post("/api/saved-meals/", json={"name": "Breakfast", "items": [OATS]})).json()
    entry = await authed_client.post("/api/entries/", json={**OATS, "grams": 60, "consumed_at": "2026-08-01T08:00:00Z"})
    await authed_client.post("/api/meal-groups/", json={"entry_ids": [entry.json()["id"]], "name": "Breakfast"})

    await authed_client.patch(f"/api/saved-meals/{meal['id']}", json={"name": "Brunch", "items": [OATS]})

    body = (await authed_client.get("/api/meal-names/")).json()
    assert [(item["name"], item["times_logged"]) for item in body] == [("Brunch", 1)]
