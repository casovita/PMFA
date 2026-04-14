/**
 * Biomechanical angle utilities for squat analysis.
 * All inputs are MediaPipe landmark objects: { x, y, z, visibility }
 * Coordinates are normalized [0,1] relative to frame dimensions.
 *
 * Angle convention: 0° = anatomical position (full extension for joints,
 * neutral for spine). Values increase with flexion/deviation.
 *
 * Severity levels: 'warning' | 'high_risk' | 'critical'
 * (matching the four-tier model from movement_analysis_rules.json)
 *
 * Thresholds are NOT hardcoded here — they are loaded at startup from
 * KNOWLEDGE/movement_analysis_rules.json via rules.js.
 */
import { THRESHOLDS } from './rules.js';

/**
 * Compute the angle (degrees) at joint B formed by the A→B→C chain.
 * Uses atan2 so the result is always in [0, 180].
 *
 * @param {Object} a - proximal landmark
 * @param {Object} b - joint landmark (vertex)
 * @param {Object} c - distal landmark
 * @returns {number} angle in degrees, or NaN if any landmark is missing
 */
export function angleDeg(a, b, c) {
  if (!a || !b || !c) return NaN;

  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;

  const dot = abx * cbx + aby * cby;
  const cross = abx * cby - aby * cbx;

  return Math.abs(Math.atan2(Math.abs(cross), dot) * (180 / Math.PI));
}

/**
 * Extract the key squat angles from a MediaPipe pose landmark array.
 * Returns NaN for any angle where required landmarks are below the visibility
 * threshold (default 0.5).
 *
 * MediaPipe landmark indices used:
 *   11 = left shoulder, 12 = right shoulder
 *   23 = left hip,      24 = right hip
 *   25 = left knee,     26 = right knee
 *   27 = left ankle,    28 = right ankle
 *
 * @param {Array} landmarks - 33-element array from pose.onResults
 * @param {number} [visThreshold=0.5]
 * @returns {{
 *   kneeAngle: number,
 *   hipAngle: number,
 *   ankleAngle: number,
 *   trunkLean: number,
 * }}
 */
export function extractSquatAngles(landmarks, visThreshold = 0.5) {
  const lm = landmarks;

  const vis = (idx) => (lm[idx]?.visibility ?? 0) >= visThreshold ? lm[idx] : null;

  const lShoulder = vis(11);
  const lHip      = vis(23);
  const lKnee     = vis(25);
  const lAnkle    = vis(27);

  // Knee flexion: Hip → Knee → Ankle (180° = fully extended)
  const kneeAngle = angleDeg(lHip, lKnee, lAnkle);

  // Hip flexion: Shoulder → Hip → Knee
  const hipAngle = angleDeg(lShoulder, lHip, lKnee);

  // Ankle dorsiflexion proxy: Knee → Ankle → virtual point directly below ankle.
  // Convention: standing with shin vertical ≈ 180°. As the shin tilts forward
  // (dorsiflexion increases during a squat), this angle decreases toward 90°.
  // Lower value = more dorsiflexion (better mobility).
  const ankleAngle = lAnkle && lKnee
    ? angleDeg(lKnee, lAnkle, { x: lAnkle.x, y: lAnkle.y + 0.1 })
    : NaN;

  // Trunk lean: angle of Hip→Shoulder vector from vertical (0° = perfectly upright)
  const trunkLean = lHip && lShoulder
    ? Math.abs(
        Math.atan2(lShoulder.x - lHip.x, lHip.y - lShoulder.y) * (180 / Math.PI)
      )
    : NaN;

  return { kneeAngle, hipAngle, ankleAngle, trunkLean };
}

/**
 * Rule-based squat violation checks for a single frame.
 * Uses evidence-based thresholds from movement_analysis_rules.json (JSC entries).
 *
 * @param {{kneeAngle: number, hipAngle: number, ankleAngle: number, trunkLean: number}} angles
 * @param {Array} landmarks
 * @param {number} [visThreshold=0.5]
 * @param {'IDLE'|'DESCENDING'|'BOTTOM'|'ASCENDING'} [repPhase='IDLE']
 * @returns {Array<{type: string, severity: 'warning'|'high_risk'|'critical', message: string}>}
 */
export function checkSquatViolations(angles, landmarks, visThreshold = 0.5, repPhase = 'IDLE') {
  const violations = [];
  const lm = landmarks;

  const vis = (idx) => (lm[idx]?.visibility ?? 0) >= visThreshold ? lm[idx] : null;

  const lHip   = vis(23);
  const lKnee  = vis(25);
  const lAnkle = vis(27);

  // ── 1. Depth (JSC: EXEC-IPF-SQ-001 depth_requirement) ────────────────────────
  // Hip crease must be at or below knee (y increases downward in MediaPipe).
  // hip.y >= knee.y means hip is lower = good.
  if (lHip && lKnee) {
    const delta = lHip.y - lKnee.y; // positive = good (hip below knee)
    if (delta < THRESHOLDS.depth.critical) {
      violations.push({
        type: 'depth',
        severity: 'critical',
        message: `Insufficient depth — hip ${Math.abs(delta * 100).toFixed(1)}% above knee`,
      });
    } else if (delta < THRESHOLDS.depth.high_risk) {
      violations.push({
        type: 'depth',
        severity: 'high_risk',
        message: `Depth short — hip crease ${Math.abs(delta * 100).toFixed(1)}% above knee`,
      });
    }
  }

  // ── 2. Trunk lean — high-bar squat (JSC-LUMBAR-001 proxy) ────────────────────
  if (!isNaN(angles.trunkLean)) {
    const tl = angles.trunkLean;
    if (tl > THRESHOLDS.trunkLean.critical) {
      violations.push({
        type: 'trunk_lean',
        severity: 'critical',
        message: `Excessive trunk lean — ${tl.toFixed(1)}° (stop immediately)`,
      });
    } else if (tl > THRESHOLDS.trunkLean.high_risk) {
      violations.push({
        type: 'trunk_lean',
        severity: 'high_risk',
        message: `High trunk lean — ${tl.toFixed(1)}° (reduce load)`,
      });
    } else if (tl > THRESHOLDS.trunkLean.warning) {
      violations.push({
        type: 'trunk_lean',
        severity: 'warning',
        message: `Elevated trunk lean — ${tl.toFixed(1)}°`,
      });
    }
  }

  // ── 3. Knee valgus proxy — 2D sagittal (JSC-KNEE-001) ────────────────────────
  // Medial knee collapse: knee x > ankle x on left side.
  // Note: true valgus requires frontal-plane camera; this is a 2D proxy only.
  if (lKnee && lAnkle) {
    const valgus = (lKnee.x - lAnkle.x) * 100;
    if (valgus > THRESHOLDS.kneeValgus.critical) {
      violations.push({
        type: 'knee_valgus',
        severity: 'critical',
        message: `Severe knee valgus — ${valgus.toFixed(1)}% inward shift`,
      });
    } else if (valgus > THRESHOLDS.kneeValgus.high_risk) {
      violations.push({
        type: 'knee_valgus',
        severity: 'high_risk',
        message: `Knee valgus — ${valgus.toFixed(1)}% inward shift (reduce load)`,
      });
    } else if (valgus > THRESHOLDS.kneeValgus.warning) {
      violations.push({
        type: 'knee_valgus',
        severity: 'warning',
        message: `Mild knee valgus — ${valgus.toFixed(1)}% inward shift`,
      });
    }
  }

  // ── 4. Ankle dorsiflexion (JSC-ANKLE-001) ─────────────────────────────────────
  // Only meaningful during the descent or bottom of the squat.
  // ankleAngle convention: standing ≈ 180°, decreases as shin tilts forward.
  // Higher ankleAngle = more restricted dorsiflexion.
  // Thresholds are approximate — empirical calibration recommended.
  //   warning   > 140° ≈ limited dorsiflexion (< ~25°)
  //   high_risk > 150° ≈ restricted (< ~15°)
  //   critical  > 160° ≈ severely restricted (< ~10°)
  if (!isNaN(angles.ankleAngle) &&
      (repPhase === 'DESCENDING' || repPhase === 'BOTTOM')) {
    const aa = angles.ankleAngle;
    if (aa > THRESHOLDS.ankle.critical) {
      violations.push({
        type: 'ankle_dorsiflexion',
        severity: 'critical',
        message: `Severely restricted ankle mobility (${aa.toFixed(1)}°) — consider heel elevation`,
      });
    } else if (aa > THRESHOLDS.ankle.high_risk) {
      violations.push({
        type: 'ankle_dorsiflexion',
        severity: 'high_risk',
        message: `Limited ankle dorsiflexion (${aa.toFixed(1)}°)`,
      });
    } else if (aa > THRESHOLDS.ankle.warning) {
      violations.push({
        type: 'ankle_dorsiflexion',
        severity: 'warning',
        message: `Borderline ankle mobility (${aa.toFixed(1)}°)`,
      });
    }
  }

  // ── 5. Butt wink proxy (JSC-LUMBAR-002) ──────────────────────────────────────
  // Approximate: deep hip flexion (hipAngle > 135°) combined with elevated trunk
  // lean suggests posterior pelvic tilt transferring load to lumbar spine.
  // Only relevant at depth.
  if ((repPhase === 'DESCENDING' || repPhase === 'BOTTOM') &&
      !isNaN(angles.hipAngle) && !isNaN(angles.trunkLean)) {
    const { hipAngle_warning, hipAngle_high_risk, trunkLean_min } = THRESHOLDS.buttWink;
    if (angles.hipAngle > hipAngle_warning && angles.trunkLean > trunkLean_min) {
      violations.push({
        type: 'butt_wink',
        severity: angles.hipAngle > hipAngle_high_risk ? 'high_risk' : 'warning',
        message: `Possible butt wink — hip ${angles.hipAngle.toFixed(1)}°, trunk lean ${angles.trunkLean.toFixed(1)}°`,
      });
    }
  }

  return violations;
}

// ── Rep State Machine ─────────────────────────────────────────────────────────

/**
 * Create the initial rep state object. Pass to updateRepStateMachine each frame.
 *
 * @returns {{
 *   phase: string,
 *   repCount: number,
 *   baselineKneeAngle: number|null,
 *   baselineBuffer: number[],
 *   angleBuffer: number[],
 *   currentRepData: Object|null,
 *   repHistory: Object[]
 * }}
 */
export function createRepState() {
  return {
    phase: 'IDLE',            // 'IDLE' | 'DESCENDING' | 'BOTTOM' | 'ASCENDING'
    repCount: 0,
    baselineKneeAngle: null,  // standing knee angle baseline
    baselineBuffer: [],       // accumulates near-extended frames to set baseline
    angleBuffer: [],          // short buffer for local-minimum detection
    currentRepData: null,
    repHistory: [],
  };
}

/**
 * Advance the rep state machine by one frame.
 * Call BEFORE checkSquatViolations so repPhase is current when checking violations.
 *
 * @param {Object} state       - mutable state from createRepState()
 * @param {number} kneeAngle   - current frame knee angle (degrees)
 * @param {{trunkLean: number}} frameAngles
 * @param {number} frameTime   - current time in seconds
 * @returns {{ completedRep: Object|null }}
 *   completedRep is non-null when a rep just finished (ASCENDING→IDLE transition).
 */
export function updateRepStateMachine(state, kneeAngle, frameAngles, frameTime) {
  if (isNaN(kneeAngle)) return { completedRep: null };

  let completedRep = null;

  switch (state.phase) {
    case 'IDLE': {
      // Build baseline only from near-standing positions to avoid mid-squat init
      if (kneeAngle > 140) {
        state.baselineBuffer.push(kneeAngle);
        if (state.baselineBuffer.length >= 10) {
          state.baselineKneeAngle =
            state.baselineBuffer.reduce((a, b) => a + b, 0) / state.baselineBuffer.length;
          // Keep buffer capped so a long standing period stays fresh
          if (state.baselineBuffer.length > 30) state.baselineBuffer.shift();
        }
      }
      // Transition to DESCENDING once knee flexes 25° below standing baseline
      if (state.baselineKneeAngle !== null &&
          kneeAngle < state.baselineKneeAngle - 25) {
        state.phase = 'DESCENDING';
        state.currentRepData = {
          startTime: frameTime,
          endTime: null,
          bottomTime: null,
          minKneeAngle: kneeAngle,
          maxTrunkLean: isNaN(frameAngles.trunkLean) ? 0 : frameAngles.trunkLean,
          timeUnderTension: 0,
          violations: [],
          repNumber: null,
          score: null,
        };
      }
      break;
    }

    case 'DESCENDING': {
      if (kneeAngle < state.currentRepData.minKneeAngle)
        state.currentRepData.minKneeAngle = kneeAngle;
      if (!isNaN(frameAngles.trunkLean) &&
          frameAngles.trunkLean > state.currentRepData.maxTrunkLean)
        state.currentRepData.maxTrunkLean = frameAngles.trunkLean;

      // Detect local minimum: must be below 100° and rising for ≥4 frames
      if (kneeAngle < 100) {
        state.angleBuffer.push(kneeAngle);
        if (state.angleBuffer.length > 5) state.angleBuffer.shift();
        const rising =
          state.angleBuffer.length >= 4 &&
          state.angleBuffer[state.angleBuffer.length - 1] > state.angleBuffer[0];
        if (rising) {
          state.phase = 'BOTTOM';
          state.currentRepData.bottomTime = frameTime;
        }
      }
      break;
    }

    case 'BOTTOM': {
      if (!isNaN(frameAngles.trunkLean) &&
          frameAngles.trunkLean > state.currentRepData.maxTrunkLean)
        state.currentRepData.maxTrunkLean = frameAngles.trunkLean;
      // Transition to ASCENDING once angle rises 5° above the minimum
      if (kneeAngle > state.currentRepData.minKneeAngle + 5)
        state.phase = 'ASCENDING';
      break;
    }

    case 'ASCENDING': {
      if (!isNaN(frameAngles.trunkLean) &&
          frameAngles.trunkLean > state.currentRepData.maxTrunkLean)
        state.currentRepData.maxTrunkLean = frameAngles.trunkLean;
      // Transition to IDLE when knee returns to within 20° of standing baseline
      if (state.baselineKneeAngle !== null &&
          kneeAngle >= state.baselineKneeAngle - 20) {
        state.phase = 'IDLE';
        state.currentRepData.endTime = frameTime;
        state.currentRepData.timeUnderTension =
          state.currentRepData.endTime - state.currentRepData.startTime;
        state.repCount += 1;
        state.currentRepData.repNumber = state.repCount;
        completedRep = { ...state.currentRepData };
        state.repHistory.push(completedRep);
        state.currentRepData = null;
        state.angleBuffer = [];
        state.baselineKneeAngle = kneeAngle; // refresh baseline with current lockout angle
      }
      break;
    }
  }

  return { completedRep };
}

/**
 * Accumulate per-frame violations into the active rep's violation list.
 * Call immediately after checkSquatViolations, before the frame data push.
 *
 * @param {Object} state
 * @param {Array} violations
 */
export function accumulateViolationsToCurrentRep(state, violations) {
  if (state.currentRepData && violations.length > 0) {
    state.currentRepData.violations.push(...violations);
  }
}

// ── Per-rep Scoring ───────────────────────────────────────────────────────────

/**
 * Score a completed rep 0–100 based on its worst violation per category.
 * Deductions are taken once per category using the worst-severity instance.
 *
 * @param {Object} repData - completed rep from the state machine
 * @returns {number} integer score 0–100
 */
export function scoreRep(repData) {
  const SEVERITY_RANK = { critical: 4, high_risk: 3, warning: 2 };
  const DEDUCTIONS = {
    depth:              { critical: 30, high_risk: 20, warning: 10 },
    trunk_lean:         { critical: 25, high_risk: 15, warning: 8  },
    knee_valgus:        { critical: 30, high_risk: 20, warning: 10 },
    ankle_dorsiflexion: { critical: 15, high_risk: 10, warning: 5  },
    butt_wink:          { critical: 20, high_risk: 12, warning: 5  },
  };

  // Keep only the worst severity per violation type
  const worst = {};
  for (const v of repData.violations) {
    if (!worst[v.type] || SEVERITY_RANK[v.severity] > SEVERITY_RANK[worst[v.type]])
      worst[v.type] = v.severity;
  }

  let score = 100;
  for (const [type, severity] of Object.entries(worst)) {
    score -= DEDUCTIONS[type]?.[severity] ?? 0;
  }
  return Math.max(0, score);
}

/**
 * Map a numeric score to a CSS quality label.
 *
 * @param {number} score
 * @returns {'excellent'|'good'|'fair'|'poor'}
 */
export function scoreQuality(score) {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 55) return 'fair';
  return 'poor';
}

// ── Fatigue Detection ─────────────────────────────────────────────────────────

/**
 * Compare the most recently completed rep to the first rep and the previous rep
 * to detect fatigue-driven form degradation.
 *
 * @param {Object[]} repHistory - all completed reps (must have ≥2 entries)
 * @returns {Array<{severity: string, message: string}>}
 */
export function checkFatigue(repHistory) {
  if (repHistory.length < 2) return [];

  const baseline = repHistory[0];
  const prev     = repHistory[repHistory.length - 2];
  const curr     = repHistory[repHistory.length - 1];
  const alerts   = [];

  // Trunk lean drift from rep 1 (JSC fatigue: >10° warning, >12° high_risk)
  const trunkDrift = curr.maxTrunkLean - baseline.maxTrunkLean;
  if (trunkDrift > 12) {
    alerts.push({
      severity: 'high_risk',
      message: `Trunk lean drifted +${trunkDrift.toFixed(1)}° from rep 1 — reduce load`,
    });
  } else if (trunkDrift > 10) {
    alerts.push({
      severity: 'warning',
      message: `Trunk lean increasing +${trunkDrift.toFixed(1)}° from rep 1`,
    });
  }

  // Depth consistency: consecutive rep knee angle should not vary by >5° (FAT-005)
  const depthDiff = Math.abs(curr.minKneeAngle - prev.minKneeAngle);
  if (depthDiff > 5) {
    alerts.push({
      severity: 'warning',
      message: `Depth inconsistency — ${depthDiff.toFixed(1)}° knee angle change vs prev rep`,
    });
  }

  // Sudden trunk lean spike vs previous rep (FAT-007 — discontinuous flexion event)
  const spike = curr.maxTrunkLean - prev.maxTrunkLean;
  if (spike > 15) {
    alerts.push({
      severity: 'critical',
      message: `Sudden trunk lean spike +${spike.toFixed(1)}° — stop immediately`,
    });
  }

  return alerts;
}
