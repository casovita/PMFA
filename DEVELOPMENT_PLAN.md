# Powerlifting Form Analysis AI — Development Roadmap v1.0

> **Total Duration:** 18–24 months | **Team:** 2–6 engineers | **Phases:** 5
> **Stack:** MediaPipe · FastAPI · React · TensorRT

---

## Table of Contents

- [Best Practices & Development Standards](#best-practices--development-standards)
- [Rules Engine Architecture](#rules-engine-architecture)
- [Phase 1 — Proof of Concept (Weeks 1–6)](#phase-1--proof-of-concept-weeks-16)
- [Phase 2 — Alpha: All Three Lifts + Backend (Weeks 7–16)](#phase-2--alpha-all-three-lifts--backend-weeks-716)
- [Phase 3 — Beta: Data, ML Scoring + Auth (Weeks 17–28)](#phase-3--beta-data-ml-scoring--auth-weeks-1728)
- [Phase 4 — V1 Launch: Production Grade (Weeks 29–40)](#phase-4--v1-launch-production-grade-weeks-2940)
- [Phase 5 — Scale: Research Grade Product (Months 10–24)](#phase-5--scale-research-grade-product-months-1024)
- [Phase Summary](#phase-summary)

---

## Best Practices & Development Standards

### 1. Git Workflow (GitHub Flow)

#### Branching Strategy

- **`main`** — always deployable, protected branch. Direct pushes forbidden.
- **Feature branches** — created from `main` for all work. Merged back via PR.
- **No long-lived branches** — branches should live <1 week. Break large features into incremental PRs.

#### Branch Naming Convention

```
<type>/<short-description>

Types:
  feat/     — new feature or capability
  fix/      — bug fix
  refactor/ — code restructuring without behavior change
  docs/     — documentation only
  test/     — adding or updating tests
  chore/    — tooling, deps, CI config
  perf/     — performance improvement
  spike/    — experimental / throwaway investigation

Examples:
  feat/blazepose-skeleton-overlay
  fix/knee-angle-calculation-overflow
  refactor/extract-angle-utils
  chore/setup-eslint-prettier
```

#### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <description>

[optional body]
[optional footer]
```

- **type:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`
- **scope:** module or area affected — `pose`, `backend`, `frontend`, `scoring`, `infra`
- **description:** imperative mood, lowercase, no period, max 72 chars
- **body:** explain *why*, not *what* (the diff shows what)

```
feat(pose): add One Euro filter for keypoint smoothing

Reduces jitter on wrist/ankle landmarks during barbell lifts.
Cutoff frequency set to 6 Hz based on typical squat cadence.

Closes #42
```

#### Pull Request Process

1. **Create PR early** — open as draft if work-in-progress, for visibility
2. **PR title** — follows commit convention: `feat(pose): add skeleton overlay renderer`
3. **PR description must include:**
   - Summary of changes (what and why)
   - How to test / verify
   - Screenshots or video for UI changes
   - Breaking changes noted explicitly
4. **Require 1 approval** before merge (2 approvals for `scoring/` and `infra/` changes)
5. **Squash merge** to `main` — keeps history clean, one commit per feature
6. **Delete branch** after merge (automated via GitHub settings)
7. **No self-merging** unless solo on the project (Phase 1)

#### Code Review Standards

- Review within **24 hours** of PR creation
- Focus on: correctness, edge cases, security, readability — not style (automated)
- Use GitHub suggestions for small fixes
- Block merging for: security issues, data loss risk, untested behavior changes
- Approve with comments for minor nits — don't block on formatting

---

### 2. Code Quality

#### Linting & Formatting

| Tool | Scope | Config |
|------|-------|--------|
| **ESLint** | Frontend (TS/TSX) | `eslint.config.js` — strict TypeScript rules, no `any` |
| **Prettier** | Frontend + Markdown | `.prettierrc` — 2-space indent, single quotes, trailing comma |
| **Ruff** | Backend (Python) | `ruff.toml` — replaces Black + isort + flake8 |
| **mypy** | Backend (Python) | `mypy.ini` — strict mode, no implicit optional |

All formatters run automatically:
- **On save** (IDE integration)
- **Pre-commit hook** (via `pre-commit` framework)
- **CI check** (fail PR if unformatted code)

#### TypeScript Standards (Frontend)

- **Strict mode enabled** — `"strict": true` in tsconfig
- **No `any`** — use `unknown` + type guards, or proper generics
- **Explicit return types** on exported functions and hooks
- **Interface over type** for object shapes; `type` for unions/intersections
- **No non-null assertions** (`!`) — handle null explicitly

#### Python Standards (Backend)

- **Type hints required** on all function signatures
- **Pydantic models** for all API request/response schemas
- **No bare `except:`** — always catch specific exceptions
- **Docstrings** on public API endpoints (not internal helpers)
- **async/await** for all I/O-bound operations

#### Testing Standards

| Layer | Framework | Coverage Target | What to Test |
|-------|-----------|-----------------|--------------|
| **Frontend unit** | Vitest + Testing Library | 70%+ | Hooks, utils, angle math, scoring logic |
| **Frontend integration** | Vitest + MSW | Key flows | Upload → analyze → display results |
| **Backend unit** | pytest | 80%+ | Angle computation, scoring engine, rep counter |
| **Backend integration** | pytest + httpx | API endpoints | Full request/response cycle |
| **E2E** | Playwright (Phase 3+) | Critical paths | Upload video → get analysis → view results |

Testing rules:
- **Every PR must include tests** for new logic (not for config/markup changes)
- **Tests must pass** before merge — enforced by CI
- **No mocking internal modules** — mock only external services (S3, GPU inference, LLM API)
- **Test names describe behavior**: `test_knee_angle_returns_zero_when_leg_is_straight`
- **Angle math and scoring engine get property-based tests** (Hypothesis for Python)

#### Error Handling

- Frontend: error boundaries at page level, toast notifications for user-facing errors
- Backend: structured error responses with error codes, never expose stack traces
- Logging: structured JSON logs (backend), console.error with context (frontend)
- Never silently swallow errors — log or propagate

---

### 3. Development Environment

#### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 20 LTS | Frontend runtime |
| **Python** | 3.11+ | Backend runtime |
| **uv** | latest | Python package manager (fast, replaces pip/venv) |
| **pnpm** | 9+ | Node package manager (fast, disk-efficient) |
| **Docker** | 24+ | Local services (Redis, PostgreSQL from Phase 3) |
| **FFmpeg** | 6+ | Video transcoding (backend) |
| **Git** | 2.40+ | Version control |

#### Project Setup (First Time)

```bash
# Clone
git clone <repo-url> && cd PMFA

# Frontend
cd frontend
pnpm install
cp .env.example .env.local
pnpm dev                    # → http://localhost:5173

# Backend
cd backend
uv sync                     # creates .venv automatically
cp .env.example .env
uv run uvicorn main:app --reload  # → http://localhost:8000

# Local services (Phase 3+)
docker compose up -d        # Redis + PostgreSQL
```

#### Environment Variables

- **Never commit secrets** — `.env` files are in `.gitignore`
- **`.env.example`** committed with placeholder values and comments for every variable
- **Validation at startup** — backend uses Pydantic Settings, frontend uses Vite env validation
- **Naming convention:** `PMFA_<SERVICE>_<KEY>` (e.g., `PMFA_AWS_S3_BUCKET`, `PMFA_CLERK_SECRET_KEY`)

#### IDE Configuration (VS Code Recommended)

Shared settings committed in `.vscode/`:
- `settings.json` — format on save, Python/TS defaults, ruler at 100 chars
- `extensions.json` — recommended extensions (ESLint, Prettier, Ruff, Python, Tailwind)
- `launch.json` — debug configs for frontend (Chrome), backend (uvicorn), and tests

#### Pre-commit Hooks

Installed via `pre-commit` framework (Python) + `husky` (Node):

```yaml
# Runs on every commit:
- Prettier (frontend formatting)
- ESLint (frontend linting)
- Ruff format + lint (backend)
- mypy (backend type checking)
- Detect secrets (yelp/detect-secrets)
- No large files (>500 KB warning)
```

#### Dependency Management

- **Pin exact versions** in lock files (`pnpm-lock.yaml`, `uv.lock`)
- **Renovate bot** for automated dependency updates (weekly PRs)
- **Security audit** in CI: `pnpm audit` + `uv pip audit`
- **No global installs** — everything via project-local package managers
- **Document why** for any pinned/overridden dependency version

#### Secrets & Security

- No secrets in code, env files, or commit history — ever
- Use `.env.local` for local dev (gitignored)
- Production secrets via AWS Secrets Manager or environment injection
- Run `detect-secrets` pre-commit hook to catch accidental leaks
- API keys rotated quarterly; documented in team password manager

---

## Rules Engine Architecture

The rules engine is the deterministic, evidence-based core of PMFA's analysis pipeline. It evaluates per-frame biomechanical measurements against structured thresholds and produces severity-graded violations, execution compliance flags, rep scores, and fatigue alerts.

### Canonical Sources of Truth

| File | Role |
|------|------|
| `KNOWLEDGE/movement_analysis_rules.json` | Machine-readable ruleset — loaded by backend at startup; consumed directly by Phase 1 browser JS |
| `KNOWLEDGE/Biomechanical_thresholds_and_execution_standards.md` | Human-readable evidence base — every threshold has a source citation and injury mechanism |

**Never hardcode threshold values in application code.** All angle ranges are read from or validated against `movement_analysis_rules.json`.

### Schema Structure

```json
{
  "joint_safety_constraints": [ /* 12 constraints, IDs: JSC-*-001 */ ],
  "execution_standards": {
    "powerlifting_ipf": { /* IPF 2026: squat, bench, deadlift */ },
    "crossfit":         { /* Per-movement standards */ }
  },
  "fatigue_detection": { /* Rep-over-rep drift rules */ },
  "scoring":           { /* Deduction tables per severity and category */ }
}
```

Each constraint entry contains: `id` (stable, e.g. `JSC-KNEE-001`), `thresholds` (optimal/warning/high_risk/critical), `applies_to_movements[]`, `detection_priority` (1–4), `measurement_notes` (camera plane requirements), and `evidence` (source citation).

### Four-Tier Severity Model

| Tier | Color | Action |
|------|-------|--------|
| optimal | Green | No action — within safe range |
| warning | Yellow | Monitor — minor compensation trending toward risk |
| high_risk | Orange | Reduce load or terminate set |
| critical | Red | Stop immediately — imminent injury risk |

### Camera Requirements by Rule Category

| Rule Category | Sagittal (2D) | Frontal | 3D Dual-Cam |
|---------------|:---:|:---:|:---:|
| Squat depth, trunk lean, butt wink, ankle dorsiflexion | ✓ | — | — |
| Lumbar / thoracic flexion proxies | ✓ (proxy) | — | — |
| Knee valgus | proxy only | ✓ | ✓ (true) |
| Shoulder abduction (bench) | — | ✓ | ✓ |
| Lateral pelvic shift | — | ✓ | ✓ |

### Phase-by-Phase Evolution

| Phase | Rules Engine State |
|-------|--------------------|
| **1 — POC** | Browser JS; squat subset of JSC rules; 4-tier model; rep state machine + fatigue detection |
| **2 — Alpha** | Python `RulesEngine` class loads full JSON; evaluates all sagittal-detectable rules for all 3 lifts; powers scoring API |
| **3 — Beta** | Rule violations become XGBoost features; SHAP surfaces top rule IDs for LLM feedback generation |
| **4 — V1** | Real-time rule evaluation <16 ms/frame server-side; audio cues from violation severity |
| **5 — Scale** | Frontal-plane rules enabled (JSC-KNEE-001 true valgus, JSC-SHOULDER-001); all 12 JSC constraints active |

---

## Phase 1 — Proof of Concept (Weeks 1–6)

**Duration:** 6 weeks | **Team:** 1–2 engineers | **Infra Cost:** ~$0–500/mo

**Goal:** Validate core technical assumptions with minimal code. A single-exercise demo running in a browser that produces interpretable joint angles — nothing more.

### Core Objectives

1. Run MediaPipe BlazePose in-browser via `@mediapipe/pose` on a pre-recorded squat video
2. Extract 33 keypoints per frame and log raw (x, y, z, visibility) data to console
3. Compute knee flexion angle per frame using `atan2` vector math on Hip→Knee→Ankle landmarks
4. Render skeleton overlay on HTML5 Canvas with color-coded confidence (green/red by visibility threshold 0.5)
5. Plot live knee angle graph using Chart.js or Recharts alongside video playback
6. Verify 2D sagittal accuracy is within ~10° of known ground truth by manually reviewing known depth squat clips

### Tech Stack (POC Only)

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Pose** | MediaPipe BlazePose Full via CDN WASM | No build pipeline needed |
| **Frontend** | Vanilla HTML/JS + Canvas | Eliminate framework complexity |
| **Math** | Raw JS for `atan2` vector math | No external biomechanics libs yet |
| **Charting** | Chart.js for angle time-series | Bundled from CDN |
| **Hosting** | GitHub Pages or Vercel static deploy | Zero backend |

### Week-by-Week Breakdown

| Week | Deliverable |
|------|-------------|
| **Week 1** | Environment setup. Get BlazePose running on webcam feed. Confirm FPS and landmark output format |
| **Week 2** | Implement angle computation for all 5 key squat joints (ankle, knee, hip, shoulder, trunk lean) |
| **Week 3** | Build Canvas overlay renderer. Color-code by confidence. Show skeleton lines between joint pairs |
| **Week 4** | Add video file upload and frame-by-frame processing. Synchronize angle chart with video scrubber |
| **Week 5** | Implement 4-tier severity model (warning/high_risk/critical) using thresholds from `KNOWLEDGE/movement_analysis_rules.json`. Add rep state machine (IDLE→DESCENDING→BOTTOM→ASCENDING), per-rep scoring (deduction-based, 0–100), fatigue detection (trunk lean drift + depth inconsistency), and rep history panel |
| **Week 6** | Test on 20+ squat videos from YouTube (beginner/intermediate/advanced). Document failure modes |

### Known Risks

| Severity | Risk | Detail |
|----------|------|--------|
| **HIGH** | Barbell occlusion | BlazePose frequently loses wrist/ankle keypoints when a barbell is present. Document which frames fail and at what load angle. This sets expectations for Phase 2 mitigation work. |
| **MED** | iOS Safari WebGL support | MediaPipe WASM GPU path is unreliable on iOS Safari. Confirm fallback to CPU-only BlazePose Lite works acceptably (target >12 FPS). |
| **MED** | 2D-only knee valgus | True valgus requires frontal-plane camera or 3D. The POC should explicitly scope to sagittal-only and log this as a V2 requirement. |

### Success Criteria (Gate to Phase 2)

- [x] BlazePose runs at 20+ FPS on desktop Chrome
- [x] Knee angle error <10° vs. visual inspection on 15+ clips
- [x] Depth check correct on 80%+ of labeled clips
- [x] Barbell failure modes documented with frame count
- [ ] **NOT required:** any backend, auth, or database

---

## Phase 2 — Alpha: All Three Lifts + Backend (Weeks 7–16)

**Duration:** 10 weeks | **Team:** 2–3 engineers | **Infra Cost:** ~$300–500/mo

**Goal:** Extend to squat, bench, and deadlift. Add a Python backend for server-side analysis. Build the rep counter and phase segmenter. Invite 10–20 internal testers.

### Squat — Deepen Analysis

1. Add One Euro filter to all keypoints (cutoff=6 Hz for squat cadence)
2. Implement depth check via hip crease vs. knee landmark y-coordinate delta
3. Compute hip flexion angle (Shoulder→Hip→Knee) and trunk lean vector
4. Rep counter via knee angle state machine (threshold: flexion <130° = descent, >160° = lockout)
5. Per-rep metrics: min knee angle, max trunk lean, time-under-tension

### Deadlift — New Lift

1. Implement lumbar flexion angle (hip-to-shoulder vs. horizontal baseline)
2. Bar drift proxy: horizontal delta between wrist and ankle x-coordinates across frames
3. Hip-knee extension sequence check (hips should not rise faster than shoulders off floor)
4. Lockout detection via hip and knee angle both approaching 180°
5. Handle sumo vs. conventional: classify stance by ankle width / hip width ratio at setup

### Bench Press — Scoped Version

1. Scope to sagittal view only — document frontal limitations explicitly in UI
2. Elbow depth vs. shoulder height check (elbow must drop to or below shoulder)
3. Bar path extraction from wrist trajectory — flag bar drift >3 cm laterally
4. Elbow flare angle: shoulder→elbow vector vs. torso horizontal (target 45–70°)
5. Unrack / descent / press / lockout phase labels via elbow angle state machine

### Backend — FastAPI Foundation

1. Initialize FastAPI project with `uvicorn`. Define REST endpoints: `POST /analyze`, `GET /results/{job_id}`
2. Integrate YOLOv8n-pose via Ultralytics Python SDK for server-side frame processing
3. Build FFmpeg transcoding wrapper: normalize uploads to 720p, 30 FPS, H.264 before inference
4. Implement async job queue using FastAPI BackgroundTasks (upgrade to Celery + Redis in Phase 3)
5. Return structured JSON: per-frame keypoints, per-rep metrics, violation flags, overall score 0–100
6. Store results in SQLite (PostgreSQL migration in Phase 3)
7. Basic S3 upload endpoint with presigned URL generation (AWS boto3)
8. Implement `GET /rules` and `GET /rules/{movement}` endpoints. `RulesEngine` singleton loaded at startup from `KNOWLEDGE/movement_analysis_rules.json`. Filter rules by `applies_to_movements` and camera plane. Return threshold metadata for client display and frontend validation

### Frontend — React Migration

1. ✅ Migrate from vanilla JS to React + TypeScript + Vite build pipeline
2. ✅ Component architecture: `VideoCapture`, `PoseOverlay`, `AngleDashboard`, `LiftSelector`, `RepTimeline`
3. ✅ Move BlazePose inference to Web Worker to prevent UI thread blocking
4. ✅ Camera positioning guide overlay: SVG tooltip illustrations per lift (sagittal + bench diagrams)
5. ✅ Rep-by-rep session history: localStorage persistence, session cards with sparklines, per-rep detail table, cross-session trend chart
6. ✅ Violation snapshots: JPEG frame capture on worst high_risk/critical frame per rep; glowing joint highlights; lightbox in history table
7. Feedback panel: 2–3 prioritized coaching cues per set, driven by rule-based templates (Phase 3)

### Scoring Engine — Rules Engine V1

The Phase 2 backend implements a `RulesEngine` Python class that:

1. Loads `KNOWLEDGE/movement_analysis_rules.json` at startup into a singleton
2. Filters rules by `applies_to_movements` (current lift) and plane availability (sagittal initially)
3. Evaluates per-frame angle measurements against 4-tier thresholds
4. Returns `Violation` objects: `{ rule_id, severity, metric, value, threshold, phase }`
5. Accumulates violations per-rep; scores using deduction table from `scoring` section of JSON
6. Detects fatigue via rep-over-rep drift using `fatigue_detection` rules from schema

**Sagittal-detectable rules enabled in Phase 2:**

| Rule ID | Constraint | Lifts |
|---------|-----------|-------|
| JSC-LUMBAR-001 | Lumbar flexion proxy (trunk lean vector) | All |
| JSC-LUMBAR-002 | Posterior pelvic tilt / butt wink | Squat, Front Squat |
| JSC-HIP-001 | Hip flexion at end-range | Squat, Front Squat |
| JSC-ANKLE-001 | Dorsiflexion restriction proxy | Squat |
| JSC-THORACIC-001 | Kyphosis increase proxy | All |
| EXEC-IPF-SQ-001 depth | Hip crease below knee landmark | Squat |
| EXEC-IPF-BP-001 depth | Elbow below shoulder at descent | Bench |

**Deduction table** (from `movement_analysis_rules.json` `scoring` section):
- `critical`: 25–30 pts · `high_risk`: 15–20 pts · `warning`: 5–10 pts
- One deduction per violation category per rep (worst severity wins)
- `score = clamp(100 − Σ deductions, 0, 100)`

**Score quality labels:** excellent ≥90 · good ≥75 · fair ≥55 · poor <55

**API endpoints:**
- `GET /rules/{movement}` — returns applicable rules for a lift (filtered by plane)
- `POST /analyze` response includes `violations[]` with `rule_id` for client-side rule lookup

### Success Criteria (Gate to Phase 3)

- [ ] All 3 lifts produce per-rep metrics
- [ ] Backend processes uploaded 60-sec video in <30 sec
- [ ] Rep counter ±1 rep accuracy on 90%+ of test clips
- [ ] 10 alpha testers — gather qualitative feedback
- [ ] Rule-based score correlates with coach rating (Pearson r >0.6)
- [ ] Barbell occlusion mitigation: One Euro filter reduces keypoint dropout by 40%+

---

## Phase 3 — Beta: Data, ML Scoring + Auth (Weeks 17–28)

**Duration:** 12 weeks | **Team:** 3–4 engineers | **Infra Cost:** ~$500–1,500/mo

**Goal:** Build the data flywheel, upgrade to ML scoring, add user accounts, and harden the infrastructure. Onboard 50–200 beta users. Begin proprietary dataset collection.

### Dataset Collection Pipeline

1. Build internal annotation tool: video player with frame scrubber, keypoint editor, and per-rep score field (0–10)
2. Establish annotation protocol: minimum 2 certified coaches per clip, inter-rater reliability check (Cohen's κ >0.7)
3. Begin with FLEX dataset (7,512 samples) and InfiniteRep (1,000 synthetic) for pre-training
4. Target: 500 annotated real clips per lift (squat, bench, deadlift) by end of Phase 3
5. Annotation schema: 33 keypoints + barbell (x,y) + phase labels + error flags + overall score
6. Use active learning (uncertainty sampling with initial model) to prioritize hardest clips for annotation

### ML Scoring — Gradient Boosting Layer

1. Feature engineering: per-frame angles, velocities (Δangle/Δt), variability (SD within rep), left-right symmetry, phase timing ratios. **Rules engine as primary feature source:** `RulesEngine` outputs — per-frame severity distributions, worst-severity per joint, violation counts per rep phase, timing ratios — feed directly into the feature matrix. The deterministic rule engine always runs first; XGBoost calibrates the score against coach labels on top. The 60/40 rule-based/ML weighting shifts toward ML as labeled data grows, but rule violations always remain interpretable standalone outputs alongside the ML score
2. Train XGBoost regression on annotated score labels. Baseline: 500 labeled reps per lift
3. Platt calibration to produce well-calibrated 0–100 risk probabilities
4. Fusion: blend rule-based score (60%) + XGBoost score (40%) initially. Shift weighting as data grows
5. Explainability: use SHAP values to surface top-3 contributing features per prediction for feedback generation
6. Evaluation: 5-fold cross-validation; target Pearson r >0.75 vs. coach labels

### Infrastructure Hardening

1. Migrate from SQLite to PostgreSQL (RDS). Schema: `users`, `sessions`, `videos`, `analyses`, `reps`, `keyframes`
2. Replace FastAPI BackgroundTasks with Celery + Redis for reliable async job processing
3. S3 multipart upload with direct client→S3 presigned URLs (bypass server bandwidth)
4. Upgrade GPU: single g4dn.xlarge spot (T4, ~$80/mo). Implement spot interruption handling with SQS visibility timeout
5. Add CDN (CloudFront) for static assets + processed video thumbnails
6. Implement structured logging (JSON), Sentry error tracking, basic Grafana dashboard

### User Accounts + Progress Tracking

1. Auth via Clerk or Supabase Auth (avoid building auth from scratch). JWT + refresh token pattern
2. User profile: height, weight class, current 1RMs, training age, injury history flags
3. Session history: timeline of all analyzed sets, filterable by lift and date range
4. Progress dashboard: trend charts for key metrics (avg score, knee angle variance, depth consistency)
5. Set comparison: overlay two reps on same canvas to visualize form changes over time
6. Basic notification: email summary after each session (SendGrid)

### LLM-Powered Feedback — Structured Pipeline

```
1. Biomechanical Analysis (deterministic)
   Rule engine + XGBoost → structured JSON:
   {
     lift: "squat", reps: 4, score: 62,
     violations: [
       { metric: "knee_valgus", severity: "medium", value: 12.4, threshold: 8.0 },
       { metric: "depth", severity: "low", value: "borderline", frame: 84 }
     ],
     trends: { knee_valgus_change: "+3.2° set-over-set" },
     context: { training_age: "intermediate", weight_class: "83kg" }
   }

2. LLM Feedback Generation (Claude Sonnet)
   System: "You are an elite powerlifting coach. Given biomechanical data,
            provide 2-3 specific, actionable cues. Use coaching language,
            not medical jargon. Prioritize by injury risk."
   
   Input: <above JSON + few-shot examples of good coaching cues>
   Output: Ranked cues → rendered in feedback panel

3. Feedback Rules
   - Max 3 cues per set (cognitive load limit)
   - Prioritize by injury risk (lumbar > valgus > depth > lean)
   - Never generate cues for metrics with confidence < 0.6
   - Cache identical violation patterns (reduce API cost)
```

### Success Criteria (Gate to Phase 4)

- [ ] 50+ active beta users with >3 sessions each
- [ ] ML score Pearson r >0.75 vs. coach labels
- [ ] 500+ annotated reps per lift in proprietary dataset
- [ ] System uptime >99% over 4-week window
- [ ] Video processing P95 latency <45 sec for 3-min uploads
- [ ] Net Promoter Score >40 from beta survey

---

## Phase 4 — V1 Launch: Production Grade (Weeks 29–40)

**Duration:** 12 weeks | **Team:** 4–5 engineers | **Infra Cost:** ~$1,500–4,000/mo

**Goal:** Production hardening, real-time analysis pipeline, fatigue detection, velocity tracking, and public launch. Target: 1,000+ paying users within 3 months post-launch.

### Real-Time Pipeline

1. Progressive enhancement: BlazePose Lite in-browser (instant, low-accuracy) → async server analysis (delayed, high-accuracy)
2. WebSocket endpoint for real-time frame streaming: `ws://api/stream/{session_id}`
3. Client sends 15 FPS frame stream; server returns per-frame feedback within 200 ms using YOLOv8n-pose + TensorRT
4. Graceful degradation: if server latency >200 ms, switch to local BlazePose only and queue for server catch-up
5. Audio cue system: text-to-speech for real-time coaching cues without requiring visual attention

### Velocity-Based Training (VBT)

1. Track wrist/barbell y-coordinate velocity across frames (pixels/sec → calibrated m/s using hip-to-shoulder reference height)
2. Compute mean concentric velocity and peak velocity per rep
3. Detect velocity loss across set (fatigue marker: >20% drop from rep 1 = flag)
4. Load-velocity relationship: prompt user for 1RM data; display estimated %1RM per rep
5. Sticking point detection: identify frame window where velocity is minimum during concentric

### Fatigue Detection System

1. Compute per-rep baseline stats on set 1: mean angles, angle SD, timing ratios
2. Flag when any metric drifts >2 SD from set baseline across subsequent reps
3. Specific fatigue markers: increasing lumbar flexion (+3°+ rep-over-rep), growing knee angle variability, asymmetric bar path
4. Set-over-set tracking (requires user to upload multiple sets): detect systemic fatigue across session
5. Visual: heatmap overlay on rep timeline showing fatigue progression by color gradient

### GPU Infrastructure for V1

1. Upgrade to NVIDIA L4 instances (g6.xlarge on AWS, ~$0.80/hr spot). TensorRT-optimize YOLOv8m-pose to INT8
2. Karpenter autoscaler: scale from 0 to N GPU instances based on SQS queue depth
3. Scale-to-zero during off-hours (GPU cost reduction 60–70%)
4. Separate queues for real-time (high priority, <200 ms SLA) vs. batch upload (best-effort, <120 sec SLA)
5. Multi-region deployment (US + EU) for GDPR compliance and latency

### Full Production Architecture

```
CLIENT (Browser/Mobile)
  MediaPipe BlazePose Lite (Web Worker) → instant overlay
  MediaStream API → 15 FPS WebSocket frame stream
  React + TypeScript + Vite → component tree
  Canvas 2D → skeleton + violation overlay

         ↕ HTTPS / WSS

API LAYER (FastAPI)
  /upload → S3 presigned multipart URL
  /analyze → SQS job enqueue → job_id
  /results/{id} → PostgreSQL query
  ws/stream → GPU worker proxy
  /auth → JWT validate (Clerk)

         ↕ internal

PROCESSING LAYER
  SQS Queue (batch)      Redis (real-time jobs)
       ↓                        ↓
  GPU Workers (L4)       GPU Workers (L4 spot)
  FFmpeg transcode       TensorRT YOLOv8n-pose
  YOLOv8m-pose           One Euro filter
  Butterworth filter     Per-frame JSON emit
  Phase segmentation
  (MS-TCN++)
  XGBoost scoring
  LLM feedback gen
       ↓

STORAGE
  S3 (raw + processed video, lifecycle → Glacier 90d)
  PostgreSQL/RDS (users, analyses, reps, keypoints JSONB)
  Redis (session cache, job status, feedback cache)
  CloudFront CDN (static assets, thumbnails)
```

### Success Criteria (V1 Launch)

- [ ] Real-time feedback at <200 ms server latency P95
- [ ] Batch upload processed in <2× video duration
- [ ] Uptime 99.9% SLA
- [ ] 1,000 paying users within 60 days post-launch
- [ ] GDPR + SOC 2 Type I in progress
- [ ] Velocity tracking within 5% of commercial VBT devices (Tendo, GymAware)

---

## Phase 5 — Scale: Research Grade Product (Months 10–24)

**Duration:** 14 months | **Team:** 5–8 engineers | **Infra Cost:** ~$5,000–18,000/mo

**Goal:** Domain-specific model fine-tuning, multi-camera 3D analysis, competition prep tools, coach dashboard, API offering, and team/gym features. Differentiate from all current commercial offerings.

### Domain Fine-Tuning (Months 10–13)

1. Target: 5,000 annotated powerlifting reps (1,667/lift) — use active learning to get there with 40% fewer labels
2. Fine-tune ViTPose-Base on proprietary dataset using LoRA adapters (preserve generalization)
3. Expected outcome: barbell-occlusion mean per-joint error 0.19 m → 0.098 m (per domain-adaptation literature)
4. Fine-tune YOLOv8m-pose separately for serving layer
5. A/B test fine-tuned vs. base model on holdout set; deploy only if MPJPE improves >15%
6. Retrain XGBoost scorer on 5,000+ labeled reps; shift fusion to 30% rules / 70% ML

### 3D Analysis — Dual-Camera (Months 10–15)

1. Design two-camera setup guide: sagittal (side) + frontal (front), 45° angle, synchronized via audio click or QR timestamp
2. Implement Pose2Sim pipeline for 3D triangulation: 2D poses → epipolar geometry → 3D keypoints
3. Enable true knee valgus/varus measurement (frontal plane) — the key accuracy upgrade
4. Mobile app (React Native): use front + rear camera simultaneously as approximate dual-camera rig
5. Implement camera calibration wizard: checkerboard pattern or automatic from known body segment lengths
6. 3D triangulation unlocks frontal-plane rules from `movement_analysis_rules.json` currently bypassed: JSC-KNEE-001 (true dynamic valgus), JSC-HIP-002 (lateral pelvic shift asymmetry), JSC-SHOULDER-001 (shoulder abduction on bench). All three carry `detection_priority: 1` — the highest in the schema

### Competition Prep Suite (Months 13–17)

1. IPF rule compliance checker: automatic red/white light prediction for depth, pause on bench, and press command timing
2. Peak week analysis: track form degradation under meet-week load
3. Attempt selection assistant: combines velocity data + form quality to suggest opener, second, third attempts
4. Side-by-side video comparison: current lift vs. best historical lift overlay
5. Meet day export: PDF report with all metrics for coach review

### Coach Dashboard + API (Months 17–22)

1. Coach portal: manage multiple athletes, view aggregated analytics, add manual annotations
2. Athlete sharing: generate shareable session links with embedded video + overlaid skeleton
3. REST API + webhooks for gym management software integration (TrainHeroic, Teambuildr, etc.)
4. White-label option: embed analysis widget in third-party platforms
5. Research API: anonymized dataset access for academic partners (IRB protocol)

### Data Flywheel Architecture

```
User uploads video
      ↓
Model analyzes → generates score + feedback
      ↓
User/coach rates feedback quality (thumbs up/down)
Or: coach manually corrects joint annotations in tool
      ↓
Active Learning Pipeline
  Uncertainty sampling: flag predictions where model confidence < 0.65
  Diversity sampling: ensure coverage across weight classes, mobility profiles
  Route to annotation queue → certified coach labels within 48 hrs
      ↓
Monthly Retraining Cycle
  Retrain XGBoost on new labeled reps (incremental, not full retrain)
  Quarterly: fine-tune ViTPose on accumulated domain data
  A/B test new model on 10% traffic before full deploy
  Track: MPJPE, score correlation, user satisfaction delta
```

### Competitive Differentiation

| Feature | Kemtai | CueForm.ai | AiKYNETIX | **This System (V1+)** |
|---------|--------|------------|-----------|----------------------|
| Barbell compound lifts | No | Limited | Squat/DL | **All 3 lifts** |
| Real-time feedback | Yes | No (upload only) | Yes | **Yes (<200 ms)** |
| Per-rep biomechanics data | No | Basic | Partial | **Full (angles, velocity, phases)** |
| IPF rule compliance | No | No | No | **Yes (Phase 5)** |
| Velocity-based training | No | No | No | **Yes (Phase 4)** |
| Coach dashboard + API | No | No | No | **Yes (Phase 5)** |
| Domain-fine-tuned model | No | No | Unknown | **Yes (Phase 5 — proprietary)** |

---

## Phase Summary

| Phase | Duration | Team Size | Infra Cost | Key Deliverable | Hard Dependency |
|-------|----------|-----------|------------|-----------------|-----------------|
| **1 — POC** | 6 weeks | 1–2 engineers | ~$0 | Squat angle demo in browser | BlazePose WASM works on target devices |
| **2 — Alpha** | 10 weeks | 2–3 engineers | ~$300–500/mo | All 3 lifts + FastAPI backend | T4 GPU spot instance availability |
| **3 — Beta** | 12 weeks | 3–4 engineers | ~$500–1,500/mo | ML scoring + 500 labeled reps/lift | Coach annotation bandwidth |
| **4 — V1 Launch** | 12 weeks | 4–5 engineers | ~$1,500–4,000/mo | Real-time pipeline + velocity + fatigue | L4 GPU TensorRT optimization |
| **5 — Scale** | 14 months | 5–8 engineers | ~$5,000–18,000/mo | Fine-tuned model + 3D + coach API | 5,000 annotated reps in proprietary dataset |
