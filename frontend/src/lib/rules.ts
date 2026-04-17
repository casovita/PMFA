/**
 * Loads thresholds from KNOWLEDGE/movement_analysis_rules.json at startup.
 * Falls back to hardcoded defaults if the JSON is unreachable.
 */

export interface Thresholds {
  depth:      { critical: number; high_risk: number };
  trunkLean:  { warning: number; high_risk: number; critical: number };
  kneeValgus: { warning: number; high_risk: number; critical: number };
  ankle:      { warning: number; high_risk: number; critical: number };
  buttWink:   { hipAngle_warning: number; hipAngle_high_risk: number; trunkLean_min: number };
}

const DEFAULTS: Thresholds = {
  depth:      { critical: -0.05, high_risk: 0.0 },
  trunkLean:  { warning: 35, high_risk: 45, critical: 55 },
  kneeValgus: { warning: 5, high_risk: 10, critical: 15 },
  ankle:      { warning: 140, high_risk: 150, critical: 160 },
  buttWink:   { hipAngle_warning: 130, hipAngle_high_risk: 145, trunkLean_min: 20 },
};

export let THRESHOLDS: Thresholds = { ...DEFAULTS };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractThresholds(json: any): Thresholds {
  const jsc = (id: string) =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    json?.joint_safety_constraints?.find((c: { id: string }) => c.id === id);

  const knee = jsc('JSC-KNEE-001');
  const lumbar = jsc('JSC-LUMBAR-001');
  const ankle = jsc('JSC-ANKLE-001');
  const lumbar2 = jsc('JSC-LUMBAR-002');

  return {
    depth: DEFAULTS.depth,
    trunkLean: {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      warning:   lumbar?.thresholds?.warning   ?? DEFAULTS.trunkLean.warning,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      high_risk: lumbar?.thresholds?.high_risk ?? DEFAULTS.trunkLean.high_risk,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      critical:  lumbar?.thresholds?.critical  ?? DEFAULTS.trunkLean.critical,
    },
    kneeValgus: {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      warning:   knee?.thresholds?.warning   ?? DEFAULTS.kneeValgus.warning,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      high_risk: knee?.thresholds?.high_risk ?? DEFAULTS.kneeValgus.high_risk,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      critical:  knee?.thresholds?.critical  ?? DEFAULTS.kneeValgus.critical,
    },
    ankle: {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      warning:   ankle?.thresholds?.warning   ?? DEFAULTS.ankle.warning,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      high_risk: ankle?.thresholds?.high_risk ?? DEFAULTS.ankle.high_risk,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      critical:  ankle?.thresholds?.critical  ?? DEFAULTS.ankle.critical,
    },
    buttWink: {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      hipAngle_warning:   lumbar2?.thresholds?.warning   ?? DEFAULTS.buttWink.hipAngle_warning,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      hipAngle_high_risk: lumbar2?.thresholds?.high_risk ?? DEFAULTS.buttWink.hipAngle_high_risk,
      trunkLean_min:      DEFAULTS.buttWink.trunkLean_min,
    },
  };
}

let _loadPromise: Promise<boolean> | null = null;

export function loadRules(): Promise<boolean> {
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    try {
      const res = await fetch('/KNOWLEDGE/movement_analysis_rules.json');
      if (!res.ok) return false;
      const json: unknown = await res.json();
      THRESHOLDS = extractThresholds(json);
      return true;
    } catch {
      return false;
    }
  })();
  return _loadPromise;
}
