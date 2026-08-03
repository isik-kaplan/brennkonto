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
    assert len(handlers) == 8


def test_build_route_handlers_with_static_dir(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(main_module, "STATIC_DIR", tmp_path)
    handlers = main_module._build_route_handlers()
    assert len(handlers) == 9
