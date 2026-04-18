"""LLM-powered coaching cue generation using Claude Sonnet.

Consumes scored AnalysisResult data and returns up to 3 ranked coaching cues.
Returns None gracefully if ANTHROPIC_API_KEY is absent or the API call fails.
"""

import json
import logging
from typing import Any

import anthropic

from app.config import get_settings
from app.schemas.feedback import CoachingCue, FeedbackResult

logger = logging.getLogger(__name__)

_MODEL = "claude-sonnet-4-6"

_SYSTEM_PROMPT = """\
You are a certified powerlifting coach with expertise in biomechanics and injury prevention.

You will receive structured data from a video analysis session. Your task is to identify \
the most important corrections and return structured JSON feedback.

## Output format (strict JSON — no markdown, no explanation outside JSON):
{
  "cues": [
    {
      "rule_id": "<rule_id from violations, e.g. JSC-LUMBAR-001>",
      "severity": "<warning|high_risk|critical>",
      "cue": "<1-2 sentence correction grounded in the athlete's measured values>",
      "drill": "<optional corrective drill or accessory exercise>",
      "rep_numbers": [<rep numbers where this occurred>]
    }
  ],
  "summary": "<1 sentence overall set assessment>"
}

## Constraints:
- Maximum 3 cues — rank by injury risk (critical first, then high_risk, then warning)
- Cues must reference the athlete's actual measured angles, not generic advice
- If no violations exist, return an empty cues array and a positive summary
- Mention fatigue/form breakdown trend in the summary if fatigue_flags are present
- For deadlift, reference stance (sumo/conventional) when coaching hip/ankle cues\
"""

_MOVEMENT_CONTEXT: dict[str, str] = {
    "squat": (
        "Standards: knee flexion ≥120° for IPF depth; "
        "trunk lean ≤35° (warning), ≤45° (high_risk); "
        "dorsiflexion ≥20°"
    ),
    "deadlift": (
        "Standards: lumbar flexion ≤15° (warning), ≤25° (high_risk); "
        "hip lockout at top; bar drift ≤5 cm from body"
    ),
    "bench_press": (
        "Standards: elbow 0–10° below torso at lockout; "
        "elbow flare ≤45° from torso; full lockout required"
    ),
}


def _build_payload(
    movement: str,
    overall_score: float,
    quality_label: str,
    rep_metrics: list[dict[str, Any]],
    violations: list[dict[str, Any]],
    fatigue_flags: list[dict[str, Any]],
    stance: str | None,
) -> dict[str, Any]:
    condensed_reps = [
        {
            "rep": m["rep_number"],
            "score": m["score"],
            "quality": m["quality_label"],
            "trunk_lean_deg": m["max_trunk_lean"],
            "depth_angle_deg": m["primary_angle_min"],
            "time_under_tension_sec": m["time_under_tension_sec"],
            "violations": [
                {
                    "rule_id": v["rule_id"],
                    "severity": v["severity"],
                    "metric": v["metric"],
                    "value_deg": v["value"],
                }
                for v in m["violations"]
            ],
            "top_factors": [
                {"factor": s["feature"], "impact": round(s["shap_value"], 2)}
                for s in m.get("shap_top", [])
            ],
        }
        for m in rep_metrics
    ]
    return {
        "movement": movement,
        "overall_score": overall_score,
        "quality_label": quality_label,
        "stance": stance,
        "set_violations": [
            {
                "rule_id": v["rule_id"],
                "severity": v["severity"],
                "metric": v["metric"],
                "value_deg": v["value"],
            }
            for v in violations
        ],
        "fatigue_flags": fatigue_flags,
        "reps": condensed_reps,
    }


def _parse_feedback(raw: str) -> FeedbackResult | None:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        data = json.loads(text)
        cues = [
            CoachingCue(
                rule_id=c["rule_id"],
                severity=c["severity"],
                cue=c["cue"],
                drill=c.get("drill"),
                rep_numbers=c.get("rep_numbers", []),
            )
            for c in data.get("cues", [])[:3]
        ]
        return FeedbackResult(
            cues=cues,
            summary=data.get("summary", ""),
            model=_MODEL,
        )
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        logger.warning("Failed to parse LLM feedback response: %s — raw: %.200s", exc, raw)
        return None


def generate_feedback(
    movement: str,
    overall_score: float,
    quality_label: str,
    rep_metrics: list[dict[str, Any]],
    violations: list[dict[str, Any]],
    fatigue_flags: list[dict[str, Any]],
    stance: str | None,
    *,
    client: anthropic.Anthropic | None = None,
) -> FeedbackResult | None:
    """Generate coaching cues from scored analysis data via Claude Sonnet.

    Returns None if ANTHROPIC_API_KEY is unset or the API call fails — callers
    should treat None as graceful degradation (no coaching cues available).
    """
    api_key = get_settings().anthropic_api_key
    if not api_key:
        logger.debug("anthropic_api_key not configured — skipping LLM feedback")
        return None

    _client = client or anthropic.Anthropic(api_key=api_key)
    movement_ctx = _MOVEMENT_CONTEXT.get(movement, "")
    system_text = f"{_SYSTEM_PROMPT}\n\n## Movement: {movement.upper()}\n{movement_ctx}"
    payload = _build_payload(
        movement, overall_score, quality_label, rep_metrics, violations, fatigue_flags, stance
    )

    try:
        response = _client.messages.create(
            model=_MODEL,
            max_tokens=1024,
            system=[
                {
                    "type": "text",
                    "text": system_text,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": json.dumps(payload, indent=2)}],
            extra_headers={"anthropic-beta": "prompt-caching-2024-07-31"},
        )
    except anthropic.APIError as exc:
        logger.warning("LLM feedback API error: %s", exc)
        return None

    raw = response.content[0].text if response.content else ""
    return _parse_feedback(raw)
