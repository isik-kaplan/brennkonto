from pathlib import Path

from litestar import Litestar, get
from litestar.config.cors import CORSConfig
from litestar.di import Provide
from litestar.static_files import create_static_files_router

from app.auth import session_auth
from app.config import settings
from app.controllers.account import account_router
from app.controllers.auth import auth_router
from app.controllers.entries import entries_router
from app.controllers.foods import foods_router
from app.controllers.goals import goals_router
from app.controllers.meal_groups import meal_groups_router
from app.controllers.stats import stats_router
from app.db import create_tables, get_db_session


STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


def _build_route_handlers() -> list:
    handlers = [
        health,
        auth_router,
        account_router,
        foods_router,
        entries_router,
        meal_groups_router,
        goals_router,
        stats_router,
    ]
    if STATIC_DIR.is_dir():
        # Serves the built frontend SPA and falls back to index.html for client-side routes -
        # only present once the frontend build has been copied in (see the Dockerfile).
        handlers.append(create_static_files_router(path="/", directories=[STATIC_DIR], html_mode=True, name="spa"))
    return handlers


def _build_cors_config() -> CORSConfig | None:
    if not settings.CORS_ALLOW_ORIGINS:
        return None
    return CORSConfig(allow_origins=settings.CORS_ALLOW_ORIGINS, allow_credentials=True)


app = Litestar(
    route_handlers=_build_route_handlers(),
    dependencies={"db_session": Provide(get_db_session)},
    on_app_init=[session_auth.on_app_init],
    on_startup=[create_tables],
    cors_config=_build_cors_config(),
)
