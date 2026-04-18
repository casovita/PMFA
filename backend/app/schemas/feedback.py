from pydantic import BaseModel


class CoachingCue(BaseModel):
    rule_id: str
    severity: str               # warning | high_risk | critical
    cue: str                    # 1-2 sentence coaching instruction
    drill: str | None = None    # optional corrective drill / accessory
    rep_numbers: list[int] = []


class FeedbackResult(BaseModel):
    cues: list[CoachingCue]     # max 3, ranked by injury risk
    summary: str                # 1-sentence set-level assessment
    model: str                  # LLM model used
