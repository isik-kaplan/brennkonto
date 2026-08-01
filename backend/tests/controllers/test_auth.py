async def test_register_creates_a_user_and_starts_a_session(client) -> None:
    response = await client.post(
        "/api/auth/register",
        json={"email": "a@b.com", "password": "correcthorsebattery", "display_name": "Ada"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "a@b.com"
    assert body["username"] is None
    assert body["display_name"] == "Ada"
    assert body["daily_calorie_goal"] == 2000
    assert "password" not in body
    assert "password_hash" not in body

    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "a@b.com"


async def test_register_rejects_a_duplicate_email(client) -> None:
    payload = {"email": "a@b.com", "password": "correcthorsebattery", "display_name": "Ada"}
    first = await client.post("/api/auth/register", json=payload)
    assert first.status_code == 201

    second = await client.post("/api/auth/register", json=payload)
    assert second.status_code == 403
    assert "already exists" in second.json()["detail"]


async def test_register_rejects_when_registration_is_disabled(client, monkeypatch) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "REGISTRATION_ENABLED", False)
    response = await client.post(
        "/api/auth/register",
        json={"email": "a@b.com", "password": "correcthorsebattery", "display_name": "Ada"},
    )
    assert response.status_code == 404


async def test_login_with_email(client) -> None:
    await client.post(
        "/api/auth/register",
        json={"email": "a@b.com", "password": "correcthorsebattery", "display_name": "Ada"},
    )
    await client.post("/api/auth/logout")

    response = await client.post("/api/auth/login", json={"identifier": "a@b.com", "password": "correcthorsebattery"})
    assert response.status_code == 201
    assert response.json()["email"] == "a@b.com"


async def test_login_with_username(client) -> None:
    await client.post(
        "/api/auth/register",
        json={"email": "a@b.com", "password": "correcthorsebattery", "display_name": "Ada"},
    )
    await client.patch("/api/account/profile", json={"display_name": "Ada", "username": "ada"})
    await client.post("/api/auth/logout")

    response = await client.post("/api/auth/login", json={"identifier": "ada", "password": "correcthorsebattery"})
    assert response.status_code == 201
    assert response.json()["username"] == "ada"


async def test_login_with_wrong_password(client) -> None:
    await client.post(
        "/api/auth/register",
        json={"email": "a@b.com", "password": "correcthorsebattery", "display_name": "Ada"},
    )
    response = await client.post("/api/auth/login", json={"identifier": "a@b.com", "password": "wrong"})
    assert response.status_code == 401


async def test_login_with_unknown_identifier(client) -> None:
    response = await client.post("/api/auth/login", json={"identifier": "nobody@b.com", "password": "wrong"})
    assert response.status_code == 401


async def test_logout_clears_the_session(authed_client) -> None:
    logout = await authed_client.post("/api/auth/logout")
    assert logout.status_code == 204

    me = await authed_client.get("/api/auth/me")
    assert me.status_code == 401


async def test_me_requires_authentication(client) -> None:
    response = await client.get("/api/auth/me")
    assert response.status_code == 401


async def test_me_returns_the_current_user(authed_client) -> None:
    response = await authed_client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json()["email"] == "demo@brennkonto.local"
