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
- `frontend/poc/` — full vanilla JS + Canvas POC
  - `angles.js` — `atan2` angle math for knee, hip, ankle, trunk lean; violation checker
  - `renderer.js` — BlazePose skeleton overlay, confidence color-coding, angle label
  - `chart.js` — Chart.js knee angle time-series with live playhead
  - `main.js` — two modes: video upload (play/pause/scrubber) + live webcam (getUserMedia, wall-clock time, stop button)
  - `sound.js` — Web Audio API radar beeps; pitch and rate scale with danger proximity; mutable
  - `rules.js` — fetches `KNOWLEDGE/movement_analysis_rules.json` at startup; exposes `THRESHOLDS` consumed by angles.js; falls back to defaults if JSON unreachable
  - `index.html` / `style.css` — dark-theme UI, video + overlay layout, violation panel
- `KNOWLEDGE/movement_analysis_rules.json` — canonical ruleset (JSC constraints, execution standards, scoring)
- `frontend/poc/package.json` — `npm run dev` serves repo root on port 5173
- `.gitignore`, `CLAUDE.md` — project scaffolding

### To Run
```bash
cd frontend/poc
npm install
npm run dev
# → http://localhost:5173/frontend/poc/   (server root = repo root so /KNOWLEDGE/ is reachable)
```

### Success Criteria
- [ ] BlazePose runs at 20+ FPS on desktop Chrome
- [ ] Knee angle error <10° vs. visual inspection on 15+ clips
- [ ] Depth check correct on 80%+ of labeled clips
- [ ] Barbell failure modes documented

---

## Phase 2 — Alpha (Weeks 7–16)
**Status:** Not Started

---

## Phase 3 — Beta (Weeks 17–28)
**Status:** Not Started

---

## Phase 4 — V1 Launch (Weeks 29–40)
**Status:** Not Started

---

## Phase 5 — Scale (Months 10–24)
**Status:** Not Started
