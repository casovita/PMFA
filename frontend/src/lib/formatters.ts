import type { LiftType, QualityLabel } from '../types';

export function qualityLabel(score: number): QualityLabel {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 55) return 'fair';
  return 'poor';
}

export function formatDate(epochMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(epochMs));
}

export function formatLift(lift: LiftType): string {
  const labels: Record<LiftType, string> = {
    squat: 'Squat',
    deadlift: 'Deadlift',
    bench: 'Bench Press',
  };
  return labels[lift];
}
