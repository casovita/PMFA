# PMFA — Progress Log

## Phase 1 — Proof of Concept (Weeks 1–6)
**Status:** In Progress  
**Goal:** Validate core technical assumptions. Single-exercise squat demo in browser producing interpretable joint angles.

### Objectives
- [x] Run MediaPipe BlazePose in-browser on a pre-recorded squat video
- [x] Extract 33 keypoints per frame (x, y, z, visibility)
- [x] Compute knee flexion angle per frame via `atan2` on Hip→Knee→Ankle landmarks
- [x] Render skeleton overlay on Canvas with confidence color-coding (green/red at visibility 0.5)
- [x] Plot live knee angle graph (Chart.js) synced to video playback + scrubber
- [x] Rule-based violation flags: depth check, trunk lean, knee valgus proxy
- [x] Live webcam mode via `getUserMedia` with wall-clock timing and stop button
- [x] Radar audio alerts (Web Audio API beeps, pitch/rate tied to danger proximity, mutable)
- [x] Thresholds loaded from `KNOWLEDGE/movement_analysis_rules.json` at startup (no hardcoded values in angles.js)
- [ ] Verify 2D sagittal accuracy within ~10° on 15+ known clips (manual QA)
- [ ] Document barbell occlusion failure modes with frame counts

### Completed
- `KNOWLEDGE/movement_analysis_rules.json` — canonical ruleset (JSC constraints, execution standards, scoring)
- `.gitignore`, `CLAUDE.md` — project scaffolding
- POC deleted — all functionality ported to Phase 2 React app (`frontend/`)

### Success Criteria
- [ ] BlazePose runs at 20+ FPS on desktop Chrome
- [ ] Knee angle error <10° vs. visual inspection on 15+ clips
- [ ] Depth check correct on 80%+ of labeled clips
- [ ] Barbell failure modes documented

---

## Phase 2 — Alpha (Weeks 7–16)
**Status:** In Progress

### Completed
- `frontend/` — React + TypeScript + Vite scaffold
  - `tsconfig.json` — strict TypeScript, no `any`
  - `vite.config.ts` — ES worker format, repo root served for `/KNOWLEDGE/`
  - `eslint.config.js` + `.prettierrc` — strict ESLint + Prettier
  - `src/types.ts` — shared types: `LiftType`, `Landmark`, `SquatAngles`, `RepState`, `RepData`, worker message protocol
  - `src/lib/angles.ts` — typed port of POC angle math, rep state machine, scoring, fatigue detection
  - `src/lib/renderer.ts` — typed port of POC skeleton renderer
  - `src/lib/rules.ts` — typed port of POC rules loader
  - `src/workers/pose.worker.ts` — BlazePose inference moved to Web Worker (unblocks UI thread)
  - `src/components/LiftSelector.tsx` — squat / deadlift / bench toggle
  - `src/components/VideoCapture.tsx` — file upload + webcam modes
  - `src/components/PoseOverlay.tsx` — canvas overlay with imperative draw handle
  - `src/components/AngleDashboard.tsx` — live metrics, violations, rep status, fatigue banner
  - `src/components/RepTimeline.tsx` — collapsible per-rep history panel
  - `src/App.tsx` — root orchestrator wiring all components + worker

### Completed (continued)
- `src/lib/angles.ts` — deadlift: `extractDeadliftAngles`, `checkDeadliftViolations` (lumbar, bar drift, hip lockout); bench: `extractBenchAngles`, `checkBenchViolations` (elbow depth EXEC-IPF-BP-001, elbow flare, lockout)
- `src/lib/angles.ts` — unified `updateRepStateMachine` with `RepMachineConfig` (squat / deadlift / bench thresholds); `scoreRep` extended with all 11 violation types
- `src/lib/renderer.ts` — `drawAngleLabel` now lift-aware (knee/hip/elbow label + correct landmark anchor)
- `src/lib/renderer.ts` — `captureSnapshot(video, landmarks, violations)`: captures JPEG frame at worst high_risk/critical violation; draws skeleton + glowing joint highlights (concentric rings per severity) on offscreen canvas
- `src/App.tsx` — `onLandmarks` dispatches to correct extract/check per `lift` via `liftRef`; `AngleChart` wired in
- `src/App.tsx` — `snapshotWorstRankRef` tracks worst violation rank per rep; triggers `captureSnapshot` when rank improves; resets on rep completion
- `src/components/AngleDashboard.tsx` — lift-aware metric strips (squat/deadlift/bench)
- `src/components/RepTimeline.tsx` — uses `rep.lift` for per-rep primary angle label
- `src/components/AngleChart.tsx` — Chart.js 4 angle time-series (primary angle vs time, last 300 frames)
- `src/components/CameraGuide.tsx` — camera positioning guide with SVG tooltip illustrations (sagittal/bench diagrams, hover+click, outside-click close)
- `src/lib/historyStore.ts` — localStorage persistence (`pmfa_sessions_v1`); `saveSession`, `loadSessions`, `deleteSession`, `computeAggregate`; max 50 sessions, QuotaExceededError handled
- `src/lib/formatters.ts` — shared `qualityLabel`, `formatDate`, `formatLift` utilities
- `src/components/HistoryView.tsx` — session history browser: lift filter, TrendChart, SessionCard list, empty state
- `src/components/SessionCard.tsx` — session card: lift badge, date, rep count, avg score badge, ScoreSparkline, delete, expand/collapse
- `src/components/SessionDetail.tsx` — per-rep table with two-line column headers (label + muted subtitle); snapshot column with 80px thumbnail + click-to-open lightbox
- `src/components/ScoreSparkline.tsx` — pure SVG polyline sparkline (no Chart.js); handles 0/1/N scores; color-coded by last rep quality
- `src/components/TrendChart.tsx` — Chart.js line chart: avg score per session per lift (≥3 sessions required to render)
- `src/App.tsx` — `view: 'analyze' | 'history'` toggle; `repHistoryRef` (stale-closure-safe history snapshot); `savedFeedback` toast (auto-dismiss 2.5 s); `historyVersion` counter forces re-read of localStorage after delete
- `backend/app/services/storage.py` — switched from S3 presigned URLs to local disk upload (`/tmp/pmfa_uploads`); `save_upload`, `get_upload_path`
- `backend/app/config.py` — added `upload_dir` (local disk) and `ffmpeg_path` (optional override) settings
- `backend/app/routers/storage.py` — `POST /upload` now accepts multipart file, returns `video_key`
- `backend/app/routers/analysis.py` — `POST /analyze` accepts `video_key` (replaces `s3_key`); calls `save_upload` on inline video uploads
- `backend/app/services/transcoder.py` — FFmpeg wrapper: `transcode()` (720p / 30 FPS / H.264 / AAC), `probe_duration()` via ffprobe; `TranscodeError` on non-zero exit
- `backend/app/services/analyzer.py` — `run_analysis_stub` now runs transcode step before writing stub result; handles `TranscodeError` → job status `"failed"`
- `backend/tests/` — 88 passing tests: updated `test_analysis.py` + `test_job_lifecycle.py` for `video_key` API; rewrote `test_storage.py` for multipart upload; added `test_transcoder.py` (13 tests)
- `src/lib/feedbackEngine.ts` — rule-based coaching cue generator: aggregates violations across set, priority-ranks by clinical injury risk (lumbar > valgus > depth > ankle > bar drift > elbow), returns ≤3 cues with severity-keyed templates for all 11 violation types
- `src/components/FeedbackPanel.tsx` + `FeedbackPanel.module.css` — post-set coaching panel: ranked cue list with severity badge, rep count, actionable cue text; shows after stop when reps exist
- `src/App.tsx` — wires `generateFeedback` on `handleStop`; clears cues on `reset`; renders `FeedbackPanel` in idle mode

### Completed (continued — backend ML + Phase 3 bootstrap, 2026-04-17/18)
- `backend/app/services/inference.py` — YOLOv8n-pose wrapper; full inference pipeline wired end-to-end
- `backend/app/services/biomechanics.py` — `AngleSmoother` (One Euro Filter), `RepSegmenter`, `classify_deadlift_stance` (sumo/conventional from hip-width ratio)
- `backend/app/services/feature_engineering.py` — 15-feature vector (`FEATURE_NAMES`), `features_to_row`
- `backend/app/services/ml_scorer.py` — `MLScorer`: XGBoost regressor + SHAP `TreeExplainer`; lazy-load from JSON; `shap_top(n=3)`
- `backend/app/services/scorer.py` — `FusionScorer`: 60% rule-based + 40% XGBoost; `ScoredRep` with `shap_top`
- `backend/app/services/analyzer.py` — full pipeline: transcode → YOLOv8 → smoothing → rep segmentation → fusion scoring → fatigue detection → LLM feedback → persist
- `backend/scripts/train_model.py` — synthetic data generator + XGBRegressor trainer (300 trees, depth=4, lr=0.05)
- `backend/models/xgb_scorer.json` — trained model artifact (575 KB)
- **LLM coaching cues (Phase 3):**
  - `backend/app/schemas/feedback.py` — `CoachingCue`, `FeedbackResult` schemas
  - `backend/app/services/llm_feedback.py` — `generate_feedback()` via `claude-sonnet-4-6`; system prompt cached (`cache_control: ephemeral`); graceful `None` on missing key or API error
  - `backend/app/routers/analysis.py` — `GET /api/v1/feedback/{job_id}` shortcut
  - `backend/tests/test_llm_feedback.py` — 11 tests (parse, happy path, error, degradation, cache headers)
- **Frontend ↔ backend (confirmed wired):**
  - `frontend/src/lib/api.ts` — `submitAnalysis`, `pollResult`; `BackendCoachingCue`, `BackendFeedback`, full `BackendAnalysisResult` types
  - `frontend/src/components/BackendAnalysisPanel.tsx` — score/quality/reps, per-rep grid, violations, **AI coaching cues**, fatigue flags
  - `App.tsx` — video upload triggers parallel browser (BlazePose) + server (YOLOv8) analysis; polls until complete
- **Test count: 137 passing**

---

## Phase 3 — Beta (Weeks 17–28)
**Status:** In Progress (bootstrap complete)

### Completed
- XGBoost fusion scorer trained + integrated (synthetic data; real annotation needed)
- SHAP explainability feeding LLM prompt context
- Claude Sonnet coaching cue generation with prompt caching
- Frontend renders LLM cues alongside YOLOv8 results

### Next
- [ ] User auth (Clerk or Supabase Auth + JWT)
- [ ] PostgreSQL migration (replace SQLite)
- [ ] Celery + Redis job queue (replace FastAPI BackgroundTasks)
- [ ] S3/R2 upload (replace local disk)
- [ ] Dataset collection: 500 annotated real clips per lift
- [ ] Retrain XGBoost on real labels (target: Pearson r > 0.75)
- [ ] Beta user onboarding (target: 50 users)

---

## Phase 4 — V1 Launch (Weeks 29–40)
**Status:** Not Started

---

## Phase 5 — Scale (Months 10–24)
**Status:** Not Started
