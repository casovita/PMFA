"""Local disk upload storage.

Files are saved to settings.upload_dir (default /tmp/pmfa_uploads).
The inference service reads them directly by path — no download step needed.

NOTE: swap to Cloudflare R2 before any cloud/production deployment.
R2 migration = change boto3 client to use endpoint_url; everything else stays identical.
"""

import uuid
from pathlib import Path

import aiofiles
from fastapi import UploadFile

from app.config import get_settings


async def save_upload(file: UploadFile) -> str:
    """Save an uploaded video to local disk. Returns a video_key (relative path)."""
    settings = get_settings()
    ext = Path(file.filename or "upload").suffix or ".mp4"
    key = f"{uuid.uuid4()}{ext}"
    dest = settings.upload_dir / key
    dest.parent.mkdir(parents=True, exist_ok=True)
    async with aiofiles.open(dest, "wb") as f:
        await f.write(await file.read())
    return key


def get_upload_path(video_key: str) -> Path:
    """Resolve a video_key to an absolute filesystem path."""
    settings = get_settings()
    return settings.upload_dir / video_key
