"""Integration tests for GET /api/v1/rules endpoints."""

from fastapi.testclient import TestClient


class TestListRules:
    def test_returns_200(self, client: TestClient) -> None:
        response = client.get("/api/v1/rules")
        assert response.status_code == 200

    def test_returns_list(self, client: TestClient) -> None:
        data = client.get("/api/v1/rules").json()
        assert isinstance(data, list)
        assert len(data) > 0

    def test_each_rule_has_required_fields(self, client: TestClient) -> None:
        rules = client.get("/api/v1/rules").json()
        for rule in rules:
            assert "id" in rule
            assert "plane" in rule
            assert "description" in rule
            assert "applies_to_movements" in rule
            assert "detection_priority" in rule
            assert "thresholds" in rule


class TestGetMovementRules:
    def test_squat_returns_200(self, client: TestClient) -> None:
        response = client.get("/api/v1/rules/squat")
        assert response.status_code == 200

    def test_squat_response_shape(self, client: TestClient) -> None:
        data = client.get("/api/v1/rules/squat").json()
        assert data["movement"] == "squat"
        assert "sagittal_rules" in data
        assert "frontal_rules" in data
        assert isinstance(data["sagittal_rules"], list)
        assert isinstance(data["frontal_rules"], list)

    def test_squat_has_sagittal_rules(self, client: TestClient) -> None:
        data = client.get("/api/v1/rules/squat").json()
        assert len(data["sagittal_rules"]) > 0

    def test_deadlift_returns_200(self, client: TestClient) -> None:
        assert client.get("/api/v1/rules/deadlift").status_code == 200

    def test_bench_press_returns_200(self, client: TestClient) -> None:
        assert client.get("/api/v1/rules/bench_press").status_code == 200

    def test_unknown_movement_returns_404(self, client: TestClient) -> None:
        response = client.get("/api/v1/rules/unknown_movement_xyz")
        assert response.status_code == 404
        assert "detail" in response.json()

    def test_squat_execution_standards_present(self, client: TestClient) -> None:
        data = client.get("/api/v1/rules/squat").json()
        # The real rules JSON has IPF squat standards
        assert data["execution_standards"] is not None
