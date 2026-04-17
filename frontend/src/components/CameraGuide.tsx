import { useState, useRef, useEffect } from 'react';
import type { LiftType } from '../types';
import styles from './CameraGuide.module.css';

// ── SVG illustrations ─────────────────────────────────────────────────────────

/** Top-down schematic: camera to the side, athlete facing forward. */
function SagittalDiagram({ cameraHeight }: { cameraHeight: string }) {
  return (
    <svg width="230" height="176" viewBox="0 0 230 176" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background */}
      <rect width="230" height="176" rx="6" fill="#0c0c0c" />

      {/* Subtle floor grid */}
      {[40, 80, 120, 160, 200].map((x) => (
        <line key={`gv${x}`} x1={x} y1="0" x2={x} y2="176" stroke="#161616" strokeWidth="1" />
      ))}
      {[44, 88, 132].map((y) => (
        <line key={`gh${y}`} x1="0" y1={y} x2="230" y2={y} stroke="#161616" strokeWidth="1" />
      ))}

      {/* ── Label ── */}
      <text x="115" y="16" textAnchor="middle" fontSize="8" fill="#3d4451" fontFamily="system-ui" fontWeight="600" letterSpacing="1.5">
        TOP-DOWN VIEW
      </text>

      {/* ── Athlete ── */}
      {/* Body oval */}
      <ellipse cx="160" cy="92" rx="12" ry="22" fill="#1c2330" stroke="#374151" strokeWidth="1.5" />
      {/* Head circle */}
      <circle cx="160" cy="60" r="10" fill="#1c2330" stroke="#374151" strokeWidth="1.5" />
      {/* Forward arrow (facing up = facing camera's 12 o'clock) */}
      <line x1="160" y1="49" x2="160" y2="30" stroke="#6b7280" strokeWidth="1.5" />
      <polygon points="160,23 154,31 166,31" fill="#6b7280" />
      <text x="172" y="33" fontSize="7.5" fill="#4b5563" fontFamily="system-ui">fwd</text>
      {/* Label */}
      <text x="160" y="126" textAnchor="middle" fontSize="8" fill="#4b5563" fontFamily="system-ui">
        athlete
      </text>

      {/* ── Camera ── */}
      {/* Body */}
      <rect x="18" y="80" width="34" height="22" rx="3" fill="#1c2330" stroke="#4b5563" strokeWidth="1.5" />
      {/* Viewfinder bump */}
      <rect x="24" y="74" width="12" height="7" rx="2" fill="#1c2330" stroke="#4b5563" strokeWidth="1" />
      {/* Lens (points right toward athlete) */}
      <circle cx="52" cy="91" r="8" fill="#0c0c0c" stroke="#4b5563" strokeWidth="1.5" />
      <circle cx="52" cy="91" r="4.5" fill="#0c0c0c" stroke="#374151" strokeWidth="1" />
      <circle cx="52" cy="91" r="1.5" fill="#4b5563" />
      {/* Label */}
      <text x="35" y="114" textAnchor="middle" fontSize="8" fill="#4b5563" fontFamily="system-ui">
        camera
      </text>

      {/* ── Sight line ── */}
      <line x1="60" y1="91" x2="146" y2="84" stroke="#4ade80" strokeWidth="1.3" strokeDasharray="5,3" opacity="0.75" />
      {/* Right-angle tick at athlete */}
      <rect x="143" y="81" width="8" height="8" fill="none" stroke="#4ade80" strokeWidth="1" opacity="0.5" />

      {/* ── Distance dimension ── */}
      <line x1="60" y1="142" x2="146" y2="142" stroke="#2a3140" strokeWidth="1" />
      <line x1="60" y1="137" x2="60" y2="147" stroke="#2a3140" strokeWidth="1" />
      <line x1="146" y1="137" x2="146" y2="147" stroke="#2a3140" strokeWidth="1" />
      <text x="103" y="156" textAnchor="middle" fontSize="8" fill="#4b5563" fontFamily="system-ui">
        2–4 m
      </text>

      {/* ── Camera height note ── */}
      <text x="115" y="172" textAnchor="middle" fontSize="8" fill="#374151" fontFamily="system-ui">
        {cameraHeight}
      </text>
    </svg>
  );
}

/** Side-on schematic for bench: person lying down, camera at bench level. */
function BenchDiagram() {
  return (
    <svg width="230" height="176" viewBox="0 0 230 176" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background */}
      <rect width="230" height="176" rx="6" fill="#0c0c0c" />

      {/* Grid */}
      {[40, 80, 120, 160, 200].map((x) => (
        <line key={`gv${x}`} x1={x} y1="0" x2={x} y2="176" stroke="#161616" strokeWidth="1" />
      ))}
      {[44, 88, 132].map((y) => (
        <line key={`gh${y}`} x1="0" y1={y} x2="230" y2={y} stroke="#161616" strokeWidth="1" />
      ))}

      {/* Label */}
      <text x="115" y="16" textAnchor="middle" fontSize="8" fill="#3d4451" fontFamily="system-ui" fontWeight="600" letterSpacing="1.5">
        SIDE VIEW
      </text>

      {/* Bench */}
      <rect x="55" y="100" width="130" height="8" rx="2" fill="#1c2330" stroke="#374151" strokeWidth="1.5" />
      {/* Bench legs */}
      <rect x="60" y="108" width="6" height="18" rx="1" fill="#1c2330" stroke="#374151" strokeWidth="1" />
      <rect x="174" y="108" width="6" height="18" rx="1" fill="#1c2330" stroke="#374151" strokeWidth="1" />

      {/* Athlete lying down */}
      {/* Torso */}
      <rect x="75" y="82" width="85" height="18" rx="8" fill="#1c2330" stroke="#4b5563" strokeWidth="1.5" />
      {/* Head */}
      <circle cx="170" cy="91" r="10" fill="#1c2330" stroke="#4b5563" strokeWidth="1.5" />
      {/* Arms up (pressing) */}
      <line x1="100" y1="82" x2="100" y2="62" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" />
      <line x1="130" y1="82" x2="130" y2="62" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" />
      {/* Barbell */}
      <rect x="88" y="58" width="54" height="7" rx="2" fill="#1c2330" stroke="#6b7280" strokeWidth="1.5" />
      {/* Plates */}
      <rect x="83" y="55" width="5" height="13" rx="1" fill="#1c2330" stroke="#6b7280" strokeWidth="1" />
      <rect x="142" y="55" width="5" height="13" rx="1" fill="#1c2330" stroke="#6b7280" strokeWidth="1" />

      {/* Labels */}
      <text x="125" y="136" textAnchor="middle" fontSize="8" fill="#4b5563" fontFamily="system-ui">athlete + bench</text>

      {/* Camera (to the left, at bench height) */}
      <rect x="16" y="82" width="28" height="18" rx="3" fill="#1c2330" stroke="#4b5563" strokeWidth="1.5" />
      <rect x="20" y="77" width="10" height="6" rx="1.5" fill="#1c2330" stroke="#4b5563" strokeWidth="1" />
      <circle cx="44" cy="91" r="7" fill="#0c0c0c" stroke="#4b5563" strokeWidth="1.5" />
      <circle cx="44" cy="91" r="3.5" fill="#0c0c0c" stroke="#374151" strokeWidth="1" />
      <circle cx="44" cy="91" r="1.2" fill="#4b5563" />
      <text x="30" y="112" textAnchor="middle" fontSize="8" fill="#4b5563" fontFamily="system-ui">camera</text>

      {/* Sight line */}
      <line x1="51" y1="91" x2="70" y2="91" stroke="#4ade80" strokeWidth="1.3" strokeDasharray="4,3" opacity="0.75" />

      {/* Camera height arrow (↕) */}
      <line x1="8" y1="91" x2="8" y2="126" stroke="#2a3140" strokeWidth="1" />
      <line x1="4" y1="91" x2="12" y2="91" stroke="#2a3140" strokeWidth="1" />
      <line x1="4" y1="126" x2="12" y2="126" stroke="#2a3140" strokeWidth="1" />
      <text x="115" y="172" textAnchor="middle" fontSize="8" fill="#374151" fontFamily="system-ui">
        camera at bench height, from the side
      </text>
    </svg>
  );
}

// ── Tooltip wrapper ───────────────────────────────────────────────────────────

interface TooltipCellProps {
  label: string;
  value: string;
  children: React.ReactNode; // illustration content
}

function TooltipCell({ label, value, children }: TooltipCellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div ref={ref} className={styles.cell}>
      <span className={styles.cellLabel}>{label}</span>
      <div className={styles.cellValueRow}>
        <span className={styles.cellValue}>{value}</span>
        <button
          className={styles.infoBtn}
          onClick={() => setOpen((v) => !v)}
          aria-label={`Illustration for ${label}`}
          aria-expanded={open}
        >
          ⓘ
        </button>
      </div>
      {open && (
        <div className={styles.tooltip} role="tooltip">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Guide data ────────────────────────────────────────────────────────────────

interface GuideEntry {
  view: string;
  distance: string;
  height: string;
  tips: string[];
}

const GUIDE: Record<LiftType, GuideEntry> = {
  squat: {
    view: 'Sagittal (side-on)',
    distance: '2–4 m from camera',
    height: 'Camera at hip height',
    tips: [
      'Both feet and the barbell should be fully in frame',
      'Film the left or right side — either works',
      'Avoid filming from behind or in front',
    ],
  },
  deadlift: {
    view: 'Sagittal (side-on)',
    distance: '2–4 m from camera',
    height: 'Camera at knee–hip height',
    tips: [
      'Full body from foot to top of head must be visible',
      'Bar should be visible at the start position',
      'Side view is essential — frontal view is not supported yet',
    ],
  },
  bench: {
    view: 'Sagittal (side-on)',
    distance: '2–3 m from camera',
    height: 'Camera at bench height',
    tips: [
      'Film from the side so the bar path is clearly visible',
      'Elbow, shoulder, and wrist must all be in frame',
      'Frontal view is not yet supported for bench',
    ],
  },
};

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  lift: LiftType;
}

export function CameraGuide({ lift }: Props) {
  const g = GUIDE[lift];

  const viewIllustration =
    lift === 'bench' ? (
      <BenchDiagram />
    ) : (
      <SagittalDiagram cameraHeight={g.height} />
    );

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.icon}>📷</span>
        <span className={styles.heading}>
          Camera Setup — {lift.charAt(0).toUpperCase() + lift.slice(1)}
        </span>
      </div>
      <div className={styles.grid}>
        <TooltipCell label="View" value={g.view}>
          {viewIllustration}
        </TooltipCell>
        <TooltipCell label="Distance" value={g.distance}>
          {viewIllustration}
        </TooltipCell>
        <div className={styles.cell}>
          <span className={styles.cellLabel}>Height</span>
          <span className={styles.cellValue}>{g.height}</span>
        </div>
      </div>
      <ul className={styles.tips}>
        {g.tips.map((tip, i) => (
          <li key={i} className={styles.tip}>
            {tip}
          </li>
        ))}
      </ul>
    </div>
  );
}
