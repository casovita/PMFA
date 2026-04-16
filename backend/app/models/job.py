from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import Column
from sqlalchemy import JSON as SA_JSON
from sqlmodel import Field, SQLModel


class AnalysisJob(SQLModel, table=True):
    """Persisted record for a video analysis job."""

    __tablename__ = "analysis_jobs"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    status: str = Field(default="pending")          # pending | processing | completed | failed
    movement: str | None = Field(default=None)       # squat | deadlift | bench_press
    video_s3_key: str | None = Field(default=None)
    error_message: str | None = Field(default=None)
    result: dict[str, Any] | None = Field(default=None, sa_column=Column(SA_JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
