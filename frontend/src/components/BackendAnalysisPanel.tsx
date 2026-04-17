import type { BackendAnalysisResult, BackendViolation, JobStatusCode } from '../lib/api';
import styles from './BackendAnalysisPanel.module.css';

interface Props {
  status: JobStatusCode | 'uploading';
  result: BackendAnalysisResult | null;
  error: string | null;
}

const SEV_LABEL: Record<string, string> = {
  critical: 'Critical',
  high_risk: 'High Risk',
  warning: 'Warning',
};

const METRIC_LABEL: Record<string, string> = {
  trunk_lean: 'Trunk Lean',
  hip_flexion: 'Hip Flexion',
  dorsiflexion: 'Ankle Dorsiflexion',
  knee_flexion: 'Knee Flexion',
  elbow_flexion: 'Elbow Flexion',
};

function ViolationRow({ v }: { v: BackendViolation }) {
  return (
    <li className={styles.violationItem} data-severity={v.severity}>
      <span className={styles.vMetric}>{METRIC_LABEL[v.metric] ?? v.metric}</span>
      <span className={styles.vValue}>{v.value.toFixed(1)}°</span>
      <span className={styles.vThreshold}>limit {v.threshold.toFixed(1)}°</span>
      <span className={styles.vBadge} data-severity={v.severity}>
        {SEV_LABEL[v.severity] ?? v.severity}
      </span>
    </li>
  );
}

export function BackendAnalysisPanel({ status, result, error }: Props) {
  if (status === 'uploading' || status === 'pending' || status === 'processing') {
    return (
      <section className={styles.panel} aria-label="Server analysis">
        <h3 className={styles.heading}>
          Server Analysis
          <span className={styles.statusBadge} data-status="processing">Processing</span>
        </h3>
        <div className={styles.spinnerRow}>
          <span className={styles.spinner} aria-hidden="true" />
          <span className={styles.spinnerText}>
            {status === 'uploading'
              ? 'Uploading video…'
              : 'YOLOv8 pose analysis running…'}
          </span>
        </div>
      </section>
    );
  }

  if (status === 'failed' || error) {
    return (
      <section className={styles.panel} data-state="error" aria-label="Server analysis">
        <h3 className={styles.heading}>
          Server Analysis
          <span className={styles.statusBadge} data-status="failed">Failed</span>
        </h3>
        <p className={styles.errorMsg}>{error ?? 'Server analysis failed.'}</p>
      </section>
    );
  }

  if (status !== 'completed' || !result) return null;

  const topViolations = result.violations.slice(0, 4);

  return (
    <section className={styles.panel} aria-label="Server analysis results">
      <h3 className={styles.heading}>
        Server Analysis
        <span className={styles.statusBadge} data-status="done">YOLOv8</span>
        <span className={styles.procTime}>{result.processing_time_sec.toFixed(1)}s</span>
      </h3>

      {/* Score row */}
      <div className={styles.scoreRow}>
        <div className={styles.scoreBlock}>
          <span className={styles.scoreValue}>{result.overall_score.toFixed(0)}</span>
          <span className={styles.scoreLabel}>Overall Score</span>
        </div>
        <div className={styles.scoreBlock}>
          <span className={styles.qualityValue} data-quality={result.quality_label}>
            {result.quality_label.charAt(0).toUpperCase() + result.quality_label.slice(1)}
          </span>
          <span className={styles.scoreLabel}>Quality</span>
        </div>
        <div className={styles.scoreBlock}>
          <span className={styles.scoreValue}>{result.total_reps}</span>
          <span className={styles.scoreLabel}>Reps detected</span>
        </div>
      </div>

      {/* Per-rep scores */}
      {result.rep_metrics.length > 0 && (
        <div className={styles.repGrid}>
          {result.rep_metrics.map((rep) => (
            <div
              key={rep.rep_number}
              className={styles.repCell}
              data-quality={rep.quality_label}
              title={`Rep ${rep.rep_number}: ${rep.quality_label} · TUT ${rep.time_under_tension_sec.toFixed(1)}s`}
            >
              <span className={styles.repNum}>Rep {rep.rep_number}</span>
              <span className={styles.repScore}>{rep.score.toFixed(0)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Top violations */}
      {topViolations.length > 0 && (
        <>
          <p className={styles.sectionLabel}>Top violations this set</p>
          <ul className={styles.violationList}>
            {topViolations.map((v) => (
              <ViolationRow key={v.rule_id} v={v} />
            ))}
          </ul>
        </>
      )}

      {/* Fatigue flags */}
      {result.fatigue_flags.length > 0 && (
        <p className={styles.fatigueNote}>
          Fatigue drift detected on rep{result.fatigue_flags.length > 1 ? 's' : ''}{' '}
          {result.fatigue_flags.map((f) => f.rep).join(', ')} — trunk lean increasing.
        </p>
      )}

      {result.total_reps === 0 && (
        <p className={styles.noReps}>
          No reps detected — ensure the camera has a clear side view.
        </p>
      )}
    </section>
  );
}
