from fastapi import APIRouter, File, UploadFile
from pydantic import BaseModel

from app.services.storage import save_upload

router = APIRouter()


class UploadResponse(BaseModel):
    video_key: str


@router.post(
    "/upload",
    response_model=UploadResponse,
    summary="Upload a video file for analysis",
)
async def upload_video(file: UploadFile = File(...)) -> UploadResponse:
    """Accept a multipart video upload, save to local disk, return video_key.

    Pass video_key to POST /analyze as the `video_key` parameter.
    """
    key = await save_upload(file)
    return UploadResponse(video_key=key)
