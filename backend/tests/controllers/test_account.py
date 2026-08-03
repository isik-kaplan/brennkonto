async def test_update_profile(authed_client) -> None:
    response = await authed_client.patch("/api/account/profile", json={"display_name": "New Name"})
    assert response.status_code == 200
    assert response.json()["display_name"] == "New Name"

    me = await authed_client.get("/api/auth/me")
    assert me.json()["display_name"] == "New Name"


async def test_update_profile_requires_authentication(client) -> None:
    response = await client.patch("/api/account/profile", json={"display_name": "New Name"})
    assert response.status_code == 401


async def test_update_profile_ignores_a_username_field_if_sent(authed_client) -> None:
    # Username is permanently fixed after account creation - UpdateProfileRequest no longer even
    # has the field, so a client sending one (an old frontend build, or a direct API call) has it
    # silently dropped by msgspec rather than changing anything.
    response = await authed_client.patch(
        "/api/account/profile", json={"display_name": "Demo", "username": "attempted-change"}
    )
    assert response.status_code == 200
    assert response.json()["username"] is None


async def test_update_profile_sets_a_new_email(authed_client) -> None:
    response = await authed_client.patch(
        "/api/account/profile", json={"display_name": "Demo", "email": "new@example.com"}
    )
    assert response.status_code == 200
    assert response.json()["email"] == "new@example.com"


async def test_update_profile_rejects_a_taken_email(authed_client) -> None:
    # authed_client is already logged in as demo@brennkonto.local - registering switches this
    # same client's session to the new user, a clean way to get a second account without a
    # second TestClient.
    await authed_client.post(
        "/api/auth/register", json={"email": "other@b.com", "password": "correcthorsebattery", "display_name": "Bob"}
    )
    response = await authed_client.patch(
        "/api/account/profile", json={"display_name": "Bob", "email": "demo@brennkonto.local"}
    )
    assert response.status_code == 403
    assert "already exists" in response.json()["detail"]


async def test_update_profile_email_is_a_no_op_when_unchanged(authed_client) -> None:
    response = await authed_client.patch(
        "/api/account/profile", json={"display_name": "Demo", "email": "demo@brennkonto.local"}
    )
    assert response.status_code == 200
    assert response.json()["email"] == "demo@brennkonto.local"


async def test_change_password_with_correct_current_password(authed_client) -> None:
    response = await authed_client.post(
        "/api/account/password", json={"current_password": "correcthorsebattery", "new_password": "new-password-123"}
    )
    assert response.status_code == 201

    await authed_client.post("/api/auth/logout")
    login = await authed_client.post(
        "/api/auth/login", json={"identifier": "demo@brennkonto.local", "password": "new-password-123"}
    )
    assert login.status_code == 201


async def test_change_password_with_wrong_current_password(authed_client) -> None:
    response = await authed_client.post(
        "/api/account/password", json={"current_password": "wrong", "new_password": "new-password-123"}
    )
    assert response.status_code == 401
