"""S3 presigned URL helper (boto3)."""

import uuid

import boto3
from botocore.exceptions import ClientError

from app.config import get_settings


def generate_presigned_upload_url(
    filename: str,
    content_type: str = "video/mp4",
) -> tuple[str, str]:
    """Return (s3_key, presigned_put_url) for direct browser → S3 upload."""
    settings = get_settings()
    s3_key = f"uploads/{uuid.uuid4()}/{filename}"

    client = boto3.client(
        "s3",
        region_name=settings.aws_s3_region,
        aws_access_key_id=settings.aws_access_key_id or None,
        aws_secret_access_key=settings.aws_secret_access_key or None,
    )
    try:
        url: str = client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.aws_s3_bucket,
                "Key": s3_key,
                "ContentType": content_type,
            },
            ExpiresIn=settings.aws_s3_presign_expiry_seconds,
        )
    except ClientError as exc:
        raise RuntimeError(f"Failed to generate presigned URL: {exc}") from exc

    return s3_key, url
