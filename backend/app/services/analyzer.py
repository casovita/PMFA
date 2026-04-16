"""Video analysis service — Phase 2 stub.

Will house:
  - FFmpeg transcoding wrapper (720p, 30 FPS, H.264)
  - YOLOv8n-pose inference via Ultralytics
  - RulesEngine evaluation per frame
  - Rep segmentation and scoring

The stub writes synthetic data so the frontend can integrate
against a running server before inference is implemented.
"""

import uuid
from datetime import datetime

from sqlalchemy import Engine
from sqlmodel import Session

from app.models.job import AnalysisJob


def run_analysis_stub(job_id: uuid.UUID, engine: Engine) -> None:
    """BackgroundTask: update job status and write a stub result.

    Opens its own Session — the request session has already closed
    by the time a BackgroundTask executes.
    """
    with Session(engine) as session:
        job = session.get(AnalysisJob, job_id)
        if job is None:
            return

        job.status = "processing"
        job.updated_at = datetime.utcnow()
        session.add(job)
        session.commit()

        stub_result = {
            "job_id": str(job_id),
            "movement": job.movement or "squat",
            "total_reps": 0,
            "overall_score": 0.0,
            "quality_label": "pending",
            "frame_keypoints": [],
            "rep_metrics": [],
            "violations": [],
            "fatigue_flags": [],
            "processing_time_sec": 0.0,
            "note": "Stub — YOLOv8 inference not yet implemented.",
        }

        job.status = "completed"
        job.result = stub_result
        job.updated_at = datetime.utcnow()
        session.add(job)
        session.commit()
