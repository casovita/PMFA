import { useRef, useEffect } from 'react';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import type { LiftType, SavedSession } from '../types';
import { formatLift } from '../lib/formatters';
import styles from './TrendChart.module.css';

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Legend);

const LIFT_COLOR: Record<LiftType, string> = {
  squat:    'rgba(74,222,128,0.9)',
  deadlift: 'rgba(96,165,250,0.9)',
  bench:    'rgba(251,146,60,0.9)',
};

const MIN_SESSIONS_FOR_SERIES = 3;

interface Props {
  sessions: SavedSession[];
  filterLift: LiftType | 'all';
}

/** Returns ordered sessions for a given lift, newest last (for x-axis progression). */
function sessionsForLift(sessions: SavedSession[], lift: LiftType): SavedSession[] {
  return sessions.filter((s) => s.lift === lift).sort((a, b) => a.savedAt - b.savedAt);
}

export function TrendChart({ sessions, filterLift }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<Chart | null>(null);

  const lifts: LiftType[] = filterLift === 'all'
    ? (['squat', 'deadlift', 'bench'] as LiftType[])
    : [filterLift];

  const qualifyingLifts = lifts.filter(
    (l) => sessionsForLift(sessions, l).length >= MIN_SESSIONS_FOR_SERIES,
  );

  // Build datasets
  const datasets = qualifyingLifts.map((lift) => {
    const liftSessions = sessionsForLift(sessions, lift);
    return {
      label: formatLift(lift),
      data: liftSessions.map((s, i) => ({ x: i + 1, y: Math.round(s.aggregate.avgScore * 10) / 10 })),
      borderColor: LIFT_COLOR[lift],
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      fill: false,
      tension: 0.3,
    };
  });

  useEffect(() => {
    if (qualifyingLifts.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    chartRef.current?.destroy();

    chartRef.current = new Chart(canvas, {
      type: 'line',
      data: { datasets },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: qualifyingLifts.length > 1,
            position: 'top',
            labels: { color: '#6b7280', font: { size: 11 }, boxWidth: 12, padding: 12 },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${(ctx.parsed.y as number).toFixed(1)}/100`,
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            min: 1,
            ticks: {
              color: '#4b5563',
              stepSize: 1,
              callback: (v) => `#${v as number}`,
            },
            grid: { color: '#1a1a1a' },
            title: { display: true, text: 'Session', color: '#374151', font: { size: 10 } },
          },
          y: {
            min: 0,
            max: 100,
            ticks: { color: '#4b5563', stepSize: 25 },
            grid: { color: '#1a1a1a' },
            title: { display: true, text: 'Avg Score', color: '#374151', font: { size: 10 } },
          },
        },
      },
    });

    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  // Rebuild chart when sessions or filter changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.length, filterLift]);

  if (qualifyingLifts.length === 0) return null;

  return (
    <div className={styles.root}>
      <span className={styles.title}>Score Trend</span>
      <div className={styles.chartWrap}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
