import { describe, it, expect } from 'vitest';
import { generateFeedback } from './feedbackEngine';
import { makeRepData, makeViolation } from '../test/factories';

// ── generateFeedback ──────────────────────────────────────────────────────────

describe('generateFeedback', () => {
  it('returns empty array for no reps', () => {
    expect(generateFeedback([], 'squat')).toEqual([]);
  });

  it('returns empty array when reps have no violations', () => {
    const reps = [makeRepData({ violations: [] }), makeRepData({ violations: [] })];
    expect(generateFeedback(reps, 'squat')).toEqual([]);
  });

  it('returns at most 3 cues regardless of violation count', () => {
    const violations = [
      makeViolation({ type: 'trunk_lean', severity: 'warning' }),
      makeViolation({ type: 'knee_valgus', severity: 'warning' }),
      makeViolation({ type: 'depth', severity: 'warning' }),
      makeViolation({ type: 'ankle_dorsiflexion', severity: 'warning' }),
      makeViolation({ type: 'butt_wink', severity: 'warning' }),
    ];
    const reps = [makeRepData({ violations })];
    const cues = generateFeedback(reps, 'squat');
    expect(cues.length).toBeLessThanOrEqual(3);
  });

  it('prioritizes critical over warning severity', () => {
    const reps = [
      makeRepData({
        violations: [
          makeViolation({ type: 'depth', severity: 'warning' }),
          makeViolation({ type: 'trunk_lean', severity: 'critical' }),
        ],
      }),
    ];
    const cues = generateFeedback(reps, 'squat');
    expect(cues[0].violationType).toBe('trunk_lean');
    expect(cues[0].severity).toBe('critical');
  });

  it('prioritizes lumbar_flexion over depth when same severity', () => {
    const reps = [
      makeRepData({
        violations: [
          makeViolation({ type: 'depth', severity: 'high_risk' }),
          makeViolation({ type: 'lumbar_flexion', severity: 'high_risk' }),
        ],
      }),
    ];
    const cues = generateFeedback(reps, 'deadlift');
    expect(cues[0].violationType).toBe('lumbar_flexion');
  });

  it('includes repCount correctly across multiple reps', () => {
    const reps = [
      makeRepData({ violations: [makeViolation({ type: 'depth', severity: 'warning' })] }),
      makeRepData({ violations: [makeViolation({ type: 'depth', severity: 'warning' })] }),
      makeRepData({ violations: [] }),
    ];
    const cues = generateFeedback(reps, 'squat');
    const depthCue = cues.find((c) => c.violationType === 'depth');
    expect(depthCue).toBeDefined();
    expect(depthCue!.repCount).toBe(2);
  });

  it('uses worst severity when violation appears across multiple reps', () => {
    const reps = [
      makeRepData({ violations: [makeViolation({ type: 'trunk_lean', severity: 'warning' })] }),
      makeRepData({ violations: [makeViolation({ type: 'trunk_lean', severity: 'critical' })] }),
    ];
    const cues = generateFeedback(reps, 'squat');
    const trunkCue = cues.find((c) => c.violationType === 'trunk_lean');
    expect(trunkCue?.severity).toBe('critical');
  });

  it('counts each violation type once per rep (not per frame)', () => {
    // Same violation type appears twice in the same rep's violations array
    const reps = [
      makeRepData({
        violations: [
          makeViolation({ type: 'knee_valgus', severity: 'warning' }),
          makeViolation({ type: 'knee_valgus', severity: 'warning' }),
        ],
      }),
    ];
    const cues = generateFeedback(reps, 'squat');
    const valgusCue = cues.find((c) => c.violationType === 'knee_valgus');
    expect(valgusCue?.repCount).toBe(1);
  });

  it('returns a cue with non-empty cue text', () => {
    const reps = [makeRepData({ violations: [makeViolation({ type: 'depth', severity: 'warning' })] })];
    const cues = generateFeedback(reps, 'squat');
    expect(cues[0].cue.length).toBeGreaterThan(10);
  });

  it('returns a label for each cue', () => {
    const reps = [makeRepData({ violations: [makeViolation({ type: 'bar_drift', severity: 'high_risk' })] })];
    const cues = generateFeedback(reps, 'deadlift');
    expect(cues[0].label).toBe('Bar path');
  });

  it('omits unknown violation types without crashing', () => {
    const reps = [makeRepData({ violations: [makeViolation({ type: 'unknown_type', severity: 'warning' })] })];
    expect(() => generateFeedback(reps, 'squat')).not.toThrow();
    const cues = generateFeedback(reps, 'squat');
    expect(cues.length).toBe(0);
  });

  it('works for all three lift types', () => {
    const squat = [makeRepData({ lift: 'squat', violations: [makeViolation({ type: 'depth', severity: 'warning' })] })];
    const deadlift = [makeRepData({ lift: 'deadlift', violations: [makeViolation({ type: 'lumbar_flexion', severity: 'warning' })] })];
    const bench = [makeRepData({ lift: 'bench', violations: [makeViolation({ type: 'elbow_depth', severity: 'high_risk' })] })];

    expect(generateFeedback(squat, 'squat').length).toBeGreaterThan(0);
    expect(generateFeedback(deadlift, 'deadlift').length).toBeGreaterThan(0);
    expect(generateFeedback(bench, 'bench').length).toBeGreaterThan(0);
  });
});
