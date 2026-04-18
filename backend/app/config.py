from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="PMFA_",
        env_file=".env",
        env_file_encoding="utf-8",
    )

    # App
    app_env: str = "development"
    app_debug: bool = False
    app_cors_origins: list[str] = ["http://localhost:5173"]

    # Database
    db_url: str = "sqlite:///./pmfa.db"

    # Rules engine
    rules_json_path: Path = Path("../KNOWLEDGE/movement_analysis_rules.json")

    # Local disk upload storage
    # NOTE: swap to Cloudflare R2 (2-line boto3 change) before any cloud deployment
    upload_dir: Path = Path("/tmp/pmfa_uploads")

    # ML model directory — contains xgb_squat.json, xgb_deadlift.json, etc.
    # Training script: backend/scripts/train_model.py
    model_dir: Path = Path("models")

    # FFmpeg — leave empty to auto-detect from PATH
    ffmpeg_path: str = ""

    # Anthropic — leave empty to disable LLM feedback (graceful fallback)
    anthropic_api_key: str = ""

    # AWS S3 — unused during local-disk phase; kept for future R2/S3 migration
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_s3_bucket: str = ""
    aws_s3_region: str = "us-east-1"
    aws_s3_presign_expiry_seconds: int = 3600

    @field_validator("rules_json_path", mode="before")
    @classmethod
    def resolve_rules_path(cls, v: str | Path) -> Path:
        return Path(v).resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()
