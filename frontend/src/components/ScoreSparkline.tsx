/** Tiny SVG sparkline showing per-rep score progression. No Chart.js — pure SVG. */

interface Props {
  scores: number[];
  width?: number;
  height?: number;
}

function strokeColor(lastScore: number): string {
  if (lastScore >= 90) return '#4ade80';
  if (lastScore >= 75) return '#86efac';
  if (lastScore >= 55) return '#fde68a';
  return '#fca5a5';
}

export function ScoreSparkline({ scores, width = 60, height = 24 }: Props) {
  if (scores.length === 0) return null;

  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const color = strokeColor(scores[scores.length - 1]);

  if (scores.length === 1) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <circle cx={width / 2} cy={height / 2} r={2.5} fill={color} />
      </svg>
    );
  }

  // Normalize scores to pixel coords. 0→bottom, 100→top.
  const points = scores.map((s, i) => {
    const x = pad + (i / (scores.length - 1)) * w;
    const y = pad + h - (Math.max(0, Math.min(100, s)) / 100) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
