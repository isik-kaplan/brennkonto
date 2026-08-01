import hashlib
from uuid import UUID

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from litestar.connection import ASGIConnection
from litestar.middleware.session.client_side import CookieBackendConfig
from litestar.security.session_auth import SessionAuth

from app.config import settings
from app.db import session_factory
from app.models import User


_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    # InvalidHashError - a corrupted or foreign-format hash - is a ValueError, not a subclass of
    # VerifyMismatchError's Argon2Error hierarchy, so it needs its own except clause; both cases
    # mean "this password doesn't verify", not a 500.
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


async def retrieve_user_handler(session: dict, connection: ASGIConnection) -> User | None:
    user_id = session.get("user_id")
    if user_id is None:
        return None
    # The session cookie round-trips through JSON, which has no UUID type - a UUID stored via
    # set_session() comes back here as a plain string. A malformed/stale value (e.g. an int id
    # from a pre-UUID-migration session cookie) must resolve to "not logged in", not a 500.
    try:
        parsed_id = UUID(user_id) if isinstance(user_id, str) else UUID(str(user_id))
    except (ValueError, AttributeError, TypeError):
        return None
    async with session_factory() as db_session:
        return await db_session.get(User, parsed_id)


# CookieBackendConfig encrypts the session with AES, which requires a 16/24/32-byte key -
# hashing SECRET_KEY down to 32 bytes means any non-empty SECRET_KEY the user sets works,
# regardless of the length they happened to pick.
session_backend_config = CookieBackendConfig(
    secret=hashlib.sha256(settings.SECRET_KEY.encode()).digest(),
    secure=settings.SESSION_COOKIE_SECURE,
)

session_auth = SessionAuth[User, CookieBackendConfig](
    retrieve_user_handler=retrieve_user_handler,
    session_backend_config=session_backend_config,
    exclude=["/api/auth/register", "/api/auth/login", "/health", "/schema", r"^/(?!api).*"],
)
