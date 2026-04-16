import { describe, it, expect } from 'vitest';
import { qualityLabel, formatDate, formatLift } from './formatters';

// ── qualityLabel ──────────────────────────────────────────────────────────────

describe('qualityLabel', () => {
  it('returns "excellent" for score >= 90', () => {
    expect(qualityLabel(100)).toBe('excellent');
    expect(qualityLabel(90)).toBe('excellent');
  });

  it('returns "good" for score 75–89', () => {
    expect(qualityLabel(89)).toBe('good');
    expect(qualityLabel(75)).toBe('good');
  });

  it('returns "fair" for score 55–74', () => {
    expect(qualityLabel(74)).toBe('fair');
    expect(qualityLabel(55)).toBe('fair');
  });

  it('returns "poor" for score < 55', () => {
    expect(qualityLabel(54)).toBe('poor');
    expect(qualityLabel(0)).toBe('poor');
  });

  // Boundary values — each threshold is inclusive at the top of its band
  it.each([
    [90, 'excellent'],
    [89, 'good'],
    [75, 'good'],
    [74, 'fair'],
    [55, 'fair'],
    [54, 'poor'],
  ] as const)('score %i → %s', (score, expected) => {
    expect(qualityLabel(score)).toBe(expected);
  });
});

// ── formatDate ────────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('returns a non-empty string for any epoch value', () => {
    const result = formatDate(Date.now());
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes the year from the epoch', () => {
    // Use a fixed date to avoid locale issues: Jan 15 2025, noon UTC
    const epoch = new Date('2025-01-15T12:00:00Z').getTime();
    const result = formatDate(epoch);
    expect(result).toContain('2025');
  });

  it('handles epoch 0 without throwing', () => {
    expect(() => formatDate(0)).not.toThrow();
  });
});

// ── formatLift ────────────────────────────────────────────────────────────────

describe('formatLift', () => {
  it('formats each lift type correctly', () => {
    expect(formatLift('squat')).toBe('Squat');
    expect(formatLift('deadlift')).toBe('Deadlift');
    expect(formatLift('bench')).toBe('Bench Press');
  });
});
