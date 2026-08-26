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
    assert set(body[0]["items"]) == {"Nutella", "Banana"}


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
