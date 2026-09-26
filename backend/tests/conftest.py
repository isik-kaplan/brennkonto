import os
from collections.abc import AsyncIterator, Iterator
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


def _database_path() -> Path:
    shared = Path(os.environ["DATABASE_PATH"])
    # mutmut forks one child per mutant, several at a time, each running its own pytest session
    # against an app (and engine) the parent already imported - on one shared file they'd drop each
    # other's tables mid-test. Each child gets its own file instead. Checked for presence, not a
    # value: mutmut's own clean baseline run sets it to "".
    if "MUTANT_UNDER_TEST" in os.environ:
        return shared.with_name(f"{shared.stem}.{os.getpid()}{shared.suffix}")
    return shared


@pytest.fixture(scope="session", autouse=True)
def _fresh_database_file() -> Iterator[None]:
    # A per-test drop_all/create_all isn't enough on its own to start the *session* clean - a
    # SQLite file left over from a previous test run (previous `pytest` process) needs to be
    # gone before the engine's first connection of this session, not just have its tables
    # dropped from within one.
    path = _database_path()
    path.unlink(missing_ok=True)
    if path == Path(os.environ["DATABASE_PATH"]):
        yield
        return

    from sqlalchemy import event

    from app.db import engine

    # Repointed per connection rather than by swapping the engine: app.auth and several tests
    # import `engine`/`session_factory` by name, so a replacement would never reach them. Pooled
    # connections are dropped on the way in and out - mutmut runs several sessions per process and
    # forks children mid-way, so whatever is pooled is open on some other session's file.
    engine.sync_engine.dispose(close=False)

    def connect_to_own_file(dialect, connection_record, cargs, cparams) -> None:
        cargs[0] = str(path)

    event.listen(engine.sync_engine, "do_connect", connect_to_own_file)
    yield
    event.remove(engine.sync_engine, "do_connect", connect_to_own_file)
    engine.sync_engine.dispose(close=False)
    path.unlink(missing_ok=True)


@pytest.fixture(autouse=True)
async def _reset_database() -> AsyncIterator[None]:
    # The models register their tables on Base.metadata when imported - done here so a test module
    # that never imports them itself (test_db.py) doesn't depend on some other module having done
    # it first. mutmut runs tests in subsets, where that ordering can't be relied on.
    import app.models  # noqa: F401
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
