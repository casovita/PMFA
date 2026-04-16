from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.config import get_settings
from app.services.storage import generate_presigned_upload_url

router = APIRouter()


class PresignedUrlResponse(BaseModel):
    s3_key: str
    upload_url: str
    expires_in_seconds: int


@router.post(
    "/upload",
    response_model=PresignedUrlResponse,
    summary="Generate a presigned S3 URL for direct video upload",
)
def create_upload_url(
    filename: str,
    content_type: str = "video/mp4",
) -> PresignedUrlResponse:
    """Return a presigned PUT URL. Client uploads directly to S3, then passes s3_key to /analyze."""
    settings = get_settings()
    if not settings.aws_s3_bucket:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="S3 storage is not configured on this instance.",
        )
    s3_key, url = generate_presigned_upload_url(filename, content_type)
    return PresignedUrlResponse(
        s3_key=s3_key,
        upload_url=url,
        expires_in_seconds=settings.aws_s3_presign_expiry_seconds,
    )
