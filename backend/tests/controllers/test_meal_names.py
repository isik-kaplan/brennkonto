import pytest
from sqlalchemy import select


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
    "consumed_at": "2026-08-01T08:05:00Z",
}


async def _log_breakfast(authed_client, consumed_at: str = "2026-08-01T08:00:00Z") -> list[str]:
    nutella = await authed_client.post("/api/entries/", json={**NUTELLA_PAYLOAD, "consumed_at": consumed_at})
    banana = await authed_client.post("/api/entries/", json={**BANANA_PAYLOAD, "consumed_at": consumed_at})
    entry_ids = [nutella.json()["id"], banana.json()["id"]]
    await authed_client.post("/api/meal-groups/", json={"entry_ids": entry_ids, "name": "Breakfast"})
    return entry_ids


async def test_list_meal_names_aggregates_across_occurrences(authed_client) -> None:
    await _log_breakfast(authed_client, "2026-08-01T08:00:00Z")
    await _log_breakfast(authed_client, "2026-08-02T08:00:00Z")

    response = await authed_client.get("/api/meal-names/")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["name"] == "Breakfast"
    assert body[0]["times_logged"] == 2
    assert body[0]["last_logged_at"].startswith("2026-08-02")
    assert {item["name"] for item in body[0]["items"]} == {"Nutella", "Banana"}
    assert body[0]["saved_meal_id"] is None


async def test_list_meal_names_excludes_unnamed_groups(authed_client) -> None:
    entry = await authed_client.post("/api/entries/", json=NUTELLA_PAYLOAD)
    await authed_client.post("/api/meal-groups/", json={"entry_ids": [entry.json()["id"]]})

    response = await authed_client.get("/api/meal-names/")
    assert response.json() == []


async def test_list_meal_names_only_returns_the_current_users_meals(authed_client) -> None:
    await _log_breakfast(authed_client)

    await authed_client.post(
        "/api/auth/register", json={"email": "other@b.com", "password": "correcthorsebattery", "display_name": "Bob"}
    )
    response = await authed_client.get("/api/meal-names/")
    assert response.json() == []


async def test_rename_meal_name_renames_every_occurrence(authed_client) -> None:
    await _log_breakfast(authed_client, "2026-08-01T08:00:00Z")
    await _log_breakfast(authed_client, "2026-08-02T08:00:00Z")

    response = await authed_client.patch("/api/meal-names/?name=Breakfast", json={"new_name": "Morning meal"})
    assert response.status_code == 200

    body = (await authed_client.get("/api/meal-names/")).json()
    assert len(body) == 1
    assert body[0]["name"] == "Morning meal"
    assert body[0]["times_logged"] == 2


async def test_rename_meal_name_matches_case_insensitively(authed_client) -> None:
    await _log_breakfast(authed_client)

    response = await authed_client.patch("/api/meal-names/?name=breakfast", json={"new_name": "Brekkie"})
    assert response.status_code == 200
    assert (await authed_client.get("/api/meal-names/")).json()[0]["name"] == "Brekkie"


async def test_rename_meal_name_rejects_a_blank_name(authed_client) -> None:
    await _log_breakfast(authed_client)

    response = await authed_client.patch("/api/meal-names/?name=Breakfast", json={"new_name": "   "})
    assert response.status_code == 400
    assert (await authed_client.get("/api/meal-names/")).json()[0]["name"] == "Breakfast"


async def test_rename_meal_name_404s_for_an_unknown_name(authed_client) -> None:
    response = await authed_client.patch("/api/meal-names/?name=Nope", json={"new_name": "Whatever"})
    assert response.status_code == 404


async def test_remove_meal_name_ungroups_without_deleting_entries(authed_client) -> None:
    entry_ids = await _log_breakfast(authed_client)

    response = await authed_client.delete("/api/meal-names/?name=Breakfast")
    assert response.status_code == 204

    assert (await authed_client.get("/api/meal-names/")).json() == []

    # The entries themselves are untouched - still there, just no longer sharing a named group.
    listing = await authed_client.get("/api/entries/?date=2026-08-01")
    remaining_ids = {entry["id"] for entry in listing.json()}
    assert remaining_ids == set(entry_ids)
    group_ids = {entry["meal_group_id"] for entry in listing.json()}
    assert len(group_ids) == 2  # each entry got its own fresh singleton group


async def test_remove_meal_name_ungroups_every_occurrence(authed_client) -> None:
    await _log_breakfast(authed_client, "2026-08-01T08:00:00Z")
    await _log_breakfast(authed_client, "2026-08-02T08:00:00Z")

    response = await authed_client.delete("/api/meal-names/?name=Breakfast")
    assert response.status_code == 204
    assert (await authed_client.get("/api/meal-names/")).json() == []


async def test_remove_meal_name_404s_for_an_unknown_name(authed_client) -> None:
    response = await authed_client.delete("/api/meal-names/?name=Nope")
    assert response.status_code == 404


async def test_list_meal_names_skips_a_group_whose_name_is_blank_after_stripping(authed_client) -> None:
    entry = (await authed_client.post("/api/entries/", json=NUTELLA_PAYLOAD)).json()
    # MealGroup.name is nullable, not non-blank - the SQL filter only excludes None, so a
    # whitespace-only name reaches the app-level trim-and-skip.
    await authed_client.post("/api/meal-groups/", json={"entry_ids": [entry["id"]], "name": "   "})

    assert (await authed_client.get("/api/meal-names/")).json() == []


async def test_list_meal_names_skips_a_name_whose_entries_are_all_deleted(authed_client) -> None:
    entry_ids = await _log_breakfast(authed_client)
    for entry_id in entry_ids:
        await authed_client.delete(f"/api/entries/{entry_id}")

    assert (await authed_client.get("/api/meal-names/")).json() == []


OATS_ITEM = {
    "name": "Oats",
    "input_amount": 60,
    "calories_per_100g": 380,
    "protein_per_100g": 13,
    "carbs_per_100g": 60,
    "fat_per_100g": 7,
}


async def test_list_meal_names_includes_unlogged_saved_meals(authed_client) -> None:
    meal = (await authed_client.post("/api/saved-meals/", json={"name": "Porridge", "items": [OATS_ITEM]})).json()
    await _log_breakfast(authed_client)

    body = (await authed_client.get("/api/meal-names/")).json()
    assert [item["name"] for item in body] == ["Breakfast", "Porridge"]
    porridge = body[1]
    assert porridge["saved_meal_id"] == meal["id"]
    assert porridge["times_logged"] == 0
    assert porridge["last_logged_at"] is None
    assert porridge["calories"] == 228
    assert porridge["protein_g"] == 7.8


async def test_list_meal_names_merges_a_saved_meal_with_its_logged_occurrences(authed_client) -> None:
    await authed_client.post("/api/saved-meals/", json={"name": "breakfast", "items": [OATS_ITEM]})
    await _log_breakfast(authed_client)

    body = (await authed_client.get("/api/meal-names/")).json()
    assert len(body) == 1
    assert body[0]["times_logged"] == 1
    assert [item["name"] for item in body[0]["items"]] == ["Oats"]


async def test_rename_meal_name_renames_the_saved_meal_and_its_logged_occurrences(authed_client) -> None:
    await authed_client.post("/api/saved-meals/", json={"name": "Breakfast", "items": [OATS_ITEM]})
    await _log_breakfast(authed_client)

    response = await authed_client.patch("/api/meal-names/?name=Breakfast", json={"new_name": "Brekkie"})
    assert response.status_code == 200
    body = (await authed_client.get("/api/meal-names/")).json()
    assert [(meal["name"], meal["times_logged"]) for meal in body] == [("Brekkie", 1)]


async def test_rename_meal_name_rejects_clashing_with_another_saved_meal(authed_client) -> None:
    await authed_client.post("/api/saved-meals/", json={"name": "Porridge", "items": [OATS_ITEM]})
    await authed_client.post("/api/saved-meals/", json={"name": "Oatmeal", "items": [OATS_ITEM]})

    response = await authed_client.patch("/api/meal-names/?name=Porridge", json={"new_name": "oatmeal"})
    assert response.status_code == 400


async def test_remove_meal_name_deletes_the_saved_meal_and_ungroups_logged_ones(authed_client) -> None:
    await authed_client.post("/api/saved-meals/", json={"name": "Breakfast", "items": [OATS_ITEM]})
    entry_ids = await _log_breakfast(authed_client)

    assert (await authed_client.delete("/api/meal-names/?name=Breakfast")).status_code == 204
    assert (await authed_client.get("/api/meal-names/")).json() == []
    assert (await authed_client.get("/api/saved-meals/")).json() == []
    stats = (await authed_client.get("/api/stats/daily?date=2026-08-01")).json()
    assert set(entry_ids) <= {entry["id"] for entry in stats["entries"]}


async def test_list_meal_names_returns_a_logged_meals_items_and_macros_in_full(authed_client) -> None:
    await _log_breakfast(authed_client)

    [meal] = (await authed_client.get("/api/meal-names/")).json()
    nutella, banana = sorted(meal["items"], key=lambda item: item["name"], reverse=True)
    assert nutella == {
        "name": "Nutella",
        "brand": "Ferrero",
        "barcode": "3017620422003",
        "grams": 30.0,
        "input_unit": "g",
        "input_amount": 30.0,
        "unit_to_grams": 1.0,
        "calories_per_100g": 539.0,
        "protein_per_100g": 6.3,
        "carbs_per_100g": 57.5,
        "fat_per_100g": 30.9,
    }
    assert banana["brand"] is None
    assert meal["calories"] == pytest.approx(30 * 5.39 + 120 * 0.89)
    assert meal["protein_g"] == pytest.approx(30 * 0.063 + 120 * 0.011)
    assert meal["carbs_g"] == pytest.approx(30 * 0.575 + 120 * 0.228)
    assert meal["fat_g"] == pytest.approx(30 * 0.309 + 120 * 0.003)


async def test_list_meal_names_returns_an_unlogged_saved_meals_macros(authed_client) -> None:
    await authed_client.post("/api/saved-meals/", json={"name": "Porridge", "items": [OATS_ITEM]})
    [meal] = (await authed_client.get("/api/meal-names/")).json()
    assert meal["carbs_g"] == pytest.approx(36)
    assert meal["fat_g"] == pytest.approx(4.2)


async def test_rename_meal_name_stamps_each_group_as_updated(authed_client) -> None:
    from app.db import session_factory
    from app.models import MealGroup

    await _log_breakfast(authed_client)
    await authed_client.patch("/api/meal-names/?name=Breakfast", json={"new_name": "Brekkie"})

    async with session_factory() as session:
        [group] = (await session.scalars(select(MealGroup).where(MealGroup.name == "Brekkie"))).all()
    assert group.updated_at is not None


async def test_meal_names_match_case_insensitively_even_where_upper_and_lower_case_disagree(authed_client) -> None:
    # "ß" lowercases to itself but uppercases to "SS" - so only a lowercase key keeps "Straße" and
    # "Strasse" apart, and only a lowercase key is what the rest of the app (history_groups) uses.
    await authed_client.post("/api/saved-meals/", json={"name": "Straße", "items": [OATS_ITEM]})
    await authed_client.post("/api/saved-meals/", json={"name": "Strasse", "items": [OATS_ITEM]})
    names = [meal["name"] for meal in (await authed_client.get("/api/meal-names/")).json()]
    assert sorted(names) == ["Strasse", "Straße"]
