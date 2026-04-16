# PMFA — Claude Code Environment

## Project
Powerlifting Form Analysis AI. Full roadmap: see `DEVELOPMENT_PLAN.md`.

## Stack
- **Frontend:** React + TypeScript + Vite (`frontend/`)
- **Backend:** FastAPI + Python 3.11+ (Phase 2+)
- **Package managers:** `npm` (Node), `uv` (Python)
- **Pose inference:** MediaPipe BlazePose (browser), YOLOv8-pose (server, Phase 2+)

## Directory Layout
```
PMFA/
  frontend/        # React + TypeScript + Vite app
  backend/         # FastAPI app (Phase 2+)
  DEVELOPMENT_PLAN.md
  PROGRESS.md      # Phase-by-phase completion log
  CLAUDE.md
```

## Dev Standards (enforced)
- **Commits:** Conventional Commits — `type(scope): description`
- **Branches:** `feat/`, `fix/`, `refactor/`, `chore/`, etc.
- **Frontend:** strict TypeScript, no `any`, ESLint + Prettier
- **Backend:** type hints on all signatures, Pydantic schemas, Ruff + mypy strict
- **Tests:** every PR includes tests for new logic; no mocking internal modules
- **Secrets:** never committed — `.env` files are gitignored, `.env.example` committed

## Phase Status
- **Phase 1 (POC):** Complete
- **Phase 2 (Alpha):** In progress
- **Phase 3–5:** Not started

## Key Commands
```bash
# Frontend (Phase 2+)
cd frontend && npm install && npm run dev    # http://localhost:5173

# Backend (Phase 2+)
cd backend && uv sync && uv run uvicorn main:app --reload  # http://localhost:8000
```
