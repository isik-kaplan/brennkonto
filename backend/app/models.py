from datetime import UTC, date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(120))
    daily_calorie_goal: Mapped[int] = mapped_column(default=2000)
    daily_protein_goal_g: Mapped[int] = mapped_column(default=150)
    daily_carbs_goal_g: Mapped[int] = mapped_column(default=200)
    daily_fat_goal_g: Mapped[int] = mapped_column(default=65)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    entries: Mapped[list["FoodEntry"]] = relationship(back_populates="user", cascade="all, delete-orphan")


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
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class FoodEntry(Base):
    """A single logged food, storing the macros per 100g at the time it was logged rather than a
    foreign key to ProductCache - so a later re-fetch of the same barcode (or the product being
    delisted from OFF) never rewrites history the user already logged."""

    __tablename__ = "food_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    brand: Mapped[str | None] = mapped_column(String(255), nullable=True)
    barcode: Mapped[str | None] = mapped_column(String(64), nullable=True)
    grams: Mapped[float]
    calories_per_100g: Mapped[float]
    protein_per_100g: Mapped[float]
    carbs_per_100g: Mapped[float]
    fat_per_100g: Mapped[float]
    consumed_at: Mapped[date] = mapped_column(Date, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

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
