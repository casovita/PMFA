import { useState } from 'react';
import type { LiftType, RepData } from '../types';
import { qualityLabel } from '../lib/formatters';
import styles from './SessionDetail.module.css';

const PRIMARY_LABEL: Record<LiftType, string> = {
  squat: 'Knee',
  deadlift: 'Hip',
  bench: 'Elbow',
};

interface Props {
  reps: RepData[];
  lift: LiftType;
}

export function SessionDetail({ reps, lift }: Props) {
  const angleLabel = PRIMARY_LABEL[lift];
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxCaption, setLightboxCaption] = useState<string>('');

  const hasSnapshots = reps.some((r) => r.snapshotUrl);

  return (
    <div className={styles.root}>
      <table className={styles.table}>
        <thead>
          <tr className={styles.headerRow}>
            <th className={styles.th}>
              <span className={styles.colLabel}>#</span>
              <span className={styles.colSub}>rep</span>
            </th>
            <th className={styles.th}>
              <span className={styles.colLabel}>{angleLabel}</span>
              <span className={styles.colSub}>min angle</span>
            </th>
            <th className={styles.th}>
              <span className={styles.colLabel}>Trunk</span>
              <span className={styles.colSub}>max lean</span>
            </th>
            <th className={styles.th}>
              <span className={styles.colLabel}>TUT</span>
              <span className={styles.colSub}>time under tension</span>
            </th>
            <th className={styles.th}>
              <span className={styles.colLabel}>Violations</span>
              <span className={styles.colSub}>flagged issues</span>
            </th>
            <th className={styles.th}>
              <span className={styles.colLabel}>Score</span>
              <span className={styles.colSub}>rep quality 0–100</span>
            </th>
            {hasSnapshots && (
              <th className={styles.th}>
                <span className={styles.colLabel}>Snapshot</span>
                <span className={styles.colSub}>worst violation frame</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {reps.map((rep) => {
            const score = rep.score ?? 0;
            const q = qualityLabel(score);
            const uniqueTypes = [...new Set(rep.violations.map((v) => v.type))];
            const violSummary =
              uniqueTypes.length > 0
                ? uniqueTypes.map((t) => t.replace(/_/g, ' ')).join(', ')
                : '—';

            return (
              <tr key={rep.repNumber} className={styles.row}>
                <td className={styles.repNum}>#{rep.repNumber}</td>
                <td className={styles.td}>{rep.primaryAngle.toFixed(1)}°</td>
                <td className={styles.td}>{rep.maxTrunkLean.toFixed(1)}°</td>
                <td className={styles.td}>{rep.timeUnderTension.toFixed(1)}s</td>
                <td className={styles.violations}>{violSummary}</td>
                <td className={styles.td}>
                  <span className={styles.scoreBadge} data-quality={q}>
                    {score}
                  </span>
                </td>
                {hasSnapshots && (
                  <td className={styles.snapshotCell}>
                    {rep.snapshotUrl ? (
                      <img
                        className={styles.thumbnail}
                        src={rep.snapshotUrl}
                        alt={`Rep ${rep.repNumber} violation frame`}
                        onClick={() => {
                          setLightboxUrl(rep.snapshotUrl!);
                          setLightboxCaption(
                            uniqueTypes.length > 0
                              ? uniqueTypes.map((t) => t.replace(/_/g, ' ')).join(' · ')
                              : 'Form issue',
                          );
                        }}
                      />
                    ) : (
                      <span className={styles.noSnap}>—</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className={styles.lightboxBackdrop}
          onClick={() => setLightboxUrl(null)}
        >
          <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
            <img className={styles.lightboxImg} src={lightboxUrl} alt="Violation frame" />
            {lightboxCaption && (
              <p className={styles.lightboxCaption}>{lightboxCaption}</p>
            )}
            <button
              className={styles.lightboxClose}
              onClick={() => setLightboxUrl(null)}
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
