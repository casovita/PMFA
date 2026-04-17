"""Integration tests — full job lifecycle through the HTTP layer."""

import re
import time
import uuid

from fastapi.testclient import TestClient


UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
VALID_MOVEMENTS = ["squat", "deadlift", "bench_press"]


# ── Submission ────────────────────────────────────────────────────────────────

class TestSubmission:
    def test_each_valid_movement_returns_202(self, client: TestClient) -> None:
        for movement in VALID_MOVEMENTS:
            resp = client.post(
                "/api/v1/analyze",
                params={"movement": movement, "video_key": "uploads/test.mp4"},
            )
            assert resp.status_code == 202, f"Expected 202 for movement={movement}"

    def test_each_job_gets_unique_id(self, client: TestClient) -> None:
        ids = [
            client.post(
                "/api/v1/analyze",
                params={"movement": "squat", "video_key": "uploads/test.mp4"},
            ).json()["job_id"]
            for _ in range(5)
        ]
        assert len(set(ids)) == 5, "All job IDs must be unique"

    def test_job_id_is_uuid4(self, client: TestClient) -> None:
        job_id = client.post(
            "/api/v1/analyze",
            params={"movement": "squat", "video_key": "uploads/test.mp4"},
        ).json()["job_id"]
        assert UUID_RE.match(job_id)

    def test_initial_status_is_pending(self, client: TestClient) -> None:
        data = client.post(
            "/api/v1/analyze",
            params={"movement": "squat", "video_key": "uploads/test.mp4"},
        ).json()
        assert data["status"] == "pending"
        assert data["result"] is None
        assert data["error_message"] is None

    def test_rejects_unknown_movement_with_422(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/analyze",
            params={"movement": "bicep_curl", "video_key": "uploads/test.mp4"},
        )
        assert resp.status_code == 422
        assert "bicep_curl" in resp.json()["detail"]

    def test_rejects_missing_input_with_422(self, client: TestClient) -> None:
        resp = client.post("/api/v1/analyze", params={"movement": "squat"})
        assert resp.status_code == 422

    def test_accepts_multipart_video_upload(self, client: TestClient) -> None:
        import io
        resp = client.post(
            "/api/v1/analyze",
            params={"movement": "deadlift"},
            files={"video": ("clip.mp4", io.BytesIO(b"\x00" * 64), "video/mp4")},
        )
        assert resp.status_code == 202


# ── Polling ───────────────────────────────────────────────────────────────────

class TestPolling:
    def _submit(self, client: TestClient, movement: str = "squat") -> str:
        return client.post(
            "/api/v1/analyze",
            params={"movement": movement, "video_key": "uploads/test.mp4"},
        ).json()["job_id"]

    def test_get_results_returns_200_for_known_job(self, client: TestClient) -> None:
        job_id = self._submit(client)
        resp = client.get(f"/api/v1/results/{job_id}")
        assert resp.status_code == 200

    def test_get_results_returns_404_for_unknown_job(self, client: TestClient) -> None:
        resp = client.get(f"/api/v1/results/{uuid.uuid4()}")
        assert resp.status_code == 404

    def test_get_results_returns_422_for_malformed_uuid(self, client: TestClient) -> None:
        resp = client.get("/api/v1/results/not-a-uuid")
        assert resp.status_code == 422

    def test_job_completes_and_result_present(self, client: TestClient) -> None:
        job_id = self._submit(client)
        # Poll until completed or timeout
        data: dict = {}
        for _ in range(20):
            data = client.get(f"/api/v1/results/{job_id}").json()
            if data["status"] == "completed":
                break
            time.sleep(0.1)
        assert data["status"] == "completed"
        assert data["result"] is not None

    def test_result_contains_movement_field(self, client: TestClient) -> None:
        job_id = self._submit(client, "deadlift")
        for _ in range(20):
            data = client.get(f"/api/v1/results/{job_id}").json()
            if data["status"] == "completed":
                break
            time.sleep(0.1)
        assert data["result"]["movement"] == "deadlift"

    def test_multiple_concurrent_jobs_isolated(self, client: TestClient) -> None:
        """Each job result is independent — no cross-contamination."""
        ids = {
            movement: self._submit(client, movement)
            for movement in VALID_MOVEMENTS
        }
        for movement, job_id in ids.items():
            for _ in range(20):
                data = client.get(f"/api/v1/results/{job_id}").json()
                if data["status"] == "completed":
                    break
                time.sleep(0.1)
            assert data["result"]["movement"] == movement, (
                f"Job for {movement} returned wrong movement in result"
            )

    def test_result_schema_has_required_fields(self, client: TestClient) -> None:
        job_id = self._submit(client)
        for _ in range(20):
            data = client.get(f"/api/v1/results/{job_id}").json()
            if data["status"] == "completed":
                break
            time.sleep(0.1)
        result = data["result"]
        for field in [
            "job_id", "movement", "total_reps", "overall_score",
            "quality_label", "frame_keypoints", "rep_metrics",
            "violations", "fatigue_flags", "processing_time_sec",
        ]:
            assert field in result, f"Missing field '{field}' in result"

    def test_result_score_is_in_valid_range(self, client: TestClient) -> None:
        job_id = self._submit(client)
        for _ in range(20):
            data = client.get(f"/api/v1/results/{job_id}").json()
            if data["status"] == "completed":
                break
            time.sleep(0.1)
        score = data["result"]["overall_score"]
        assert 0.0 <= score <= 100.0
