from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import get_settings
from app.database import init_db
from app.services.rules_engine import RulesEngine


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup and shutdown lifecycle for the FastAPI application."""
    settings = get_settings()

    # Initialise SQLite tables
    init_db()

    # Load rules JSON — fails fast at startup if missing or malformed
    rules_engine = RulesEngine(settings.rules_json_path)
    app.state.rules_engine = rules_engine

    yield
    # Shutdown: nothing to clean up for SQLite / in-process engine
