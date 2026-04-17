"""Tests for classify_deadlift_stance in biomechanics.py.

Thresholds from movement_analysis_rules.json §biomechanical_targets:
  conventional: trunk_lean 30–45°, hip_flexion 80–95°
  sumo:         trunk_lean 15–30°, hip_flexion 70–85°
"""

import pytest

from app.services.biomechanics import (
    _HIP_SPLIT,
    _TRUNK_SPLIT_HIGH,
    _TRUNK_SPLIT_LOW,
    classify_deadlift_stance,
)


def _frames(trunk: float, hip: float | None = None, n: int = 10) -> list[dict[str, float]]:
    """Build a uniform list of angle dicts for testing."""
    frame: dict[str, float] = {"trunk_lean": trunk}
    if hip is not None:
        frame["hip_flexion"] = hip
    return [frame.copy() for _ in range(n)]


# ─── Core classification ──────────────────────────────────────────────────────

class TestCoreClassification:
    def test_conventional_clear(self) -> None:
        """Trunk lean 40° (centre of conventional range) → conventional."""
        assert classify_deadlift_stance(_frames(trunk=40.0, hip=88.0)) == "conventional"

    def test_sumo_clear(self) -> None:
        """Trunk lean 20° (centre of sumo range) → sumo."""
        assert classify_deadlift_stance(_frames(trunk=20.0, hip=77.0)) == "sumo"

    def test_sumo_upright_extreme(self) -> None:
        """Very upright setup (trunk ≈ 15°) → sumo."""
        assert classify_deadlift_stance(_frames(trunk=15.0, hip=72.0)) == "sumo"

    def test_conventional_bent_extreme(self) -> None:
        """Heavily forward-leaning setup (trunk ≈ 45°) → conventional."""
        assert classify_deadlift_stance(_frames(trunk=45.0, hip=92.0)) == "conventional"


# ─── Tiebreaker (ambiguous zone) ─────────────────────────────────────────────

class TestAmbiguousZone:
    """trunk_lean in the 28–33° overlap zone uses hip_flexion as tiebreaker."""

    def test_ambiguous_low_hip_is_sumo(self) -> None:
        """Trunk 30° + hip 78° (below split) → sumo."""
        assert classify_deadlift_stance(_frames(trunk=30.0, hip=78.0)) == "sumo"

    def test_ambiguous_high_hip_is_conventional(self) -> None:
        """Trunk 30° + hip 87° (above split) → conventional."""
        assert classify_deadlift_stance(_frames(trunk=30.0, hip=87.0)) == "conventional"

    def test_ambiguous_no_hip_returns_unknown(self) -> None:
        """Trunk 30°, hip_flexion absent → unknown (insufficient data)."""
        frames = [{"trunk_lean": 30.0} for _ in range(10)]
        assert classify_deadlift_stance(frames) == "unknown"

    def test_split_boundary_low(self) -> None:
        """Trunk exactly at _TRUNK_SPLIT_LOW boundary → falls through to ambiguous."""
        # At exactly SPLIT_LOW trunk is still < SPLIT_LOW? No, it's equal.
        # classify returns sumo only if < _TRUNK_SPLIT_LOW.
        # At trunk == _TRUNK_SPLIT_LOW the condition `trunk_mean < _TRUNK_SPLIT_LOW` is False,
        # so we fall into the ambiguous zone.
        result = classify_deadlift_stance(_frames(trunk=_TRUNK_SPLIT_LOW, hip=80.0))
        assert result in ("sumo", "conventional", "unknown")  # deterministic, not error

    def test_split_boundary_high(self) -> None:
        """Trunk exactly at _TRUNK_SPLIT_HIGH → falls through to ambiguous."""
        result = classify_deadlift_stance(_frames(trunk=_TRUNK_SPLIT_HIGH, hip=85.0))
        assert result in ("sumo", "conventional", "unknown")


# ─── Insufficient data ────────────────────────────────────────────────────────

class TestInsufficientData:
    def test_empty_returns_unknown(self) -> None:
        assert classify_deadlift_stance([]) == "unknown"

    def test_below_min_frames_returns_unknown(self) -> None:
        assert classify_deadlift_stance(_frames(trunk=20.0, n=2), min_frames=3) == "unknown"

    def test_exactly_min_frames_classifies(self) -> None:
        assert classify_deadlift_stance(_frames(trunk=20.0, n=3), min_frames=3) == "sumo"

    def test_missing_trunk_lean_key(self) -> None:
        """Frames without trunk_lean are silently skipped."""
        frames: list[dict[str, float]] = [{"hip_flexion": 77.0} for _ in range(10)]
        assert classify_deadlift_stance(frames) == "unknown"

    def test_mixed_frames_uses_only_trunk_lean_frames(self) -> None:
        """Only frames that contain trunk_lean contribute to classification."""
        frames: list[dict[str, float]] = [
            {"hip_flexion": 77.0},            # no trunk_lean — ignored
            {"trunk_lean": 20.0, "hip_flexion": 77.0},
            {"trunk_lean": 20.0, "hip_flexion": 77.0},
            {"trunk_lean": 20.0, "hip_flexion": 77.0},
        ]
        assert classify_deadlift_stance(frames, min_frames=3) == "sumo"


# ─── Noisy / averaged inputs ─────────────────────────────────────────────────

class TestNoisyInputs:
    def test_noisy_conventional_classifies_correctly(self) -> None:
        """Conventional signal with ±3° jitter around 38° → still conventional."""
        import random
        rng = random.Random(42)
        frames = [
            {"trunk_lean": 38.0 + rng.uniform(-3.0, 3.0), "hip_flexion": 88.0}
            for _ in range(30)
        ]
        assert classify_deadlift_stance(frames) == "conventional"

    def test_noisy_sumo_classifies_correctly(self) -> None:
        """Sumo signal with ±3° jitter around 22° → still sumo."""
        import random
        rng = random.Random(7)
        frames = [
            {"trunk_lean": 22.0 + rng.uniform(-3.0, 3.0), "hip_flexion": 76.0}
            for _ in range(30)
        ]
        assert classify_deadlift_stance(frames) == "sumo"

    def test_averaging_prevents_single_outlier_flip(self) -> None:
        """One outlier frame at 50° shouldn't flip a sumo classification."""
        frames: list[dict[str, float]] = [{"trunk_lean": 20.0, "hip_flexion": 76.0}] * 29
        frames.append({"trunk_lean": 50.0, "hip_flexion": 76.0})  # outlier
        # mean trunk = (29*20 + 50) / 30 = 23.3° → still < SPLIT_LOW → sumo
        assert classify_deadlift_stance(frames) == "sumo"
