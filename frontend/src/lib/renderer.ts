/**
 * Canvas skeleton renderer — TypeScript port of the POC renderer.js.
 */

import type { Landmark, LiftType, Violation } from '../types';

const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15],
  [12, 14], [14, 16],
  [23, 25], [25, 27], [27, 29], [27, 31],
  [24, 26], [26, 28], [28, 30], [28, 32],
];

const KEY_JOINTS = new Set([11, 12, 23, 24, 25, 26, 27, 28]);

/** Landmark index and label for the primary angle annotation per lift. */
const LIFT_LABEL: Record<LiftType, { idx: number; label: string }> = {
  squat:    { idx: 25, label: 'Knee' },
  deadlift: { idx: 23, label: 'Hip' },
  bench:    { idx: 13, label: 'Elbow' },
};

/**
 * Which landmark indices to highlight for each violation type.
 * Values are BlazePose landmark indices (0-based, 33 total).
 */
const VIOLATION_LANDMARKS: Record<string, number[]> = {
  depth:               [23, 25],      // squat: hip + knee
  trunk_lean:          [11, 23],      // shoulder + hip
  knee_valgus:         [25, 27],      // knee + ankle
  ankle_dorsiflexion:  [27],          // ankle
  butt_wink:           [23],          // hip
  lumbar_flexion:      [11, 23],      // shoulder + hip
  bar_drift:           [15, 27],      // wrist + ankle
  hip_lockout:         [23, 25],      // hip + knee
  elbow_depth:         [13, 11],      // elbow + shoulder
  elbow_flare:         [13],          // elbow
  lockout:             [13, 15],      // elbow + wrist
};

/** Glow color per severity. */
const GLOW_COLOR: Record<string, string> = {
  warning:   '#fbbf24',
  high_risk: '#f97316',
  critical:  '#ef4444',
};

// ── Internal helpers ─────────────────────────────────────────────────────────

function drawSkeletonOnCtx(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  w: number,
  h: number,
  visThreshold = 0.5,
): void {
  for (const [i, j] of POSE_CONNECTIONS) {
    const a = landmarks[i];
    const b = landmarks[j];
    if (!a || !b) continue;
    const visible = a.visibility >= visThreshold && b.visibility >= visThreshold;
    ctx.beginPath();
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
    ctx.strokeStyle = visible ? 'rgba(0,220,80,0.85)' : 'rgba(220,60,60,0.5)';
    ctx.lineWidth = visible ? 2 : 1;
    ctx.stroke();
  }

  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if (!lm) continue;
    const visible = lm.visibility >= visThreshold;
    const isKey = KEY_JOINTS.has(i);
    ctx.beginPath();
    ctx.arc(lm.x * w, lm.y * h, isKey ? 5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = visible ? (isKey ? '#00ff50' : '#00cc40') : 'rgba(220,60,60,0.6)';
    ctx.fill();
  }
}

/** Draw concentric glow rings + colored dot on a problematic joint. */
function drawJointGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  severity: string,
): void {
  const color = GLOW_COLOR[severity] ?? '#fbbf24';

  // Outer glow rings (3 expanding, fading)
  for (let ring = 3; ring >= 1; ring--) {
    const radius = 8 + ring * 7;
    const alpha = 0.15 * ring;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color.replace(')', `, ${alpha})`).replace('rgb', 'rgba').replace('#', 'rgba(')
      // fallback: just use a semi-transparent version
      ;
    // Use createRadialGradient for a proper glow effect
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, hexToRgba(color, 0.5 * ring / 3));
    grad.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // White outline ring
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Colored fill center
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function drawSkeleton(
  canvas: HTMLCanvasElement,
  landmarks: Landmark[],
  visThreshold = 0.5,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!landmarks.length) return;
  drawSkeletonOnCtx(ctx, landmarks, canvas.width, canvas.height, visThreshold);
}

export function drawAngleLabel(
  canvas: HTMLCanvasElement,
  landmarks: Landmark[],
  angle: number,
  lift: LiftType,
): void {
  const { idx, label } = LIFT_LABEL[lift];
  if (isNaN(angle) || !landmarks[idx]) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const lm = landmarks[idx];
  ctx.font = 'bold 14px system-ui';
  ctx.fillStyle = '#facc15';
  ctx.fillText(
    `${label}: ${angle.toFixed(1)}°`,
    lm.x * canvas.width + 10,
    lm.y * canvas.height - 10,
  );
}

/**
 * Capture a JPEG snapshot from the video element, overlaying the skeleton
 * and highlighting joints implicated in the provided violations with glow effects.
 *
 * Returns a data URL string, or null if the video has no dimensions yet.
 */
export function captureSnapshot(
  video: HTMLVideoElement,
  landmarks: Landmark[],
  violations: Violation[],
): string | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Draw video frame
  ctx.drawImage(video, 0, 0, w, h);

  // Draw skeleton overlay
  drawSkeletonOnCtx(ctx, landmarks, w, h);

  // Collect violated landmark indices, ranked by severity
  const severityRank: Record<string, number> = { warning: 1, high_risk: 2, critical: 3 };
  const jointSeverity = new Map<number, string>();

  // Sort violations worst-first so joint gets the worst severity color
  const sorted = [...violations].sort(
    (a, b) => (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0),
  );

  for (const v of sorted) {
    const indices = VIOLATION_LANDMARKS[v.type] ?? [];
    for (const idx of indices) {
      if (!jointSeverity.has(idx)) {
        jointSeverity.set(idx, v.severity);
      }
    }
  }

  // Draw glows on violated joints
  for (const [idx, severity] of jointSeverity) {
    const lm = landmarks[idx];
    if (!lm || lm.visibility < 0.3) continue;
    drawJointGlow(ctx, lm.x * w, lm.y * h, severity);
  }

  return canvas.toDataURL('image/jpeg', 0.4);
}
