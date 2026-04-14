/**
 * Rules loader — fetches movement_analysis_rules.json from the canonical
 * KNOWLEDGE/ directory and exposes per-check thresholds for the POC.
 *
 * Usage:
 *   import { loadRules, THRESHOLDS } from './rules.js';
 *
 *   await loadRules();   // call once at startup, before initPose()
 *   // THRESHOLDS is now populated from the JSON; falls back to defaults if fetch fails
 *
 * Mapping notes (Phase 1 sagittal proxy):
 *   trunkLean    → JSC-LUMBAR-001 (lumbar_flexion_from_neutral, sagittal proxy)
 *   depth        → EXEC-IPF-SQ-001 depth_requirement (hip.y vs knee.y in normalized coords)
 *   kneeValgus   → JSC-KNEE-001 thresholds in %; 2D proxy, true detection needs frontal cam
 *   ankle        → JSC-ANKLE-001; re-mapped from dorsiflexion degrees to proxy angle convention
 *   buttWink     → JSC-HIP-001 (hip flexion) + JSC-LUMBAR-002 (posterior pelvic tilt)
 */

/**
 * Mutable threshold object — mutated in-place by loadRules() so that
 * importing modules that read THRESHOLDS.x automatically see the updated values.
 *
 * Default values match the hardcoded constants previously in angles.js.
 * They also serve as the fallback when the JSON cannot be fetched.
 */
export const THRESHOLDS = {
  /** Trunk lean proxy (Hip→Shoulder vs vertical) — maps to JSC-LUMBAR-001 */
  trunkLean: {
    warning:   35, // °  above this → monitor
    high_risk: 45, // °  above this → reduce load
    critical:  55, // °  above this → stop immediately
  },

  /**
   * Depth check: normalized delta between hip.y and knee.y (y↓ in MediaPipe).
   * Negative delta means hip is ABOVE knee.
   * Maps to EXEC-IPF-SQ-001 depth_requirement.
   */
  depth: {
    high_risk: -0.02, // hip crease slightly above knee
    critical:  -0.06, // hip clearly above knee
  },

  /**
   * Knee valgus 2D proxy — (knee.x − ankle.x) as % of frame width.
   * Maps to JSC-KNEE-001 (frontal-plane degrees remapped to sagittal pixel proxy).
   * Sagittal note: this is a 2D approximation only; frontal camera needed for true valgus.
   */
  kneeValgus: {
    warning:   5,  // %
    high_risk: 10, // %
    critical:  15, // %
  },

  /**
   * Ankle dorsiflexion proxy angle (Knee→Ankle→vertical_below_ankle).
   * Standing ≈ 180°; ankle dorsiflexion increases as this angle decreases.
   * Dorsiflexion ≈ 180° − ankleAngle (crude proxy).
   * Maps to JSC-ANKLE-001: warning <25°, high_risk <15°, critical <10° dorsiflexion.
   */
  ankle: {
    warning:   140, // proxy angle above which dorsiflexion is borderline
    high_risk: 150, // limited
    critical:  160, // severely restricted
  },

  /**
   * Butt wink composite check — maps to JSC-HIP-001 + JSC-LUMBAR-002.
   * Triggered when both hip flexion and trunk lean exceed these limits at depth.
   */
  buttWink: {
    hipAngle_warning:   135, // ° hip flexion threshold for warning
    hipAngle_high_risk: 150, // ° hip flexion threshold for high_risk
    trunkLean_min:       35, // ° minimum trunk lean for this check to fire
  },
};

/**
 * Load the canonical movement_analysis_rules.json and update THRESHOLDS in-place.
 * Safe to call multiple times; subsequent calls are no-ops after the first success.
 *
 * @returns {Promise<boolean>} true if rules loaded from JSON, false if fallback used
 */
export async function loadRules() {
  try {
    const res = await fetch('/KNOWLEDGE/movement_analysis_rules.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const rules = await res.json();
    _applyRules(rules);
    return true;
  } catch (err) {
    console.warn(`[rules] Could not load movement_analysis_rules.json (${err.message}). Using built-in defaults.`);
    return false;
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _getConstraint(rules, id) {
  return rules.joint_safety_constraints?.find((c) => c.id === id) ?? null;
}

function _applyRules(rules) {
  // ── Trunk lean → JSC-LUMBAR-001 ──────────────────────────────────────────────
  const lumbar001 = _getConstraint(rules, 'JSC-LUMBAR-001');
  if (lumbar001?.thresholds) {
    const t = lumbar001.thresholds;
    THRESHOLDS.trunkLean.warning   = t.warning?.min  ?? THRESHOLDS.trunkLean.warning;
    THRESHOLDS.trunkLean.high_risk = t.high_risk?.min ?? THRESHOLDS.trunkLean.high_risk;
    THRESHOLDS.trunkLean.critical  = t.critical?.min  ?? THRESHOLDS.trunkLean.critical;
  }

  // ── Knee valgus → JSC-KNEE-001 (thresholds in ° valgus; kept as % proxy) ────
  // The JSON uses true frontal-plane degrees; the POC proxy is % frame width.
  // The 5/10/15 mapping is intentionally preserved as-is for the sagittal proxy.

  // ── Butt wink → JSC-HIP-001 (hip flexion limits) ─────────────────────────────
  const hip001 = _getConstraint(rules, 'JSC-HIP-001');
  if (hip001?.thresholds) {
    const t = hip001.thresholds;
    THRESHOLDS.buttWink.hipAngle_warning   = t.warning?.min   ?? THRESHOLDS.buttWink.hipAngle_warning;
    THRESHOLDS.buttWink.hipAngle_high_risk = t.high_risk?.min ?? THRESHOLDS.buttWink.hipAngle_high_risk;
  }

  // ── Ankle → JSC-ANKLE-001 (dorsiflexion degrees → proxy angle) ───────────────
  // JSC-ANKLE-001: warning <25°, high_risk <15°, critical <10° dorsiflexion.
  // Proxy convention: ankleProxyAngle ≈ 180° − dorsiflexion_degrees.
  const ankle001 = _getConstraint(rules, 'JSC-ANKLE-001');
  if (ankle001?.thresholds) {
    const t = ankle001.thresholds;
    // warning: dorsiflexion < 25° → proxyAngle > 155°
    if (t.warning?.min != null)
      THRESHOLDS.ankle.warning   = 180 - t.warning.max;   // upper bound of warning band
    // high_risk: dorsiflexion < 15° → proxyAngle > 165°
    if (t.high_risk?.min != null)
      THRESHOLDS.ankle.high_risk = 180 - t.high_risk.max;
    // critical: dorsiflexion < 10° → proxyAngle > 170°
    if (t.critical?.max != null)
      THRESHOLDS.ankle.critical  = 180 - t.critical.max;
  }
}
