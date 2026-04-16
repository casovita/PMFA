// ── Lift types ────────────────────────────────────────────────────────────────

export type LiftType = 'squat' | 'deadlift' | 'bench';

// ── Pose ──────────────────────────────────────────────────────────────────────

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

// ── Angles ────────────────────────────────────────────────────────────────────

export interface SquatAngles {
  kneeAngle: number;
  hipAngle: number;
  ankleAngle: number;
  trunkLean: number;
}

export interface DeadliftAngles {
  hipAngle: number;    // shoulder→hip→knee — primary rep-tracking angle
  trunkLean: number;   // hip→shoulder vs vertical (same proxy as squat)
  barDrift: number;    // wrist.x − ankle.x (% of frame width) — bar path proxy
}

export interface BenchAngles {
  elbowAngle: number;  // shoulder→elbow→wrist — primary rep-tracking angle
  elbowFlare: number;  // shoulder→elbow vector vs torso horizontal
  trunkLean: number;   // shoulder y vs hip y proxy (arch / body position)
}

export type LiftAngles = SquatAngles | DeadliftAngles | BenchAngles;

// ── Violations ────────────────────────────────────────────────────────────────

export type Severity = 'warning' | 'high_risk' | 'critical';

export interface Violation {
  type: string;
  severity: Severity;
  message: string;
}

// ── Rep state machine ─────────────────────────────────────────────────────────

export type RepPhase = 'IDLE' | 'DESCENDING' | 'BOTTOM' | 'ASCENDING';

export interface RepData {
  repNumber: number;
  lift: LiftType;
  startTime: number;
  endTime: number;
  bottomTime: number | null;
  /** Primary angle tracked for this lift: min knee (squat), min hip (deadlift), min elbow (bench). */
  primaryAngle: number;
  maxTrunkLean: number;
  timeUnderTension: number;
  violations: Violation[];
  score: number | null;
  /** Data URL of a frame captured during a high_risk/critical violation, if any. */
  snapshotUrl?: string;
}

export interface RepState {
  phase: RepPhase;
  repCount: number;
  /** Standing/lockout baseline for the primary angle. Null until enough frames are observed. */
  baselinePrimaryAngle: number | null;
  baselineBuffer: number[];
  angleBuffer: number[];
  currentRepData: Omit<RepData, 'repNumber' | 'score'> & { repNumber: null; score: null } | null;
  repHistory: RepData[];
}

// ── Frame data (used by AngleChart) ──────────────────────────────────────────

export interface FrameData {
  time: number;
  phase: RepPhase;
  primaryAngle: number;
  trunkLean: number;
  violations: Violation[];
  lift: LiftType;
}

// ── Worker messages ───────────────────────────────────────────────────────────

export interface WorkerInFrame {
  type: 'frame';
  bitmap: ImageBitmap;
  time: number;
}

export interface WorkerInInit {
  type: 'init';
}

export type WorkerInMessage = WorkerInFrame | WorkerInInit;

export interface WorkerOutReady {
  type: 'ready';
}

export interface WorkerOutResult {
  type: 'result';
  landmarks: Landmark[];
  time: number;
}

export interface WorkerOutError {
  type: 'error';
  message: string;
}

export type WorkerOutMessage = WorkerOutReady | WorkerOutResult | WorkerOutError;

// ── Quality label ─────────────────────────────────────────────────────────────

export type QualityLabel = 'excellent' | 'good' | 'fair' | 'poor';

// ── Session history (localStorage) ───────────────────────────────────────────

export interface SessionAggregate {
  repCount: number;
  avgScore: number;
  minScore: number;
  maxScore: number;
  /** Per-rep scores in rep order — used for sparkline. */
  scores: number[];
  avgPrimaryAngle: number;
  avgTimeUnderTension: number;
  totalViolations: number;
  worstSeverity: Severity | null;
}

export interface SavedSession {
  /** crypto.randomUUID() */
  id: string;
  /** Date.now() at save time */
  savedAt: number;
  lift: LiftType;
  reps: RepData[];
  /** Pre-computed at save time to keep the read path trivial. */
  aggregate: SessionAggregate;
}
