import type { LiftType, LiftAngles, SquatAngles, DeadliftAngles, BenchAngles, Violation, RepPhase } from '../types';
import { qualityLabel } from '../lib/formatters';
import styles from './AngleDashboard.module.css';

interface Props {
  lift: LiftType;
  angles: LiftAngles;
  phase: RepPhase;
  repCount: number;
  lastScore: number | null;
  sessionAvg: number | null;
  violations: Violation[];
  fatigueMessage: string | null;
  fatigueSeverity: string | null;
}

const SEVERITY_ICON: Record<string, string> = {
  warning: '⚠',
  high_risk: '⚠',
  critical: '✖',
};

function fmt(n: number, unit = '°'): string {
  return isNaN(n) ? '—' : `${n.toFixed(1)}${unit}`;
}

function SquatMetrics({ a }: { a: SquatAngles }) {
  return (
    <>
      <div className={styles.metric}>
        <span className={styles.metricLabel}>Knee</span>
        <span className={styles.metricValue}>{fmt(a.kneeAngle)}</span>
      </div>
      <div className={styles.metric}>
        <span className={styles.metricLabel}>Hip</span>
        <span className={styles.metricValue}>{fmt(a.hipAngle)}</span>
      </div>
      <div className={styles.metric}>
        <span className={styles.metricLabel}>Ankle</span>
        <span className={styles.metricValue}>{fmt(a.ankleAngle)}</span>
      </div>
      <div className={styles.metric}>
        <span className={styles.metricLabel}>Trunk Lean</span>
        <span className={styles.metricValue}>{fmt(a.trunkLean)}</span>
      </div>
    </>
  );
}

function DeadliftMetrics({ a }: { a: DeadliftAngles }) {
  return (
    <>
      <div className={styles.metric}>
        <span className={styles.metricLabel}>Hip Angle</span>
        <span className={styles.metricValue}>{fmt(a.hipAngle)}</span>
      </div>
      <div className={styles.metric}>
        <span className={styles.metricLabel}>Trunk Lean</span>
        <span className={styles.metricValue}>{fmt(a.trunkLean)}</span>
      </div>
      <div className={styles.metric}>
        <span className={styles.metricLabel}>Bar Drift</span>
        <span className={styles.metricValue}>{fmt(a.barDrift, '%')}</span>
      </div>
    </>
  );
}

function BenchMetrics({ a }: { a: BenchAngles }) {
  return (
    <>
      <div className={styles.metric}>
        <span className={styles.metricLabel}>Elbow</span>
        <span className={styles.metricValue}>{fmt(a.elbowAngle)}</span>
      </div>
      <div className={styles.metric}>
        <span className={styles.metricLabel}>Elbow Flare</span>
        <span className={styles.metricValue}>{fmt(a.elbowFlare)}</span>
      </div>
    </>
  );
}

export function AngleDashboard({
  lift,
  angles,
  phase,
  repCount,
  lastScore,
  sessionAvg,
  violations,
  fatigueMessage,
  fatigueSeverity,
}: Props) {
  const quality = lastScore !== null ? qualityLabel(lastScore) : null;

  return (
    <div className={styles.root}>
      {/* Metric strip */}
      <div className={styles.metrics}>
        {lift === 'squat'    && <SquatMetrics    a={angles as SquatAngles} />}
        {lift === 'deadlift' && <DeadliftMetrics a={angles as DeadliftAngles} />}
        {lift === 'bench'    && <BenchMetrics    a={angles as BenchAngles} />}
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Phase</span>
          <span className={styles.metricValue}>{phase}</span>
        </div>
      </div>

      {/* Rep status */}
      {repCount > 0 && (
        <div className={styles.repStatus}>
          <span className={styles.repCounter}>Rep {repCount}</span>
          {lastScore !== null && quality && (
            <span className={styles.scoreBadge} data-quality={quality}>
              {lastScore}/100
            </span>
          )}
          {sessionAvg !== null && (
            <span className={styles.sessionAvg}>Session avg: {sessionAvg.toFixed(0)}/100</span>
          )}
        </div>
      )}

      {/* Fatigue banner */}
      {fatigueMessage && (
        <div className={styles.fatigueBanner} data-severity={fatigueSeverity ?? 'warning'}>
          {fatigueMessage}
        </div>
      )}

      {/* Violations */}
      {violations.length > 0 && (
        <div className={styles.violations}>
          <h3 className={styles.violTitle}>Violations</h3>
          <ul className={styles.violList}>
            {violations.map((v, i) => (
              <li key={i} className={styles.violItem} data-severity={v.severity}>
                {SEVERITY_ICON[v.severity] ?? ''} {v.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
