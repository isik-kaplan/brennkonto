from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.auth import hash_password, retrieve_user_handler, verify_password
from app.models import User


passwords = st.text(min_size=1, max_size=200)


@settings(suppress_health_check=[HealthCheck.function_scoped_fixture], deadline=None)
@given(password=passwords)
def test_hash_and_verify_round_trip(password: str) -> None:
    hashed = hash_password(password)
    assert hashed != password
    assert verify_password(password, hashed)


@settings(suppress_health_check=[HealthCheck.function_scoped_fixture], deadline=None)
@given(password=passwords, wrong_password=passwords)
def test_verify_rejects_wrong_password(password: str, wrong_password: str) -> None:
    if password == wrong_password:
        return
    hashed = hash_password(password)
    assert not verify_password(wrong_password, hashed)


def test_verify_rejects_a_malformed_hash() -> None:
    assert not verify_password("anything", "not-a-real-argon2-hash")


async def test_retrieve_user_handler_returns_none_without_session_user_id() -> None:
    user = await retrieve_user_handler({}, connection=None)
    assert user is None


async def test_retrieve_user_handler_returns_none_for_unknown_user_id() -> None:
    user = await retrieve_user_handler({"user_id": 999999}, connection=None)
    assert user is None


async def test_retrieve_user_handler_returns_the_user() -> None:
    from app.db import session_factory

    async with session_factory() as db_session:
        user = User(email="a@b.com", password_hash=hash_password("secret1234"), display_name="A")
        db_session.add(user)
        await db_session.commit()
        user_id = user.id

    found = await retrieve_user_handler({"user_id": user_id}, connection=None)
    assert found is not None
    assert found.email == "a@b.com"
