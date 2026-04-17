"""RulesEngine — loads and queries movement_analysis_rules.json.

Provides:
  - Rule lookup / filtering by movement and camera plane
  - Per-frame threshold evaluation → ViolationFlag list
  - Per-rep deduction-based scoring

Sagittal-plane rules evaluated in Phase 2
(frontal-plane rules such as JSC-KNEE-001 are skipped until Phase 5):

  JSC-LUMBAR-001  trunk_lean        all lifts
  JSC-HIP-001     hip_flexion       squat, deadlift
  JSC-ANKLE-001   dorsiflexion      squat
  JSC-ELBOW-001   elbow_flexion     bench press  (lockout hyperextension check omitted)
"""

import json
from pathlib import Path
from typing import Any

from app.schemas.analysis import ViolationFlag

# Maps constraint identifier → angle key in the angles dict produced by
# biomechanics.extract_angles().  Constraints not in this map are skipped.
_CONSTRAINT_ANGLE_MAP: dict[str, str] = {
    "flexion_from_neutral":              "trunk_lean",     # JSC-LUMBAR-001
    "flexion_with_pelvic_compensation":  "hip_flexion",    # JSC-HIP-001
    "dorsiflexion_restriction":          "dorsiflexion",   # JSC-ANKLE-001
    # JSC-ELBOW-001 hyperextension at lockout requires negative angle detection;
    # skipped until Phase 3 when we track lockout phase explicitly.
}

# Severity weights for the deduction-based scoring table (from development plan)
_DEDUCTIONS: dict[str, float] = {
    "critical":  27.0,
    "high_risk": 17.0,
    "warning":    7.0,
}

_QUALITY_LABELS: list[tuple[float, str]] = [
    (90.0, "excellent"),
    (75.0, "good"),
    (55.0, "fair"),
    (0.0,  "poor"),
]


class RulesEngineError(Exception):
    """Raised when the rules JSON cannot be loaded or is structurally invalid."""


class RulesEngine:
    """Singleton loaded at startup via FastAPI lifespan.

    Stores the parsed rules JSON and exposes query methods.
    Injected into routes via app.state.rules_engine.
    """

    def __init__(self, rules_path: Path) -> None:
        if not rules_path.exists():
            raise RulesEngineError(
                f"Rules JSON not found at {rules_path}. "
                "Ensure PMFA_RULES_JSON_PATH points to KNOWLEDGE/movement_analysis_rules.json."
            )
        try:
            with rules_path.open() as f:
                self._data: dict[str, Any] = json.load(f)
        except json.JSONDecodeError as exc:
            raise RulesEngineError(f"Rules JSON is malformed: {exc}") from exc

        self._constraints: list[dict[str, Any]] = self._data.get("joint_safety_constraints", [])
        self._execution_standards: dict[str, Any] = self._data.get("execution_standards", {})
        self._fatigue_rules: dict[str, Any] = self._data.get("fatigue_detection", {})
        self._scoring: dict[str, Any] = self._data.get("scoring", {})

    # ── Public query API ──────────────────────────────────────────────────────

    def get_all_constraints(self) -> list[dict[str, Any]]:
        return self._constraints

    def get_constraints_for_movement(
        self,
        movement: str,
        plane: str | None = None,
    ) -> list[dict[str, Any]]:
        """Return constraints that apply to a movement, optionally filtered by plane."""
        results = [
            c for c in self._constraints
            if movement in c.get("applies_to_movements", [])
        ]
        if plane is not None:
            results = [c for c in results if c.get("plane") == plane]
        return results

    def get_execution_standards(self, movement: str) -> dict[str, Any] | None:
        """Return execution standards for a movement (checks IPF movements, then CrossFit)."""
        ipf = self._execution_standards.get("powerlifting_ipf", {})
        ipf_movements: dict[str, Any] = ipf.get("movements", ipf)  # support both layouts
        if movement in ipf_movements:
            return ipf_movements[movement]  # type: ignore[no-any-return]
        crossfit = self._execution_standards.get("crossfit", {})
        cf_movements: dict[str, Any] = crossfit.get("movements", crossfit)
        return cf_movements.get(movement)

    def get_fatigue_rules(self) -> dict[str, Any]:
        return self._fatigue_rules

    def get_scoring_config(self) -> dict[str, Any]:
        return self._scoring

    # ── Evaluation API ────────────────────────────────────────────────────────

    def evaluate_frame(
        self,
        movement: str,
        angles: dict[str, float],
        phase: str | None = None,
    ) -> list[ViolationFlag]:
        """Check computed angles against sagittal-plane thresholds for *movement*.

        Returns one ViolationFlag per violated constraint (skips optimal range).
        Constraints without a mapped angle in *angles* are silently skipped.
        """
        violations: list[ViolationFlag] = []

        for constraint in self._constraints:
            # Skip if this constraint doesn't apply to the movement
            if movement not in constraint.get("applies_to_movements", []):
                continue

            # Skip frontal-plane rules (no 3D pose in Phase 2)
            plane = constraint.get("plane", "")
            if plane == "frontal":
                continue

            # Map constraint type → angle name
            angle_name = _CONSTRAINT_ANGLE_MAP.get(constraint.get("constraint", ""))
            if angle_name is None:
                continue

            # Skip if angle wasn't computed this frame (missing/low-conf keypoints)
            if angle_name not in angles:
                continue

            value = angles[angle_name]
            thresholds = constraint.get("thresholds", {})

            severity = _classify_severity(thresholds, value)
            if severity is None:
                continue  # in optimal range

            # threshold = the optimal-range boundary in the direction of violation
            threshold = _optimal_boundary(thresholds)

            violations.append(
                ViolationFlag(
                    rule_id=constraint["id"],
                    severity=severity,
                    metric=angle_name,
                    value=round(value, 1),
                    threshold=threshold,
                    phase=phase,
                )
            )

        return violations

    def score_rep(self, violations: list[ViolationFlag]) -> tuple[float, str]:
        """Compute a 0–100 deduction-based score and quality label.

        One deduction per rule (worst severity wins — caller should already
        have deduplicated per rule_id).  Deductions: critical=27, high_risk=17,
        warning=7.
        """
        total_deduction = sum(_DEDUCTIONS.get(v.severity, 0.0) for v in violations)
        score = round(max(0.0, min(100.0, 100.0 - total_deduction)), 1)
        label = next(lbl for threshold, lbl in _QUALITY_LABELS if score >= threshold)
        return score, label

    @property
    def schema_version(self) -> str:
        return self._data.get("metadata", {}).get("version", "unknown")  # type: ignore[no-any-return]


# ── Module-level helpers ──────────────────────────────────────────────────────

def _in_range(value: float, tier: dict[str, Any]) -> bool:
    """Return True if *value* falls within the (min, max) bounds of a threshold tier.

    None bounds are treated as unbounded in that direction.
    """
    min_v: float | None = tier.get("min")
    max_v: float | None = tier.get("max")
    return (min_v is None or value >= min_v) and (max_v is None or value <= max_v)


def _classify_severity(thresholds: dict[str, Any], value: float) -> str | None:
    """Return the severity tier for *value*, or None if in the optimal range.

    Checks tiers from most severe to least so the worst applicable tier wins
    when ranges overlap at boundaries.
    """
    for tier in ("critical", "high_risk", "warning"):
        tier_data = thresholds.get(tier)
        if tier_data and _in_range(value, tier_data):
            return tier
    return None  # optimal


def _optimal_boundary(thresholds: dict[str, Any]) -> float:
    """Return the threshold value representing the edge of the optimal range.

    For rules where smaller is safer (e.g. trunk_lean), returns optimal.max.
    For rules where larger is safer (e.g. dorsiflexion), returns optimal.min.
    Falls back to 0.0 if the optimal tier has no bounds.
    """
    opt = thresholds.get("optimal", {})
    if opt.get("max") is not None:
        return float(opt["max"])
    if opt.get("min") is not None:
        return float(opt["min"])
    return 0.0
