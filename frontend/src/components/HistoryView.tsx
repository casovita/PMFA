import { useState } from 'react';
import type { LiftType, SavedSession } from '../types';
import { formatLift } from '../lib/formatters';
import { SessionCard } from './SessionCard';
import { TrendChart } from './TrendChart';
import styles from './HistoryView.module.css';

type FilterLift = LiftType | 'all';

const FILTERS: { value: FilterLift; label: string }[] = [
  { value: 'all',      label: 'All' },
  { value: 'squat',    label: 'Squat' },
  { value: 'deadlift', label: 'Deadlift' },
  { value: 'bench',    label: 'Bench' },
];

interface Props {
  sessions: SavedSession[];
  onDeleteSession: (id: string) => void;
}

export function HistoryView({ sessions, onDeleteSession }: Props) {
  const [filterLift, setFilterLift] = useState<FilterLift>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Newest first for display
  const filtered = sessions
    .filter((s) => filterLift === 'all' || s.lift === filterLift)
    .slice()
    .reverse();

  function handleToggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleDelete(id: string) {
    if (expandedId === id) setExpandedId(null);
    onDeleteSession(id);
  }

  return (
    <div className={styles.root}>
      {/* ── Lift filter ── */}
      <div className={styles.filterRow}>
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            className={styles.filterBtn}
            data-active={filterLift === value}
            onClick={() => setFilterLift(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Trend chart (all sessions, respects filter) ── */}
      <TrendChart sessions={sessions} filterLift={filterLift} />

      {/* ── Session list ── */}
      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>
            {filterLift === 'all'
              ? 'No sessions recorded yet'
              : `No ${formatLift(filterLift)} sessions recorded`}
          </p>
          <p className={styles.emptyHint}>
            Complete an analysis and stop recording — sessions are saved automatically.
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {filtered.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              expanded={expandedId === session.id}
              onToggle={() => handleToggle(session.id)}
              onDelete={() => handleDelete(session.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
