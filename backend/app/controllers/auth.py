from litestar import Request, Router, get, post
from litestar.exceptions import NotAuthorizedException, NotFoundException, PermissionDeniedException
from litestar.response import Response
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import hash_password, verify_password
from app.config import settings
from app.models import User
from app.schemas import LoginRequest, RegisterRequest, UserOut
from app.serializers import user_out


@post("/register")
async def register(data: RegisterRequest, request: Request, db_session: AsyncSession) -> UserOut:
    if not settings.REGISTRATION_ENABLED:
        raise NotFoundException("Registration is currently disabled.")

    existing = await db_session.scalar(select(User).where(User.email == data.email))
    if existing is not None:
        raise PermissionDeniedException("An account with this email already exists.")

    user = User(email=data.email, password_hash=hash_password(data.password), display_name=data.display_name)
    db_session.add(user)
    await db_session.commit()
    request.set_session({"user_id": user.id})
    return user_out(user)


@post("/login")
async def login(data: LoginRequest, request: Request, db_session: AsyncSession) -> UserOut:
    user = await db_session.scalar(
        select(User).where(or_(User.email == data.identifier, User.username == data.identifier))
    )
    if user is None or not verify_password(data.password, user.password_hash):
        raise NotAuthorizedException("Invalid email/username or password.")
    request.set_session({"user_id": user.id})
    return user_out(user)


@post("/logout")
async def logout(request: Request) -> Response:
    request.clear_session()
    return Response(content=None, status_code=204)


@get("/me")
async def me(request: Request) -> UserOut:
    return user_out(request.user)


auth_router = Router(path="/api/auth", route_handlers=[register, login, logout, me])
