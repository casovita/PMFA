from typing import Any

from pydantic import BaseModel


class ThresholdBand(BaseModel):
    min: float | None = None
    max: float | None = None


class ThresholdSet(BaseModel):
    optimal: ThresholdBand | None = None
    warning: ThresholdBand | None = None
    high_risk: ThresholdBand | None = None
    critical: ThresholdBand | None = None


class RuleResponse(BaseModel):
    id: str
    joint: str | None = None
    constraint: str | None = None
    plane: str
    description: str
    thresholds: ThresholdSet
    applies_to_movements: list[str]
    detection_priority: int
    evidence: str | None = None


class MovementRulesResponse(BaseModel):
    movement: str
    sagittal_rules: list[RuleResponse]
    frontal_rules: list[RuleResponse]
    execution_standards: dict[str, Any] | None = None
