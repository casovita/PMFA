"""Tests for the One Euro Filter and AngleSmoother in biomechanics.py."""

import math

import pytest

from app.services.biomechanics import AngleSmoother, OneEuroFilter, _LowPassFilter, _alpha


# ─── _alpha ───────────────────────────────────────────────────────────────────

class TestAlpha:
    def test_range(self) -> None:
        """alpha must be strictly in (0, 1)."""
        a = _alpha(30.0, 1.5)
        assert 0.0 < a < 1.0

    def test_higher_freq_lowers_alpha(self) -> None:
        """Higher sampling rate → smaller alpha per sample.

        At 60 fps each sample contributes less than at 30 fps — the time
        constant in *seconds* stays the same but is spread over more samples.
        formula: alpha = 1 / (1 + tau/te), te=1/freq → smaller te → larger
        tau/te → smaller alpha.
        """
        a30 = _alpha(30.0, 1.5)
        a60 = _alpha(60.0, 1.5)
        assert a60 < a30

    def test_higher_cutoff_raises_alpha(self) -> None:
        """Higher cutoff → more signal let through → larger alpha."""
        a_lo = _alpha(30.0, 1.0)
        a_hi = _alpha(30.0, 5.0)
        assert a_hi > a_lo

    def test_known_value(self) -> None:
        """Cross-check against manual calculation at 30 Hz, 1 Hz cutoff."""
        freq, cutoff = 30.0, 1.0
        tau = 1.0 / (2.0 * math.pi * cutoff)
        te  = 1.0 / freq
        expected = 1.0 / (1.0 + tau / te)
        assert abs(_alpha(freq, cutoff) - expected) < 1e-12


# ─── _LowPassFilter ───────────────────────────────────────────────────────────

class TestLowPassFilter:
    def test_first_call_returns_input(self) -> None:
        f = _LowPassFilter(0.5)
        assert f(10.0) == 10.0

    def test_last_is_none_before_call(self) -> None:
        f = _LowPassFilter(0.5)
        assert f.last is None

    def test_converges_to_constant(self) -> None:
        """After many samples of the same value the output should equal input."""
        f = _LowPassFilter(0.5)
        for _ in range(100):
            out = f(42.0)
        assert abs(out - 42.0) < 1e-6

    def test_alpha_override(self) -> None:
        """Per-call alpha=1.0 means no smoothing (output == input)."""
        f = _LowPassFilter(0.1)
        f(0.0)             # prime with 0
        out = f(99.0, alpha=1.0)
        assert out == 99.0


# ─── OneEuroFilter ────────────────────────────────────────────────────────────

class TestOneEuroFilter:
    def test_first_call_returns_input(self) -> None:
        filt = OneEuroFilter(freq=30.0)
        assert filt(45.0) == 45.0

    def test_output_stays_close_to_constant_signal(self) -> None:
        """Constant input → output must not drift more than 1° from input."""
        filt = OneEuroFilter(freq=30.0)
        dt   = 1.0 / 30.0
        t    = 0.0
        out  = 0.0
        for _ in range(90):         # 3 seconds @ 30 fps
            out = filt(90.0, t)
            t  += dt
        assert abs(out - 90.0) < 1.0

    def test_attenuates_high_frequency_jitter(self) -> None:
        """Alternating ±10° noise at 15 Hz (every frame at 30 fps) should be
        significantly attenuated — variance after warm-up must be < 30% of raw.

        Note: a *single* spike IS intentionally passed through (it looks like a
        fast movement to the filter), which is correct One Euro behaviour.
        Only sustained high-frequency oscillation is suppressed.
        """
        filt = OneEuroFilter(freq=30.0, min_cutoff=1.5, beta=0.1)
        dt   = 1.0 / 30.0
        t    = 0.0
        raw_vals:  list[float] = []
        filt_vals: list[float] = []
        for i in range(120):
            raw  = 90.0 + (10.0 if i % 2 == 0 else -10.0)   # ±10° at 15 Hz
            raw_vals.append(raw)
            filt_vals.append(filt(raw, t))
            t += dt
        raw_var  = sum((v - 90.0) ** 2 for v in raw_vals)  / len(raw_vals)
        filt_var = sum((v - 90.0) ** 2 for v in filt_vals[30:]) / len(filt_vals[30:])
        assert filt_var < raw_var * 0.30, (
            f"HF jitter not attenuated: filt_var={filt_var:.1f} raw_var={raw_var:.1f}"
        )

    def test_timestamp_updates_freq(self) -> None:
        """Passing timestamps should adapt internal frequency to actual dt."""
        filt = OneEuroFilter(freq=30.0)
        filt(90.0, 0.0)
        filt(90.0, 1.0 / 60.0)    # simulate 60 fps
        # After timestamp-based update, freq should be ~60
        assert abs(filt._freq - 60.0) < 1.0

    def test_without_timestamps_still_works(self) -> None:
        """Filter must be usable without timestamps (uses nominal freq)."""
        filt = OneEuroFilter(freq=30.0)
        outputs = [filt(float(i % 20)) for i in range(60)]
        assert all(0.0 <= v <= 20.0 for v in outputs)

    def test_jitter_reduction(self) -> None:
        """Gaussian noise on constant signal: filtered variance < raw variance."""
        import random
        rng   = random.Random(0)
        filt  = OneEuroFilter(freq=30.0, min_cutoff=1.5, beta=0.1)
        dt    = 1.0 / 30.0
        t     = 0.0
        raw_vals: list[float] = []
        filt_vals: list[float] = []

        for _ in range(120):
            raw = 90.0 + rng.gauss(0.0, 2.0)
            raw_vals.append(raw)
            filt_vals.append(filt(raw, t))
            t += dt

        raw_var  = sum((v - 90.0) ** 2 for v in raw_vals)  / len(raw_vals)
        filt_var = sum((v - 90.0) ** 2 for v in filt_vals) / len(filt_vals)
        assert filt_var < raw_var * 0.5, (
            f"Filter variance {filt_var:.3f} not < 50% of raw {raw_var:.3f}"
        )


# ─── AngleSmoother ────────────────────────────────────────────────────────────

class TestAngleSmoother:
    def test_passthrough_keys(self) -> None:
        """All keys present in input must appear in output."""
        s = AngleSmoother()
        angles = {"knee_flexion": 85.0, "trunk_lean": 15.0, "hip_flexion": 60.0}
        out = s.smooth(0.0, angles)
        assert set(out.keys()) == set(angles.keys())

    def test_first_call_returns_input_rounded(self) -> None:
        s = AngleSmoother()
        out = s.smooth(0.0, {"knee_flexion": 87.654})
        assert out["knee_flexion"] == 87.7

    def test_lazy_filter_creation(self) -> None:
        """Filters are created on first encounter of each angle name."""
        s = AngleSmoother()
        assert len(s._filters) == 0
        s.smooth(0.0, {"knee_flexion": 90.0})
        assert "knee_flexion" in s._filters
        s.smooth(1.0 / 30.0, {"knee_flexion": 90.0, "trunk_lean": 10.0})
        assert "trunk_lean" in s._filters

    def test_suppresses_jitter_on_constant_signal(self) -> None:
        """After warm-up, mean filtered angle must be within 2° of true value.

        We check the mean over the last 30 frames rather than a single sample
        so the test is insensitive to individual unlucky noise draws.
        """
        import random
        rng = random.Random(1)
        s   = AngleSmoother(freq=30.0, min_cutoff=1.5, beta=0.5)
        dt  = 1.0 / 30.0
        t   = 0.0
        tail: list[float] = []
        for i in range(90):
            noisy = {"knee_flexion": 90.0 + rng.gauss(0.0, 2.5)}
            out = s.smooth(t, noisy)
            if i >= 60:
                tail.append(out["knee_flexion"])
            t  += dt
        mean_tail = sum(tail) / len(tail)
        assert abs(mean_tail - 90.0) < 2.0, f"mean filtered {mean_tail:.1f}° off baseline"

    def test_handles_empty_angles(self) -> None:
        s   = AngleSmoother()
        out = s.smooth(0.0, {})
        assert out == {}

    def test_separate_filters_per_angle(self) -> None:
        """Each angle has an independent filter — one spiking shouldn't affect others."""
        s = AngleSmoother(freq=30.0)
        dt = 1.0 / 30.0
        t  = 0.0
        # Warm up both angles at their baselines
        for _ in range(30):
            s.smooth(t, {"knee_flexion": 90.0, "trunk_lean": 10.0})
            t += dt
        # Spike only knee_flexion
        out = s.smooth(t, {"knee_flexion": 130.0, "trunk_lean": 10.0})
        # trunk_lean should be nearly unchanged (≤ 0.5° drift)
        assert abs(out["trunk_lean"] - 10.0) < 0.5

    def test_preserves_fast_ramp(self) -> None:
        """A linear ramp (intentional movement) should not be over-smoothed.

        After 60 frames the filtered value must reach at least 80% of the ramp
        endpoint.  This verifies beta is working (high-speed adaptation).
        """
        s  = AngleSmoother(freq=30.0, min_cutoff=1.5, beta=0.5)
        dt = 1.0 / 30.0
        t  = 0.0
        out = 0.0
        for i in range(60):
            raw = float(i) * 2.0   # 0 → 118° linear ramp
            out = s.smooth(t, {"knee_flexion": raw})["knee_flexion"]
            t  += dt
        assert out >= 118.0 * 0.80, f"Fast ramp under-tracked: {out:.1f}°"
