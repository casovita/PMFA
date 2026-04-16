"""RulesEngine — loads and queries movement_analysis_rules.json.

Phase 2 stub: provides rule lookup and filtering by movement/plane.
Full threshold evaluation and violation accumulation will be added
when the YOLOv8 inference pipeline is implemented.
"""

import json
from pathlib import Path
from typing import Any


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
        return cf_movements.get(movement)  # type: ignore[no-any-return]

    def get_fatigue_rules(self) -> dict[str, Any]:
        return self._fatigue_rules

    def get_scoring_config(self) -> dict[str, Any]:
        return self._scoring

    @property
    def schema_version(self) -> str:
        return self._data.get("metadata", {}).get("version", "unknown")  # type: ignore[no-any-return]
