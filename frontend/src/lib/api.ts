/**
 * Backend API client — Phase 2.
 *
 * Base URL is read from VITE_API_URL (defaults to http://localhost:8000).
 * All functions throw on non-2xx responses.
 */

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';

// ── Response types (mirror backend schemas/analysis.py) ──────────────────────

export interface BackendViolation {
  rule_id: string;
  severity: 'warning' | 'high_risk' | 'critical';
  metric: string;
  value: number;
  threshold: number;
  phase: string | null;
}

export interface BackendRepMetrics {
  rep_number: number;
  primary_angle_min: number;
  max_trunk_lean: number;
  time_under_tension_sec: number;
  violations: BackendViolation[];
  score: number;
  quality_label: string;
}

export interface BackendFatigueFlag {
  rep: number;
  metric: string;
  baseline_deg: number;
  current_deg: number;
  drift_deg: number;
  severity: 'warning' | 'high_risk';
}

export interface BackendAnalysisResult {
  job_id: string;
  movement: string;
  total_reps: number;
  overall_score: number;
  quality_label: string;
  rep_metrics: BackendRepMetrics[];
  violations: BackendViolation[];
  fatigue_flags: BackendFatigueFlag[];
  processing_time_sec: number;
}

export type JobStatusCode = 'pending' | 'processing' | 'completed' | 'failed';

export interface JobStatus {
  job_id: string;
  status: JobStatusCode;
  result: BackendAnalysisResult | null;
  error_message: string | null;
}

// ── API functions ─────────────────────────────────────────────────────────────

/** Submit a video file for server-side analysis. Returns the job_id. */
export async function submitAnalysis(file: File, movement: string): Promise<string> {
  const form = new FormData();
  form.append('video', file);

  const res = await fetch(`${API_BASE}/api/v1/analyze?movement=${encodeURIComponent(movement)}`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Analysis submission failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { job_id: string };
  return data.job_id;
}

/** Poll for job status. Returns the full JobStatus including result when complete. */
export async function pollResult(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${API_BASE}/api/v1/results/${encodeURIComponent(jobId)}`);

  if (!res.ok) {
    throw new Error(`Poll failed (${res.status})`);
  }

  return res.json() as Promise<JobStatus>;
}

/** Map frontend LiftType to backend movement string. */
export function toBackendMovement(lift: string): string {
  return lift === 'bench' ? 'bench_press' : lift;
}
