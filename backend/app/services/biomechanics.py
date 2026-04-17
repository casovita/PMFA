"""Biomechanical angle extraction and rep segmentation.

All angles are returned in *rule convention*:
  0° = neutral/extended position, increases with movement amplitude.

  knee_flexion   : 0° = straight leg          → ~130° at ATG squat
  hip_flexion    : 0° = upright torso          → ~120° at deep forward lean
  trunk_lean     : 0° = vertical spine         → ~45° at DL setup
  dorsiflexion   : larger = more range         → ≥25° = optimal
  elbow_flexion  : 0° = locked-out elbow       → ~120° at bar-on-chest

Convention is chosen to match movement_analysis_rules.json thresholds directly.

One Euro Filter (Casiez et al. 2012) is applied to per-frame angles before rep
segmentation.  It suppresses tracker jitter (high-freq noise) while preserving
fast intentional movement transients by adapting the cutoff frequency to signal
speed.  This directly improves state-machine accuracy: without smoothing, noisy
angle spikes can prematurely trigger or abort rep detection.
"""

import math
from dataclasses import dataclass, field
from typing import Any

from app.schemas.analysis import Keypoint

# ─── One Euro Filter ─────────────────────────────────────────────────────────


def _alpha(freq: float, cutoff: float) -> float:
    """Smoothing coefficient for a first-order low-pass filter at *cutoff* Hz."""
    tau = 1.0 / (2.0 * math.pi * cutoff)
    te  = 1.0 / freq
    return 1.0 / (1.0 + tau / te)


class _LowPassFilter:
    """Exponential moving average with a settable alpha per call."""

    def __init__(self, alpha: float) -> None:
        self._alpha = alpha
        self._value: float | None = None

    @property
    def last(self) -> float | None:
        return self._value

    def __call__(self, x: float, alpha: float | None = None) -> float:
        if self._value is None:
            self._value = x
        else:
            a = alpha if alpha is not None else self._alpha
            self._value = a * x + (1.0 - a) * self._value
        return self._value


class OneEuroFilter:
    """Adaptive 1€ low-pass filter for a single scalar signal.

    Parameters
    ----------
    freq:        Nominal sampling frequency (Hz).  Used only for the very first
                 call when no previous timestamp exists; subsequent calls derive
                 instantaneous frequency from consecutive timestamps.
    min_cutoff:  Minimum cutoff frequency (Hz).  Lower = more smoothing when
                 the signal is stationary.  Good default for 30 fps joint angles:
                 ``1.5`` Hz.
    beta:        Speed coefficient.  Higher = faster response when the signal
                 changes quickly (reduces lag on fast movements).  ``0.5`` works
                 well for powerlifting rep angles.
    d_cutoff:    Cutoff frequency (Hz) for the derivative low-pass filter.
                 ``1.0`` Hz is the original paper's recommendation.

    Usage::

        filt = OneEuroFilter(freq=30.0)
        smoothed = filt(raw_value, timestamp_sec)
    """

    def __init__(
        self,
        freq: float = 30.0,
        min_cutoff: float = 1.5,
        beta: float = 0.5,
        d_cutoff: float = 1.0,
    ) -> None:
        self._freq      = freq
        self._min_cutoff = min_cutoff
        self._beta      = beta
        self._d_cutoff  = d_cutoff
        self._x_filt    = _LowPassFilter(_alpha(freq, min_cutoff))
        self._dx_filt   = _LowPassFilter(_alpha(freq, d_cutoff))
        self._last_time: float | None = None

    def __call__(self, x: float, timestamp: float | None = None) -> float:
        """Return the filtered value of *x* at optional *timestamp* seconds."""
        # Update instantaneous frequency from elapsed time between frames
        if timestamp is not None and self._last_time is not None:
            dt = timestamp - self._last_time
            if dt > 1e-9:
                self._freq = 1.0 / dt
        self._last_time = timestamp

        prev = self._x_filt.last
        dx   = (x - prev) * self._freq if prev is not None else 0.0

        edx     = self._dx_filt(dx, _alpha(self._freq, self._d_cutoff))
        cutoff  = self._min_cutoff + self._beta * abs(edx)
        return self._x_filt(x, _alpha(self._freq, cutoff))


class AngleSmoother:
    """Applies a One Euro Filter to each angle in a per-frame angles dict.

    One ``OneEuroFilter`` instance is created lazily per angle name so the
    smoother can be constructed before the angle names are known.

    Parameters
    ----------
    freq:        Nominal FPS of the video (used for the first frame only).
    min_cutoff:  Passed to each ``OneEuroFilter``.  Default ``1.5`` Hz.
    beta:        Passed to each ``OneEuroFilter``.  Default ``0.5``.

    Usage::

        smoother = AngleSmoother(freq=30.0)
        for frame in frames:
            angles = extract_angles(kps, side)
            angles = smoother.smooth(frame.timestamp_sec, angles)
            segmenter.push(..., angles=angles, ...)
    """

    def __init__(
        self,
        freq: float = 30.0,
        min_cutoff: float = 1.5,
        beta: float = 0.5,
    ) -> None:
        self._freq       = freq
        self._min_cutoff = min_cutoff
        self._beta       = beta
        self._filters: dict[str, OneEuroFilter] = {}

    def smooth(self, timestamp: float, angles: dict[str, float]) -> dict[str, float]:
        """Return a new dict with each angle value filtered.

        Unknown angle names are auto-registered with their own filter on first
        encounter.  Values are rounded to one decimal place (matching the raw
        angle precision from ``extract_angles``).
        """
        result: dict[str, float] = {}
        for name, val in angles.items():
            if name not in self._filters:
                self._filters[name] = OneEuroFilter(
                    freq=self._freq,
                    min_cutoff=self._min_cutoff,
                    beta=self._beta,
                )
            result[name] = round(self._filters[name](val, timestamp), 1)
        return result


# ─── Keypoint name constants ─────────────────────────────────────────────────

_SIDE_KPS: dict[str, dict[str, str]] = {
    "right": {
        "shoulder": "right_shoulder",
        "elbow":    "right_elbow",
        "wrist":    "right_wrist",
        "hip":      "right_hip",
        "knee":     "right_knee",
        "ankle":    "right_ankle",
    },
    "left": {
        "shoulder": "left_shoulder",
        "elbow":    "left_elbow",
        "wrist":    "left_wrist",
        "hip":      "left_hip",
        "knee":     "left_knee",
        "ankle":    "left_ankle",
    },
}

KpsDict = dict[str, tuple[float, float, float]]  # name → (x, y, conf)


# ─── Keypoint helpers ─────────────────────────────────────────────────────────

def kps_to_dict(keypoints: list[Keypoint]) -> KpsDict:
    """Convert flat keypoints list to name-keyed dict."""
    return {kp.name: (kp.x, kp.y, kp.visibility) for kp in keypoints}


def pick_side(kps: KpsDict) -> str:
    """Return 'right' or 'left' based on mean visibility of shoulder/hip/knee/ankle."""
    def avg_vis(side: str) -> float:
        names = [_SIDE_KPS[side][k] for k in ("shoulder", "hip", "knee", "ankle")]
        vals = [kps[n][2] for n in names if n in kps]
        return sum(vals) / len(vals) if vals else 0.0

    return "right" if avg_vis("right") >= avg_vis("left") else "left"


def _xy(kps: KpsDict, name: str, min_conf: float = 0.3) -> tuple[float, float] | None:
    """Return (x, y) for a keypoint if confidence meets threshold, else None."""
    entry = kps.get(name)
    if entry is None or entry[2] < min_conf:
        return None
    return (entry[0], entry[1])


# ─── Angle math ───────────────────────────────────────────────────────────────

def _joint_angle(
    a: tuple[float, float],
    b: tuple[float, float],
    c: tuple[float, float],
) -> float:
    """Interior angle at vertex *b* formed by rays b→a and b→c.

    Returns degrees in [0, 180]. Returns 0.0 for degenerate inputs.
    """
    v1 = (a[0] - b[0], a[1] - b[1])
    v2 = (c[0] - b[0], c[1] - b[1])
    m1 = math.sqrt(v1[0] ** 2 + v1[1] ** 2)
    m2 = math.sqrt(v2[0] ** 2 + v2[1] ** 2)
    if m1 < 1e-9 or m2 < 1e-9:
        return 0.0
    cos_a = max(-1.0, min(1.0, (v1[0] * v2[0] + v1[1] * v2[1]) / (m1 * m2)))
    return math.degrees(math.acos(cos_a))


def _angle_from_vertical(
    top: tuple[float, float],
    bottom: tuple[float, float],
) -> float:
    """Angle of the top→bottom vector from vertical (image y-axis).

    0° = perfectly vertical, 90° = horizontal.
    """
    dx = abs(bottom[0] - top[0])
    dy = abs(bottom[1] - top[1])
    if dy < 1e-9:
        return 90.0
    return math.degrees(math.atan(dx / dy))


# ─── Per-frame angle extraction ──────────────────────────────────────────────

def extract_angles(kps: KpsDict, side: str = "right") -> dict[str, float]:
    """Compute biomechanical angles from a keypoints dict.

    Uses landmarks on *side* (right or left) — whichever faces the camera.
    Missing or low-confidence keypoints are skipped silently.
    """
    sk = _SIDE_KPS[side]
    angles: dict[str, float] = {}

    shoulder = _xy(kps, sk["shoulder"])
    elbow    = _xy(kps, sk["elbow"])
    wrist    = _xy(kps, sk["wrist"])
    hip      = _xy(kps, sk["hip"])
    knee     = _xy(kps, sk["knee"])
    ankle    = _xy(kps, sk["ankle"])

    # Knee flexion — 0° = straight, increases with bend
    if hip and knee and ankle:
        angles["knee_flexion"] = round(180.0 - _joint_angle(hip, knee, ankle), 1)

    # Hip flexion — 0° = upright, increases with forward lean
    if shoulder and hip and knee:
        angles["hip_flexion"] = round(180.0 - _joint_angle(shoulder, hip, knee), 1)

    # Trunk lean — 0° = vertical, increases with forward lean (proxy for lumbar flexion)
    if shoulder and hip:
        angles["trunk_lean"] = round(_angle_from_vertical(shoulder, hip), 1)

    # Dorsiflexion proxy — shin angle from vertical; larger = more range
    if knee and ankle:
        angles["dorsiflexion"] = round(max(0.0, _angle_from_vertical(knee, ankle)), 1)

    # Elbow flexion — 0° = locked out, increases with bend
    if shoulder and elbow and wrist:
        angles["elbow_flexion"] = round(180.0 - _joint_angle(shoulder, elbow, wrist), 1)

    return angles


# ─── Rep segmentation ─────────────────────────────────────────────────────────

_IDLE = "idle"
_DESC = "descending"
_BOT  = "bottom"
_ASC  = "ascending"

_SEV_RANK: dict[str, int] = {
    "optimal": 0, "warning": 1, "high_risk": 2, "critical": 3,
}


def sev_rank(sev: str) -> int:
    return _SEV_RANK.get(sev, 0)


def _mean(vals: list[float]) -> float:
    return sum(vals) / len(vals) if vals else 0.0


def _sd(vals: list[float], mean: float) -> float:
    if len(vals) < 2:
        return 0.0
    return math.sqrt(sum((v - mean) ** 2 for v in vals) / len(vals))


@dataclass
class _ActiveRep:
    start_frame: int
    start_time: float
    angles_log: list[dict[str, float]] = field(default_factory=list)
    violations_log: list[Any] = field(default_factory=list)


@dataclass
class CompletedRep:
    rep_number: int
    start_frame: int
    end_frame: int
    time_under_tension_sec: float
    movement: str                 # squat | deadlift | bench_press
    primary_angle_peak: float     # max flexion (rule convention) reached this rep
    primary_angle_mean: float     # mean flexion — depth consistency
    primary_angle_sd: float       # SD of flexion — rep-to-rep variability
    max_trunk_lean: float
    trunk_lean_mean: float        # average forward lean
    trunk_lean_sd: float          # lean drift — fatigue proxy
    violations: list[Any]         # list[ViolationFlag] from rules engine


class RepSegmenter:
    """Per-movement rep counter using a 4-state angle machine.

    Angles are in *rule convention* (0 = neutral, positive = movement):
      - Descent start  : primary_angle exceeds TOP threshold
      - Bottom reached : primary_angle exceeds BOTTOM threshold
      - Ascent start   : primary_angle drops HYSTERESIS° below BOTTOM
      - Rep complete   : primary_angle returns below TOP threshold

    Movement configs (rule-convention thresholds):
      squat      : knee_flexion,  top=25°, bottom=70°, hysteresis=10°
      deadlift   : hip_flexion,   top=25°, bottom=70°, hysteresis=10°
      bench_press: elbow_flexion, top=25°, bottom=80°, hysteresis=10°
    """

    _CFG: dict[str, dict[str, Any]] = {
        "squat":       {"key": "knee_flexion",  "top": 25.0, "bottom": 70.0},
        "deadlift":    {"key": "hip_flexion",   "top": 25.0, "bottom": 70.0},
        "bench_press": {"key": "elbow_flexion", "top": 25.0, "bottom": 80.0},
    }
    _HYSTERESIS = 10.0

    def __init__(self, movement: str) -> None:
        cfg = self._CFG.get(movement, self._CFG["squat"])
        self._movement = movement
        self._key: str = cfg["key"]
        self._top: float = cfg["top"]
        self._bottom: float = cfg["bottom"]
        self._state = _IDLE
        self._rep_count = 0
        self._active: _ActiveRep | None = None

    def push(
        self,
        frame_idx: int,
        timestamp: float,
        angles: dict[str, float],
        violations: list[Any],
    ) -> "CompletedRep | None":
        """Feed one frame. Returns a CompletedRep when a full rep is detected."""
        val = angles.get(self._key, 0.0)

        if self._state == _IDLE:
            if val > self._top:
                self._state = _DESC
                self._active = _ActiveRep(start_frame=frame_idx, start_time=timestamp)
                self._active.angles_log.append(angles)
                self._active.violations_log.extend(violations)

        elif self._state == _DESC:
            if self._active:
                self._active.angles_log.append(angles)
                self._active.violations_log.extend(violations)
            if val >= self._bottom:
                self._state = _BOT

        elif self._state == _BOT:
            if self._active:
                self._active.angles_log.append(angles)
                self._active.violations_log.extend(violations)
            if val < self._bottom - self._HYSTERESIS:
                self._state = _ASC

        elif self._state == _ASC:
            if self._active:
                self._active.angles_log.append(angles)
                self._active.violations_log.extend(violations)
            if val <= self._top:
                rep = self._finish(frame_idx, timestamp)
                self._state = _IDLE
                self._active = None
                return rep

        return None

    def _finish(self, end_frame: int, end_time: float) -> CompletedRep:
        self._rep_count += 1
        a = self._active or _ActiveRep(start_frame=end_frame, start_time=end_time)
        tut = round(end_time - a.start_time, 2)

        primary_vals = [f.get(self._key, 0.0) for f in a.angles_log]
        trunk_vals   = [f.get("trunk_lean", 0.0) for f in a.angles_log]

        peak      = max(primary_vals, default=0.0)
        p_mean    = _mean(primary_vals)
        p_sd      = _sd(primary_vals, p_mean)
        t_max     = max(trunk_vals, default=0.0)
        t_mean    = _mean(trunk_vals)
        t_sd      = _sd(trunk_vals, t_mean)

        # Deduplicate violations: worst severity per rule_id
        best: dict[str, Any] = {}
        for v in a.violations_log:
            rid = v.rule_id
            if rid not in best or sev_rank(v.severity) > sev_rank(best[rid].severity):
                best[rid] = v

        return CompletedRep(
            rep_number=self._rep_count,
            start_frame=a.start_frame,
            end_frame=end_frame,
            time_under_tension_sec=tut,
            movement=self._movement,
            primary_angle_peak=round(peak, 1),
            primary_angle_mean=round(p_mean, 1),
            primary_angle_sd=round(p_sd, 1),
            max_trunk_lean=round(t_max, 1),
            trunk_lean_mean=round(t_mean, 1),
            trunk_lean_sd=round(t_sd, 1),
            violations=list(best.values()),
        )
