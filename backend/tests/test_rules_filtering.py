"""Integration tests — rules endpoint filtering correctness."""

from fastapi.testclient import TestClient

from app.services.rules_engine import RulesEngine

SUPPORTED_MOVEMENTS = ["squat", "deadlift", "bench_press"]
VALID_PLANES = {"sagittal", "frontal", "any"}
VALID_SEVERITIES = {"optimal", "warning", "high_risk", "critical"}
VALID_PRIORITIES = {1, 2, 3, 4}


# ── GET /rules — full list ────────────────────────────────────────────────────

class TestListRulesSchema:
    def test_all_constraints_have_id(self, client: TestClient) -> None:
        rules = client.get("/api/v1/rules").json()
        for r in rules:
            assert "id" in r and r["id"], f"Rule missing id: {r}"

    def test_all_constraints_have_valid_plane(self, client: TestClient) -> None:
        rules = client.get("/api/v1/rules").json()
        for r in rules:
            assert r["plane"] in VALID_PLANES, (
                f"Rule {r['id']} has invalid plane: {r['plane']}"
            )

    def test_all_constraints_have_valid_detection_priority(self, client: TestClient) -> None:
        rules = client.get("/api/v1/rules").json()
        for r in rules:
            assert r["detection_priority"] in VALID_PRIORITIES, (
                f"Rule {r['id']} has invalid priority: {r['detection_priority']}"
            )

    def test_applies_to_movements_is_always_a_list(self, client: TestClient) -> None:
        rules = client.get("/api/v1/rules").json()
        for r in rules:
            assert isinstance(r["applies_to_movements"], list), (
                f"Rule {r['id']} applies_to_movements is not a list"
            )
            assert len(r["applies_to_movements"]) > 0, (
                f"Rule {r['id']} applies_to_movements is empty"
            )

    def test_thresholds_keys_are_valid_severities(self, client: TestClient) -> None:
        rules = client.get("/api/v1/rules").json()
        for r in rules:
            thresholds = r.get("thresholds", {})
            for key in thresholds:
                if thresholds[key] is not None:
                    assert key in VALID_SEVERITIES, (
                        f"Rule {r['id']} has unknown threshold key: {key}"
                    )

    def test_threshold_bands_have_min_max(self, client: TestClient) -> None:
        rules = client.get("/api/v1/rules").json()
        for r in rules:
            for band_name, band in r.get("thresholds", {}).items():
                if band is not None:
                    assert "min" in band or "max" in band, (
                        f"Rule {r['id']}.{band_name} band missing min/max"
                    )


# ── GET /rules/{movement} — filtering by plane ────────────────────────────────

class TestMovementPlaneFiltering:
    def test_sagittal_rules_have_sagittal_plane(self, client: TestClient) -> None:
        data = client.get("/api/v1/rules/squat").json()
        for r in data["sagittal_rules"]:
            assert r["plane"] == "sagittal", (
                f"Rule {r['id']} in sagittal_rules has plane={r['plane']}"
            )

    def test_frontal_rules_have_frontal_plane(self, client: TestClient) -> None:
        data = client.get("/api/v1/rules/squat").json()
        for r in data["frontal_rules"]:
            assert r["plane"] == "frontal", (
                f"Rule {r['id']} in frontal_rules has plane={r['plane']}"
            )

    def test_no_overlap_between_sagittal_and_frontal(self, client: TestClient) -> None:
        data = client.get("/api/v1/rules/squat").json()
        sag_ids = {r["id"] for r in data["sagittal_rules"]}
        fro_ids = {r["id"] for r in data["frontal_rules"]}
        assert sag_ids.isdisjoint(fro_ids), (
            f"Rules appear in both sagittal and frontal: {sag_ids & fro_ids}"
        )

    def test_all_returned_rules_apply_to_requested_movement(self, client: TestClient) -> None:
        for movement in SUPPORTED_MOVEMENTS:
            data = client.get(f"/api/v1/rules/{movement}").json()
            all_rules = data["sagittal_rules"] + data["frontal_rules"]
            for r in all_rules:
                assert movement in r["applies_to_movements"], (
                    f"Rule {r['id']} returned for {movement} but doesn't apply to it"
                )

    def test_all_supported_movements_return_200(self, client: TestClient) -> None:
        for movement in SUPPORTED_MOVEMENTS:
            resp = client.get(f"/api/v1/rules/{movement}")
            assert resp.status_code == 200, f"Expected 200 for movement={movement}"

    def test_squat_has_at_least_one_sagittal_rule(self, client: TestClient) -> None:
        data = client.get("/api/v1/rules/squat").json()
        assert len(data["sagittal_rules"]) >= 1

    def test_deadlift_has_sagittal_rules(self, client: TestClient) -> None:
        data = client.get("/api/v1/rules/deadlift").json()
        assert len(data["sagittal_rules"]) >= 1

    def test_unknown_movement_returns_404(self, client: TestClient) -> None:
        resp = client.get("/api/v1/rules/burpee")
        assert resp.status_code == 404

    def test_response_includes_movement_echo(self, client: TestClient) -> None:
        for movement in SUPPORTED_MOVEMENTS:
            data = client.get(f"/api/v1/rules/{movement}").json()
            assert data["movement"] == movement


# ── RulesEngine unit — applied directly (no HTTP) ─────────────────────────────

class TestRulesEngineFiltering:
    def test_sagittal_constraints_do_not_include_frontal(
        self, rules_engine: RulesEngine
    ) -> None:
        for movement in SUPPORTED_MOVEMENTS:
            results = rules_engine.get_constraints_for_movement(movement, plane="sagittal")
            for c in results:
                assert c.get("plane") == "sagittal", (
                    f"Constraint {c['id']} in sagittal results has plane={c.get('plane')}"
                )

    def test_higher_priority_rules_present_for_squat(
        self, rules_engine: RulesEngine
    ) -> None:
        constraints = rules_engine.get_constraints_for_movement("squat")
        priorities = {c["detection_priority"] for c in constraints}
        # The rules JSON has at least one priority-1 or priority-2 rule for squat
        assert priorities & {1, 2}, "Expected at least one high-priority rule for squat"

    def test_execution_standards_present_for_all_supported_lifts(
        self, rules_engine: RulesEngine
    ) -> None:
        for movement in SUPPORTED_MOVEMENTS:
            standards = rules_engine.get_execution_standards(movement)
            assert standards is not None, (
                f"No execution standards found for movement={movement}"
            )

    def test_scoring_config_returns_a_dict(
        self, rules_engine: RulesEngine
    ) -> None:
        scoring = rules_engine.get_scoring_config()
        assert isinstance(scoring, dict), "Scoring config should be a dict"

    def test_fatigue_rules_non_empty(self, rules_engine: RulesEngine) -> None:
        fatigue = rules_engine.get_fatigue_rules()
        assert len(fatigue) > 0, "Fatigue rules should not be empty"
