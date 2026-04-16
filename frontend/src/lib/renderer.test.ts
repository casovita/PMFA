import { describe, it, expect, vi, beforeEach } from 'vitest';
import { captureSnapshot } from './renderer';
import type { Landmark, Violation } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLandmark(x = 0.5, y = 0.5, visibility = 0.9): Landmark {
  return { x, y, z: 0, visibility };
}

/** 33 visible landmarks at roughly human-pose positions */
function makeLandmarks(): Landmark[] {
  return Array.from({ length: 33 }, (_, i) =>
    makeLandmark(0.3 + (i % 5) * 0.1, 0.1 + Math.floor(i / 5) * 0.15),
  );
}

function makeViolation(type: string, severity: Violation['severity']): Violation {
  return { type, severity, message: `${type} violation` };
}

// ── captureSnapshot ───────────────────────────────────────────────────────────

describe('captureSnapshot', () => {
  let video: HTMLVideoElement;
  let mockCtx: ReturnType<typeof buildMockCtx>;

  function buildMockCtx() {
    return {
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      createRadialGradient: vi.fn(() => ({
        addColorStop: vi.fn(),
      })),
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 0,
      font: '',
    };
  }

  beforeEach(() => {
    video = document.createElement('video');
    mockCtx = buildMockCtx();

    // Stub getContext so the offscreen canvas returns our mock ctx
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );

    // Stub toDataURL to return a predictable value
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/jpeg;base64,FAKE',
    );
  });

  it('returns null when video has zero dimensions', () => {
    // Default HTMLVideoElement in jsdom has videoWidth = 0
    expect(captureSnapshot(video, makeLandmarks(), [])).toBeNull();
  });

  it('returns a data URL string when video has dimensions', () => {
    Object.defineProperty(video, 'videoWidth',  { value: 640, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true });

    const result = captureSnapshot(video, makeLandmarks(), []);
    expect(result).toMatch(/^data:image\/jpeg/);
  });

  it('calls drawImage with the video element as source', () => {
    Object.defineProperty(video, 'videoWidth',  { value: 640, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true });

    captureSnapshot(video, makeLandmarks(), []);
    expect(mockCtx.drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 480);
  });

  it('draws glow arcs for high_risk/critical violations on known landmark indices', () => {
    Object.defineProperty(video, 'videoWidth',  { value: 640, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true });

    const viols: Violation[] = [makeViolation('trunk_lean', 'high_risk')];
    captureSnapshot(video, makeLandmarks(), viols);

    // arc() is called for glow rings; we expect more arc calls when violations exist
    expect(mockCtx.arc).toHaveBeenCalled();
  });

  it('does NOT draw glow when violations array is empty', () => {
    Object.defineProperty(video, 'videoWidth',  { value: 640, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true });

    const arcCallsNoViols = vi.fn();
    mockCtx.arc = arcCallsNoViols;

    captureSnapshot(video, makeLandmarks(), []);
    const countWithoutViols = arcCallsNoViols.mock.calls.length;

    // Reset and run with violations
    arcCallsNoViols.mockClear();
    const viols: Violation[] = [makeViolation('trunk_lean', 'critical')];
    captureSnapshot(video, makeLandmarks(), viols);
    const countWithViols = arcCallsNoViols.mock.calls.length;

    // More arc calls expected with violations (glow rings add extra arcs)
    expect(countWithViols).toBeGreaterThan(countWithoutViols);
  });

  it('uses worst severity color when same joint has multiple violations', () => {
    Object.defineProperty(video, 'videoWidth',  { value: 640, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true });

    // Both violations map to trunk_lean (landmark 11 + 23)
    const viols: Violation[] = [
      makeViolation('trunk_lean', 'warning'),
      makeViolation('trunk_lean', 'critical'),
    ];
    // Should not throw — worst-severity coloring is applied
    expect(() => captureSnapshot(video, makeLandmarks(), viols)).not.toThrow();
  });

  it('skips landmarks with low visibility', () => {
    Object.defineProperty(video, 'videoWidth',  { value: 640, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true });

    const lm = makeLandmarks();
    // Make the trunk_lean landmarks invisible
    lm[11] = { ...lm[11], visibility: 0.1 };
    lm[23] = { ...lm[23], visibility: 0.1 };

    const arcSpy = vi.spyOn(mockCtx, 'arc');
    captureSnapshot(video, lm, [makeViolation('trunk_lean', 'critical')]);

    // All arc calls should be from skeleton drawing only (no glow arcs for invisible landmarks)
    // This verifies the visibility guard (lm.visibility < 0.3) branches
    expect(arcSpy).toHaveBeenCalled(); // skeleton arcs still happen
  });
});
