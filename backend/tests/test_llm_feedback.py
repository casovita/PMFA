"""Tests for LLM feedback generation (llm_feedback.py).

Uses unittest.mock to avoid real API calls — anthropic client is injected
via the client= parameter on generate_feedback().
"""

import json
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from app.schemas.feedback import CoachingCue, FeedbackResult
from app.services.llm_feedback import _parse_feedback, generate_feedback


# ── Fixtures ──────────────────────────────────────────────────────────────────

SQUAT_REP_METRICS: list[dict[str, Any]] = [
    {
        "rep_number": 1,
        "score": 74.0,
        "quality_label": "good",
        "max_trunk_lean": 38.5,
        "primary_angle_min": 125.0,
        "time_under_tension_sec": 2.1,
        "violations": [
            {
                "rule_id": "JSC-LUMBAR-001",
                "severity": "warning",
                "metric": "trunk_lean",
                "value": 38.5,
                "threshold": 35.0,
                "phase": "DESCENDING",
            }
        ],
        "shap_top": [
            {"feature": "max_trunk_lean", "value": 38.5, "shap_value": -4.5},
        ],
        "rules_score": 93.0,
        "ml_score": 68.0,
    }
]

SQUAT_VIOLATIONS: list[dict[str, Any]] = [
    {
        "rule_id": "JSC-LUMBAR-001",
        "severity": "warning",
        "metric": "trunk_lean",
        "value": 38.5,
        "threshold": 35.0,
        "phase": "DESCENDING",
    }
]

CLEAN_RESPONSE_JSON = json.dumps(
    {
        "cues": [
            {
                "rule_id": "JSC-LUMBAR-001",
                "severity": "warning",
                "cue": "Your trunk lean reached 38.5° during the descent — brace harder and keep your chest up.",
                "drill": "Goblet squat holds",
                "rep_numbers": [1],
            }
        ],
        "summary": "Solid session — address minor forward lean to improve consistency.",
    }
)


def _make_mock_client(response_text: str) -> MagicMock:
    mock_content = MagicMock()
    mock_content.text = response_text
    mock_response = MagicMock()
    mock_response.content = [mock_content]
    mock_client = MagicMock()
    mock_client.messages.create.return_value = mock_response
    return mock_client


# ── _parse_feedback unit tests ─────────────────────────────────────────────────

def test_parse_feedback_valid_json() -> None:
    result = _parse_feedback(CLEAN_RESPONSE_JSON)
    assert result is not None
    assert len(result.cues) == 1
    assert result.cues[0].rule_id == "JSC-LUMBAR-001"
    assert result.cues[0].rep_numbers == [1]
    assert "38.5" in result.cues[0].cue
    assert result.model == "claude-sonnet-4-6"


def test_parse_feedback_strips_markdown_fences() -> None:
    wrapped = f"```json\n{CLEAN_RESPONSE_JSON}\n```"
    result = _parse_feedback(wrapped)
    assert result is not None
    assert len(result.cues) == 1


def test_parse_feedback_caps_at_three_cues() -> None:
    data = {
        "cues": [
            {"rule_id": f"JSC-00{i}", "severity": "warning", "cue": f"cue {i}", "rep_numbers": [1]}
            for i in range(5)
        ],
        "summary": "too many",
    }
    result = _parse_feedback(json.dumps(data))
    assert result is not None
    assert len(result.cues) == 3


def test_parse_feedback_empty_cues() -> None:
    result = _parse_feedback(json.dumps({"cues": [], "summary": "Excellent form throughout."}))
    assert result is not None
    assert result.cues == []
    assert result.summary == "Excellent form throughout."


def test_parse_feedback_invalid_json_returns_none() -> None:
    assert _parse_feedback("not json at all") is None


def test_parse_feedback_missing_keys_returns_none() -> None:
    assert _parse_feedback(json.dumps({"cues": [{"no_rule_id": "x"}]})) is None


# ── generate_feedback integration tests (mocked client) ───────────────────────

def test_generate_feedback_returns_result(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.llm_feedback.get_settings", lambda: MagicMock(anthropic_api_key="sk-test"))
    mock_client = _make_mock_client(CLEAN_RESPONSE_JSON)

    result = generate_feedback(
        movement="squat",
        overall_score=74.0,
        quality_label="good",
        rep_metrics=SQUAT_REP_METRICS,
        violations=SQUAT_VIOLATIONS,
        fatigue_flags=[],
        stance=None,
        client=mock_client,
    )

    assert isinstance(result, FeedbackResult)
    assert len(result.cues) == 1
    assert isinstance(result.cues[0], CoachingCue)
    mock_client.messages.create.assert_called_once()


def test_generate_feedback_no_api_key_returns_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.llm_feedback.get_settings", lambda: MagicMock(anthropic_api_key=""))

    result = generate_feedback(
        movement="squat",
        overall_score=74.0,
        quality_label="good",
        rep_metrics=SQUAT_REP_METRICS,
        violations=SQUAT_VIOLATIONS,
        fatigue_flags=[],
        stance=None,
    )
    assert result is None


def test_generate_feedback_api_error_returns_none(monkeypatch: pytest.MonkeyPatch) -> None:
    import anthropic

    monkeypatch.setattr("app.services.llm_feedback.get_settings", lambda: MagicMock(anthropic_api_key="sk-test"))
    mock_client = MagicMock()
    mock_client.messages.create.side_effect = anthropic.APIConnectionError(request=MagicMock())

    result = generate_feedback(
        movement="squat",
        overall_score=74.0,
        quality_label="good",
        rep_metrics=SQUAT_REP_METRICS,
        violations=SQUAT_VIOLATIONS,
        fatigue_flags=[],
        stance=None,
        client=mock_client,
    )
    assert result is None


def test_generate_feedback_prompt_contains_movement(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify the system prompt includes movement-specific context."""
    monkeypatch.setattr("app.services.llm_feedback.get_settings", lambda: MagicMock(anthropic_api_key="sk-test"))
    mock_client = _make_mock_client(CLEAN_RESPONSE_JSON)

    generate_feedback(
        movement="deadlift",
        overall_score=80.0,
        quality_label="good",
        rep_metrics=[],
        violations=[],
        fatigue_flags=[],
        stance="sumo",
        client=mock_client,
    )

    call_kwargs = mock_client.messages.create.call_args.kwargs
    system_text = call_kwargs["system"][0]["text"]
    assert "DEADLIFT" in system_text
    assert "lumbar" in system_text.lower()


def test_generate_feedback_cache_control_set(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify prompt caching headers and cache_control are sent."""
    monkeypatch.setattr("app.services.llm_feedback.get_settings", lambda: MagicMock(anthropic_api_key="sk-test"))
    mock_client = _make_mock_client(CLEAN_RESPONSE_JSON)

    generate_feedback(
        movement="squat",
        overall_score=74.0,
        quality_label="good",
        rep_metrics=SQUAT_REP_METRICS,
        violations=SQUAT_VIOLATIONS,
        fatigue_flags=[],
        stance=None,
        client=mock_client,
    )

    call_kwargs = mock_client.messages.create.call_args.kwargs
    assert call_kwargs["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert "prompt-caching-2024-07-31" in call_kwargs["extra_headers"]["anthropic-beta"]
