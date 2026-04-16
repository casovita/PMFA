import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from sqlalchemy import Engine

from app.config import get_settings
from app.database import get_engine, get_session
from app.factory import create_app
from app.services.rules_engine import RulesEngine


@pytest.fixture(name="rules_engine")
def rules_engine_fixture() -> RulesEngine:
    settings = get_settings()
    return RulesEngine(settings.rules_json_path)


@pytest.fixture(name="session")
def session_fixture():
    """In-memory SQLite session — isolated per test."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture():
    """Test client using the real app factory (real rules JSON, in-memory DB)."""
    app = create_app()

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    def override_get_session():
        with Session(engine) as session:
            yield session

    def override_get_engine() -> Engine:
        return engine

    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_engine] = override_get_engine

    with TestClient(app) as client:
        yield client
