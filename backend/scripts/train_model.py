"""Bootstrap training script — generates synthetic rep data and trains XGBoost scorer.

Usage (from backend/):
    uv run python scripts/train_model.py [--out models/xgb_scorer.json] [--samples 2000]

Purpose
-------
Until Phase 3 provides 500+ labeled reps per lift we generate synthetic data whose
distribution mimics known biomechanical norms. The resulting model acts as a prior
that will be incrementally replaced by real data as it accumulates.

Data generation
---------------
- Randomly sample rep metrics within realistic ranges per lift
- Label ground-truth score via the same rule-deduction formula (rules_score)
  plus a small Gaussian noise term representing inter-rater variance (~3 pts σ)
- Three movements: squat, deadlift, bench_press
- Samples per movement: --samples (default 2000)

Training
--------
XGBRegressor, objective="reg:squarederror", 300 trees, max_depth=4, lr=0.05.
Model saved as JSON (portable, cross-platform, version-controlled).
"""

from __future__ import annotations

import argparse
import logging
import random
import sys
from pathlib import Path

import numpy as np

# Ensure backend package is importable when run from scripts/
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.feature_engineering import FEATURE_NAMES, features_to_row  # noqa: E402
from app.services.ml_scorer import MLScorer  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ── Realistic per-movement ranges ────────────────────────────────────────────

_MOVEMENT_RANGES: dict[str, dict[str, tuple[float, float]]] = {
    "squat": {
        "primary_angle_peak":   (70.0,  130.0),
        "primary_angle_mean":   (40.0,  100.0),
        "primary_angle_sd":     (5.0,   25.0),
        "max_trunk_lean":       (5.0,   50.0),
        "trunk_lean_mean":      (3.0,   35.0),
        "trunk_lean_sd":        (1.0,   10.0),
        "time_under_tension":   (2.0,   6.0),
        "rep_number":           (1.0,   8.0),
    },
    "deadlift": {
        "primary_angle_peak":   (60.0,  110.0),
        "primary_angle_mean":   (30.0,  80.0),
        "primary_angle_sd":     (5.0,   20.0),
        "max_trunk_lean":       (10.0,  70.0),
        "trunk_lean_mean":      (8.0,   50.0),
        "trunk_lean_sd":        (2.0,   15.0),
        "time_under_tension":   (2.5,   7.0),
        "rep_number":           (1.0,   5.0),
    },
    "bench_press": {
        "primary_angle_peak":   (80.0,  120.0),
        "primary_angle_mean":   (50.0,  90.0),
        "primary_angle_sd":     (3.0,   15.0),
        "max_trunk_lean":       (0.0,   20.0),
        "trunk_lean_mean":      (0.0,   15.0),
        "trunk_lean_sd":        (0.0,   5.0),
        "time_under_tension":   (1.5,   4.0),
        "rep_number":           (1.0,   10.0),
    },
}

# Deduction weights matching rules_engine.py
_DEDUCTIONS: dict[str, float] = {
    "critical":  27.0,
    "high_risk": 17.0,
    "warning":   7.0,
}


def _simulate_violations(
    trunk_lean: float,
    primary_angle_peak: float,
    movement: str,
    rng: random.Random,
) -> dict[str, int]:
    """Heuristically derive violation counts from the biomechanical values."""
    counts = {"warning": 0, "high_risk": 0, "critical": 0}

    # Trunk lean thresholds vary by movement
    lean_thresholds = {
        "squat":       {"warning": 20.0, "high_risk": 35.0, "critical": 50.0},
        "deadlift":    {"warning": 30.0, "high_risk": 50.0, "critical": 65.0},
        "bench_press": {"warning": 10.0, "high_risk": 18.0, "critical": 25.0},
    }
    thresholds = lean_thresholds.get(movement, lean_thresholds["squat"])

    if trunk_lean >= thresholds["critical"]:
        counts["critical"] += 1
    elif trunk_lean >= thresholds["high_risk"]:
        counts["high_risk"] += 1
    elif trunk_lean >= thresholds["warning"]:
        counts["warning"] += 1

    # Depth (primary angle): insufficient depth is a warning/high_risk
    if movement == "squat":
        if primary_angle_peak < 85.0:
            counts["high_risk"] += 1
        elif primary_angle_peak < 100.0:
            counts["warning"] += 1

    # Add occasional random minor violations (realistic noise)
    if rng.random() < 0.15:
        counts["warning"] += 1

    return counts


def _compute_rules_score(violations: dict[str, int]) -> float:
    deduction = (
        violations["warning"]   * _DEDUCTIONS["warning"]
        + violations["high_risk"] * _DEDUCTIONS["high_risk"]
        + violations["critical"]  * _DEDUCTIONS["critical"]
    )
    return max(0.0, 100.0 - deduction)


def generate_dataset(n_per_movement: int, seed: int = 42) -> tuple[list[dict[str, float]], list[float]]:
    rng = random.Random(seed)
    np_rng = np.random.default_rng(seed)

    X: list[dict[str, float]] = []
    y: list[float] = []

    for movement, ranges in _MOVEMENT_RANGES.items():
        for _ in range(n_per_movement):
            sample: dict[str, float] = {}
            for feat, (lo, hi) in ranges.items():
                sample[feat] = rng.uniform(lo, hi)

            violations = _simulate_violations(
                trunk_lean=sample["max_trunk_lean"],
                primary_angle_peak=sample["primary_angle_peak"],
                movement=movement,
                rng=rng,
            )
            sample["violation_count_warning"]   = float(violations["warning"])
            sample["violation_count_high_risk"] = float(violations["high_risk"])
            sample["violation_count_critical"]  = float(violations["critical"])
            sample["has_lumbar_violation"]      = 1.0 if violations["critical"] > 0 else 0.0
            sample["has_hip_violation"]         = 1.0 if sample["primary_angle_peak"] < 85.0 else 0.0
            sample["has_ankle_violation"]       = float(rng.random() < 0.1)

            rules_score = _compute_rules_score(violations)
            sample["rules_score"] = rules_score

            # Ground truth: rules_score + small inter-rater noise
            noise = float(np_rng.normal(0.0, 3.0))
            label = float(np.clip(rules_score + noise, 0.0, 100.0))

            X.append(sample)
            y.append(label)

    return X, y


def main() -> None:
    parser = argparse.ArgumentParser(description="Train XGBoost fusion scorer")
    parser.add_argument("--out", default="models/xgb_scorer.json", help="Output model path")
    parser.add_argument("--samples", type=int, default=2000, help="Samples per movement")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    logger.info("Generating %d synthetic reps × 3 movements …", args.samples)
    X, y = generate_dataset(n_per_movement=args.samples, seed=args.seed)

    logger.info("Training XGBoost on %d samples …", len(X))
    X_arr = np.array([[row[f] for f in sorted(row)] for row in X], dtype=np.float32)
    y_arr = np.array(y, dtype=np.float32)
    scorer = MLScorer.train(
        X=X_arr,
        y=y_arr,
        save_path=out_path,
        n_estimators=300,
        max_depth=4,
        learning_rate=0.05,
        random_state=args.seed,
    )

    # Quick sanity check
    sample_pred = scorer.predict(X[0])
    logger.info("Sanity check — sample[0] y=%.1f pred=%.1f", y[0], sample_pred)
    logger.info("Model saved → %s", out_path)


if __name__ == "__main__":
    main()
