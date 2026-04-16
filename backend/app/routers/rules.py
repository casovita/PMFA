from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.schemas.rules import MovementRulesResponse, RuleResponse, ThresholdSet
from app.services.rules_engine import RulesEngine

router = APIRouter()


def get_rules_engine(request: Request) -> RulesEngine:
    engine: RulesEngine = request.app.state.rules_engine
    return engine


RulesEngineDep = Annotated[RulesEngine, Depends(get_rules_engine)]


@router.get(
    "/rules",
    response_model=list[RuleResponse],
    summary="Return all joint safety constraints",
)
def list_rules(engine: RulesEngineDep) -> list[RuleResponse]:
    return [_to_rule_response(c) for c in engine.get_all_constraints()]


@router.get(
    "/rules/{movement}",
    response_model=MovementRulesResponse,
    summary="Return rules applicable to a specific movement",
)
def get_movement_rules(movement: str, engine: RulesEngineDep) -> MovementRulesResponse:
    sagittal = engine.get_constraints_for_movement(movement, plane="sagittal")
    frontal = engine.get_constraints_for_movement(movement, plane="frontal")
    standards = engine.get_execution_standards(movement)

    if not sagittal and not frontal and standards is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No rules found for movement '{movement}'.",
        )

    return MovementRulesResponse(
        movement=movement,
        sagittal_rules=[_to_rule_response(c) for c in sagittal],
        frontal_rules=[_to_rule_response(c) for c in frontal],
        execution_standards=standards,
    )


def _to_rule_response(constraint: dict[str, Any]) -> RuleResponse:
    return RuleResponse(
        id=constraint["id"],
        joint=constraint.get("joint"),
        constraint=constraint.get("constraint"),
        plane=constraint.get("plane", "sagittal"),
        description=constraint.get("description", ""),
        thresholds=ThresholdSet(**{
            k: v for k, v in constraint.get("thresholds", {}).items()
            if k in ("optimal", "warning", "high_risk", "critical")
        }),
        applies_to_movements=constraint.get("applies_to_movements", []),
        detection_priority=constraint.get("detection_priority", 4),
        evidence=constraint.get("evidence"),
    )
