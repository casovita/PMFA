/**
 * Test data factories — produce minimal valid objects for each domain type.
 * All fields have sensible defaults; callers override only what they care about.
 */

import type { RepData, SavedSession, Violation, LiftType } from '../types';
import { computeAggregate } from '../lib/historyStore';

export function makeViolation(overrides: Partial<Violation> = {}): Violation {
  return {
    type: 'trunk_lean',
    severity: 'warning',
    message: 'Excessive trunk lean detected',
    ...overrides,
  };
}

export function makeRepData(overrides: Partial<RepData> = {}): RepData {
  return {
    repNumber: 1,
    lift: 'squat',
    startTime: 0,
    endTime: 3,
    bottomTime: 1.5,
    primaryAngle: 85,
    maxTrunkLean: 20,
    timeUnderTension: 3,
    violations: [],
    score: 80,
    ...overrides,
  };
}

export function makeSession(
  lift: LiftType = 'squat',
  reps: RepData[] = [makeRepData()],
  overrides: Partial<SavedSession> = {},
): SavedSession {
  return {
    id: crypto.randomUUID(),
    savedAt: Date.now(),
    lift,
    reps,
    aggregate: computeAggregate(reps),
    ...overrides,
  };
}
