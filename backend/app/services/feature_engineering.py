"""Feature extraction for the XGBoost scoring layer.

Converts a CompletedRep (biomechanics domain) + its rule-based score into a
flat numeric feature vector consumed by MLScorer.

Feature design follows the development plan:
  - Per-frame angle statistics (mean, SD, peak) → depth consistency
  - Rules engine outputs (violation counts by severity, per-rule flags)
  - Temporal features (TUT, rep number as fatigue proxy)
  - Rule-based score as a feature (XGBoost calibrates on top)

The feature order is fixed by FEATURE_NAMES.  New features must be appended
to preserve compatibility with saved models.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.biomechanics import CompletedRep

# Ordered feature list — positions are stable for model serialisation
FEATURE_NAMES: list[str] = [
    # Biomechanics — primary angle
    "primary_angle_peak",
    "primary_angle_mean",
    "primary_angle_sd",
    # Biomechanics — trunk
    "max_trunk_lean",
    "trunk_lean_mean",
    "trunk_lean_sd",
    # Temporal
    "time_under_tension",
    "rep_number",
    # Violation counts by severity
    "violation_count_warning",
    "violation_count_high_risk",
    "violation_count_critical",
    # Rule-specific flags (binary)
    "has_lumbar_violation",    # JSC-LUMBAR-001
    "has_hip_violation",       # JSC-HIP-001
    "has_ankle_violation",     # JSC-ANKLE-001
    # Rules-engine deduction score (XGBoost calibrates on top)
    "rules_score",
]


def extract_features(rep: "CompletedRep", rules_score: float) -> dict[str, float]:
    """Return a feature dict keyed by FEATURE_NAMES for a completed rep.

    All values are floats.  Boolean flags are encoded as 0.0 / 1.0.
    ``rules_score`` is the deduction-based score from RulesEngine.score_rep().
    """
    from collections import Counter

    sev_counts: Counter[str] = Counter(v.severity for v in rep.violations)
    rule_ids = {v.rule_id for v in rep.violations}

    return {
        "primary_angle_peak":   rep.primary_angle_peak,
        "primary_angle_mean":   rep.primary_angle_mean,
        "primary_angle_sd":     rep.primary_angle_sd,
        "max_trunk_lean":       rep.max_trunk_lean,
        "trunk_lean_mean":      rep.trunk_lean_mean,
        "trunk_lean_sd":        rep.trunk_lean_sd,
        "time_under_tension":   rep.time_under_tension_sec,
        "rep_number":           float(rep.rep_number),
        "violation_count_warning":   float(sev_counts.get("warning", 0)),
        "violation_count_high_risk": float(sev_counts.get("high_risk", 0)),
        "violation_count_critical":  float(sev_counts.get("critical", 0)),
        "has_lumbar_violation": 1.0 if "JSC-LUMBAR-001" in rule_ids else 0.0,
        "has_hip_violation":    1.0 if "JSC-HIP-001"    in rule_ids else 0.0,
        "has_ankle_violation":  1.0 if "JSC-ANKLE-001"  in rule_ids else 0.0,
        "rules_score":          rules_score,
    }


def features_to_row(features: dict[str, float]) -> list[float]:
    """Convert feature dict to a list in FEATURE_NAMES order."""
    return [features.get(name, 0.0) for name in FEATURE_NAMES]
