/**
 * Biomechanical angle utilities — TypeScript port of the POC angles.js.
 * All inputs are MediaPipe Landmark objects: { x, y, z, visibility }
 * Coordinates are normalized [0,1] relative to frame dimensions.
 */

import type {
  Landmark,
  LiftType,
  SquatAngles,
  DeadliftAngles,
  BenchAngles,
  RepPhase,
  RepState,
  RepData,
  Violation,
} from '../types';
import { THRESHOLDS } from './rules';

// ── Vector math ───────────────────────────────────────────────────────────────

/**
 * Angle (degrees) at joint B in the A→B→C chain. Always in [0, 180].
 */
export function angleDeg(a: Landmark, b: Landmark, c: Landmark): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;

  const dot = abx * cbx + aby * cby;
  const cross = abx * cby - aby * cbx;

  return Math.abs(Math.atan2(Math.abs(cross), dot) * (180 / Math.PI));
}

// ── Rep state machine config ──────────────────────────────────────────────────

export interface RepMachineConfig {
  /** Minimum primary angle to count toward baseline (athlete standing/at lockout). */
  idleAngleMin: number;
  /** Drop from baseline to trigger DESCENDING transition. */
  descentTriggerDrop: number;
  /** Primary angle must be below this to enter BOTTOM detection. */
  bottomMaxAngle: number;
  /** Gap below baseline when returning counts as completing the rep. */
  returnGap: number;
}

export const SQUAT_CONFIG: RepMachineConfig = {
  idleAngleMin: 140,
  descentTriggerDrop: 25,
  bottomMaxAngle: 100,
  returnGap: 20,
};

export const DEADLIFT_CONFIG: RepMachineConfig = {
  idleAngleMin: 150,
  descentTriggerDrop: 25,
  bottomMaxAngle: 120,
  returnGap: 20,
};

export const BENCH_CONFIG: RepMachineConfig = {
  idleAngleMin: 140,
  descentTriggerDrop: 25,
  bottomMaxAngle: 90,
  returnGap: 20,
};

// ── Squat angles ──────────────────────────────────────────────────────────────

/**
 * MediaPipe landmark indices used across lifts:
 *   11 left shoulder, 12 right shoulder
 *   13 left elbow,    14 right elbow
 *   15 left wrist,    16 right wrist
 *   23 left hip,      24 right hip
 *   25 left knee,     26 right knee
 *   27 left ankle,    28 right ankle
 */
export function extractSquatAngles(
  landmarks: Landmark[],
  visThreshold = 0.5,
): SquatAngles {
  const vis = (idx: number): Landmark | null =>
    (landmarks[idx]?.visibility ?? 0) >= visThreshold ? landmarks[idx] : null;

  const lShoulder = vis(11);
  const lHip      = vis(23);
  const lKnee     = vis(25);
  const lAnkle    = vis(27);

  const kneeAngle =
    lHip && lKnee && lAnkle ? angleDeg(lHip, lKnee, lAnkle) : NaN;

  const hipAngle =
    lShoulder && lHip && lKnee ? angleDeg(lShoulder, lHip, lKnee) : NaN;

  const ankleAngle =
    lAnkle && lKnee
      ? angleDeg(lKnee, lAnkle, { x: lAnkle.x, y: lAnkle.y + 0.1, z: 0, visibility: 1 })
      : NaN;

  const trunkLean =
    lHip && lShoulder
      ? Math.abs(
          Math.atan2(lShoulder.x - lHip.x, lHip.y - lShoulder.y) * (180 / Math.PI),
        )
      : NaN;

  return { kneeAngle, hipAngle, ankleAngle, trunkLean };
}

// ── Deadlift angles ───────────────────────────────────────────────────────────

export function extractDeadliftAngles(
  landmarks: Landmark[],
  visThreshold = 0.5,
): DeadliftAngles {
  const vis = (idx: number): Landmark | null =>
    (landmarks[idx]?.visibility ?? 0) >= visThreshold ? landmarks[idx] : null;

  const lShoulder = vis(11);
  const lHip      = vis(23);
  const lKnee     = vis(25);
  const lAnkle    = vis(27);
  const lWrist    = vis(15);

  // Hip angle (shoulder→hip→knee): ~170° standing, ~80–110° at floor setup.
  // This is the primary rep-tracking angle for deadlift.
  const hipAngle =
    lShoulder && lHip && lKnee ? angleDeg(lShoulder, lHip, lKnee) : NaN;

  // Trunk lean from vertical (0° = upright, increases as lifter bends forward).
  const trunkLean =
    lHip && lShoulder
      ? Math.abs(
          Math.atan2(lShoulder.x - lHip.x, lHip.y - lShoulder.y) * (180 / Math.PI),
        )
      : NaN;

  // Bar drift proxy: horizontal offset of wrist vs ankle (% of frame width).
  // Near zero = bar stays over mid-foot; large positive/negative = bar drifting.
  const barDrift =
    lWrist && lAnkle ? (lWrist.x - lAnkle.x) * 100 : NaN;

  return { hipAngle, trunkLean, barDrift };
}

// ── Bench press angles ────────────────────────────────────────────────────────

export function extractBenchAngles(
  landmarks: Landmark[],
  visThreshold = 0.5,
): BenchAngles {
  const vis = (idx: number): Landmark | null =>
    (landmarks[idx]?.visibility ?? 0) >= visThreshold ? landmarks[idx] : null;

  const lShoulder = vis(11);
  const lElbow    = vis(13);
  const lWrist    = vis(15);
  const lHip      = vis(23);

  // Elbow angle (shoulder→elbow→wrist): ~170° at lockout, ~60–90° at chest.
  const elbowAngle =
    lShoulder && lElbow && lWrist ? angleDeg(lShoulder, lElbow, lWrist) : NaN;

  // Elbow flare: angle of shoulder→elbow vector vs torso horizontal.
  // Target range: 45–70° from torso for powerlifting tuck.
  const elbowFlare =
    lShoulder && lElbow && lHip
      ? (() => {
          // Torso vector: shoulder → hip (defines the body's long axis)
          const torsoDy = lHip.y - lShoulder.y;
          const torsoDx = lHip.x - lShoulder.x;
          // Elbow vector from shoulder
          const elbowDy = lElbow.y - lShoulder.y;
          const elbowDx = lElbow.x - lShoulder.x;
          // Angle between vectors
          const dot = torsoDx * elbowDx + torsoDy * elbowDy;
          const cross = torsoDx * elbowDy - torsoDy * elbowDx;
          return Math.abs(Math.atan2(Math.abs(cross), dot) * (180 / Math.PI));
        })()
      : NaN;

  // Trunk lean for bench is the arch/body-angle proxy (shoulder height vs hip).
  // In sagittal view with lifter lying down, we use the vertical displacement
  // of shoulder relative to hip as a proxy for arch quality.
  const trunkLean =
    lHip && lShoulder
      ? Math.abs(
          Math.atan2(lShoulder.x - lHip.x, lHip.y - lShoulder.y) * (180 / Math.PI),
        )
      : NaN;

  return { elbowAngle, elbowFlare, trunkLean };
}

// ── Squat violations ──────────────────────────────────────────────────────────

export function checkSquatViolations(
  angles: SquatAngles,
  landmarks: Landmark[],
  visThreshold = 0.5,
  repPhase: RepPhase = 'IDLE',
): Violation[] {
  const violations: Violation[] = [];

  const vis = (idx: number): Landmark | null =>
    (landmarks[idx]?.visibility ?? 0) >= visThreshold ? landmarks[idx] : null;

  const lHip   = vis(23);
  const lKnee  = vis(25);
  const lAnkle = vis(27);

  // 1. Depth (EXEC-IPF-SQ-001)
  if (lHip && lKnee) {
    const delta = lHip.y - lKnee.y;
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

  // 2. Trunk lean (JSC-LUMBAR-001 proxy)
  if (!isNaN(angles.trunkLean)) {
    const tl = angles.trunkLean;
    if (tl > THRESHOLDS.trunkLean.critical) {
      violations.push({ type: 'trunk_lean', severity: 'critical', message: `Excessive trunk lean — ${tl.toFixed(1)}° (stop immediately)` });
    } else if (tl > THRESHOLDS.trunkLean.high_risk) {
      violations.push({ type: 'trunk_lean', severity: 'high_risk', message: `High trunk lean — ${tl.toFixed(1)}° (reduce load)` });
    } else if (tl > THRESHOLDS.trunkLean.warning) {
      violations.push({ type: 'trunk_lean', severity: 'warning', message: `Elevated trunk lean — ${tl.toFixed(1)}°` });
    }
  }

  // 3. Knee valgus proxy (JSC-KNEE-001) — 2D sagittal only
  if (lKnee && lAnkle) {
    const valgus = (lKnee.x - lAnkle.x) * 100;
    if (valgus > THRESHOLDS.kneeValgus.critical) {
      violations.push({ type: 'knee_valgus', severity: 'critical', message: `Severe knee valgus — ${valgus.toFixed(1)}% inward shift` });
    } else if (valgus > THRESHOLDS.kneeValgus.high_risk) {
      violations.push({ type: 'knee_valgus', severity: 'high_risk', message: `Knee valgus — ${valgus.toFixed(1)}% inward shift (reduce load)` });
    } else if (valgus > THRESHOLDS.kneeValgus.warning) {
      violations.push({ type: 'knee_valgus', severity: 'warning', message: `Mild knee valgus — ${valgus.toFixed(1)}% inward shift` });
    }
  }

  // 4. Ankle dorsiflexion (JSC-ANKLE-001) — only at depth
  if (!isNaN(angles.ankleAngle) && (repPhase === 'DESCENDING' || repPhase === 'BOTTOM')) {
    const aa = angles.ankleAngle;
    if (aa > THRESHOLDS.ankle.critical) {
      violations.push({ type: 'ankle_dorsiflexion', severity: 'critical', message: `Severely restricted ankle mobility (${aa.toFixed(1)}°)` });
    } else if (aa > THRESHOLDS.ankle.high_risk) {
      violations.push({ type: 'ankle_dorsiflexion', severity: 'high_risk', message: `Limited ankle dorsiflexion (${aa.toFixed(1)}°)` });
    } else if (aa > THRESHOLDS.ankle.warning) {
      violations.push({ type: 'ankle_dorsiflexion', severity: 'warning', message: `Borderline ankle mobility (${aa.toFixed(1)}°)` });
    }
  }

  // 5. Butt wink proxy (JSC-LUMBAR-002)
  if (
    (repPhase === 'DESCENDING' || repPhase === 'BOTTOM') &&
    !isNaN(angles.hipAngle) &&
    !isNaN(angles.trunkLean)
  ) {
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

// ── Deadlift violations ───────────────────────────────────────────────────────

export function checkDeadliftViolations(
  angles: DeadliftAngles,
  _landmarks: Landmark[],
  _visThreshold = 0.5,
  repPhase: RepPhase = 'IDLE',
): Violation[] {
  const violations: Violation[] = [];

  // 1. Lumbar flexion (JSC-LUMBAR-001): excessive forward lean during pull
  if (!isNaN(angles.trunkLean) && (repPhase === 'ASCENDING' || repPhase === 'BOTTOM')) {
    const tl = angles.trunkLean;
    // Deadlift allows more forward lean than squat — thresholds are looser
    if (tl > THRESHOLDS.trunkLean.critical + 10) {
      violations.push({ type: 'lumbar_flexion', severity: 'critical', message: `Excessive back rounding — ${tl.toFixed(1)}° lean (stop immediately)` });
    } else if (tl > THRESHOLDS.trunkLean.high_risk + 10) {
      violations.push({ type: 'lumbar_flexion', severity: 'high_risk', message: `Significant back rounding — ${tl.toFixed(1)}° lean (reduce load)` });
    } else if (tl > THRESHOLDS.trunkLean.warning + 10) {
      violations.push({ type: 'lumbar_flexion', severity: 'warning', message: `Elevated forward lean — ${tl.toFixed(1)}°` });
    }
  }

  // 2. Bar drift: wrist drifting away from the ankle (over mid-foot)
  if (!isNaN(angles.barDrift) && (repPhase === 'ASCENDING' || repPhase === 'DESCENDING')) {
    const drift = Math.abs(angles.barDrift);
    if (drift > 15) {
      violations.push({ type: 'bar_drift', severity: 'high_risk', message: `Bar drifting forward — ${drift.toFixed(1)}% from mid-foot (reduce load)` });
    } else if (drift > 8) {
      violations.push({ type: 'bar_drift', severity: 'warning', message: `Bar path deviation — ${drift.toFixed(1)}% from mid-foot` });
    }
  }

  // 3. Hip lockout check: flag if lift ends without full hip extension
  if (!isNaN(angles.hipAngle) && repPhase === 'ASCENDING') {
    if (angles.hipAngle < 150) {
      violations.push({ type: 'hip_lockout', severity: 'warning', message: `Incomplete hip extension at top — ${angles.hipAngle.toFixed(1)}°` });
    }
  }

  return violations;
}

// ── Bench violations ──────────────────────────────────────────────────────────

export function checkBenchViolations(
  angles: BenchAngles,
  landmarks: Landmark[],
  visThreshold = 0.5,
  repPhase: RepPhase = 'IDLE',
): Violation[] {
  const violations: Violation[] = [];

  const vis = (idx: number): Landmark | null =>
    (landmarks[idx]?.visibility ?? 0) >= visThreshold ? landmarks[idx] : null;

  const lShoulder = vis(11);
  const lElbow    = vis(13);

  // 1. Elbow depth (EXEC-IPF-BP-001): elbow must drop to or below shoulder
  if (lShoulder && lElbow && repPhase === 'BOTTOM') {
    // In image coords, y increases downward. Elbow "below" shoulder = lElbow.y > lShoulder.y
    const delta = lElbow.y - lShoulder.y;
    if (delta < -0.02) {
      violations.push({ type: 'elbow_depth', severity: 'high_risk', message: `Elbow above shoulder at bottom — bar not reaching chest depth` });
    }
  }

  // 2. Elbow flare (JSC-SHOULDER-001 proxy)
  if (!isNaN(angles.elbowFlare) && (repPhase === 'DESCENDING' || repPhase === 'BOTTOM')) {
    const flare = angles.elbowFlare;
    // Powerlifting tuck target: 45–70°. Above 75° risks shoulder impingement.
    if (flare > 80) {
      violations.push({ type: 'elbow_flare', severity: 'high_risk', message: `Excessive elbow flare — ${flare.toFixed(1)}° (shoulder risk, tuck elbows)` });
    } else if (flare > 70) {
      violations.push({ type: 'elbow_flare', severity: 'warning', message: `Elbow flare elevated — ${flare.toFixed(1)}° (aim for 45–70°)` });
    }
  }

  // 3. Incomplete lockout at top
  if (!isNaN(angles.elbowAngle) && repPhase === 'ASCENDING') {
    if (angles.elbowAngle < 155) {
      violations.push({ type: 'lockout', severity: 'warning', message: `Incomplete elbow lockout — ${angles.elbowAngle.toFixed(1)}°` });
    }
  }

  return violations;
}

// ── Shared rep state machine ──────────────────────────────────────────────────

export function createRepState(): RepState {
  return {
    phase: 'IDLE',
    repCount: 0,
    baselinePrimaryAngle: null,
    baselineBuffer: [],
    angleBuffer: [],
    currentRepData: null,
    repHistory: [],
  };
}

export function updateRepStateMachine(
  state: RepState,
  primaryAngle: number,
  trunkLean: number,
  frameTime: number,
  lift: LiftType,
  config: RepMachineConfig,
): { completedRep: RepData | null } {
  if (isNaN(primaryAngle)) return { completedRep: null };

  let completedRep: RepData | null = null;

  switch (state.phase) {
    case 'IDLE': {
      if (primaryAngle > config.idleAngleMin) {
        state.baselineBuffer.push(primaryAngle);
        if (state.baselineBuffer.length >= 10) {
          state.baselinePrimaryAngle =
            state.baselineBuffer.reduce((a, b) => a + b, 0) / state.baselineBuffer.length;
          if (state.baselineBuffer.length > 30) state.baselineBuffer.shift();
        }
      }
      if (
        state.baselinePrimaryAngle !== null &&
        primaryAngle < state.baselinePrimaryAngle - config.descentTriggerDrop
      ) {
        state.phase = 'DESCENDING';
        state.currentRepData = {
          lift,
          startTime: frameTime,
          endTime: 0,
          bottomTime: null,
          primaryAngle,
          maxTrunkLean: isNaN(trunkLean) ? 0 : trunkLean,
          timeUnderTension: 0,
          violations: [],
          repNumber: null,
          score: null,
        };
      }
      break;
    }

    case 'DESCENDING': {
      if (!state.currentRepData) break;
      if (primaryAngle < state.currentRepData.primaryAngle)
        state.currentRepData.primaryAngle = primaryAngle;
      if (!isNaN(trunkLean) && trunkLean > state.currentRepData.maxTrunkLean)
        state.currentRepData.maxTrunkLean = trunkLean;

      if (primaryAngle < config.bottomMaxAngle) {
        state.angleBuffer.push(primaryAngle);
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
      if (!state.currentRepData) break;
      if (!isNaN(trunkLean) && trunkLean > state.currentRepData.maxTrunkLean)
        state.currentRepData.maxTrunkLean = trunkLean;
      if (primaryAngle > state.currentRepData.primaryAngle + 5)
        state.phase = 'ASCENDING';
      break;
    }

    case 'ASCENDING': {
      if (!state.currentRepData) break;
      if (!isNaN(trunkLean) && trunkLean > state.currentRepData.maxTrunkLean)
        state.currentRepData.maxTrunkLean = trunkLean;
      if (
        state.baselinePrimaryAngle !== null &&
        primaryAngle >= state.baselinePrimaryAngle - config.returnGap
      ) {
        state.phase = 'IDLE';
        state.repCount += 1;
        const finished: RepData = {
          ...state.currentRepData,
          endTime: frameTime,
          timeUnderTension: frameTime - state.currentRepData.startTime,
          repNumber: state.repCount,
          score: null,
        };
        completedRep = finished;
        state.repHistory.push(finished);
        state.currentRepData = null;
        state.angleBuffer = [];
        state.baselinePrimaryAngle = primaryAngle;
      }
      break;
    }
  }

  return { completedRep };
}

export function accumulateViolationsToCurrentRep(state: RepState, violations: Violation[]): void {
  if (state.currentRepData && violations.length > 0) {
    state.currentRepData.violations.push(...violations);
  }
}

// ── Scoring ───────────────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<string, number> = { critical: 4, high_risk: 3, warning: 2 };

const DEDUCTIONS: Record<string, Record<string, number>> = {
  // Squat
  depth:              { critical: 30, high_risk: 20, warning: 10 },
  trunk_lean:         { critical: 25, high_risk: 15, warning: 8 },
  knee_valgus:        { critical: 30, high_risk: 20, warning: 10 },
  ankle_dorsiflexion: { critical: 15, high_risk: 10, warning: 5 },
  butt_wink:          { critical: 20, high_risk: 12, warning: 5 },
  // Deadlift
  lumbar_flexion:     { critical: 30, high_risk: 20, warning: 8 },
  bar_drift:          { critical: 20, high_risk: 15, warning: 8 },
  hip_lockout:        { critical: 15, high_risk: 10, warning: 5 },
  // Bench
  elbow_depth:        { critical: 25, high_risk: 20, warning: 10 },
  elbow_flare:        { critical: 20, high_risk: 15, warning: 8 },
  lockout:            { critical: 15, high_risk: 10, warning: 5 },
};

export function scoreRep(repData: RepData): number {
  const worst: Record<string, string> = {};
  for (const v of repData.violations) {
    if (!worst[v.type] || SEVERITY_RANK[v.severity] > SEVERITY_RANK[worst[v.type]]) {
      worst[v.type] = v.severity;
    }
  }
  let score = 100;
  for (const [type, severity] of Object.entries(worst)) {
    score -= DEDUCTIONS[type]?.[severity] ?? 0;
  }
  return Math.max(0, score);
}

// ── Fatigue detection ─────────────────────────────────────────────────────────

export function checkFatigue(repHistory: RepData[]): Violation[] {
  if (repHistory.length < 2) return [];

  const baseline = repHistory[0];
  const prev     = repHistory[repHistory.length - 2];
  const curr     = repHistory[repHistory.length - 1];
  const alerts: Violation[] = [];

  const trunkDrift = curr.maxTrunkLean - baseline.maxTrunkLean;
  if (trunkDrift > 12) {
    alerts.push({ type: 'fatigue_trunk', severity: 'high_risk', message: `Trunk lean drifted +${trunkDrift.toFixed(1)}° from rep 1 — reduce load` });
  } else if (trunkDrift > 10) {
    alerts.push({ type: 'fatigue_trunk', severity: 'warning', message: `Trunk lean increasing +${trunkDrift.toFixed(1)}° from rep 1` });
  }

  const depthDiff = Math.abs(curr.primaryAngle - prev.primaryAngle);
  if (depthDiff > 5) {
    alerts.push({ type: 'fatigue_depth', severity: 'warning', message: `Depth inconsistency — ${depthDiff.toFixed(1)}° primary angle change vs prev rep` });
  }

  const spike = curr.maxTrunkLean - prev.maxTrunkLean;
  if (spike > 15) {
    alerts.push({ type: 'fatigue_spike', severity: 'critical', message: `Sudden trunk lean spike +${spike.toFixed(1)}° — stop immediately` });
  }

  return alerts;
}
