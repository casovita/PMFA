import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, UploadFile, status
from sqlalchemy import Engine
from sqlmodel import Session

from app.database import get_engine, get_session
from app.models.job import AnalysisJob
from app.schemas.analysis import JobStatusResponse
from app.schemas.feedback import FeedbackResult
from app.services.analyzer import run_analysis
from app.services.scorer import FusionScorer  # noqa: F401 — used in type annotation below
from app.services.storage import save_upload

router = APIRouter()

SessionDep = Annotated[Session, Depends(get_session)]
EngineDep = Annotated[Engine, Depends(get_engine)]

SUPPORTED_MOVEMENTS = {"squat", "deadlift", "bench_press"}


@router.post(
    "/analyze",
    response_model=JobStatusResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Submit a video for analysis",
)
async def submit_analysis(
    request: Request,
    background_tasks: BackgroundTasks,
    session: SessionDep,
    engine: EngineDep,
    movement: str = "squat",
    video: UploadFile | None = None,
    video_key: str | None = None,
) -> JobStatusResponse:
    """Accept a video upload or pre-uploaded video_key and enqueue an analysis job.

    Returns immediately with job_id. Poll GET /results/{job_id} for completion.
    """
    if movement not in SUPPORTED_MOVEMENTS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported movement '{movement}'. Must be one of: {sorted(SUPPORTED_MOVEMENTS)}",
        )
    if video is None and video_key is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide either a video file upload or a video_key.",
        )

    if video is not None:
        video_key = await save_upload(video)

    job = AnalysisJob(movement=movement, video_s3_key=video_key, status="pending")
    session.add(job)
    session.commit()
    session.refresh(job)

    scorer: FusionScorer = request.app.state.scorer

    # Pass engine + scorer (not session) — background task opens its own session
    background_tasks.add_task(run_analysis, job_id=job.id, engine=engine, scorer=scorer)

    return JobStatusResponse(job_id=job.id, status="pending")


@router.get(
    "/feedback/{job_id}",
    response_model=FeedbackResult,
    summary="Retrieve LLM coaching cues for a completed job",
)
def get_feedback(job_id: uuid.UUID, session: SessionDep) -> FeedbackResult:
    """Return only the LLM feedback for a completed job.

    404 if job not found; 409 if job not yet completed; 204-equivalent detail
    if feedback is unavailable (e.g. API key not configured).
    """
    job = session.get(AnalysisJob, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job {job_id} not found.")
    if job.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Job {job_id} is not yet completed (status: {job.status}).",
        )
    result = job.result or {}
    feedback = result.get("feedback")
    if feedback is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No LLM feedback available for this job (API key not configured or generation failed).",
        )
    return FeedbackResult(**feedback)


@router.get(
    "/results/{job_id}",
    response_model=JobStatusResponse,
    summary="Poll analysis job status and retrieve results",
)
def get_results(job_id: uuid.UUID, session: SessionDep) -> JobStatusResponse:
    """Return job status. When status == 'completed', includes full AnalysisResult."""
    job = session.get(AnalysisJob, job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found.",
        )
    return JobStatusResponse(
        job_id=job.id,
        status=job.status,
        result=job.result,
        error_message=job.error_message,
    )
