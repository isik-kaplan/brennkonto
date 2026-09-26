from pathlib import Path

import app.main as main_module
from app.config import settings


async def test_health_endpoint(client) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_build_cors_config_is_none_without_allowed_origins(monkeypatch) -> None:
    monkeypatch.setattr(settings, "CORS_ALLOW_ORIGINS", [])
    assert main_module._build_cors_config() is None


def test_build_cors_config_allows_configured_origins(monkeypatch) -> None:
    monkeypatch.setattr(settings, "CORS_ALLOW_ORIGINS", ["http://localhost:5173"])
    cors = main_module._build_cors_config()
    assert cors is not None
    assert cors.allow_origins == ["http://localhost:5173"]
    assert cors.allow_credentials is True


def test_build_route_handlers_without_static_dir(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(main_module, "STATIC_DIR", tmp_path / "does-not-exist")
    handlers = main_module._build_route_handlers()
    assert len(handlers) == 12


def test_build_route_handlers_with_static_dir(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(main_module, "STATIC_DIR", tmp_path)
    handlers = main_module._build_route_handlers()
    assert len(handlers) == 13


async def test_the_static_dir_serves_the_spa(monkeypatch, tmp_path: Path) -> None:
    from litestar import Litestar
    from litestar.testing import AsyncTestClient

    (tmp_path / "index.html").write_text("<html>app shell</html>")
    (tmp_path / "app.js").write_text("console.log('hi')")
    monkeypatch.setattr(main_module, "STATIC_DIR", tmp_path)
    app = Litestar(route_handlers=main_module._build_route_handlers())

    async with AsyncTestClient(app=app) as client:
        assert (await client.get("/")).text == "<html>app shell</html>"
        assert (await client.get("/app.js")).text == "console.log('hi')"
        # html_mode: a directory request gets its index.html; a client-side route gets nothing -
        # nginx owns that fallback in production.
        assert (await client.get("/history/2026-08-01")).status_code == 404
