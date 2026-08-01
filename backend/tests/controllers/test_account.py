async def test_update_profile(authed_client) -> None:
    response = await authed_client.patch("/api/account/profile", json={"display_name": "New Name"})
    assert response.status_code == 200
    assert response.json()["display_name"] == "New Name"

    me = await authed_client.get("/api/auth/me")
    assert me.json()["display_name"] == "New Name"


async def test_update_profile_requires_authentication(client) -> None:
    response = await client.patch("/api/account/profile", json={"display_name": "New Name"})
    assert response.status_code == 401


async def test_update_goals(authed_client) -> None:
    response = await authed_client.patch(
        "/api/account/goals",
        json={
            "daily_calorie_goal": 2500,
            "daily_protein_goal_g": 180,
            "daily_carbs_goal_g": 250,
            "daily_fat_goal_g": 80,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["daily_calorie_goal"] == 2500
    assert body["daily_protein_goal_g"] == 180
    assert body["daily_carbs_goal_g"] == 250
    assert body["daily_fat_goal_g"] == 80


async def test_change_password_with_correct_current_password(authed_client) -> None:
    response = await authed_client.post(
        "/api/account/password", json={"current_password": "correcthorsebattery", "new_password": "new-password-123"}
    )
    assert response.status_code == 201

    await authed_client.post("/api/auth/logout")
    login = await authed_client.post(
        "/api/auth/login", json={"email": "demo@brennkonto.local", "password": "new-password-123"}
    )
    assert login.status_code == 201


async def test_change_password_with_wrong_current_password(authed_client) -> None:
    response = await authed_client.post(
        "/api/account/password", json={"current_password": "wrong", "new_password": "new-password-123"}
    )
    assert response.status_code == 401
