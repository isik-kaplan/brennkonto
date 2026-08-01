import os
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from litestar.testing import AsyncTestClient


# Must run before any `app.*` module is imported (app.config builds `settings` at import time),
# so this sits at conftest module level rather than inside a fixture.
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")
os.environ.setdefault("REGISTRATION_ENABLED", "True")
os.environ.setdefault("DATABASE_PATH", str(Path(__file__).parent / "test.sqlite3"))
os.environ.setdefault("SESSION_COOKIE_SECURE", "False")
os.environ.setdefault("OFF_USER_AGENT", "Brennkonto-Test/0.1")


@pytest.fixture(scope="session", autouse=True)
def _delete_stale_database_file() -> None:
    # A per-test drop_all/create_all isn't enough on its own to start the *session* clean - a
    # SQLite file left over from a previous test run (previous `pytest` process) needs to be
    # gone before the engine's first connection of this session, not just have its tables
    # dropped from within one.
    Path(os.environ["DATABASE_PATH"]).unlink(missing_ok=True)


@pytest.fixture(autouse=True)
async def _reset_database() -> AsyncIterator[None]:
    from app.db import Base, engine

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    yield


@pytest.fixture
async def client() -> AsyncIterator[AsyncTestClient]:
    from app.main import app

    async with AsyncTestClient(app=app) as test_client:
        yield test_client


@pytest.fixture
async def authed_client(client: AsyncTestClient) -> AsyncTestClient:
    await client.post(
        "/api/auth/register",
        json={"email": "demo@brennkonto.local", "password": "correcthorsebattery", "display_name": "Demo"},
    )
    return client
