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

---

## Phase 3 — Beta (Weeks 17–28)
**Status:** Not Started

---

## Phase 4 — V1 Launch (Weeks 29–40)
**Status:** Not Started

---

## Phase 5 — Scale (Months 10–24)
**Status:** Not Started
