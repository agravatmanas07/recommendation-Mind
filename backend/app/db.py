"""SQLAlchemy models. SQLite locally, PostgreSQL in production (set DATABASE_URL)."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (CheckConstraint, DateTime, ForeignKey, Integer, String, Text,
                        UniqueConstraint, create_engine, select)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, scoped_session, sessionmaker
from werkzeug.security import generate_password_hash


def now():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="customer")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    def to_dict(self):
        return {"id": self.id, "email": self.email, "name": self.name, "role": self.role}


class Rating(Base):
    __tablename__ = "ratings"
    __table_args__ = (UniqueConstraint("user_id", "item_id"), CheckConstraint("rating BETWEEN 1 AND 5"))
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    item_id: Mapped[int] = mapped_column(Integer, index=True)
    rating: Mapped[int] = mapped_column(Integer)
    review: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)

    def to_dict(self):
        return {"id": self.id, "item_id": self.item_id, "rating": self.rating, "review": self.review,
                "updated_at": self.updated_at.isoformat()}


class CartItem(Base):
    __tablename__ = "cart_items"
    __table_args__ = (UniqueConstraint("user_id", "item_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    item_id: Mapped[int] = mapped_column(Integer)
    quantity: Mapped[int] = mapped_column(Integer, default=1)


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    total: Mapped[float] = mapped_column(default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    lines: Mapped[list["OrderLine"]] = relationship(cascade="all, delete-orphan")

    def to_dict(self):
        return {"id": self.id, "total": round(self.total, 2), "created_at": self.created_at.isoformat(),
                "lines": [{"item_id": l.item_id, "quantity": l.quantity, "price": l.price} for l in self.lines]}


class OrderLine(Base):
    __tablename__ = "order_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"))
    item_id: Mapped[int] = mapped_column(Integer)
    quantity: Mapped[int] = mapped_column(Integer)
    price: Mapped[float] = mapped_column()


class Event(Base):
    """Implicit consumer-behaviour signals (views, add-to-cart, purchases, rec clicks)."""
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    item_id: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(20), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


Session = scoped_session(sessionmaker(expire_on_commit=False))


def init_db(app):
    url = app.config["DATABASE_URL"]
    if url.startswith("postgres://"):           # Render/Heroku style URL
        url = url.replace("postgres://", "postgresql+psycopg2://", 1)
    engine = create_engine(url, pool_pre_ping=True,
                           connect_args={"check_same_thread": False} if url.startswith("sqlite") else {})
    Session.configure(bind=engine)
    Base.metadata.create_all(engine)
    app.teardown_appcontext(lambda exc: Session.remove())
    if app.config.get("SEED_DEMO_USER"):
        s = Session()
        if not s.scalar(select(User).where(User.email == "demo@recomind.app")):
            s.add(User(email="demo@recomind.app", name="Demo Shopper", role="admin",
                       password_hash=generate_password_hash("demo1234")))
            s.commit()
        Session.remove()
