import type { LiftType } from '../types';
import styles from './LiftSelector.module.css';

interface Props {
  selected: LiftType;
  onChange: (lift: LiftType) => void;
}

const LIFTS: { id: LiftType; label: string }[] = [
  { id: 'squat', label: 'Squat' },
  { id: 'deadlift', label: 'Deadlift' },
  { id: 'bench', label: 'Bench Press' },
];

export function LiftSelector({ selected, onChange }: Props) {
  return (
    <div className={styles.root}>
      {LIFTS.map(({ id, label }) => (
        <button
          key={id}
          className={styles.btn}
          data-active={selected === id ? 'true' : undefined}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
