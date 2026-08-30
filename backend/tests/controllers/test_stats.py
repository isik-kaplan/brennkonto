from datetime import date

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.controllers.stats import _bucket_key, _bucket_label


dates = st.dates(min_value=date(2000, 1, 1), max_value=date(2099, 12, 31))


@given(d=dates)
def test_bucket_key_day_is_the_date_itself(d: date) -> None:
    assert _bucket_key(d, "day") == d


@given(d=dates)
def test_bucket_key_week_is_a_monday_on_or_before_the_date(d: date) -> None:
    key = _bucket_key(d, "week")
    assert key.weekday() == 0
    assert key <= d
    assert (d - key).days < 7


@given(d=dates)
def test_bucket_key_month_is_the_first_of_the_month(d: date) -> None:
    key = _bucket_key(d, "month")
    assert key.day == 1
    assert key.year == d.year
    assert key.month == d.month


def test_bucket_key_rejects_an_unsupported_group_by() -> None:
    with pytest.raises(Exception, match="Unsupported group_by"):
        _bucket_key(date(2026, 8, 1), "fortnight")


def test_bucket_label_day() -> None:
    label, start, end = _bucket_label(date(2026, 8, 1), "day")
    assert start == end == date(2026, 8, 1)
    assert "Aug" in label


def test_bucket_label_week_spans_seven_days() -> None:
    label, start, end = _bucket_label(date(2026, 8, 3), "week")
    assert start == date(2026, 8, 3)
    assert end == date(2026, 8, 9)
    assert "–" in label


def test_bucket_label_month_spans_the_full_month() -> None:
    label, start, end = _bucket_label(date(2026, 2, 1), "month")
    assert start == date(2026, 2, 1)
    assert end == date(2026, 2, 28)
    assert label == "February 2026"


def test_bucket_label_month_handles_december_year_rollover() -> None:
    _, start, end = _bucket_label(date(2026, 12, 1), "month")
    assert start == date(2026, 12, 1)
    assert end == date(2026, 12, 31)


ENTRY_PAYLOAD = {
    "name": "Banana",
    "grams": 120,
    "calories_per_100g": 89,
    "protein_per_100g": 1.1,
    "carbs_per_100g": 22.8,
    "fat_per_100g": 0.3,
}


async def test_daily_stats_with_no_entries(authed_client) -> None:
    response = await authed_client.get("/api/stats/daily?date=2026-08-01")
    assert response.status_code == 200
    body = response.json()
    assert body["calories"] == 0
    assert body["entries"] == []
    assert body["calorie_goal"] == 2000


async def test_daily_stats_sums_same_day_entries(authed_client) -> None:
    await authed_client.post("/api/entries/", json={**ENTRY_PAYLOAD, "consumed_at": "2026-08-01T12:00:00Z"})
    await authed_client.post("/api/entries/", json={**ENTRY_PAYLOAD, "consumed_at": "2026-08-01T12:00:00Z"})
    await authed_client.post("/api/entries/", json={**ENTRY_PAYLOAD, "consumed_at": "2026-08-02T12:00:00Z"})

    response = await authed_client.get("/api/stats/daily?date=2026-08-01")
    body = response.json()
    assert len(body["entries"]) == 2
    assert body["calories"] == pytest.approx(106.8 * 2)


async def test_daily_stats_requires_authentication(client) -> None:
    response = await client.get("/api/stats/daily?date=2026-08-01")
    assert response.status_code == 401


async def test_range_stats_rejects_start_after_end(authed_client) -> None:
    response = await authed_client.get("/api/stats/range?start=2026-08-10&end=2026-08-01&group_by=day")
    assert response.status_code == 400


async def test_range_stats_rejects_an_unsupported_group_by(authed_client) -> None:
    response = await authed_client.get("/api/stats/range?start=2026-08-01&end=2026-08-07&group_by=fortnight")
    assert response.status_code == 400


async def test_range_stats_with_no_entries(authed_client) -> None:
    response = await authed_client.get("/api/stats/range?start=2026-08-01&end=2026-08-07&group_by=day")
    body = response.json()
    assert body["points"] == []
    assert body["average_calories"] == 0
    assert body["days_in_range"] == 7
    assert body["days_logged"] == 0


async def test_range_stats_groups_by_day(authed_client) -> None:
    await authed_client.post("/api/entries/", json={**ENTRY_PAYLOAD, "consumed_at": "2026-08-01T12:00:00Z"})
    await authed_client.post("/api/entries/", json={**ENTRY_PAYLOAD, "consumed_at": "2026-08-03T12:00:00Z"})

    response = await authed_client.get("/api/stats/range?start=2026-08-01&end=2026-08-07&group_by=day")
    body = response.json()
    assert len(body["points"]) == 2
    assert body["days_logged"] == 2
    assert body["average_calories"] == pytest.approx(106.8)


async def test_range_stats_groups_by_week(authed_client) -> None:
    await authed_client.post("/api/entries/", json={**ENTRY_PAYLOAD, "consumed_at": "2026-08-01T12:00:00Z"})
    await authed_client.post("/api/entries/", json={**ENTRY_PAYLOAD, "consumed_at": "2026-08-02T12:00:00Z"})

    response = await authed_client.get("/api/stats/range?start=2026-07-27&end=2026-08-09&group_by=week")
    body = response.json()
    assert len(body["points"]) == 1
    assert body["points"][0]["days_logged"] == 2
    assert body["points"][0]["calories"] == pytest.approx(106.8 * 2)


async def test_range_stats_groups_by_month(authed_client) -> None:
    await authed_client.post("/api/entries/", json={**ENTRY_PAYLOAD, "consumed_at": "2026-08-01T12:00:00Z"})
    await authed_client.post("/api/entries/", json={**ENTRY_PAYLOAD, "consumed_at": "2026-08-31T12:00:00Z"})

    response = await authed_client.get("/api/stats/range?start=2026-08-01&end=2026-08-31&group_by=month")
    body = response.json()
    assert len(body["points"]) == 1
    assert body["points"][0]["period_label"] == "August 2026"


async def test_range_stats_average_ignores_days_with_no_entries(authed_client) -> None:
    await authed_client.post("/api/entries/", json={**ENTRY_PAYLOAD, "consumed_at": "2026-08-01T12:00:00Z"})

    # a 7-day range with only 1 logged day - average should be over the 1 logged day, not the
    # full 7 days, so a partial week doesn't read as "you're eating far too little."
    response = await authed_client.get("/api/stats/range?start=2026-08-01&end=2026-08-07&group_by=day")
    body = response.json()
    assert body["average_calories"] == pytest.approx(106.8)
    assert body["days_in_range"] == 7
    assert body["days_logged"] == 1


async def test_range_stats_requires_authentication(client) -> None:
    response = await client.get("/api/stats/range?start=2026-08-01&end=2026-08-07&group_by=day")
    assert response.status_code == 401


async def test_range_stats_points_reflect_the_goal_in_effect_by_the_end_of_each_bucket(authed_client) -> None:
    await authed_client.post(
        "/api/goals",
        json={
            "effective_date": "2026-08-01",
            "daily_calorie_goal": 2000,
            "daily_protein_goal_g": 150,
            "daily_carbs_goal_g": 200,
            "daily_fat_goal_g": 65,
        },
    )
    await authed_client.post(
        "/api/goals",
        json={
            "effective_date": "2026-08-03",
            "daily_calorie_goal": 2500,
            "daily_protein_goal_g": 150,
            "daily_carbs_goal_g": 200,
            "daily_fat_goal_g": 65,
        },
    )
    await authed_client.post("/api/entries/", json={**ENTRY_PAYLOAD, "consumed_at": "2026-08-01T12:00:00Z"})
    await authed_client.post("/api/entries/", json={**ENTRY_PAYLOAD, "consumed_at": "2026-08-03T12:00:00Z"})

    response = await authed_client.get("/api/stats/range?start=2026-08-01&end=2026-08-07&group_by=day")
    points_by_date = {point["period_start"]: point for point in response.json()["points"]}
    assert points_by_date["2026-08-01"]["calorie_goal"] == 2000
    assert points_by_date["2026-08-03"]["calorie_goal"] == 2500


async def test_range_stats_points_include_the_per_macro_goals(authed_client) -> None:
    await authed_client.post("/api/entries/", json={**ENTRY_PAYLOAD, "consumed_at": "2026-08-01T12:00:00Z"})

    response = await authed_client.get("/api/stats/range?start=2026-08-01&end=2026-08-07&group_by=day")
    point = response.json()["points"][0]
    assert point["protein_goal_g"] == 150
    assert point["carbs_goal_g"] == 200
    assert point["fat_goal_g"] == 65
