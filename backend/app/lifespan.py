from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import get_settings
from app.database import init_db
from app.services.ml_scorer import MLScorer
from app.services.rules_engine import RulesEngine
from app.services.scorer import FusionScorer


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup and shutdown lifecycle for the FastAPI application."""
    settings = get_settings()

    # Initialise SQLite tables
    init_db()

    # Load rules JSON — fails fast at startup if missing or malformed
    rules_engine = RulesEngine(settings.rules_json_path)
    app.state.rules_engine = rules_engine

    # Load ML model (graceful: falls back to rules-only if file absent)
    # One model file covers all movements for now; split per-movement in Phase 3
    ml_model_path = settings.model_dir / "xgb_scorer.json"
    ml_scorer = MLScorer.from_file(ml_model_path)
    app.state.ml_scorer = ml_scorer

    # Fusion scorer combines both — this is what analyzer.py uses
    app.state.scorer = FusionScorer(rules_engine=rules_engine, ml_scorer=ml_scorer)

    yield
    # Shutdown: nothing to clean up for SQLite / in-process engine
