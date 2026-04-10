/**
 * Biomechanical angle utilities for squat analysis.
 * All inputs are MediaPipe landmark objects: { x, y, z, visibility }
 * Coordinates are normalized [0,1] relative to frame dimensions.
 */

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
 * Extract the five key squat angles from a MediaPipe pose landmark array.
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
 *   shoulderHipKnee: number
 * }}
 */
export function extractSquatAngles(landmarks, visThreshold = 0.5) {
  const lm = landmarks;

  const vis = (idx) => (lm[idx]?.visibility ?? 0) >= visThreshold ? lm[idx] : null;

  const lShoulder = vis(11);
  const lHip      = vis(23);
  const lKnee     = vis(25);
  const lAnkle    = vis(27);

  // Knee flexion: Hip → Knee → Ankle
  const kneeAngle = angleDeg(lHip, lKnee, lAnkle);

  // Hip flexion: Shoulder → Hip → Knee
  const hipAngle = angleDeg(lShoulder, lHip, lKnee);

  // Ankle dorsiflexion: Knee → Ankle → (virtual point directly below ankle)
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
 *
 * @param {{kneeAngle, hipAngle, trunkLean}} angles
 * @param {Array} landmarks
 * @param {number} [visThreshold=0.5]
 * @returns {Array<{type: string, severity: 'low'|'medium'|'high', message: string}>}
 */
export function checkSquatViolations(angles, landmarks, visThreshold = 0.5) {
  const violations = [];
  const lm = landmarks;

  const vis = (idx) => (lm[idx]?.visibility ?? 0) >= visThreshold ? lm[idx] : null;

  // ── Depth check ──────────────────────────────────────────────────────────────
  // Hip crease (hip y) must be at or below knee (knee y) in normalized coords.
  // In MediaPipe, y increases downward, so hip.y >= knee.y means hip is lower.
  const lHip  = vis(23);
  const lKnee = vis(25);
  if (lHip && lKnee) {
    const delta = lHip.y - lKnee.y;
    if (delta < -0.02) {
      violations.push({
        type: 'depth',
        severity: delta < -0.06 ? 'high' : 'medium',
        message: `Insufficient depth — hip crease above knee by ${Math.abs(delta * 100).toFixed(1)}%`,
      });
    }
  }

  // ── Trunk lean ───────────────────────────────────────────────────────────────
  // Flag if torso leans more than 45° from vertical
  if (!isNaN(angles.trunkLean)) {
    if (angles.trunkLean > 55) {
      violations.push({
        type: 'trunk_lean',
        severity: 'high',
        message: `Excessive trunk lean — ${angles.trunkLean.toFixed(1)}° (threshold 45°)`,
      });
    } else if (angles.trunkLean > 45) {
      violations.push({
        type: 'trunk_lean',
        severity: 'medium',
        message: `Elevated trunk lean — ${angles.trunkLean.toFixed(1)}°`,
      });
    }
  }

  // ── Knee valgus proxy (2D) ───────────────────────────────────────────────────
  // Compare left knee x vs. left ankle x.
  // If knee caves inward (x > ankle.x in left side), flag it.
  const lAnkle = vis(27);
  if (lKnee && lAnkle) {
    const valgus = (lKnee.x - lAnkle.x) * 100; // rough proxy in % of frame width
    if (valgus > 6) {
      violations.push({
        type: 'knee_valgus',
        severity: valgus > 10 ? 'high' : 'medium',
        message: `Knee valgus detected — ${valgus.toFixed(1)}% frame-width inward shift`,
      });
    }
  }

  return violations;
}

/**
 * Check whether this frame represents the bottom of a squat rep
 * (knee angle at local minimum, below 100°).
 *
 * @param {number[]} angleHistory  - recent kneeAngle values
 * @param {number}   currentAngle
 * @returns {boolean}
 */
export function isAtBottom(angleHistory, currentAngle) {
  if (isNaN(currentAngle) || currentAngle > 110) return false;
  if (angleHistory.length < 3) return false;
  const prev = angleHistory[angleHistory.length - 1];
  return currentAngle <= prev; // still descending or at minimum
}
