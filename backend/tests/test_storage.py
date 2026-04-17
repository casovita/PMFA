"""Integration tests — POST /api/v1/upload presigned URL endpoint."""

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient


class TestUploadEndpoint:
    def test_returns_503_when_s3_not_configured(self, client: TestClient) -> None:
        """Default test config has no S3 bucket set → should return 503."""
        resp = client.post("/api/v1/upload", params={"filename": "clip.mp4"})
        assert resp.status_code == 503
        assert "not configured" in resp.json()["detail"].lower()

    def test_503_body_does_not_expose_credentials(self, client: TestClient) -> None:
        """Error response must never leak AWS keys."""
        resp = client.post("/api/v1/upload", params={"filename": "clip.mp4"})
        body = resp.text
        assert "aws_access_key" not in body.lower()
        assert "secret" not in body.lower()

    def test_returns_200_with_mocked_s3(self, client: TestClient) -> None:
        """When S3 is configured and boto3 responds, endpoint returns presigned URL."""
        fake_url = "https://s3.amazonaws.com/pmfa-uploads/uploads/abc/clip.mp4?X-Amz-Signature=fake"

        with (
            patch("app.routers.storage.get_settings") as mock_settings,
            patch("app.services.storage.boto3.client") as mock_boto,
        ):
            settings = MagicMock()
            settings.aws_s3_bucket = "pmfa-uploads"
            settings.aws_s3_region = "us-east-1"
            settings.aws_s3_presign_expiry_seconds = 3600
            settings.aws_access_key_id = "FAKEKEY"
            settings.aws_secret_access_key = "FAKESECRET"
            mock_settings.return_value = settings

            s3_client = MagicMock()
            s3_client.generate_presigned_url.return_value = fake_url
            mock_boto.return_value = s3_client

            resp = client.post(
                "/api/v1/upload",
                params={"filename": "clip.mp4", "content_type": "video/mp4"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert "s3_key" in data
        assert "upload_url" in data
        assert "expires_in_seconds" in data

    def test_s3_key_format_with_mocked_s3(self, client: TestClient) -> None:
        """s3_key must follow uploads/{uuid}/{filename} pattern."""
        import re
        fake_url = "https://example.com/fake"

        with (
            patch("app.routers.storage.get_settings") as mock_settings,
            patch("app.services.storage.boto3.client") as mock_boto,
        ):
            settings = MagicMock()
            settings.aws_s3_bucket = "pmfa-uploads"
            settings.aws_s3_region = "us-east-1"
            settings.aws_s3_presign_expiry_seconds = 3600
            settings.aws_access_key_id = ""
            settings.aws_secret_access_key = ""
            mock_settings.return_value = settings

            s3_client = MagicMock()
            s3_client.generate_presigned_url.return_value = fake_url
            mock_boto.return_value = s3_client

            data = client.post(
                "/api/v1/upload",
                params={"filename": "my_video.mp4"},
            ).json()

        pattern = r"^uploads/[0-9a-f-]{36}/my_video\.mp4$"
        assert re.match(pattern, data["s3_key"]), (
            f"s3_key '{data['s3_key']}' does not match expected pattern"
        )

    def test_expiry_matches_config(self, client: TestClient) -> None:
        """expires_in_seconds in response must equal the configured value."""
        fake_url = "https://example.com/fake"

        with (
            patch("app.routers.storage.get_settings") as mock_settings,
            patch("app.services.storage.boto3.client") as mock_boto,
        ):
            settings = MagicMock()
            settings.aws_s3_bucket = "pmfa-uploads"
            settings.aws_s3_region = "us-east-1"
            settings.aws_s3_presign_expiry_seconds = 7200
            settings.aws_access_key_id = ""
            settings.aws_secret_access_key = ""
            mock_settings.return_value = settings

            s3_client = MagicMock()
            s3_client.generate_presigned_url.return_value = fake_url
            mock_boto.return_value = s3_client

            data = client.post(
                "/api/v1/upload",
                params={"filename": "clip.mp4"},
            ).json()

        assert data["expires_in_seconds"] == 7200

    def test_boto3_called_with_correct_put_operation(self, client: TestClient) -> None:
        """Ensure boto3 is asked for a PUT (not GET) presigned URL."""
        fake_url = "https://example.com/fake"

        with (
            patch("app.routers.storage.get_settings") as mock_settings,
            patch("app.services.storage.boto3.client") as mock_boto,
        ):
            settings = MagicMock()
            settings.aws_s3_bucket = "pmfa-uploads"
            settings.aws_s3_region = "us-east-1"
            settings.aws_s3_presign_expiry_seconds = 3600
            settings.aws_access_key_id = ""
            settings.aws_secret_access_key = ""
            mock_settings.return_value = settings

            s3_client = MagicMock()
            s3_client.generate_presigned_url.return_value = fake_url
            mock_boto.return_value = s3_client

            client.post("/api/v1/upload", params={"filename": "clip.mp4"})

            call_args = s3_client.generate_presigned_url.call_args
            assert call_args[0][0] == "put_object", (
                "Expected put_object operation for upload presigned URL"
            )
