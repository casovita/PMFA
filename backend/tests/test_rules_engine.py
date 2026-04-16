"""Unit tests for RulesEngine — no HTTP layer, pure service logic."""

import json
import tempfile
from pathlib import Path

import pytest

from app.services.rules_engine import RulesEngine, RulesEngineError


def make_engine(extra_constraints: list | None = None) -> RulesEngine:
    """Create a RulesEngine from a minimal in-memory rules JSON."""
    default_constraints = [
        {
            "id": "JSC-KNEE-001",
            "joint": "knee",
            "constraint": "dynamic_valgus",
            "plane": "frontal",
            "description": "Medial knee collapse.",
            "thresholds": {"optimal": {"min": 0, "max": 5}, "warning": {"min": 5, "max": 10}},
            "applies_to_movements": ["squat", "lunge"],
            "detection_priority": 1,
            "evidence": "Hewett et al. 2005",
        },
        {
            "id": "JSC-LUMBAR-001",
            "joint": "lumbar",
            "constraint": "flexion_proxy",
            "plane": "sagittal",
            "description": "Lumbar flexion under load.",
            "thresholds": {"warning": {"min": 35, "max": 45}, "critical": {"min": 55, "max": None}},
            "applies_to_movements": ["squat", "deadlift"],
            "detection_priority": 2,
            "evidence": "McGill 2002",
        },
    ]
    constraints = default_constraints if extra_constraints is None else extra_constraints
    data = {
        "metadata": {"version": "1.0.0"},
        "joint_safety_constraints": constraints,
        "execution_standards": {
            "powerlifting_ipf": {
                "squat": {"depth": "hip crease below knee"},
            }
        },
        "fatigue_detection": {"rep_drift_threshold_deg": 3},
        "scoring": {"critical_deduction": 25},
    }
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(data, f)
        path = Path(f.name)
    return RulesEngine(path)


# ── Init / error handling ─────────────────────────────────────────────────────

class TestRulesEngineInit:
    def test_loads_valid_json(self) -> None:
        engine = make_engine()
        assert engine.schema_version == "1.0.0"

    def test_raises_on_missing_file(self) -> None:
        with pytest.raises(RulesEngineError, match="not found"):
            RulesEngine(Path("/nonexistent/rules.json"))

    def test_raises_on_malformed_json(self) -> None:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            f.write("{ invalid json }")
            path = Path(f.name)
        with pytest.raises(RulesEngineError, match="malformed"):
            RulesEngine(path)


# ── get_all_constraints ───────────────────────────────────────────────────────

class TestGetAllConstraints:
    def test_returns_all_constraints(self) -> None:
        engine = make_engine()
        constraints = engine.get_all_constraints()
        assert len(constraints) == 2
        ids = {c["id"] for c in constraints}
        assert ids == {"JSC-KNEE-001", "JSC-LUMBAR-001"}

    def test_returns_empty_list_when_no_constraints(self) -> None:
        engine = make_engine(extra_constraints=[])
        assert engine.get_all_constraints() == []


# ── get_constraints_for_movement ──────────────────────────────────────────────

class TestGetConstraintsForMovement:
    def test_filters_by_movement(self) -> None:
        engine = make_engine()
        results = engine.get_constraints_for_movement("squat")
        assert len(results) == 2  # both apply to squat

    def test_filters_by_movement_and_plane_sagittal(self) -> None:
        engine = make_engine()
        results = engine.get_constraints_for_movement("squat", plane="sagittal")
        assert len(results) == 1
        assert results[0]["id"] == "JSC-LUMBAR-001"

    def test_filters_by_movement_and_plane_frontal(self) -> None:
        engine = make_engine()
        results = engine.get_constraints_for_movement("squat", plane="frontal")
        assert len(results) == 1
        assert results[0]["id"] == "JSC-KNEE-001"

    def test_returns_empty_for_unknown_movement(self) -> None:
        engine = make_engine()
        assert engine.get_constraints_for_movement("bench_press") == []

    def test_deadlift_gets_lumbar_only(self) -> None:
        engine = make_engine()
        results = engine.get_constraints_for_movement("deadlift")
        assert len(results) == 1
        assert results[0]["id"] == "JSC-LUMBAR-001"


# ── get_execution_standards ───────────────────────────────────────────────────

class TestGetExecutionStandards:
    def test_returns_ipf_standards_for_squat(self) -> None:
        engine = make_engine()
        standards = engine.get_execution_standards("squat")
        assert standards is not None
        assert "depth" in standards

    def test_returns_none_for_unknown_movement(self) -> None:
        engine = make_engine()
        assert engine.get_execution_standards("clean") is None


# ── Integration: load real rules.json ────────────────────────────────────────

class TestRealRulesJson:
    """Smoke-test against the actual KNOWLEDGE/movement_analysis_rules.json."""

    def test_loads_without_error(self, rules_engine: RulesEngine) -> None:
        assert rules_engine.schema_version != "unknown"

    def test_has_constraints(self, rules_engine: RulesEngine) -> None:
        assert len(rules_engine.get_all_constraints()) > 0

    def test_squat_has_sagittal_rules(self, rules_engine: RulesEngine) -> None:
        results = rules_engine.get_constraints_for_movement("squat", plane="sagittal")
        assert len(results) > 0

    def test_all_constraints_have_required_fields(self, rules_engine: RulesEngine) -> None:
        for c in rules_engine.get_all_constraints():
            assert "id" in c, f"Missing 'id' in constraint: {c}"
            assert "applies_to_movements" in c
            assert isinstance(c["applies_to_movements"], list)
