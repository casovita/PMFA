import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeAggregate,
  loadSessions,
  saveSession,
  deleteSession,
} from './historyStore';
import { makeRepData, makeViolation } from '../test/factories';

// jsdom provides localStorage; clear it before each test so tests are isolated
beforeEach(() => localStorage.clear());

// ── computeAggregate ──────────────────────────────────────────────────────────

describe('computeAggregate — empty reps', () => {
  it('returns zeroed aggregate for empty array', () => {
    const agg = computeAggregate([]);
    expect(agg.repCount).toBe(0);
    expect(agg.avgScore).toBe(0);
    expect(agg.minScore).toBe(0);
    expect(agg.maxScore).toBe(0);
    expect(agg.scores).toEqual([]);
    expect(agg.worstSeverity).toBeNull();
  });
});

describe('computeAggregate — single rep', () => {
  it('returns correct values for one rep with no violations', () => {
    const rep = makeRepData({ score: 72, primaryAngle: 90, timeUnderTension: 3 });
    const agg = computeAggregate([rep]);

    expect(agg.repCount).toBe(1);
    expect(agg.avgScore).toBeCloseTo(72);
    expect(agg.minScore).toBe(72);
    expect(agg.maxScore).toBe(72);
    expect(agg.scores).toEqual([72]);
    expect(agg.avgPrimaryAngle).toBeCloseTo(90);
    expect(agg.avgTimeUnderTension).toBeCloseTo(3);
    expect(agg.totalViolations).toBe(0);
    expect(agg.worstSeverity).toBeNull();
  });
});

describe('computeAggregate — multiple reps', () => {
  const reps = [
    makeRepData({ score: 80, primaryAngle: 85, timeUnderTension: 3, violations: [] }),
    makeRepData({ score: 60, primaryAngle: 95, timeUnderTension: 4, violations: [makeViolation({ severity: 'warning' })] }),
    makeRepData({ score: 40, primaryAngle: 75, timeUnderTension: 2, violations: [makeViolation({ severity: 'critical' })] }),
  ];

  it('computes avgScore correctly', () => {
    expect(computeAggregate(reps).avgScore).toBeCloseTo((80 + 60 + 40) / 3);
  });

  it('computes min and max score', () => {
    const agg = computeAggregate(reps);
    expect(agg.minScore).toBe(40);
    expect(agg.maxScore).toBe(80);
  });

  it('preserves scores array in rep order', () => {
    expect(computeAggregate(reps).scores).toEqual([80, 60, 40]);
  });

  it('sums totalViolations across reps', () => {
    expect(computeAggregate(reps).totalViolations).toBe(2);
  });

  it('identifies worstSeverity = critical', () => {
    expect(computeAggregate(reps).worstSeverity).toBe('critical');
  });

  it('identifies worstSeverity = high_risk when no critical present', () => {
    const reps2 = [
      makeRepData({ violations: [makeViolation({ severity: 'warning' })] }),
      makeRepData({ violations: [makeViolation({ severity: 'high_risk' })] }),
    ];
    expect(computeAggregate(reps2).worstSeverity).toBe('high_risk');
  });

  it('averages primaryAngle and timeUnderTension', () => {
    const agg = computeAggregate(reps);
    expect(agg.avgPrimaryAngle).toBeCloseTo((85 + 95 + 75) / 3);
    expect(agg.avgTimeUnderTension).toBeCloseTo((3 + 4 + 2) / 3);
  });
});

describe('computeAggregate — null scores treated as 0', () => {
  it('treats null score as 0', () => {
    const rep = makeRepData({ score: null });
    const agg = computeAggregate([rep]);
    expect(agg.avgScore).toBe(0);
    expect(agg.scores).toEqual([0]);
  });
});

// ── loadSessions / saveSession / deleteSession ────────────────────────────────

describe('loadSessions', () => {
  it('returns empty array when localStorage is empty', () => {
    expect(loadSessions()).toEqual([]);
  });

  it('returns empty array and clears key on malformed JSON', () => {
    localStorage.setItem('pmfa_sessions_v1', 'not-valid-json{');
    const result = loadSessions();
    expect(result).toEqual([]);
    expect(localStorage.getItem('pmfa_sessions_v1')).toBeNull();
  });
});

describe('saveSession', () => {
  it('persists a session and loadSessions returns it', () => {
    const reps = [makeRepData({ score: 85 })];
    const saved = saveSession('squat', reps);

    const sessions = loadSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(saved.id);
    expect(sessions[0].lift).toBe('squat');
    expect(sessions[0].aggregate.avgScore).toBeCloseTo(85);
  });

  it('appends sessions in chronological order', () => {
    saveSession('squat', [makeRepData({ score: 80 })]);
    saveSession('deadlift', [makeRepData({ score: 70 })]);

    const sessions = loadSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].lift).toBe('squat');
    expect(sessions[1].lift).toBe('deadlift');
  });

  it('prunes to most recent 50 sessions', () => {
    for (let i = 0; i < 55; i++) {
      saveSession('bench', [makeRepData({ score: i })]);
    }
    const sessions = loadSessions();
    expect(sessions).toHaveLength(50);
    // Oldest (scores 0–4) should have been pruned; newest retained
    expect(sessions[0].aggregate.avgScore).toBeCloseTo(5);
    expect(sessions[49].aggregate.avgScore).toBeCloseTo(54);
  });

  it('returns a SavedSession with a UUID id', () => {
    const saved = saveSession('squat', [makeRepData()]);
    expect(saved.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('stores snapshotUrl inside rep data', () => {
    const rep = makeRepData({ snapshotUrl: 'data:image/jpeg;base64,abc' });
    saveSession('squat', [rep]);
    const sessions = loadSessions();
    expect(sessions[0].reps[0].snapshotUrl).toBe('data:image/jpeg;base64,abc');
  });
});

describe('deleteSession', () => {
  it('removes the session with the given id', () => {
    const a = saveSession('squat', [makeRepData()]);
    saveSession('deadlift', [makeRepData()]);

    deleteSession(a.id);

    const sessions = loadSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].lift).toBe('deadlift');
  });

  it('is a no-op when id does not exist', () => {
    saveSession('squat', [makeRepData()]);
    expect(() => deleteSession('non-existent-id')).not.toThrow();
    expect(loadSessions()).toHaveLength(1);
  });

  it('leaves an empty store after deleting the last session', () => {
    const s = saveSession('squat', [makeRepData()]);
    deleteSession(s.id);
    expect(loadSessions()).toEqual([]);
  });
});
