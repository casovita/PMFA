import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ScoreSparkline } from './ScoreSparkline';

describe('ScoreSparkline', () => {
  it('renders nothing for an empty scores array', () => {
    const { container } = render(<ScoreSparkline scores={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a single <circle> for one score', () => {
    const { container } = render(<ScoreSparkline scores={[80]} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.querySelector('circle')).not.toBeNull();
    expect(svg!.querySelector('polyline')).toBeNull();
  });

  it('renders a <polyline> (not a circle) for two or more scores', () => {
    const { container } = render(<ScoreSparkline scores={[80, 70, 90]} />);
    const svg = container.querySelector('svg');
    expect(svg!.querySelector('polyline')).not.toBeNull();
    expect(svg!.querySelector('circle')).toBeNull();
  });

  it('uses default 60×24 dimensions', () => {
    const { container } = render(<ScoreSparkline scores={[80, 70]} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('60');
    expect(svg.getAttribute('height')).toBe('24');
  });

  it('respects custom width and height props', () => {
    const { container } = render(<ScoreSparkline scores={[80, 70]} width={120} height={40} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('120');
    expect(svg.getAttribute('height')).toBe('40');
  });

  describe('stroke color by last score quality', () => {
    it('uses green (#4ade80) for excellent last score (≥90)', () => {
      const { container } = render(<ScoreSparkline scores={[50, 90]} />);
      const poly = container.querySelector('polyline')!;
      expect(poly.getAttribute('stroke')).toBe('#4ade80');
    });

    it('uses light green (#86efac) for good last score (75–89)', () => {
      const { container } = render(<ScoreSparkline scores={[50, 80]} />);
      expect(container.querySelector('polyline')!.getAttribute('stroke')).toBe('#86efac');
    });

    it('uses yellow (#fde68a) for fair last score (55–74)', () => {
      const { container } = render(<ScoreSparkline scores={[50, 60]} />);
      expect(container.querySelector('polyline')!.getAttribute('stroke')).toBe('#fde68a');
    });

    it('uses red (#fca5a5) for poor last score (<55)', () => {
      const { container } = render(<ScoreSparkline scores={[50, 40]} />);
      expect(container.querySelector('polyline')!.getAttribute('stroke')).toBe('#fca5a5');
    });

    it('applies color to circle when only one score', () => {
      const { container } = render(<ScoreSparkline scores={[95]} />);
      expect(container.querySelector('circle')!.getAttribute('fill')).toBe('#4ade80');
    });
  });

  it('polyline has at least as many coordinate pairs as scores', () => {
    const scores = [80, 70, 65, 90, 85];
    const { container } = render(<ScoreSparkline scores={scores} />);
    const points = container.querySelector('polyline')!.getAttribute('points')!;
    const pairs = points.trim().split(/\s+/);
    expect(pairs).toHaveLength(scores.length);
  });
});
