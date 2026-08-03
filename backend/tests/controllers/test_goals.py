from datetime import date
from uuid import UUID

from app.controllers.goals import (
    DEFAULT_CALORIE_GOAL,
    DEFAULT_CARBS_GOAL_G,
    DEFAULT_FAT_GOAL_G,
    DEFAULT_PROTEIN_GOAL_G,
    resolve_goal_for_date,
)
from app.db import session_factory


NOT_FOUND_ID = "11111111-1111-1111-1111-111111111111"

GOAL_PAYLOAD = {
    "effective_date": "2026-08-01",
    "daily_calorie_goal": 2000,
    "daily_protein_goal_g": 150,
    "daily_carbs_goal_g": 200,
    "daily_fat_goal_g": 65,
}


async def test_list_goal_versions_is_empty_for_a_new_user(authed_client) -> None:
    response = await authed_client.get("/api/goals")
    assert response.status_code == 200
    assert response.json() == []


async def test_upsert_goal_version_creates_a_new_version(authed_client) -> None:
    response = await authed_client.post("/api/goals", json=GOAL_PAYLOAD)
    assert response.status_code == 201
    body = response.json()
    assert body["effective_date"] == "2026-08-01"
    assert body["daily_calorie_goal"] == 2000
    # the only version - in effect indefinitely, nothing supersedes it yet.
    assert body["end_date"] is None

    listing = await authed_client.get("/api/goals")
    assert len(listing.json()) == 1


async def test_goal_version_ranges_are_computed_from_neighboring_effective_dates(authed_client) -> None:
    await authed_client.post("/api/goals", json={**GOAL_PAYLOAD, "effective_date": "2026-08-01"})
    await authed_client.post("/api/goals", json={**GOAL_PAYLOAD, "effective_date": "2026-08-10"})
    third = await authed_client.post("/api/goals", json={**GOAL_PAYLOAD, "effective_date": "2026-08-20"})

    listing = (await authed_client.get("/api/goals")).json()
    ranges = {version["effective_date"]: version["end_date"] for version in listing}
    assert ranges["2026-08-01"] == "2026-08-09"
    assert ranges["2026-08-10"] == "2026-08-19"
    # most recent version - no successor yet, so it's in effect indefinitely.
    assert ranges["2026-08-20"] is None
    # the upsert response for a newly-added most-recent version already reflects this.
    assert third.json()["end_date"] is None


async def test_adding_a_later_version_gives_the_previously_last_one_a_real_end_date(authed_client) -> None:
    await authed_client.post("/api/goals", json={**GOAL_PAYLOAD, "effective_date": "2026-08-01"})
    listing = (await authed_client.get("/api/goals")).json()
    assert listing[0]["end_date"] is None  # only version so far - indefinite

    await authed_client.post("/api/goals", json={**GOAL_PAYLOAD, "effective_date": "2026-08-15"})
    listing = (await authed_client.get("/api/goals")).json()
    assert listing[0]["end_date"] == "2026-08-14"  # now superseded, no longer indefinite


async def test_upsert_goal_version_overwrites_the_existing_version_for_the_same_date(authed_client) -> None:
    first = await authed_client.post("/api/goals", json=GOAL_PAYLOAD)
    second = await authed_client.post("/api/goals", json={**GOAL_PAYLOAD, "daily_calorie_goal": 2500})

    assert first.json()["id"] == second.json()["id"]
    assert second.json()["daily_calorie_goal"] == 2500

    listing = (await authed_client.get("/api/goals")).json()
    assert len(listing) == 1
    assert listing[0]["daily_calorie_goal"] == 2500


async def test_list_goal_versions_is_sorted_by_effective_date(authed_client) -> None:
    await authed_client.post("/api/goals", json={**GOAL_PAYLOAD, "effective_date": "2026-08-15"})
    await authed_client.post("/api/goals", json={**GOAL_PAYLOAD, "effective_date": "2026-08-01"})
    await authed_client.post("/api/goals", json={**GOAL_PAYLOAD, "effective_date": "2026-08-08"})

    listing = (await authed_client.get("/api/goals")).json()
    assert [version["effective_date"] for version in listing] == ["2026-08-01", "2026-08-08", "2026-08-15"]


async def test_delete_goal_version(authed_client) -> None:
    created = await authed_client.post("/api/goals", json=GOAL_PAYLOAD)
    goal_id = created.json()["id"]

    response = await authed_client.delete(f"/api/goals/{goal_id}")
    assert response.status_code == 204
    assert (await authed_client.get("/api/goals")).json() == []


async def test_delete_goal_version_not_found(authed_client) -> None:
    response = await authed_client.delete(f"/api/goals/{NOT_FOUND_ID}")
    assert response.status_code == 404


async def test_delete_goal_version_owned_by_another_user_is_not_found(authed_client) -> None:
    created = await authed_client.post("/api/goals", json=GOAL_PAYLOAD)
    goal_id = created.json()["id"]

    await authed_client.post(
        "/api/auth/register", json={"email": "other@b.com", "password": "correcthorsebattery", "display_name": "Bob"}
    )
    response = await authed_client.delete(f"/api/goals/{goal_id}")
    assert response.status_code == 404


async def test_resolve_goal_for_date_falls_back_to_defaults_when_no_versions_exist() -> None:
    async with session_factory() as db_session:
        goal = await resolve_goal_for_date(db_session, UUID(int=0), date(2026, 8, 1))
    assert goal.calorie_goal == DEFAULT_CALORIE_GOAL
    assert goal.protein_goal_g == DEFAULT_PROTEIN_GOAL_G
    assert goal.carbs_goal_g == DEFAULT_CARBS_GOAL_G
    assert goal.fat_goal_g == DEFAULT_FAT_GOAL_G


async def test_resolve_goal_for_date_picks_the_latest_version_not_after_the_date(authed_client) -> None:
    me = (await authed_client.get("/api/auth/me")).json()
    await authed_client.post("/api/goals", json={**GOAL_PAYLOAD, "effective_date": "2026-08-01"})
    await authed_client.post(
        "/api/goals", json={**GOAL_PAYLOAD, "effective_date": "2026-08-10", "daily_calorie_goal": 2500}
    )

    user_id = UUID(me["id"])
    async with session_factory() as db_session:
        before_any_version = await resolve_goal_for_date(db_session, user_id, date(2026, 7, 1))
        exact_match = await resolve_goal_for_date(db_session, user_id, date(2026, 8, 10))
        between_versions = await resolve_goal_for_date(db_session, user_id, date(2026, 8, 5))
        after_latest = await resolve_goal_for_date(db_session, user_id, date(2026, 9, 1))

    assert before_any_version.calorie_goal == DEFAULT_CALORIE_GOAL
    assert exact_match.calorie_goal == 2500
    assert between_versions.calorie_goal == 2000
    assert after_latest.calorie_goal == 2500


async def test_daily_stats_reflects_the_goal_in_effect_on_the_queried_date(authed_client) -> None:
    await authed_client.post("/api/goals", json={**GOAL_PAYLOAD, "effective_date": "2026-08-01"})
    await authed_client.post(
        "/api/goals", json={**GOAL_PAYLOAD, "effective_date": "2026-08-10", "daily_calorie_goal": 2500}
    )

    before = await authed_client.get("/api/stats/daily?date=2026-08-05")
    after = await authed_client.get("/api/stats/daily?date=2026-08-10")
    assert before.json()["calorie_goal"] == 2000
    assert after.json()["calorie_goal"] == 2500


async def test_retroactively_editing_a_past_goal_does_not_affect_a_later_version(authed_client) -> None:
    # A later version already exists for 2026-08-10 - correcting what the goal *was* on 2026-08-01
    # must not disturb it, since resolve_goal_for_date always picks the latest version <= the date.
    await authed_client.post("/api/goals", json={**GOAL_PAYLOAD, "effective_date": "2026-08-01"})
    await authed_client.post(
        "/api/goals", json={**GOAL_PAYLOAD, "effective_date": "2026-08-10", "daily_calorie_goal": 2500}
    )
    await authed_client.post(
        "/api/goals", json={**GOAL_PAYLOAD, "effective_date": "2026-08-01", "daily_calorie_goal": 1800}
    )

    early = await authed_client.get("/api/stats/daily?date=2026-08-05")
    late = await authed_client.get("/api/stats/daily?date=2026-08-15")
    assert early.json()["calorie_goal"] == 1800
    assert late.json()["calorie_goal"] == 2500


async def test_deleting_the_only_version_falls_back_to_defaults(authed_client) -> None:
    created = await authed_client.post("/api/goals", json=GOAL_PAYLOAD)
    goal_id = created.json()["id"]

    await authed_client.delete(f"/api/goals/{goal_id}")

    response = await authed_client.get("/api/stats/daily?date=2026-08-05")
    assert response.json()["calorie_goal"] == DEFAULT_CALORIE_GOAL


async def test_deleting_a_middle_version_falls_back_to_the_next_earlier_one(authed_client) -> None:
    await authed_client.post("/api/goals", json={**GOAL_PAYLOAD, "effective_date": "2026-08-01"})
    middle = await authed_client.post(
        "/api/goals", json={**GOAL_PAYLOAD, "effective_date": "2026-08-10", "daily_calorie_goal": 2500}
    )
    await authed_client.post(
        "/api/goals", json={**GOAL_PAYLOAD, "effective_date": "2026-08-20", "daily_calorie_goal": 3000}
    )

    await authed_client.delete(f"/api/goals/{middle.json()['id']}")

    response = await authed_client.get("/api/stats/daily?date=2026-08-15")
    assert response.json()["calorie_goal"] == 2000
