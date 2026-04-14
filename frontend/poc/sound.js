/**
 * Radar-style proximity audio alerts using Web Audio API.
 * No external files — pure sine-wave synthesis.
 *
 * Usage:
 *   setRadarProximity(proximity, freq)  — call each pose frame
 *   tickRadar(timestamp)                — call every requestAnimationFrame
 *   setRadarMuted(bool)                 — mute/unmute
 */

let audioCtx = null;
let _proximity = 0;   // 0 = safe, 1 = at/past danger threshold
let _freq      = 880; // Hz for the next beep
let _lastBeep  = 0;   // DOMHighResTimeStamp of last beep
let _muted     = false;

function ctx() {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playBeep(freq, duration = 0.07) {
  const c    = ctx();
  const osc  = c.createOscillator();
  const gain = c.createGain();

  osc.connect(gain);
  gain.connect(c.destination);

  osc.type            = 'sine';
  osc.frequency.value = freq;

  gain.gain.setValueAtTime(0.25, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);

  osc.start(c.currentTime);
  osc.stop(c.currentTime + duration);
}

/**
 * Compute danger proximity for all active violation zones.
 *
 * Returns { proximity: 0–1, freq: Hz } for the most urgent danger.
 * proximity 0  → no warning
 * proximity 1  → threshold breached
 *
 * Warning ramp distances:
 *   Trunk lean  : 35° → 45° (med) → 55° (high)   pitch 660 Hz
 *   Knee valgus : 3%  →  6% (med) → 10% (high)   pitch 1100 Hz
 *
 * @param {{ trunkLean: number }} angles
 * @param {Array} landmarks
 * @param {number} [visThreshold=0.5]
 * @returns {{ proximity: number, freq: number }}
 */
export function computeDangerProximity(angles, landmarks, visThreshold = 0.5) {
  const vis = (idx) =>
    (landmarks[idx]?.visibility ?? 0) >= visThreshold ? landmarks[idx] : null;

  let maxP = 0;
  let bestFreq = 880;

  // ── Trunk lean ───────────────────────────────────────────────────────────────
  // Warn zone: 35° → 55°   (violation flags at 45° / 55° in angles.js)
  if (!isNaN(angles.trunkLean) && angles.trunkLean > 35) {
    const p = Math.min(1, (angles.trunkLean - 35) / (55 - 35));
    if (p > maxP) { maxP = p; bestFreq = 660; }
  }

  // ── Knee valgus proxy ────────────────────────────────────────────────────────
  // Warn zone: 3% → 10%   (violation flags at 6% / 10% in angles.js)
  const lKnee  = vis(25);
  const lAnkle = vis(27);
  if (lKnee && lAnkle) {
    const valgus = (lKnee.x - lAnkle.x) * 100;
    if (valgus > 3) {
      const p = Math.min(1, (valgus - 3) / (10 - 3));
      if (p > maxP) { maxP = p; bestFreq = 1100; }
    }
  }

  return { proximity: maxP, freq: bestFreq };
}

/**
 * Update the current proximity state.
 * @param {number} proximity  0–1
 * @param {number} freq       beep pitch in Hz
 */
export function setRadarProximity(proximity, freq) {
  _proximity = proximity;
  _freq      = freq;
}

/**
 * Must be called on every requestAnimationFrame tick.
 * Fires a beep when the inter-beep interval has elapsed.
 *
 * Interval mapping:
 *   proximity 0   → silent (no beep)
 *   proximity 0.1 → ~1400 ms apart  (slow ping)
 *   proximity 0.5 → ~750  ms apart  (moderate)
 *   proximity 1.0 → ~80   ms apart  (rapid alarm)
 *
 * @param {DOMHighResTimeStamp} timestamp  from requestAnimationFrame
 */
export function tickRadar(timestamp) {
  if (_muted || _proximity <= 0) return;

  const MIN_MS  = 80;
  const MAX_MS  = 1400;
  const interval = MAX_MS - _proximity * (MAX_MS - MIN_MS);

  if (timestamp - _lastBeep >= interval) {
    playBeep(_freq);
    _lastBeep = timestamp;
  }
}

/** @param {boolean} muted */
export function setRadarMuted(muted) {
  _muted = muted;
}

export function isRadarMuted() {
  return _muted;
}
