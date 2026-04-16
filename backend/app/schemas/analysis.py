from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class Keypoint(BaseModel):
    x: float
    y: float
    z: float
    visibility: float
    name: str


class FrameKeypoints(BaseModel):
    frame_index: int
    timestamp_sec: float
    keypoints: list[Keypoint]


class ViolationFlag(BaseModel):
    rule_id: str
    severity: str                   # optimal | warning | high_risk | critical
    metric: str
    value: float
    threshold: float
    phase: str | None = None        # DESCENDING | BOTTOM | ASCENDING | LOCKOUT


class RepMetrics(BaseModel):
    rep_number: int
    primary_angle_min: float
    max_trunk_lean: float
    time_under_tension_sec: float
    violations: list[ViolationFlag]
    score: float = Field(ge=0.0, le=100.0)
    quality_label: str              # excellent | good | fair | poor


class AnalysisResult(BaseModel):
    job_id: UUID
    movement: str
    total_reps: int
    overall_score: float = Field(ge=0.0, le=100.0)
    quality_label: str
    frame_keypoints: list[FrameKeypoints]
    rep_metrics: list[RepMetrics]
    violations: list[ViolationFlag]
    fatigue_flags: list[dict[str, Any]]
    processing_time_sec: float


class JobStatusResponse(BaseModel):
    job_id: UUID
    status: str
    result: AnalysisResult | None = None
    error_message: str | None = None
