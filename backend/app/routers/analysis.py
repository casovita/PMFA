import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, status
from sqlalchemy import Engine
from sqlmodel import Session

from app.database import get_engine, get_session
from app.models.job import AnalysisJob
from app.schemas.analysis import JobStatusResponse
from app.services.analyzer import run_analysis_stub

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
    background_tasks: BackgroundTasks,
    session: SessionDep,
    engine: EngineDep,
    movement: str = "squat",
    video: UploadFile | None = None,
    s3_key: str | None = None,
) -> JobStatusResponse:
    """Accept a video upload or S3 key and enqueue an analysis job.

    Returns immediately with job_id. Poll GET /results/{job_id} for completion.
    """
    if movement not in SUPPORTED_MOVEMENTS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported movement '{movement}'. Must be one of: {sorted(SUPPORTED_MOVEMENTS)}",
        )
    if video is None and s3_key is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide either a video file upload or an s3_key.",
        )

    job = AnalysisJob(movement=movement, video_s3_key=s3_key, status="pending")
    session.add(job)
    session.commit()
    session.refresh(job)

    # Pass engine (not session) so the background task can open its own session
    background_tasks.add_task(run_analysis_stub, job_id=job.id, engine=engine)

    return JobStatusResponse(job_id=job.id, status="pending")


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
