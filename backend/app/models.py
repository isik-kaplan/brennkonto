import uuid as uuid_module
from datetime import UTC, date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from uuid6 import uuid7

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _uuid7() -> uuid_module.UUID:
    return uuid7()


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid_module.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid7)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    username: Mapped[str | None] = mapped_column(String(120), unique=True, index=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    # Nullable, no default, no onupdate= - stays null until a controller explicitly sets it on a
    # real edit; auto-touching it would also fire during the id-migration's own row copy.
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    entries: Mapped[list["FoodEntry"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class GoalVersion(Base):
    """A daily calorie/macro goal that takes effect starting `effective_date`, until superseded by
    a later version - see app/controllers/goals.py's resolve_goal_for_date for how "the goal on
    date X" is resolved (latest version with effective_date <= X, or hardcoded defaults if none).
    One row per (user, effective_date): setting a goal for a date that already has a version
    overwrites it in place, which is what makes retroactively correcting a past goal and
    scheduling a future one the same operation."""

    __tablename__ = "goal_versions"
    __table_args__ = (UniqueConstraint("user_id", "effective_date", name="uq_goal_versions_user_date"),)

    id: Mapped[uuid_module.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid7)
    user_id: Mapped[uuid_module.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    effective_date: Mapped[date] = mapped_column(Date, index=True)
    daily_calorie_goal: Mapped[int]
    daily_protein_goal_g: Mapped[int]
    daily_carbs_goal_g: Mapped[int]
    daily_fat_goal_g: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)


class Favorite(Base):
    """A saved food for fast re-logging, keyed by (user, barcode) - saving over an existing
    favorite (e.g. re-favoriting from the amount form with a new amount) overwrites it in place
    rather than creating a duplicate, the same upsert-by-natural-key convention as GoalVersion.
    The default_* fields are optional and travel together: all three null means "no default
    amount, always ask"; all three set means selecting this favorite can skip the amount form."""

    __tablename__ = "favorites"
    __table_args__ = (UniqueConstraint("user_id", "barcode", name="uq_favorites_user_barcode"),)

    id: Mapped[uuid_module.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid7)
    user_id: Mapped[uuid_module.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    barcode: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(255))
    brand: Mapped[str | None] = mapped_column(String(255), nullable=True)
    calories_per_100g: Mapped[float]
    protein_per_100g: Mapped[float]
    carbs_per_100g: Mapped[float]
    fat_per_100g: Mapped[float]
    default_input_unit: Mapped[str | None] = mapped_column(String(16), nullable=True)
    default_input_amount: Mapped[float | None]
    default_unit_to_grams: Mapped[float | None]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)


class ProductCache(Base):
    """A local cache of Open Food Facts lookups, keyed by barcode, so repeat searches for the
    same product don't re-hit the OFF API."""

    __tablename__ = "product_cache"

    barcode: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    brand: Mapped[str | None] = mapped_column(String(255), nullable=True)
    calories_per_100g: Mapped[float]
    protein_per_100g: Mapped[float]
    carbs_per_100g: Mapped[float]
    fat_per_100g: Mapped[float]
    suggested_unit: Mapped[str] = mapped_column(String(16), default="g")
    unit_to_grams: Mapped[float] = mapped_column(default=1.0)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class MealGroup(Base):
    """A cluster of food entries logged together as one meal. Every entry always belongs to one -
    even a "group of one" - so a single entry can be named the same way a multi-item meal can;
    see app/controllers/entries.py's create_entry and app/controllers/meal_groups.py's
    assign_fresh_singleton_group/delete_group_if_empty for how that invariant is kept."""

    __tablename__ = "meal_groups"

    id: Mapped[uuid_module.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid7)
    user_id: Mapped[uuid_module.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)


class FoodEntry(Base):
    """A single logged food, storing the macros per 100g at the time it was logged rather than a
    foreign key to ProductCache - so a later re-fetch of the same barcode (or the product being
    delisted from OFF) never rewrites history the user already logged."""

    __tablename__ = "food_entries"

    id: Mapped[uuid_module.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid7)
    user_id: Mapped[uuid_module.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    brand: Mapped[str | None] = mapped_column(String(255), nullable=True)
    barcode: Mapped[str | None] = mapped_column(String(64), nullable=True)
    grams: Mapped[float]
    # What the user actually typed and in what unit, snapshotted at logging time - `grams` above
    # is always the canonical value every calculation uses; these three are a historical record
    # of how the entry was originally logged (e.g. "2 count" for 2 eggs), not live-editable.
    input_unit: Mapped[str] = mapped_column(String(16), default="g")
    input_amount: Mapped[float]
    unit_to_grams: Mapped[float] = mapped_column(default=1.0)
    calories_per_100g: Mapped[float]
    protein_per_100g: Mapped[float]
    carbs_per_100g: Mapped[float]
    fat_per_100g: Mapped[float]
    # Full timestamp (not just a date) so a logged food can carry a time of day, editable
    # retroactively - distinct from created_at, which is a fixed audit timestamp of the row's
    # insertion, never editable.
    consumed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    # Plain scalar FK, not a relationship() - group membership is always read/written via direct
    # queries in the meal-groups controller rather than ORM collection traversal, which sidesteps
    # async lazy-loading pitfalls on a relationship. Nullable at the schema level only to avoid a
    # disruptive NOT NULL migration on SQLite - every code path that creates or moves an entry
    # always assigns a real group, so in practice this is never null (see MealGroup's docstring).
    meal_group_id: Mapped[uuid_module.UUID | None] = mapped_column(
        ForeignKey("meal_groups.id", ondelete="SET NULL"), nullable=True
    )
    # Soft delete: set instead of removing the row on a normal delete. Restore clears it; a
    # permanent delete (only reachable once this is already set) removes the row for real.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    user: Mapped[User] = relationship(back_populates="entries")

    @property
    def calories(self) -> float:
        return self.grams * self.calories_per_100g / 100

    @property
    def protein_g(self) -> float:
        return self.grams * self.protein_per_100g / 100

    @property
    def carbs_g(self) -> float:
        return self.grams * self.carbs_per_100g / 100

    @property
    def fat_g(self) -> float:
        return self.grams * self.fat_per_100g / 100
