"""Every "not found" carries a message the frontend shows as-is - pinned here in one place."""

import uuid

import pytest


MISSING = uuid.UUID(int=1)

NUTELLA = {
    "name": "Nutella",
    "grams": 30,
    "calories_per_100g": 539,
    "protein_per_100g": 6.3,
    "carbs_per_100g": 57.5,
    "fat_per_100g": 30.9,
    "consumed_at": "2026-08-01T08:00:00Z",
}


@pytest.mark.parametrize(
    ("method", "path", "body", "detail"),
    [
        (
            "PATCH",
            f"/api/entries/{MISSING}",
            {"grams": 1, "consumed_at": "2026-08-01T08:00:00Z"},
            "No entry found with this id.",
        ),
        ("DELETE", f"/api/goals/{MISSING}", None, "No goal version found with this id."),
        ("DELETE", f"/api/favorites/{MISSING}", None, "No favorite found with this id."),
        ("DELETE", f"/api/meal-groups/{MISSING}", None, "No meal group found with this id."),
        ("POST", "/api/meal-groups/", {"entry_ids": [str(MISSING)]}, "One or more entries were not found."),
        ("DELETE", "/api/meal-names/?name=Nope", None, "No meal found with this name."),
        ("DELETE", f"/api/saved-meals/{MISSING}", None, "No saved meal found with this id."),
    ],
)
async def test_not_found_messages(authed_client, method, path, body, detail) -> None:
    response = await authed_client.request(method, path, json=body)
    assert response.status_code == 404
    assert response.json()["detail"] == detail


async def test_a_deleted_entry_is_not_found_with_the_same_message(authed_client) -> None:
    entry_id = (await authed_client.post("/api/entries/", json=NUTELLA)).json()["id"]
    await authed_client.delete(f"/api/entries/{entry_id}")

    response = await authed_client.patch(
        f"/api/entries/{entry_id}", json={"grams": 1, "consumed_at": "2026-08-01T08:00:00Z"}
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "No entry found with this id."
