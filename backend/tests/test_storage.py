"""Integration tests — POST /api/v1/upload local disk endpoint."""

import io

from fastapi.testclient import TestClient


class TestUploadEndpoint:
    def test_returns_200_with_video_key(self, client: TestClient) -> None:
        """A valid multipart upload returns 200 with a video_key."""
        fake_video = io.BytesIO(b"fake mp4 bytes")
        resp = client.post(
            "/api/v1/upload",
            files={"file": ("clip.mp4", fake_video, "video/mp4")},
        )
        assert resp.status_code == 200
        assert "video_key" in resp.json()

    def test_video_key_has_mp4_extension(self, client: TestClient) -> None:
        """video_key preserves the original file extension."""
        fake_video = io.BytesIO(b"\x00" * 16)
        data = client.post(
            "/api/v1/upload",
            files={"file": ("my_squat.mp4", fake_video, "video/mp4")},
        ).json()
        assert data["video_key"].endswith(".mp4"), (
            f"Expected .mp4 extension in key '{data['video_key']}'"
        )

    def test_video_key_is_unique_per_upload(self, client: TestClient) -> None:
        """Two identical uploads must get distinct keys."""
        payload = io.BytesIO(b"identical bytes")

        def upload() -> str:
            payload.seek(0)
            return client.post(
                "/api/v1/upload",
                files={"file": ("clip.mp4", payload, "video/mp4")},
            ).json()["video_key"]

        assert upload() != upload(), "video_key must be unique across uploads"

    def test_video_key_returned_can_be_passed_to_analyze(self, client: TestClient) -> None:
        """video_key from /upload can be forwarded to POST /analyze without error."""
        fake_video = io.BytesIO(b"fake content")
        video_key = client.post(
            "/api/v1/upload",
            files={"file": ("deadlift.mp4", fake_video, "video/mp4")},
        ).json()["video_key"]

        resp = client.post(
            "/api/v1/analyze",
            params={"movement": "deadlift", "video_key": video_key},
        )
        assert resp.status_code == 202

    def test_non_mp4_extension_preserved(self, client: TestClient) -> None:
        """Extension is derived from the filename, not forced to .mp4."""
        fake_video = io.BytesIO(b"\x00" * 8)
        data = client.post(
            "/api/v1/upload",
            files={"file": ("clip.mov", fake_video, "video/quicktime")},
        ).json()
        assert data["video_key"].endswith(".mov"), (
            f"Expected .mov extension in key '{data['video_key']}'"
        )
