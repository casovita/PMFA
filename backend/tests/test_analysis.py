"""Integration tests for POST /api/v1/analyze and GET /api/v1/results/{job_id}."""

import io
import time

from fastapi.testclient import TestClient


class TestSubmitAnalysis:
    def test_returns_202_with_video_key(self, client: TestClient) -> None:
        response = client.post("/api/v1/analyze", params={"movement": "squat", "video_key": "uploads/test.mp4"})
        assert response.status_code == 202

    def test_returns_job_id_and_pending_status(self, client: TestClient) -> None:
        data = client.post(
            "/api/v1/analyze",
            params={"movement": "squat", "video_key": "uploads/test.mp4"},
        ).json()
        assert "job_id" in data
        assert data["status"] == "pending"
        assert data["result"] is None

    def test_returns_202_with_video_upload(self, client: TestClient) -> None:
        fake_video = io.BytesIO(b"fake mp4 bytes")
        response = client.post(
            "/api/v1/analyze",
            params={"movement": "deadlift"},
            files={"video": ("test.mp4", fake_video, "video/mp4")},
        )
        assert response.status_code == 202

    def test_422_when_no_video_or_s3_key(self, client: TestClient) -> None:
        response = client.post("/api/v1/analyze", params={"movement": "squat"})
        assert response.status_code == 422

    def test_422_for_unsupported_movement(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/analyze",
            params={"movement": "clean", "video_key": "uploads/test.mp4"},
        )
        assert response.status_code == 422
        assert "clean" in response.json()["detail"]

    def test_job_id_is_uuid(self, client: TestClient) -> None:
        import re
        data = client.post(
            "/api/v1/analyze",
            params={"movement": "bench_press", "video_key": "uploads/test.mp4"},
        ).json()
        uuid_pattern = r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        assert re.match(uuid_pattern, data["job_id"], re.IGNORECASE)


class TestGetResults:
    def test_404_for_unknown_job(self, client: TestClient) -> None:
        response = client.get("/api/v1/results/00000000-0000-4000-8000-000000000000")
        assert response.status_code == 404

    def test_can_retrieve_submitted_job(self, client: TestClient) -> None:
        job_id = client.post(
            "/api/v1/analyze",
            params={"movement": "squat", "video_key": "uploads/test.mp4"},
        ).json()["job_id"]

        response = client.get(f"/api/v1/results/{job_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["job_id"] == job_id
        assert data["status"] in {"pending", "processing", "completed"}

    def test_job_eventually_completes(self, client: TestClient) -> None:
        """The stub analyzer runs synchronously in TestClient; job should complete."""
        job_id = client.post(
            "/api/v1/analyze",
            params={"movement": "squat", "video_key": "uploads/test.mp4"},
        ).json()["job_id"]

        # Poll up to 3 seconds — stub completes near-instantly
        for _ in range(10):
            data = client.get(f"/api/v1/results/{job_id}").json()
            if data["status"] == "completed":
                break
            time.sleep(0.3)

        assert data["status"] == "completed"
        assert data["result"] is not None
        assert data["result"]["movement"] == "squat"
