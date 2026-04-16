from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.lifespan import lifespan
from app.routers import analysis, rules, storage


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="PMFA API",
        description="Powerlifting Form Analysis — backend API",
        version="0.1.0",
        lifespan=lifespan,
        debug=settings.app_debug,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.app_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(analysis.router, prefix="/api/v1", tags=["analysis"])
    app.include_router(rules.router, prefix="/api/v1", tags=["rules"])
    app.include_router(storage.router, prefix="/api/v1", tags=["storage"])

    return app
