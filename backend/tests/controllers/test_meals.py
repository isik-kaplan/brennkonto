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

BANANA_ENTRY = {
    "name": "Banana",
    "barcode": "4011",
    "grams": 120,
    "calories_per_100g": 89,
    "protein_per_100g": 1.1,
    "carbs_per_100g": 22.8,
    "fat_per_100g": 0.3,
    "consumed_at": "2026-08-01T08:00:00Z",
}


async def _create(client, name="Breakfast", items=None) -> dict:
    response = await client.post("/api/meals/", json={"name": name, "items": items or [OATS]})
    assert response.status_code == 201
    return response.json()


async def _log_as(client, meal_name: str, consumed_at="2026-08-01T08:00:00Z") -> dict:
    entry = (await client.post("/api/entries/", json={**BANANA_ENTRY, "consumed_at": consumed_at})).json()
    group = await client.post("/api/meal-groups/", json={"entry_ids": [entry["id"]], "name": meal_name})
    return {"entry": entry, "group": group.json()}


async def test_create_meal_computes_grams_and_totals(authed_client) -> None:
    meal = await _create(authed_client, " Breakfast ", [OATS, EGG])
    assert meal["name"] == "Breakfast"
    assert [item["grams"] for item in meal["items"]] == [60, 100]
    assert meal["calories"] == pytest.approx(60 * 3.8 + 100 * 1.55)
    assert meal["protein_g"] == pytest.approx(60 * 0.13 + 100 * 0.13)
    assert meal["carbs_g"] == pytest.approx(60 * 0.6 + 100 * 0.01)
    assert meal["fat_g"] == pytest.approx(60 * 0.07 + 100 * 0.11)
    assert (meal["times_logged"], meal["last_logged_at"]) == (0, None)


async def test_create_meal_takes_a_gram_amount_as_is_and_accepts_a_fraction(authed_client) -> None:
    meal = await _create(
        authed_client, "Eggs", [{**EGG, "input_unit": "g", "input_amount": 120}, {**EGG, "input_amount": 0.5}]
    )
    assert [item["grams"] for item in meal["items"]] == [120, 25]


@pytest.mark.parametrize(
    ("payload", "detail"),
    [
        ({"name": "  ", "items": [OATS]}, "A meal needs a name."),
        ({"name": "Empty", "items": []}, "A meal needs at least one food."),
        ({"name": "Zero", "items": [{**OATS, "input_amount": 0}]}, "Every food in a meal needs an amount above zero."),
    ],
)
async def test_create_meal_rejects_invalid_input(authed_client, payload, detail) -> None:
    response = await authed_client.post("/api/meals/", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == detail


async def test_meal_names_are_unique_case_insensitively_the_lowercase_way(authed_client) -> None:
    await _create(authed_client, "Breakfast")
    response = await authed_client.post("/api/meals/", json={"name": "breakfast", "items": [EGG]})
    assert response.status_code == 400
    assert response.json()["detail"] == 'You already have a meal called "breakfast".'
    # "ß" uppercases to "SS" - so only a lowercase comparison keeps these apart.
    await _create(authed_client, "Straße")
    await _create(authed_client, "Strasse")


async def test_list_meals_is_alphabetical_and_only_the_current_users(authed_client) -> None:
    await _create(authed_client, "porridge")
    await _create(authed_client, "Breakfast")
    assert [meal["name"] for meal in (await authed_client.get("/api/meals/")).json()] == ["Breakfast", "porridge"]

    await authed_client.post(
        "/api/auth/register", json={"email": "other@b.com", "password": "correcthorsebattery", "display_name": "Bob"}
    )
    assert (await authed_client.get("/api/meals/")).json() == []


async def test_list_meals_counts_each_time_it_was_eaten(authed_client) -> None:
    await _create(authed_client, "Breakfast")
    await _log_as(authed_client, "Breakfast", "2026-08-01T08:00:00Z")
    latest = await _log_as(authed_client, "breakfast", "2026-08-03T08:00:00Z")

    [meal] = (await authed_client.get("/api/meals/")).json()
    assert meal["times_logged"] == 2
    assert meal["last_logged_at"].startswith("2026-08-03")

    # A time whose entries were all deleted doesn't count - until one is restored.
    await authed_client.delete(f"/api/entries/{latest['entry']['id']}")
    [meal] = (await authed_client.get("/api/meals/")).json()
    assert (meal["times_logged"], meal["last_logged_at"][:10]) == (1, "2026-08-01")


async def test_update_meal_replaces_it_and_every_time_it_was_eaten_follows(authed_client) -> None:
    meal = await _create(authed_client, "Breakfast")
    logged = await _log_as(authed_client, "Breakfast")

    # Re-saving under its own name isn't a duplicate of itself.
    response = await authed_client.patch(f"/api/meals/{meal['id']}", json={"name": "Brunch", "items": [EGG]})
    assert response.status_code == 200
    assert response.json()["name"] == "Brunch"
    assert [item["name"] for item in response.json()["items"]] == ["Egg"]
    assert response.json()["times_logged"] == 1

    [group] = [g for g in (await authed_client.get("/api/meal-groups/")).json() if g["id"] == logged["group"]["id"]]
    assert (group["meal_id"], group["name"]) == (meal["id"], "Brunch")


async def test_update_meal_rejects_another_meals_name(authed_client) -> None:
    meal = await _create(authed_client, "Breakfast")
    await _create(authed_client, "Lunch")
    response = await authed_client.patch(f"/api/meals/{meal['id']}", json={"name": "LUNCH", "items": [OATS]})
    assert response.status_code == 400
    assert response.json()["detail"] == 'You already have a meal called "LUNCH".'


async def test_delete_meal_keeps_what_was_eaten_grouped_but_unnamed(authed_client) -> None:
    meal = await _create(authed_client, "Breakfast")
    logged = await _log_as(authed_client, "Breakfast")

    assert (await authed_client.delete(f"/api/meals/{meal['id']}")).status_code == 204
    assert (await authed_client.get("/api/meals/")).json() == []
    [group] = [g for g in (await authed_client.get("/api/meal-groups/")).json() if g["id"] == logged["group"]["id"]]
    assert (group["meal_id"], group["name"], group["entry_ids"]) == (None, None, [logged["entry"]["id"]])


async def test_meals_cannot_be_touched_by_another_user(authed_client) -> None:
    meal = await _create(authed_client)
    await authed_client.post(
        "/api/auth/register", json={"email": "other@b.com", "password": "correcthorsebattery", "display_name": "Bob"}
    )
    response = await authed_client.patch(f"/api/meals/{meal['id']}", json={"name": "Mine", "items": [EGG]})
    assert response.status_code == 404
    assert (await authed_client.delete(f"/api/meals/{meal['id']}")).status_code == 404


async def test_meals_require_authentication(client) -> None:
    assert (await client.get("/api/meals/")).status_code == 401
