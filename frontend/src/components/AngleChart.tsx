import { useRef, useEffect } from 'react';
import { Chart, LineController, LineElement, PointElement, LinearScale, Filler, Tooltip } from 'chart.js';
import type { LiftType, FrameData } from '../types';
import styles from './AngleChart.module.css';

Chart.register(LineController, LineElement, PointElement, LinearScale, Filler, Tooltip);

const LIFT_LABEL: Record<LiftType, string> = {
  squat:    'Knee Angle (°)',
  deadlift: 'Hip Angle (°)',
  bench:    'Elbow Angle (°)',
};

const LIFT_COLOR: Record<LiftType, string> = {
  squat:    'rgba(74,222,128,0.9)',
  deadlift: 'rgba(96,165,250,0.9)',
  bench:    'rgba(251,146,60,0.9)',
};

const MAX_VISIBLE_POINTS = 300; // display last ~10s at 30fps

interface Props {
  frameData: FrameData[];
  lift: LiftType;
}

export function AngleChart({ frameData, lift }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const chartRef   = useRef<Chart | null>(null);
  const prevLiftRef = useRef<LiftType>(lift);

  // Create chart on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    chartRef.current = new Chart(canvas, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: LIFT_LABEL[lift],
          data: [],
          borderColor: LIFT_COLOR[lift],
          backgroundColor: LIFT_COLOR[lift].replace('0.9)', '0.1)'),
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
          tension: 0.3,
        }],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${(ctx.parsed.y as number).toFixed(1)}°`,
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            ticks: {
              color: '#555',
              maxTicksLimit: 6,
              callback: (v) => `${(v as number).toFixed(0)}s`,
            },
            grid: { color: '#222' },
          },
          y: {
            min: 0,
            max: 180,
            ticks: { color: '#555', stepSize: 30 },
            grid: { color: '#222' },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update chart data when frameData or lift changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const liftChanged = prevLiftRef.current !== lift;
    prevLiftRef.current = lift;

    // Slice to the most recent MAX_VISIBLE_POINTS
    const slice = frameData.slice(-MAX_VISIBLE_POINTS);
    const points = slice
      .filter((f) => f.lift === lift && !isNaN(f.primaryAngle))
      .map((f) => ({ x: f.time, y: f.primaryAngle }));

    const ds = chart.data.datasets[0];
    if (!ds) return;

    if (liftChanged) {
      ds.label = LIFT_LABEL[lift];
      ds.borderColor = LIFT_COLOR[lift];
      ds.backgroundColor = LIFT_COLOR[lift].replace('0.9)', '0.1)');
    }

    ds.data = points;
    chart.update('none');
  }, [frameData, lift]);

  return (
    <div className={styles.root}>
      <span className={styles.title}>{LIFT_LABEL[lift]}</span>
      <div className={styles.chartWrap}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
