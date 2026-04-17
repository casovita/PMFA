"""Video analysis service — Phase 2.

Pipeline:
  1. Transcode upload → 720p / 30 FPS / H.264 via FFmpeg
  2. YOLOv8n-pose inference  (returns [] gracefully when file missing / no GPU)
  3. Per-frame angle extraction + FusionScorer threshold evaluation
  4. RepSegmenter accumulates violations and fires CompletedRep events
  5. FusionScorer.score_rep() — rules (60%) + XGBoost ML (40%) blend
  6. Persist AnalysisResult to job record

When inference returns no frames (test environment, missing file, or YOLO not
installed) the job still completes with total_reps=0 and an empty result so
callers always get a valid JSON response.
"""

import logging
import time
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Engine
from sqlmodel import Session

from app.models.job import AnalysisJob
from app.schemas.analysis import FrameKeypoints, RepMetrics, ViolationFlag
from app.services.biomechanics import (
    AngleSmoother,
    CompletedRep,
    RepSegmenter,
    classify_deadlift_stance,
    extract_angles,
    kps_to_dict,
    pick_side,
)
from app.services.inference import run_inference
from app.services.scorer import FusionScorer, ScoredRep
from app.services.storage import get_upload_path
from app.services.transcoder import TranscodeError, transcode

logger = logging.getLogger(__name__)

_QUALITY_LABELS: list[tuple[float, str]] = [
    (90.0, "excellent"),
    (75.0, "good"),
    (55.0, "fair"),
    (0.0,  "poor"),
]


def _quality_label(score: float) -> str:
    return next(lbl for threshold, lbl in _QUALITY_LABELS if score >= threshold)


def _rep_to_metrics(rep: CompletedRep, scorer: FusionScorer) -> RepMetrics:
    """Convert a CompletedRep (biomechanics domain) to the API RepMetrics schema."""
    scored: ScoredRep = scorer.score_rep(rep)
    return RepMetrics(
        rep_number=rep.rep_number,
        primary_angle_min=rep.primary_angle_peak,   # max flexion = "min" raw angle
        max_trunk_lean=rep.max_trunk_lean,
        time_under_tension_sec=rep.time_under_tension_sec,
        violations=rep.violations,
        score=scored.score,
        quality_label=scored.quality_label,
        rules_score=scored.rules_score,
        ml_score=scored.ml_score,
        shap_top=scored.shap_top,
    )


def run_analysis(
    job_id: uuid.UUID,
    engine: Engine,
    scorer: FusionScorer,
) -> None:
    """BackgroundTask: run the full analysis pipeline and persist the result.

    Opens its own Session — the request session has already closed by the time
    a BackgroundTask executes.
    """
    with Session(engine) as session:
        job = session.get(AnalysisJob, job_id)
        if job is None:
            return

        job.status = "processing"
        job.updated_at = datetime.utcnow()
        session.add(job)
        session.commit()

        start = time.monotonic()
        transcoded_path = None
        error_msg: str | None = None
        frame_keypoints: list[FrameKeypoints] = []

        # ── Step 1: transcode ────────────────────────────────────────────────
        try:
            video_key = job.video_s3_key
            if video_key:
                source_path = get_upload_path(video_key)
                if source_path.exists():
                    transcoded_path = transcode(source_path)
                    logger.info("Job %s: transcoded → %s", job_id, transcoded_path.name)
                else:
                    logger.warning("Job %s: source not found at %s", job_id, source_path)
        except TranscodeError as exc:
            logger.warning("Job %s: transcode failed — %s", job_id, exc)
            error_msg = str(exc)

        # ── Step 2: inference ────────────────────────────────────────────────
        if error_msg is None and transcoded_path is not None:
            frame_keypoints = run_inference(transcoded_path)
            logger.info("Job %s: %d frames from inference", job_id, len(frame_keypoints))

        # ── Steps 3–4: per-frame evaluation + rep segmentation ───────────────
        movement = job.movement or "squat"
        segmenter = RepSegmenter(movement)
        smoother  = AngleSmoother()          # One Euro Filter — one per job
        completed_reps: list[CompletedRep] = []
        all_violations: list[ViolationFlag] = []
        locked_side: str | None = None
        # Collect angles during the IDLE phase (before first rep) for stance detection
        setup_angles: list[dict[str, float]] = []
        _setup_done = False                  # stop collecting once rep starts

        for frame in frame_keypoints:
            if not frame.keypoints:
                continue

            kps = kps_to_dict(frame.keypoints)

            # Lock the dominant side from the first frame that has keypoints
            if locked_side is None:
                locked_side = pick_side(kps)

            raw_angles = extract_angles(kps, side=locked_side)
            angles     = smoother.smooth(frame.timestamp_sec, raw_angles)

            # Accumulate setup angles while still in the pre-rep IDLE phase
            if not _setup_done:
                setup_angles.append(angles)

            violations = scorer.evaluate_frame(movement, angles)
            all_violations.extend(violations)

            rep = segmenter.push(
                frame_idx=frame.frame_index,
                timestamp=frame.timestamp_sec,
                angles=angles,
                violations=violations,
            )
            if rep is not None:
                _setup_done = True           # rep started — stop collecting setup
                completed_reps.append(rep)

        # ── Step 4b: stance classification (deadlift only) ───────────────────
        stance: str | None = None
        if movement == "deadlift":
            stance = classify_deadlift_stance(setup_angles)
            logger.info("Job %s: deadlift stance → %s", job_id, stance)

        # ── Step 5: score ────────────────────────────────────────────────────
        rep_metrics = [_rep_to_metrics(r, scorer) for r in completed_reps]

        overall_score = (
            round(sum(m.score for m in rep_metrics) / len(rep_metrics), 1)
            if rep_metrics
            else 0.0
        )

        # Set-level violations: deduplicate all_violations by rule_id, worst severity
        set_violations = _dedup_violations(all_violations)

        elapsed = time.monotonic() - start

        # ── Step 6: persist ──────────────────────────────────────────────────
        if error_msg:
            job.status = "failed"
            job.error_message = error_msg
        else:
            result: dict[str, Any] = {
                "job_id": str(job_id),
                "movement": movement,
                "total_reps": len(completed_reps),
                "overall_score": overall_score,
                "quality_label": _quality_label(overall_score) if completed_reps else "pending",
                "frame_keypoints": [f.model_dump() for f in frame_keypoints],
                "rep_metrics": [m.model_dump() for m in rep_metrics],
                "violations": [v.model_dump() for v in set_violations],
                "fatigue_flags": _detect_fatigue(rep_metrics),
                "processing_time_sec": round(elapsed, 3),
                "stance": stance,
            }
            job.status = "completed"
            job.result = result

        job.updated_at = datetime.utcnow()
        session.add(job)
        session.commit()

        if transcoded_path is not None:
            transcoded_path.unlink(missing_ok=True)

        logger.info(
            "Job %s: %s — %d reps, score=%.1f, elapsed=%.1fs",
            job_id,
            job.status,
            len(completed_reps),
            overall_score,
            elapsed,
        )


# ── Helpers ───────────────────────────────────────────────────────────────────

_SEV_RANK: dict[str, int] = {
    "optimal": 0, "warning": 1, "high_risk": 2, "critical": 3,
}


def _dedup_violations(violations: list[ViolationFlag]) -> list[ViolationFlag]:
    """One entry per rule_id, keeping the highest severity instance."""
    best: dict[str, ViolationFlag] = {}
    for v in violations:
        if v.rule_id not in best or (
            _SEV_RANK.get(v.severity, 0) > _SEV_RANK.get(best[v.rule_id].severity, 0)
        ):
            best[v.rule_id] = v
    return list(best.values())


def _detect_fatigue(rep_metrics: list[RepMetrics]) -> list[dict[str, Any]]:
    """Simple fatigue flag: trunk lean drift ≥3° rep-over-rep from rep 1 baseline."""
    if len(rep_metrics) < 2:
        return []

    baseline = rep_metrics[0].max_trunk_lean
    flags: list[dict[str, Any]] = []

    for m in rep_metrics[1:]:
        drift = m.max_trunk_lean - baseline
        if drift >= 3.0:
            flags.append({
                "rep": m.rep_number,
                "metric": "trunk_lean",
                "baseline_deg": baseline,
                "current_deg": m.max_trunk_lean,
                "drift_deg": round(drift, 1),
                "severity": "warning" if drift < 6.0 else "high_risk",
            })

    return flags
