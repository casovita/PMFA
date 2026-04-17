"""FusionScorer — blends rule-based deductions with XGBoost predictions.

Weighting follows the development plan:
  60% rules-based + 40% ML initially.
  Shifts toward ML as labeled data grows (adjust ML_WEIGHT in config or here).

When no ML model is loaded (first run, no model file) the scorer is identical
to the pure rule engine: rules_weight=1.0, ml_weight=0.0.

Used as the single scoring entry point in analyzer.py, replacing the previous
direct call to RulesEngine.score_rep().
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.services.biomechanics import CompletedRep

from app.services.feature_engineering import extract_features
from app.services.ml_scorer import MLScorer, ShapFeature
from app.services.rules_engine import RulesEngine

logger = logging.getLogger(__name__)

# Initial blend weights (plan: 60/40, shifts toward ML as data grows)
_RULES_WEIGHT = 0.6
_ML_WEIGHT    = 0.4

_QUALITY_LABELS: list[tuple[float, str]] = [
    (90.0, "excellent"),
    (75.0, "good"),
    (55.0, "fair"),
    (0.0,  "poor"),
]


def _quality_label(score: float) -> str:
    return next(lbl for threshold, lbl in _QUALITY_LABELS if score >= threshold)


@dataclass
class ScoredRep:
    """Scoring output for a single rep."""

    score:         float          # final blended score [0, 100]
    quality_label: str            # excellent | good | fair | poor
    rules_score:   float          # pure deduction-based score
    ml_score:      float | None   # XGBoost prediction (None if no model)
    shap_top:      list[dict[str, Any]] = field(default_factory=list)
    """Top SHAP features as serialisable dicts (for API / LLM context)."""


class FusionScorer:
    """Combines RulesEngine deductions with an XGBoost calibration layer.

    If the ML model is not loaded, FusionScorer behaves identically to the
    pure rule engine (zero additional latency).

    evaluate_frame() delegates to the wrapped RulesEngine so callers only
    need a single scorer reference.
    """

    def __init__(self, rules_engine: RulesEngine, ml_scorer: MLScorer) -> None:
        self._rules = rules_engine
        self._ml = ml_scorer
        if ml_scorer.is_loaded:
            logger.info("FusionScorer ready — rules %.0f%% + ML %.0f%%",
                        _RULES_WEIGHT * 100, _ML_WEIGHT * 100)
        else:
            logger.info("FusionScorer ready — rules-only (no ML model loaded)")

    # ── Delegation to RulesEngine ─────────────────────────────────────────────

    def evaluate_frame(
        self,
        movement: str,
        angles: dict[str, float],
        phase: str | None = None,
    ) -> list[Any]:  # list[ViolationFlag]
        """Evaluate per-frame angles against sagittal-plane constraints."""
        return self._rules.evaluate_frame(movement, angles, phase)

    # ── Per-rep scoring ───────────────────────────────────────────────────────

    def score_rep(self, rep: "CompletedRep") -> ScoredRep:
        """Score a completed rep using the fusion model.

        Pipeline:
          1. Rule engine → deduction-based score (always runs)
          2. Feature extraction from rep + rules_score
          3. XGBoost prediction (if model loaded)
          4. Blend: final = rules_weight * rules_score + ml_weight * ml_score
          5. SHAP top-3 features (for LLM feedback context)
        """
        rules_score, _ = self._rules.score_rep(rep.violations)

        if not self._ml.is_loaded:
            return ScoredRep(
                score=rules_score,
                quality_label=_quality_label(rules_score),
                rules_score=rules_score,
                ml_score=None,
                shap_top=[],
            )

        features = extract_features(rep, rules_score)

        try:
            ml_raw = self._ml.predict(features)
        except Exception:
            logger.exception("ML prediction failed for rep %d — falling back to rules", rep.rep_number)
            return ScoredRep(
                score=rules_score,
                quality_label=_quality_label(rules_score),
                rules_score=rules_score,
                ml_score=None,
                shap_top=[],
            )

        final = round(
            max(0.0, min(100.0, _RULES_WEIGHT * rules_score + _ML_WEIGHT * ml_raw)),
            1,
        )

        shap_raw: list[ShapFeature] = self._ml.shap_top(features, n=3)
        shap_dicts = [
            {"feature": s.feature, "value": round(s.value, 2), "shap_value": round(s.shap_value, 2)}
            for s in shap_raw
        ]

        return ScoredRep(
            score=final,
            quality_label=_quality_label(final),
            rules_score=rules_score,
            ml_score=round(ml_raw, 1),
            shap_top=shap_dicts,
        )
