import uuid

from app.db import session_factory
from app.models import FoodEntry


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


async def test_create_entry(authed_client) -> None:
    response = await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Banana"
    assert body["calories"] == 106.8
    assert body["protein_g"] == 1.32
    assert body["brand"] is None
    assert body["barcode"] is None


async def test_create_entry_gets_its_own_group_of_one(authed_client) -> None:
    response = await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    body = response.json()
    assert body["meal_group_id"] is not None

    groups = (await authed_client.get("/api/meal-groups/")).json()
    assert len(groups) == 1
    assert groups[0]["id"] == body["meal_group_id"]
    assert groups[0]["entry_ids"] == [body["id"]]


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
    await authed_client.post("/api/entries/", json={**ENTRY_PAYLOAD, "consumed_at": "2026-08-02T12:00:00Z"})

    response = await authed_client.get("/api/entries/?date=2026-08-01")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["consumed_at"].startswith("2026-08-01")


async def test_list_entries_includes_entries_logged_late_in_the_day(authed_client) -> None:
    await authed_client.post("/api/entries/", json={**ENTRY_PAYLOAD, "consumed_at": "2026-08-01T23:59:00Z"})

    response = await authed_client.get("/api/entries/?date=2026-08-01")
    assert len(response.json()) == 1


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

    response = await authed_client.patch(
        f"/api/entries/{entry_id}", json={"grams": 200, "consumed_at": "2026-08-03T09:30:00Z"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["grams"] == 200
    assert body["consumed_at"].startswith("2026-08-03T09:30")
    assert body["calories"] == 89 * 2
    assert body["updated_at"] is not None


async def test_update_entry_not_found(authed_client) -> None:
    response = await authed_client.patch(
        f"/api/entries/{NOT_FOUND_ID}", json={"grams": 200, "consumed_at": "2026-08-03T09:30:00Z"}
    )
    assert response.status_code == 404


async def test_update_entry_owned_by_another_user_is_not_found(authed_client) -> None:
    created = await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    entry_id = created.json()["id"]

    await authed_client.post(
        "/api/auth/register", json={"email": "other@b.com", "password": "correcthorsebattery", "display_name": "Bob"}
    )
    response = await authed_client.patch(
        f"/api/entries/{entry_id}", json={"grams": 1, "consumed_at": "2026-08-01T12:00:00Z"}
    )
    assert response.status_code == 404


async def test_move_entry_to_group_merges_into_the_target_and_deletes_the_now_empty_old_group(
    authed_client,
) -> None:
    entry_a = (await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)).json()
    entry_b = (await authed_client.post("/api/entries/", json={**ENTRY_PAYLOAD, "name": "Toast"})).json()
    old_group_id = entry_a["meal_group_id"]

    response = await authed_client.post(
        f"/api/entries/{entry_a['id']}/group", json={"target_group_id": entry_b["meal_group_id"]}
    )
    assert response.status_code == 201
    assert response.json()["meal_group_id"] == entry_b["meal_group_id"]

    groups = {group["id"] for group in (await authed_client.get("/api/meal-groups/")).json()}
    assert old_group_id not in groups  # entry_a's own group of one is now empty, and gone


async def test_move_entry_to_group_with_no_target_gives_it_a_fresh_group(authed_client) -> None:
    entry = (await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)).json()
    old_group_id = entry["meal_group_id"]

    response = await authed_client.post(f"/api/entries/{entry['id']}/group", json={})
    assert response.status_code == 201
    new_group_id = response.json()["meal_group_id"]
    assert new_group_id is not None
    assert new_group_id != old_group_id

    groups = {group["id"] for group in (await authed_client.get("/api/meal-groups/")).json()}
    assert old_group_id not in groups
    assert new_group_id in groups


async def test_move_entry_to_group_does_not_delete_the_old_group_if_others_remain(authed_client) -> None:
    entry_a = (await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)).json()
    entry_b = (await authed_client.post("/api/entries/", json={**ENTRY_PAYLOAD, "name": "Toast"})).json()
    entry_c = (await authed_client.post("/api/entries/", json={**ENTRY_PAYLOAD, "name": "Juice"})).json()
    shared_group_id = entry_b["meal_group_id"]

    # move entry_a into entry_b's group, then entry_c in too - the group now has b and c.
    await authed_client.post(f"/api/entries/{entry_a['id']}/group", json={"target_group_id": shared_group_id})
    await authed_client.post(f"/api/entries/{entry_c['id']}/group", json={"target_group_id": shared_group_id})

    # move entry_a back out - the shared group still has b and c, so it must survive.
    response = await authed_client.post(f"/api/entries/{entry_a['id']}/group", json={})
    assert response.status_code == 201

    groups = {group["id"] for group in (await authed_client.get("/api/meal-groups/")).json()}
    assert shared_group_id in groups


async def test_move_entry_to_group_onto_its_own_current_group_is_a_no_op(authed_client) -> None:
    entry = (await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)).json()

    response = await authed_client.post(
        f"/api/entries/{entry['id']}/group", json={"target_group_id": entry["meal_group_id"]}
    )
    assert response.status_code == 201
    assert response.json()["meal_group_id"] == entry["meal_group_id"]

    groups = (await authed_client.get("/api/meal-groups/")).json()
    assert len(groups) == 1


async def test_move_entry_to_group_rejects_a_target_not_owned_by_the_user(authed_client) -> None:
    entry = (await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)).json()

    response = await authed_client.post(f"/api/entries/{entry['id']}/group", json={"target_group_id": NOT_FOUND_ID})
    assert response.status_code == 404


async def test_move_entry_to_group_not_found(authed_client) -> None:
    response = await authed_client.post(f"/api/entries/{NOT_FOUND_ID}/group", json={})
    assert response.status_code == 404


async def test_move_entry_to_group_owned_by_another_user_is_not_found(authed_client) -> None:
    entry = (await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)).json()

    await authed_client.post(
        "/api/auth/register", json={"email": "other@b.com", "password": "correcthorsebattery", "display_name": "Bob"}
    )
    response = await authed_client.post(f"/api/entries/{entry['id']}/group", json={})
    assert response.status_code == 404


async def test_move_entry_to_group_requires_authentication(client) -> None:
    response = await client.post(f"/api/entries/{NOT_FOUND_ID}/group", json={})
    assert response.status_code == 401


async def test_delete_entry(authed_client) -> None:
    created = await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    entry_id = created.json()["id"]

    response = await authed_client.delete(f"/api/entries/{entry_id}")
    assert response.status_code == 204

    listing = await authed_client.get("/api/entries/?date=2026-08-01")
    assert listing.json() == []


async def test_delete_entry_soft_deletes_rather_than_removing_the_row(authed_client) -> None:
    created = await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    entry_id = created.json()["id"]

    await authed_client.delete(f"/api/entries/{entry_id}")

    archived = (await authed_client.get("/api/entries/archive?date=2026-08-01")).json()
    assert len(archived) == 1
    assert archived[0]["id"] == entry_id
    assert archived[0]["deleted_at"] is not None


async def test_delete_entry_not_found(authed_client) -> None:
    response = await authed_client.delete(f"/api/entries/{NOT_FOUND_ID}")
    assert response.status_code == 404


async def test_delete_entry_owned_by_another_user_is_not_found(authed_client) -> None:
    created = await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    entry_id = created.json()["id"]

    await authed_client.post(
        "/api/auth/register", json={"email": "other@b.com", "password": "correcthorsebattery", "display_name": "Bob"}
    )
    response = await authed_client.delete(f"/api/entries/{entry_id}")
    assert response.status_code == 404


async def test_deleted_entries_are_excluded_from_stats(authed_client) -> None:
    created = await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    entry_id = created.json()["id"]
    await authed_client.delete(f"/api/entries/{entry_id}")

    daily = (await authed_client.get("/api/stats/daily?date=2026-08-01")).json()
    assert daily["calories"] == 0
    assert daily["entries"] == []

    range_stats = (await authed_client.get("/api/stats/range?start=2026-08-01&end=2026-08-01&group_by=day")).json()
    assert range_stats["points"] == []


async def test_update_entry_on_a_deleted_entry_is_not_found(authed_client) -> None:
    created = await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    entry_id = created.json()["id"]
    await authed_client.delete(f"/api/entries/{entry_id}")

    response = await authed_client.patch(
        f"/api/entries/{entry_id}", json={"grams": 1, "consumed_at": "2026-08-01T12:00:00Z"}
    )
    assert response.status_code == 404


async def test_list_archived_entries_only_returns_the_current_users_entries(authed_client) -> None:
    created = await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    entry_id = created.json()["id"]
    await authed_client.delete(f"/api/entries/{entry_id}")

    await authed_client.post(
        "/api/auth/register", json={"email": "other@b.com", "password": "correcthorsebattery", "display_name": "Bob"}
    )
    response = await authed_client.get("/api/entries/archive?date=2026-08-01")
    assert response.status_code == 200
    assert response.json() == []


async def test_restore_entry(authed_client) -> None:
    created = await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    entry_id = created.json()["id"]
    await authed_client.delete(f"/api/entries/{entry_id}")

    response = await authed_client.post(f"/api/entries/{entry_id}/restore")
    assert response.status_code == 201
    body = response.json()
    assert body["deleted_at"] is None
    assert body["updated_at"] is not None

    listing = (await authed_client.get("/api/entries/?date=2026-08-01")).json()
    assert len(listing) == 1
    archived = (await authed_client.get("/api/entries/archive?date=2026-08-01")).json()
    assert archived == []


async def test_restore_entry_rejects_a_live_entry(authed_client) -> None:
    created = await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    entry_id = created.json()["id"]

    response = await authed_client.post(f"/api/entries/{entry_id}/restore")
    assert response.status_code == 404


async def test_restore_entry_not_found(authed_client) -> None:
    response = await authed_client.post(f"/api/entries/{NOT_FOUND_ID}/restore")
    assert response.status_code == 404


async def test_restore_entry_owned_by_another_user_is_not_found(authed_client) -> None:
    created = await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    entry_id = created.json()["id"]
    await authed_client.delete(f"/api/entries/{entry_id}")

    await authed_client.post(
        "/api/auth/register", json={"email": "other@b.com", "password": "correcthorsebattery", "display_name": "Bob"}
    )
    response = await authed_client.post(f"/api/entries/{entry_id}/restore")
    assert response.status_code == 404


async def test_permanently_delete_entry(authed_client) -> None:
    created = await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    entry_id = created.json()["id"]
    group_id = created.json()["meal_group_id"]
    await authed_client.delete(f"/api/entries/{entry_id}")

    response = await authed_client.delete(f"/api/entries/{entry_id}/permanent")
    assert response.status_code == 204

    archived = (await authed_client.get("/api/entries/archive?date=2026-08-01")).json()
    assert archived == []

    # its now-empty group of one is cleaned up along with it
    groups = {group["id"] for group in (await authed_client.get("/api/meal-groups/")).json()}
    assert group_id not in groups


async def test_permanently_delete_entry_does_not_delete_a_group_that_still_has_other_members(authed_client) -> None:
    entry_a = (await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)).json()
    entry_b = (await authed_client.post("/api/entries/", json={**ENTRY_PAYLOAD, "name": "Toast"})).json()
    await authed_client.post(f"/api/entries/{entry_a['id']}/group", json={"target_group_id": entry_b["meal_group_id"]})

    await authed_client.delete(f"/api/entries/{entry_a['id']}")
    await authed_client.delete(f"/api/entries/{entry_a['id']}/permanent")

    groups = {group["id"] for group in (await authed_client.get("/api/meal-groups/")).json()}
    assert entry_b["meal_group_id"] in groups


async def test_permanently_delete_entry_with_no_group_does_not_error(authed_client) -> None:
    created = await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    entry_id = created.json()["id"]

    # Not reachable through the API - every entry always gets a group on creation - but permanent
    # delete must stay defensive if that invariant is ever violated.
    async with session_factory() as db_session:
        entry = await db_session.get(FoodEntry, uuid.UUID(entry_id))
        entry.meal_group_id = None
        await db_session.commit()

    await authed_client.delete(f"/api/entries/{entry_id}")
    response = await authed_client.delete(f"/api/entries/{entry_id}/permanent")
    assert response.status_code == 204


async def test_permanently_delete_entry_rejects_a_live_entry(authed_client) -> None:
    created = await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    entry_id = created.json()["id"]

    response = await authed_client.delete(f"/api/entries/{entry_id}/permanent")
    assert response.status_code == 404

    listing = (await authed_client.get("/api/entries/?date=2026-08-01")).json()
    assert len(listing) == 1


async def test_permanently_delete_entry_not_found(authed_client) -> None:
    response = await authed_client.delete(f"/api/entries/{NOT_FOUND_ID}/permanent")
    assert response.status_code == 404


async def test_permanently_delete_entry_owned_by_another_user_is_not_found(authed_client) -> None:
    created = await authed_client.post("/api/entries/", json=ENTRY_PAYLOAD)
    entry_id = created.json()["id"]
    await authed_client.delete(f"/api/entries/{entry_id}")

    await authed_client.post(
        "/api/auth/register", json={"email": "other@b.com", "password": "correcthorsebattery", "display_name": "Bob"}
    )
    response = await authed_client.delete(f"/api/entries/{entry_id}/permanent")
    assert response.status_code == 404
