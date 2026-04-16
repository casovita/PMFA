import { useState } from 'react';
import type { LiftType, RepData } from '../types';
import { qualityLabel } from '../lib/formatters';
import styles from './RepTimeline.module.css';

interface Props {
  reps: RepData[];
}

const PRIMARY_LABEL: Record<LiftType, string> = {
  squat:    'Knee',
  deadlift: 'Hip',
  bench:    'Elbow',
};

export function RepTimeline({ reps }: Props) {
  const [open, setOpen] = useState(false);

  if (reps.length === 0) return null;

  return (
    <div className={styles.root}>
      <button className={styles.toggle} onClick={() => setOpen((v) => !v)}>
        <span>Rep History ({reps.length})</span>
        <span className={styles.chevron}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <ul className={styles.list}>
          {reps.map((rep) => {
            const score = rep.score ?? 0;
            const q = qualityLabel(score);
            const uniqueTypes = [...new Set(rep.violations.map((v) => v.type))];
            const violSummary =
              uniqueTypes.length > 0
                ? uniqueTypes.map((t) => t.replace(/_/g, ' ')).join(', ')
                : 'No violations';
            const angleLabel = PRIMARY_LABEL[rep.lift];

            return (
              <li key={rep.repNumber} className={styles.item}>
                <span className={styles.repNum}>#{rep.repNumber}</span>
                <div className={styles.details}>
                  <div className={styles.stats}>
                    <span>{angleLabel}: {rep.primaryAngle.toFixed(1)}°</span>
                    <span>Trunk: {rep.maxTrunkLean.toFixed(1)}°</span>
                    <span>TUT: {rep.timeUnderTension.toFixed(1)}s</span>
                  </div>
                  <div className={styles.violSummary}>{violSummary}</div>
                </div>
                <span className={styles.miniScore} data-quality={q}>
                  {score}/100
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
