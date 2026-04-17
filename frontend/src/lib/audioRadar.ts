/**
 * Radar-style proximity audio alerts using Web Audio API.
 * No external files — pure sine-wave synthesis.
 *
 * Ported from frontend/poc/sound.js (POC → Phase 2 TypeScript).
 *
 * Usage:
 *   computeDangerProximity(angles, landmarks) → { proximity, freq }
 *   setRadarProximity(proximity, freq)        — call each pose frame
 *   tickRadar(timestamp)                      — call every rAF tick
 *   setRadarMuted(bool)                       — mute/unmute
 */

import type { LiftAngles, LiftType, Landmark } from '../types';

// ── Module state ──────────────────────────────────────────────────────────────

let _audioCtx: AudioContext | null = null;
let _proximity = 0;   // 0 = safe, 1 = at/past danger threshold
let _freq      = 880; // Hz for next beep
let _lastBeep  = 0;   // DOMHighResTimeStamp of last beep
let _muted     = false;

// ── Internal helpers ──────────────────────────────────────────────────────────

function getCtx(): AudioContext {
  if (!_audioCtx) _audioCtx = new AudioContext();
  if (_audioCtx.state === 'suspended') void _audioCtx.resume();
  return _audioCtx;
}

function playBeep(freq: number, duration = 0.07): void {
  const c    = getCtx();
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

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute danger proximity from live angles and landmarks.
 *
 * Returns { proximity: 0–1, freq: Hz } for the most urgent cue.
 * proximity 0 → silent; proximity 1 → maximum alarm rate.
 *
 * Cue mapping (shared across all lifts):
 *   Trunk lean  35°→55°  pitch 660 Hz  (forward lean danger)
 *   Knee valgus  3%→10%  pitch 1100 Hz (squat/deadlift only — ignored for bench)
 */
export function computeDangerProximity(
  angles: LiftAngles,
  landmarks: Landmark[],
  lift: LiftType,
  visThreshold = 0.5,
): { proximity: number; freq: number } {
  const vis = (idx: number): Landmark | null =>
    (landmarks[idx]?.visibility ?? 0) >= visThreshold ? landmarks[idx] : null;

  let maxP     = 0;
  let bestFreq = 880;

  // ── Trunk lean (all lifts) ─────────────────────────────────────────────────
  // Warn zone: 35° → 55°  (violation thresholds are 45° / 55°)
  if (!isNaN(angles.trunkLean) && angles.trunkLean > 35) {
    const p = Math.min(1, (angles.trunkLean - 35) / (55 - 35));
    if (p > maxP) { maxP = p; bestFreq = 660; }
  }

  // ── Knee valgus proxy (squat + deadlift only) ─────────────────────────────
  // Uses left knee (25) vs left ankle (27) horizontal offset.
  // Warn zone: 3% → 10%  (violation thresholds are 6% / 10%)
  if (lift !== 'bench') {
    const lKnee  = vis(25);
    const lAnkle = vis(27);
    if (lKnee && lAnkle) {
      const valgus = (lKnee.x - lAnkle.x) * 100;
      if (valgus > 3) {
        const p = Math.min(1, (valgus - 3) / (10 - 3));
        if (p > maxP) { maxP = p; bestFreq = 1100; }
      }
    }
  }

  return { proximity: maxP, freq: bestFreq };
}

/**
 * Update the current proximity state.
 * Call this each time new pose landmarks arrive.
 */
export function setRadarProximity(proximity: number, freq: number): void {
  _proximity = proximity;
  _freq      = freq;
}

/**
 * Must be called on every requestAnimationFrame tick.
 * Fires a beep when the inter-beep interval has elapsed.
 *
 * Interval mapping (from POC):
 *   proximity 0   → silent
 *   proximity 0.1 → ~1400 ms  (slow ping)
 *   proximity 0.5 → ~750  ms  (moderate)
 *   proximity 1.0 → ~80   ms  (rapid alarm)
 */
export function tickRadar(timestamp: DOMHighResTimeStamp): void {
  if (_muted || _proximity <= 0) return;

  const MIN_MS   = 80;
  const MAX_MS   = 1400;
  const interval = MAX_MS - _proximity * (MAX_MS - MIN_MS);

  if (timestamp - _lastBeep >= interval) {
    playBeep(_freq);
    _lastBeep = timestamp;
  }
}

export function setRadarMuted(muted: boolean): void {
  _muted = muted;
}

export function isRadarMuted(): boolean {
  return _muted;
}
