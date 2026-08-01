from litestar import Request, Router, patch, post
from litestar.exceptions import NotAuthorizedException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import hash_password, verify_password
from app.models import User
from app.schemas import ChangePasswordRequest, UpdateGoalsRequest, UpdateProfileRequest, UserOut
from app.serializers import user_out


async def _load_current_user(db_session: AsyncSession, request: Request) -> User:
    # request.user comes from a short-lived session opened by retrieve_user_handler, already
    # closed by the time a controller runs - reloading by id into this request's own db_session
    # keeps the instance attached and safe to mutate and commit.
    return await db_session.get(User, request.user.id)


@patch("/profile")
async def update_profile(data: UpdateProfileRequest, request: Request, db_session: AsyncSession) -> UserOut:
    user = await _load_current_user(db_session, request)
    user.display_name = data.display_name
    await db_session.commit()
    return user_out(user)


@patch("/goals")
async def update_goals(data: UpdateGoalsRequest, request: Request, db_session: AsyncSession) -> UserOut:
    user = await _load_current_user(db_session, request)
    user.daily_calorie_goal = data.daily_calorie_goal
    user.daily_protein_goal_g = data.daily_protein_goal_g
    user.daily_carbs_goal_g = data.daily_carbs_goal_g
    user.daily_fat_goal_g = data.daily_fat_goal_g
    await db_session.commit()
    return user_out(user)


@post("/password")
async def change_password(data: ChangePasswordRequest, request: Request, db_session: AsyncSession) -> UserOut:
    user = await _load_current_user(db_session, request)
    if not verify_password(data.current_password, user.password_hash):
        raise NotAuthorizedException("Current password is incorrect.")
    user.password_hash = hash_password(data.new_password)
    await db_session.commit()
    return user_out(user)


account_router = Router(path="/api/account", route_handlers=[update_profile, update_goals, change_password])
