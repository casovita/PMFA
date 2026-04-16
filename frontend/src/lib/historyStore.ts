import type { LiftType, RepData, SavedSession, SessionAggregate, Severity } from '../types';

const STORAGE_KEY = 'pmfa_sessions_v1';
const MAX_STORED_SESSIONS = 50;

// ── Aggregate computation ─────────────────────────────────────────────────────

export function computeAggregate(reps: RepData[]): SessionAggregate {
  if (reps.length === 0) {
    return {
      repCount: 0,
      avgScore: 0,
      minScore: 0,
      maxScore: 0,
      scores: [],
      avgPrimaryAngle: 0,
      avgTimeUnderTension: 0,
      totalViolations: 0,
      worstSeverity: null,
    };
  }

  const scores = reps.map((r) => r.score ?? 0);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);

  const avgPrimaryAngle =
    reps.reduce((a, r) => a + r.primaryAngle, 0) / reps.length;
  const avgTimeUnderTension =
    reps.reduce((a, r) => a + r.timeUnderTension, 0) / reps.length;

  const totalViolations = reps.reduce((a, r) => a + r.violations.length, 0);

  const SEVERITY_RANK: Record<Severity, number> = { warning: 1, high_risk: 2, critical: 3 };
  let worstSeverity: Severity | null = null;
  for (const rep of reps) {
    for (const v of rep.violations) {
      if (
        worstSeverity === null ||
        SEVERITY_RANK[v.severity] > SEVERITY_RANK[worstSeverity]
      ) {
        worstSeverity = v.severity;
      }
    }
  }

  return {
    repCount: reps.length,
    avgScore,
    minScore,
    maxScore,
    scores,
    avgPrimaryAngle,
    avgTimeUnderTension,
    totalViolations,
    worstSeverity,
  };
}

// ── localStorage helpers ──────────────────────────────────────────────────────

function persistSessions(sessions: SavedSession[]): void {
  const json = JSON.stringify(sessions);
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // QuotaExceededError — drop 10 oldest and retry once
    const trimmed = sessions.slice(10);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Silently abandon — history is non-load-bearing
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns all stored sessions, oldest-first. Returns [] on parse error. */
export function loadSessions(): SavedSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedSession[];
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

/**
 * Saves a new session. Computes aggregate, appends, prunes to 50, and persists.
 * Returns the created SavedSession.
 */
export function saveSession(lift: LiftType, reps: RepData[]): SavedSession {
  const session: SavedSession = {
    id: crypto.randomUUID(),
    savedAt: Date.now(),
    lift,
    reps,
    aggregate: computeAggregate(reps),
  };

  const sessions = loadSessions();
  sessions.push(session);
  const pruned = sessions.slice(-MAX_STORED_SESSIONS);
  persistSessions(pruned);

  return session;
}

/** Deletes a session by id. No-op if not found. */
export function deleteSession(id: string): void {
  const sessions = loadSessions().filter((s) => s.id !== id);
  persistSessions(sessions);
}
