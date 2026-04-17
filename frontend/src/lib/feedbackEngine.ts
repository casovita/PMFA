/**
 * Rule-based feedback engine — Phase 2.
 *
 * Aggregates violations across a completed set and returns ≤3 prioritized
 * coaching cues. Phase 3 will replace templates with LLM-generated cues.
 *
 * Priority ordering (injury risk): lumbar/trunk → knee valgus → depth →
 * ankle → bar drift → butt wink → elbow → lockout → hip lockout
 */

import type { RepData, Severity, LiftType, CoachingCue } from '../types';

export type { CoachingCue };

// ── Priority order — higher index = lower priority ────────────────────────────

const PRIORITY_ORDER: string[] = [
  'lumbar_flexion',
  'trunk_lean',
  'knee_valgus',
  'depth',
  'ankle_dorsiflexion',
  'butt_wink',
  'bar_drift',
  'elbow_depth',
  'elbow_flare',
  'hip_lockout',
  'lockout',
];

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 3,
  high_risk: 2,
  warning: 1,
};

// ── Cue templates ─────────────────────────────────────────────────────────────

interface CueTemplate {
  label: string;
  /** Keyed by severity: use highest severity seen for this violation. */
  cues: Partial<Record<Severity | 'default', string>>;
}

const TEMPLATES: Record<string, CueTemplate> = {
  trunk_lean: {
    label: 'Trunk lean',
    cues: {
      critical: 'Stop the set — excessive forward lean puts your lumbar spine at acute injury risk. Deload and focus on bracing.',
      high_risk: 'Brace harder before unracking. Think "big chest" throughout the descent to keep the torso upright.',
      warning: 'Slight forward lean detected. Cue: "chest up, elbows forward" to maintain a vertical torso.',
    },
  },
  lumbar_flexion: {
    label: 'Back rounding',
    cues: {
      critical: 'Stop immediately — severe lumbar flexion under load. Deload significantly and reinforce bracing.',
      high_risk: 'Reduce load. Brace your core before initiating the pull. Cue: "proud chest, neutral spine" off the floor.',
      warning: 'Mild back rounding. Take a big breath and brace before each rep. Keep hips down at the start.',
    },
  },
  knee_valgus: {
    label: 'Knee valgus',
    cues: {
      critical: 'Knees caving severely — stop the set. This is a patellar and ACL risk. Reduce load significantly.',
      high_risk: 'Knees caving inward. Cue: "spread the floor" or "push knees out over little toes." Consider reducing load.',
      warning: 'Mild knee cave. Focus on external rotation: cue "knees out" at the bottom.',
    },
  },
  depth: {
    label: 'Squat depth',
    cues: {
      critical: 'Hip crease well above parallel — significant IPF red light risk. Work on hip flexor and ankle mobility.',
      high_risk: 'Depth borderline. Slow the descent and aim for hip crease below knee crease.',
      warning: 'Depth slightly short on some reps. Pause at the bottom to improve proprioception.',
    },
  },
  ankle_dorsiflexion: {
    label: 'Ankle mobility',
    cues: {
      critical: 'Severely restricted ankle range — heels may be rising. Elevate heels temporarily or address mobility.',
      high_risk: 'Limited ankle dorsiflexion restricting depth. Add ankle stretching and calf foam rolling pre-session.',
      warning: 'Borderline ankle mobility. Use banded ankle stretches and slow eccentric squats.',
    },
  },
  butt_wink: {
    label: 'Butt wink',
    cues: {
      high_risk: 'Posterior pelvic tilt at depth detected. Do not exceed current range of motion. Work on hip flexor and hamstring flexibility.',
      warning: 'Slight butt wink at the bottom. Reduce depth until flexibility improves.',
      default: 'Slight posterior pelvic tilt. Reduce depth or improve hip mobility.',
    },
  },
  bar_drift: {
    label: 'Bar path',
    cues: {
      high_risk: 'Bar drifting away from the body — reduces leverage and strains the lower back. Keep the bar close, drag it up the shins.',
      warning: 'Bar path deviating slightly. Cue: "bar stays over mid-foot" throughout the pull.',
    },
  },
  elbow_depth: {
    label: 'Elbow depth',
    cues: {
      critical: 'Elbows not reaching shoulder level — IPF touch depth violation risk. Lower the bar until elbows clear shoulder height.',
      high_risk: 'Borderline touch depth. Lower the bar until you feel it touch your chest with elbows below shoulder level.',
      warning: 'Elbow depth close to the line on some reps. Focus on a controlled, full-range descent.',
    },
  },
  elbow_flare: {
    label: 'Elbow flare',
    cues: {
      high_risk: 'Excessive elbow flare — high shoulder stress. Tuck elbows slightly (45–70° from torso) to protect the rotator cuff.',
      warning: 'Elbow flare slightly wide. Cue: "elbows at 45°" to reduce shoulder impingement risk.',
    },
  },
  hip_lockout: {
    label: 'Hip lockout',
    cues: {
      warning: 'Not completing full hip extension at the top — IPF "hips through" requirement not met. Drive the hips forward to lockout.',
      default: 'Incomplete hip extension. Squeeze glutes at the top of every rep.',
    },
  },
  lockout: {
    label: 'Elbow lockout',
    cues: {
      warning: 'Elbows not fully locking out on bench — IPF rule violation risk. Fully extend arms at the top of each press.',
      default: 'Incomplete elbow lockout. Press until arms are fully straight.',
    },
  },
};

// ── Engine ────────────────────────────────────────────────────────────────────

interface ViolationSummary {
  type: string;
  worstSeverity: Severity;
  repCount: number;
}

function aggregateViolations(reps: RepData[]): ViolationSummary[] {
  const byType = new Map<string, { worstRank: number; worstSeverity: Severity; repCount: number }>();

  for (const rep of reps) {
    const typesInRep = new Set<string>();
    for (const v of rep.violations) {
      if (typesInRep.has(v.type)) continue; // one entry per rep per type
      typesInRep.add(v.type);
      const existing = byType.get(v.type);
      const rank = SEVERITY_RANK[v.severity];
      if (!existing) {
        byType.set(v.type, { worstRank: rank, worstSeverity: v.severity, repCount: 1 });
      } else {
        if (rank > existing.worstRank) {
          existing.worstRank = rank;
          existing.worstSeverity = v.severity;
        }
        existing.repCount += 1;
      }
    }
  }

  return Array.from(byType.entries()).map(([type, data]) => ({
    type,
    worstSeverity: data.worstSeverity,
    repCount: data.repCount,
  }));
}

function sortByClinicalPriority(summaries: ViolationSummary[]): ViolationSummary[] {
  return [...summaries].sort((a, b) => {
    // First: severity rank (critical > high_risk > warning)
    const sevDiff = SEVERITY_RANK[b.worstSeverity] - SEVERITY_RANK[a.worstSeverity];
    if (sevDiff !== 0) return sevDiff;

    // Second: clinical priority order
    const ai = PRIORITY_ORDER.indexOf(a.type);
    const bi = PRIORITY_ORDER.indexOf(b.type);
    const aPrio = ai === -1 ? PRIORITY_ORDER.length : ai;
    const bPrio = bi === -1 ? PRIORITY_ORDER.length : bi;
    if (aPrio !== bPrio) return aPrio - bPrio;

    // Third: frequency (more reps affected = higher priority)
    return b.repCount - a.repCount;
  });
}

function buildCue(summary: ViolationSummary): CoachingCue | null {
  const template = TEMPLATES[summary.type];
  if (!template) return null;

  const cueText =
    template.cues[summary.worstSeverity] ??
    template.cues['default'] ??
    null;
  if (!cueText) return null;

  return {
    violationType: summary.type,
    severity: summary.worstSeverity,
    repCount: summary.repCount,
    cue: cueText,
    label: template.label,
  };
}

/**
 * Generate ≤3 prioritized coaching cues from a completed set.
 *
 * @param reps - All completed reps in the set.
 * @param _lift - Currently unused; reserved for lift-specific filtering in Phase 3.
 * @returns Up to 3 coaching cues, highest clinical priority first.
 */
export function generateFeedback(reps: RepData[], _lift: LiftType): CoachingCue[] {
  if (reps.length === 0) return [];

  const summaries = aggregateViolations(reps);
  const sorted = sortByClinicalPriority(summaries);

  const cues: CoachingCue[] = [];
  for (const summary of sorted) {
    if (cues.length >= 3) break;
    const cue = buildCue(summary);
    if (cue) cues.push(cue);
  }

  return cues;
}
