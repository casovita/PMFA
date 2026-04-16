"""PMFA backend entry point.

Run from the backend/ directory:
    uv run uvicorn main:app --reload
"""

from app.factory import create_app

app = create_app()
