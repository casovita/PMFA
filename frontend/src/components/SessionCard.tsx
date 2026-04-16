import type { SavedSession } from '../types';
import { qualityLabel, formatDate, formatLift } from '../lib/formatters';
import { ScoreSparkline } from './ScoreSparkline';
import { SessionDetail } from './SessionDetail';
import styles from './SessionCard.module.css';

const LIFT_COLOR: Record<string, string> = {
  squat: 'squat',
  deadlift: 'deadlift',
  bench: 'bench',
};

interface Props {
  session: SavedSession;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}

export function SessionCard({ session, expanded, onToggle, onDelete }: Props) {
  const { aggregate, lift, savedAt } = session;
  const avgQ = qualityLabel(aggregate.avgScore);

  return (
    <div className={styles.card} data-expanded={expanded}>
      {/* ── Card header (click to expand) ── */}
      <button className={styles.header} onClick={onToggle} aria-expanded={expanded}>
        <span className={styles.liftBadge} data-lift={LIFT_COLOR[lift]}>
          {formatLift(lift)}
        </span>

        <span className={styles.date}>{formatDate(savedAt)}</span>

        <div className={styles.meta}>
          <span className={styles.repCount}>{aggregate.repCount} reps</span>
          <span className={styles.avgScore} data-quality={avgQ}>
            {aggregate.avgScore.toFixed(0)}/100
          </span>
        </div>

        <div className={styles.sparklineWrap}>
          <ScoreSparkline scores={aggregate.scores} />
        </div>

        <div className={styles.actions}>
          <button
            className={styles.deleteBtn}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            aria-label="Delete session"
            title="Delete session"
          >
            ✕
          </button>
          <span className={styles.chevron}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* ── Expanded detail ── */}
      {expanded && <SessionDetail reps={session.reps} lift={lift} />}
    </div>
  );
}
