"""XGBoost scoring model wrapper with SHAP explainability.

The model file is optional — when absent (or not yet trained) MLScorer.is_loaded
returns False and FusionScorer falls back to 100% rule-based scoring.

Model files are saved to settings.model_dir as
  xgb_<movement>.json   (e.g. xgb_squat.json)

Loading is lazy: the first call to predict() or shap_top() triggers the load.
The singleton pattern is handled by the lifespan, which creates one MLScorer
per movement and stores them on app.state.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from app.services.feature_engineering import FEATURE_NAMES, features_to_row

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ShapFeature:
    """A single SHAP contribution entry."""

    feature: str         # human-readable name from FEATURE_NAMES
    value: float         # the actual feature value for this prediction
    shap_value: float    # SHAP contribution (positive = pushes score up)


class MLScorer:
    """Per-movement XGBoost regressor with SHAP explanations.

    Predicts a 0–100 form score given a feature vector extracted by
    feature_engineering.extract_features().

    Usage:
        scorer = MLScorer.from_file(model_dir / "xgb_squat.json")
        if scorer.is_loaded:
            score = scorer.predict(features)
            top3  = scorer.shap_top(features, n=3)
    """

    def __init__(self, model: Any | None = None, explainer: Any | None = None) -> None:
        self._model = model
        self._explainer = explainer

    # ── Factory ──────────────────────────────────────────────────────────────

    @classmethod
    def from_file(cls, path: Path) -> "MLScorer":
        """Load a saved model from *path*.  Returns an empty scorer on failure."""
        if not path.exists():
            logger.info("No ML model at %s — running rules-only scoring.", path)
            return cls()
        try:
            import xgboost as xgb

            model = xgb.XGBRegressor()
            model.load_model(str(path))
            explainer = _build_explainer(model)
            logger.info("Loaded ML scorer from %s", path)
            return cls(model=model, explainer=explainer)
        except Exception:
            logger.exception("Failed to load ML model from %s", path)
            return cls()

    # ── Public API ────────────────────────────────────────────────────────────

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def predict(self, features: dict[str, float]) -> float:
        """Return a predicted score in [0, 100]."""
        if self._model is None:
            raise RuntimeError("No model loaded.")
        row = np.array([features_to_row(features)], dtype=np.float32)
        raw: float = float(self._model.predict(row)[0])
        return max(0.0, min(100.0, raw))

    def shap_top(self, features: dict[str, float], n: int = 3) -> list[ShapFeature]:
        """Return the top-n SHAP contributors for a prediction."""
        if not self.is_loaded or self._explainer is None:
            return []
        try:
            row = np.array([features_to_row(features)], dtype=np.float32)
            shap_vals = self._explainer(row).values[0]  # shape: (n_features,)
            # Sort by absolute contribution, descending
            ranked = sorted(
                enumerate(shap_vals), key=lambda x: abs(x[1]), reverse=True
            )
            result: list[ShapFeature] = []
            for idx, sv in ranked[:n]:
                name = FEATURE_NAMES[idx] if idx < len(FEATURE_NAMES) else f"f{idx}"
                result.append(ShapFeature(
                    feature=name,
                    value=float(features.get(name, 0.0)),
                    shap_value=float(sv),
                ))
            return result
        except Exception:
            logger.exception("SHAP computation failed")
            return []

    # ── Training ──────────────────────────────────────────────────────────────

    @classmethod
    def train(
        cls,
        X: "np.ndarray[Any, Any]",
        y: "np.ndarray[Any, Any]",
        save_path: Path | None = None,
        n_estimators: int = 200,
        max_depth: int = 5,
        learning_rate: float = 0.05,
        subsample: float = 0.8,
        colsample_bytree: float = 0.8,
        random_state: int = 42,
    ) -> "MLScorer":
        """Train a new XGBoost model on feature matrix X and labels y.

        Optionally saves to save_path.  Returns the trained MLScorer.
        """
        import xgboost as xgb

        model = xgb.XGBRegressor(
            n_estimators=n_estimators,
            max_depth=max_depth,
            learning_rate=learning_rate,
            subsample=subsample,
            colsample_bytree=colsample_bytree,
            random_state=random_state,
            objective="reg:squarederror",
            eval_metric="rmse",
            verbosity=0,
        )
        model.fit(X, y)

        if save_path is not None:
            save_path.parent.mkdir(parents=True, exist_ok=True)
            model.save_model(str(save_path))
            logger.info("Model saved to %s", save_path)

        explainer = _build_explainer(model)
        return cls(model=model, explainer=explainer)


# ── Module helpers ────────────────────────────────────────────────────────────

def _build_explainer(model: Any) -> Any | None:
    """Build a SHAP TreeExplainer; returns None if shap unavailable."""
    try:
        import shap

        return shap.TreeExplainer(model)
    except Exception:
        logger.warning("SHAP TreeExplainer unavailable — SHAP features disabled.")
        return None
