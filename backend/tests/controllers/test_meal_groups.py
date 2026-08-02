import uuid

from app.controllers.meal_groups import delete_group_if_empty
from app.db import session_factory


NOT_FOUND_ID = "11111111-1111-1111-1111-111111111111"

ENTRY_PAYLOAD = {
    "name": "Banana",
    "grams": 120,
    "calories_per_100g": 89,
    "protein_per_100g": 1.1,
    "carbs_per_100g": 22.8,
    "fat_per_100g": 0.3,
    "consumed_at": "2026-08-01T12:00:00Z",
}


async def _create_entry(authed_client, **overrides) -> str:
    response = await authed_client.post("/api/entries/", json={**ENTRY_PAYLOAD, **overrides})
    return response.json()["id"]


async def test_list_meal_groups(authed_client) -> None:
    entry_a = await _create_entry(authed_client)
    await authed_client.post("/api/meal-groups/", json={"entry_ids": [entry_a], "name": "Breakfast"})

    response = await authed_client.get("/api/meal-groups/")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["name"] == "Breakfast"
    assert body[0]["entry_ids"] == [entry_a]


async def test_list_meal_groups_only_returns_the_current_users_groups(authed_client) -> None:
    entry_a = await _create_entry(authed_client)
    await authed_client.post("/api/meal-groups/", json={"entry_ids": [entry_a]})

    await authed_client.post(
        "/api/auth/register", json={"email": "other@b.com", "password": "correcthorsebattery", "display_name": "Bob"}
    )
    response = await authed_client.get("/api/meal-groups/")
    assert response.json() == []


async def test_create_meal_group(authed_client) -> None:
    entry_a = await _create_entry(authed_client, name="Eggs")
    entry_b = await _create_entry(authed_client, name="Toast")

    response = await authed_client.post(
        "/api/meal-groups/", json={"entry_ids": [entry_a, entry_b], "name": "Breakfast"}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Breakfast"
    assert set(body["entry_ids"]) == {entry_a, entry_b}

    listing = await authed_client.get("/api/entries/?date=2026-08-01")
    group_ids = {entry["meal_group_id"] for entry in listing.json()}
    assert group_ids == {body["id"]}


async def test_create_meal_group_with_no_entries(authed_client) -> None:
    response = await authed_client.post("/api/meal-groups/", json={"entry_ids": [], "name": "Empty"})
    assert response.status_code == 201
    assert response.json()["entry_ids"] == []


async def test_create_meal_group_without_a_name(authed_client) -> None:
    entry_a = await _create_entry(authed_client)
    response = await authed_client.post("/api/meal-groups/", json={"entry_ids": [entry_a]})
    assert response.status_code == 201
    assert response.json()["name"] is None


async def test_create_meal_group_rejects_an_entry_not_owned_by_the_user(authed_client) -> None:
    entry_a = await _create_entry(authed_client)
    await authed_client.post(
        "/api/auth/register", json={"email": "other@b.com", "password": "correcthorsebattery", "display_name": "Bob"}
    )
    response = await authed_client.post("/api/meal-groups/", json={"entry_ids": [entry_a]})
    assert response.status_code == 404


async def test_update_meal_group_renames(authed_client) -> None:
    entry_a = await _create_entry(authed_client)
    created = await authed_client.post("/api/meal-groups/", json={"entry_ids": [entry_a], "name": "Breakfast"})
    group_id = created.json()["id"]

    response = await authed_client.patch(f"/api/meal-groups/{group_id}", json={"name": "Brunch"})
    assert response.status_code == 200
    assert response.json()["name"] == "Brunch"
    assert response.json()["entry_ids"] == [entry_a]


async def test_update_meal_group_replaces_membership_retroactively(authed_client) -> None:
    entry_a = await _create_entry(authed_client, name="Eggs")
    entry_b = await _create_entry(authed_client, name="Toast")
    entry_c = await _create_entry(authed_client, name="Juice")
    created = await authed_client.post("/api/meal-groups/", json={"entry_ids": [entry_a, entry_b]})
    group_id = created.json()["id"]

    # drop entry_b, add entry_c - a single PATCH covers both retroactive grouping and degrouping.
    response = await authed_client.patch(f"/api/meal-groups/{group_id}", json={"entry_ids": [entry_a, entry_c]})
    assert response.status_code == 200
    assert set(response.json()["entry_ids"]) == {entry_a, entry_c}

    listing = (await authed_client.get("/api/entries/?date=2026-08-01")).json()
    by_id = {entry["id"]: entry["meal_group_id"] for entry in listing}
    assert by_id[entry_a] == group_id
    # entry_b was dropped from the group, not left groupless - it gets a fresh group of its own.
    assert by_id[entry_b] is not None
    assert by_id[entry_b] != group_id
    assert by_id[entry_c] == group_id


async def test_update_meal_group_clears_all_membership(authed_client) -> None:
    entry_a = await _create_entry(authed_client)
    entry_b = await _create_entry(authed_client)
    created = await authed_client.post("/api/meal-groups/", json={"entry_ids": [entry_a, entry_b]})
    group_id = created.json()["id"]

    response = await authed_client.patch(f"/api/meal-groups/{group_id}", json={"entry_ids": []})
    assert response.status_code == 200
    assert response.json()["entry_ids"] == []

    listing = (await authed_client.get("/api/entries/?date=2026-08-01")).json()
    # every cleared entry gets its own fresh group instead of being left groupless.
    new_group_ids = [entry["meal_group_id"] for entry in listing]
    assert all(new_id is not None for new_id in new_group_ids)
    assert group_id not in new_group_ids
    assert len(set(new_group_ids)) == len(new_group_ids)  # each entry's fresh group is its own


async def test_update_meal_group_not_found(authed_client) -> None:
    response = await authed_client.patch(f"/api/meal-groups/{NOT_FOUND_ID}", json={"name": "Brunch"})
    assert response.status_code == 404


async def test_update_meal_group_owned_by_another_user_is_not_found(authed_client) -> None:
    entry_a = await _create_entry(authed_client)
    created = await authed_client.post("/api/meal-groups/", json={"entry_ids": [entry_a]})
    group_id = created.json()["id"]

    await authed_client.post(
        "/api/auth/register", json={"email": "other@b.com", "password": "correcthorsebattery", "display_name": "Bob"}
    )
    response = await authed_client.patch(f"/api/meal-groups/{group_id}", json={"name": "Brunch"})
    assert response.status_code == 404


async def test_update_meal_group_rejects_a_new_entry_not_owned_by_the_user(authed_client) -> None:
    entry_a = await _create_entry(authed_client)
    created = await authed_client.post("/api/meal-groups/", json={"entry_ids": [entry_a]})
    group_id = created.json()["id"]

    response = await authed_client.patch(f"/api/meal-groups/{group_id}", json={"entry_ids": [NOT_FOUND_ID]})
    assert response.status_code == 404


async def test_delete_meal_group_ungroups_without_deleting_entries(authed_client) -> None:
    entry_a = await _create_entry(authed_client)
    entry_b = await _create_entry(authed_client)
    created = await authed_client.post("/api/meal-groups/", json={"entry_ids": [entry_a, entry_b]})
    group_id = created.json()["id"]

    response = await authed_client.delete(f"/api/meal-groups/{group_id}")
    assert response.status_code == 204

    listing = (await authed_client.get("/api/entries/?date=2026-08-01")).json()
    assert len(listing) == 2
    # each entry survives, now with its own fresh group instead of the deleted one.
    new_group_ids = [entry["meal_group_id"] for entry in listing]
    assert all(new_id is not None for new_id in new_group_ids)
    assert group_id not in new_group_ids
    assert len(set(new_group_ids)) == len(new_group_ids)

    # and the deleted group is really gone, not just emptied.
    remaining_groups = (await authed_client.get("/api/meal-groups/")).json()
    assert group_id not in {group["id"] for group in remaining_groups}


async def test_delete_meal_group_not_found(authed_client) -> None:
    response = await authed_client.delete(f"/api/meal-groups/{NOT_FOUND_ID}")
    assert response.status_code == 404


async def test_delete_group_if_empty_is_a_no_op_when_the_group_is_already_gone() -> None:
    # Not reachable through the API in normal use - every caller passes a group id it just looked
    # up - but the helper must stay defensive if that ever changes.
    async with session_factory() as db_session:
        await delete_group_if_empty(db_session, uuid.uuid4())
        await db_session.commit()


async def test_meal_groups_require_authentication(client) -> None:
    response = await client.post("/api/meal-groups/", json={"entry_ids": []})
    assert response.status_code == 401
