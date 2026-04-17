import type { CoachingCue } from '../lib/feedbackEngine';
import type { LiftType } from '../types';
import styles from './FeedbackPanel.module.css';

interface Props {
  cues: CoachingCue[];
  lift: LiftType;
  repCount: number;
}

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'Critical',
  high_risk: 'High Risk',
  warning: 'Warning',
};

export function FeedbackPanel({ cues, lift: _lift, repCount }: Props) {
  if (cues.length === 0) return null;

  return (
    <section className={styles.panel} aria-label="Coaching feedback">
      <h3 className={styles.heading}>
        Coaching Cues
        <span className={styles.setMeta}>{repCount} rep{repCount !== 1 ? 's' : ''}</span>
      </h3>
      <ol className={styles.list}>
        {cues.map((cue, i) => (
          <li key={cue.violationType} className={styles.item} data-severity={cue.severity}>
            <div className={styles.itemHeader}>
              <span className={styles.rank}>{i + 1}</span>
              <span className={styles.label}>{cue.label}</span>
              <span className={styles.badge} data-severity={cue.severity}>
                {SEVERITY_LABEL[cue.severity]}
              </span>
              {cue.repCount > 1 && (
                <span className={styles.freq}>{cue.repCount} reps</span>
              )}
            </div>
            <p className={styles.cueText}>{cue.cue}</p>
          </li>
        ))}
      </ol>
      <p className={styles.footer}>
        Phase 3: LLM-powered cues with athlete context
      </p>
    </section>
  );
}
