from collections.abc import Generator

from sqlalchemy import Engine
from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings

_engine: Engine = create_engine(
    get_settings().db_url,
    connect_args={"check_same_thread": False},
    echo=get_settings().app_debug,
)


def init_db() -> None:
    """Create all tables. Idempotent — safe to call on every startup."""
    SQLModel.metadata.create_all(_engine)


def get_engine() -> Engine:
    """Return the module-level engine. Override in tests via dependency_overrides."""
    return _engine


def get_session() -> Generator[Session, None, None]:
    """Yield a database session. Used as a FastAPI dependency."""
    with Session(_engine) as session:
        yield session
