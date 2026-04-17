import { useState, useRef, useEffect, useCallback } from 'react';
import type {
  LiftType,
  LiftAngles,
  Landmark,
  RepData,
  Violation,
  RepState,
  FrameData,
} from './types';
import { LiftSelector } from './components/LiftSelector';
import { VideoCapture } from './components/VideoCapture';
import { PoseOverlay, type PoseOverlayHandle } from './components/PoseOverlay';
import { AngleDashboard } from './components/AngleDashboard';
import { RepTimeline } from './components/RepTimeline';
import { AngleChart } from './components/AngleChart';
import { CameraGuide } from './components/CameraGuide';
import { HistoryView } from './components/HistoryView';
import {
  extractSquatAngles,
  extractDeadliftAngles,
  extractBenchAngles,
  checkSquatViolations,
  checkDeadliftViolations,
  checkBenchViolations,
  createRepState,
  updateRepStateMachine,
  accumulateViolationsToCurrentRep,
  scoreRep,
  checkFatigue,
  SQUAT_CONFIG,
  DEADLIFT_CONFIG,
  BENCH_CONFIG,
} from './lib/angles';
import { loadRules } from './lib/rules';
import { captureSnapshot } from './lib/renderer';
import { saveSession, deleteSession, loadSessions } from './lib/historyStore';
import styles from './App.module.css';

// MediaPipe Pose is loaded via <script> tag in index.html (CDN UMD build).
declare const Pose: new (config: { locateFile: (f: string) => string }) => {
  setOptions(opts: Record<string, unknown>): void;
  onResults(cb: (r: { poseLandmarks?: Landmark[] }) => void): void;
  initialize(): Promise<void>;
  send(input: { image: HTMLVideoElement }): Promise<void>;
  close(): Promise<void>;
};

type PoseInstance = ReturnType<typeof Pose['prototype']['send']> extends Promise<void>
  ? InstanceType<typeof Pose>
  : never;

type AppMode = 'idle' | 'video' | 'webcam';
type AppView = 'analyze' | 'history';

export default function App() {
  const [lift, setLift] = useState<LiftType>('squat');
  const [view, setView] = useState<AppView>('analyze');
  const [mode, setMode] = useState<AppMode>('idle');
  const [rulesLoaded, setRulesLoaded] = useState(false);

  // Live state for display
  const [currentAngles, setCurrentAngles] = useState<LiftAngles | null>(null);
  const [phase, setPhase] = useState<ReturnType<typeof createRepState>['phase']>('IDLE');
  const [violations, setViolations] = useState<Violation[]>([]);
  const [repCount, setRepCount] = useState(0);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [sessionAvg, setSessionAvg] = useState<number | null>(null);
  const [fatigueMsg, setFatigueMsg] = useState<string | null>(null);
  const [fatigueSev, setFatigueSev] = useState<string | null>(null);
  const [repHistory, setRepHistory] = useState<RepData[]>([]);
  const [frameData, setFrameData] = useState<FrameData[]>([]);

  // History
  const [historyVersion, setHistoryVersion] = useState(0);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Mutable refs (not state — no render needed per frame)
  const poseRef           = useRef<PoseInstance | null>(null);
  const pendingTimeRef    = useRef(0);
  const repStateRef       = useRef<RepState>(createRepState());
  const repScoresRef      = useRef<number[]>([]);
  const frameDataRef      = useRef<FrameData[]>([]);
  const repHistoryRef     = useRef<RepData[]>([]);   // mirrors repHistory state
  const videoRef          = useRef<HTMLVideoElement | null>(null);
  const overlayRef        = useRef<PoseOverlayHandle | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const animRef           = useRef<number>(0);
  const lastTRef          = useRef(-1);
  const processingRef     = useRef(false);
  const modeRef              = useRef<AppMode>('idle');
  const liftRef              = useRef<LiftType>('squat');
  const webcamStartRef       = useRef(0);
  /** Highest violation rank (1=warning, 2=high_risk, 3=critical) seen in current rep — prevents lower-quality re-captures. */
  const snapshotWorstRankRef = useRef(0);
  const INTERVAL             = 1 / 30;

  // Keep refs in sync with state
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { liftRef.current = lift; }, [lift]);
  useEffect(() => { repHistoryRef.current = repHistory; }, [repHistory]);

  // Auto-dismiss saved toast
  useEffect(() => {
    if (!savedFeedback) return;
    const t = setTimeout(() => setSavedFeedback(false), 2500);
    return () => clearTimeout(t);
  }, [savedFeedback]);

  // Load rules once
  useEffect(() => {
    loadRules().then((ok) => setRulesLoaded(ok)).catch(() => setRulesLoaded(false));
  }, []);

  // ── Pose setup ───────────────────────────────────────────────────────────────
  const initPose = useCallback(() => {
    void poseRef.current?.close();
    poseRef.current = null;

    const p = new Pose({
      locateFile: (f) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${f}`,
    });

    p.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    p.onResults((results) => {
      processingRef.current = false;
      if (results.poseLandmarks) {
        onLandmarks(results.poseLandmarks, pendingTimeRef.current);
      }
    });

    p.initialize()
      .then(() => { poseRef.current = p; })
      .catch((err: unknown) => { console.error('[Pose] init failed', err); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lift-aware landmark handler ──────────────────────────────────────────────
  function onLandmarks(lm: Landmark[], t: number) {
    const currentLift = liftRef.current;

    let angles: LiftAngles;
    let primaryAngle: number;
    let trunkLean: number;
    let viols: Violation[];

    if (currentLift === 'squat') {
      const a = extractSquatAngles(lm);
      angles = a;
      primaryAngle = a.kneeAngle;
      trunkLean = a.trunkLean;
      const { completedRep } = updateRepStateMachine(
        repStateRef.current, primaryAngle, trunkLean, t, 'squat', SQUAT_CONFIG,
      );
      viols = checkSquatViolations(a, lm, 0.5, repStateRef.current.phase);
      accumulateViolationsToCurrentRep(repStateRef.current, viols);
      handleCompletedRep(completedRep);
    } else if (currentLift === 'deadlift') {
      const a = extractDeadliftAngles(lm);
      angles = a;
      primaryAngle = a.hipAngle;
      trunkLean = a.trunkLean;
      const { completedRep } = updateRepStateMachine(
        repStateRef.current, primaryAngle, trunkLean, t, 'deadlift', DEADLIFT_CONFIG,
      );
      viols = checkDeadliftViolations(a, lm, 0.5, repStateRef.current.phase);
      accumulateViolationsToCurrentRep(repStateRef.current, viols);
      handleCompletedRep(completedRep);
    } else {
      const a = extractBenchAngles(lm);
      angles = a;
      primaryAngle = a.elbowAngle;
      trunkLean = a.trunkLean;
      const { completedRep } = updateRepStateMachine(
        repStateRef.current, primaryAngle, trunkLean, t, 'bench', BENCH_CONFIG,
      );
      viols = checkBenchViolations(a, lm, 0.5, repStateRef.current.phase);
      accumulateViolationsToCurrentRep(repStateRef.current, viols);
      handleCompletedRep(completedRep);
    }

    const fd: FrameData = {
      time: t,
      phase: repStateRef.current.phase,
      primaryAngle,
      trunkLean,
      violations: viols,
      lift: currentLift,
    };
    frameDataRef.current.push(fd);
    if (frameDataRef.current.length % 10 === 0) {
      setFrameData([...frameDataRef.current]);
    }

    // Capture snapshot on worst high_risk/critical frame during an active rep
    const repData = repStateRef.current.currentRepData;
    if (repData && viols.length > 0 && videoRef.current) {
      const RANK: Record<string, number> = { warning: 1, high_risk: 2, critical: 3 };
      const worstRank = Math.max(...viols.map((v) => RANK[v.severity] ?? 0));
      if (worstRank >= 2 && worstRank > snapshotWorstRankRef.current) {
        const url = captureSnapshot(videoRef.current, lm, viols);
        if (url) {
          repData.snapshotUrl = url;
          snapshotWorstRankRef.current = worstRank;
        }
      }
    }

    overlayRef.current?.draw(lm, primaryAngle, currentLift);
    setCurrentAngles(angles);
    setPhase(repStateRef.current.phase);
    setViolations(viols);
    setRepCount(repStateRef.current.repCount);
  }

  function handleCompletedRep(completedRep: RepData | null) {
    if (!completedRep) return;
    completedRep.score = scoreRep(completedRep);
    snapshotWorstRankRef.current = 0; // reset for next rep
    repScoresRef.current.push(completedRep.score);
    const fatigueAlerts = checkFatigue(repStateRef.current.repHistory);
    if (fatigueAlerts.length > 0) {
      const rank = { critical: 3, high_risk: 2, warning: 1 } as Record<string, number>;
      const worst = fatigueAlerts.sort((a, b) => (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0))[0];
      setFatigueMsg(worst.message);
      setFatigueSev(worst.severity);
    }
    setRepHistory([...repStateRef.current.repHistory]);
    setLastScore(completedRep.score);
    const scores = repScoresRef.current;
    setSessionAvg(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  // ── Processing loop ─────────────────────────────────────────────────────────
  const processLoop = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const pose = poseRef.current;
    if (!pose) {
      animRef.current = requestAnimationFrame(processLoop);
      return;
    }

    const t = modeRef.current === 'webcam'
      ? (Date.now() - webcamStartRef.current) / 1000
      : video.currentTime;

    if (!processingRef.current && t - lastTRef.current >= INTERVAL) {
      lastTRef.current = t;
      processingRef.current = true;
      pendingTimeRef.current = t;
      pose.send({ image: video }).catch(() => { processingRef.current = false; });
    }

    animRef.current = requestAnimationFrame(processLoop);
  }, []);

  const stopLoop = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    processingRef.current = false;
    lastTRef.current = -1;
  }, []);

  // ── Reset ───────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    stopLoop();
    repStateRef.current = createRepState();
    repScoresRef.current = [];
    snapshotWorstRankRef.current = 0;
    frameDataRef.current = [];
    setCurrentAngles(null);
    setPhase('IDLE');
    setViolations([]);
    setRepCount(0);
    setLastScore(null);
    setSessionAvg(null);
    setFatigueMsg(null);
    setFatigueSev(null);
    setRepHistory([]);
    setFrameData([]);
    overlayRef.current?.clear();
  }, [stopLoop]);

  // ── Video handlers ──────────────────────────────────────────────────────────
  const handleStop = useCallback(() => {
    stopLoop();
    void poseRef.current?.close();
    poseRef.current = null;

    // Save session before reset clears state
    if (repHistoryRef.current.length > 0) {
      saveSession(liftRef.current, repHistoryRef.current);
      setSavedFeedback(true);
    }

    setMode('idle');
    reset();
  }, [stopLoop, reset]);

  const handleVideoReady = useCallback((video: HTMLVideoElement) => {
    setCameraError(null);
    reset();
    videoRef.current = video;
    setMode('video');
    initPose();
    video.onplay = () => { animRef.current = requestAnimationFrame(processLoop); };
    video.onpause = stopLoop;
    // Auto-save when video finishes playing naturally
    video.onended = handleStop;
  }, [reset, initPose, processLoop, stopLoop, handleStop]);

  const handleWebcamReady = useCallback((video: HTMLVideoElement) => {
    setCameraError(null);
    reset();
    videoRef.current = video;
    webcamStartRef.current = Date.now();
    setMode('webcam');
    initPose();
    animRef.current = requestAnimationFrame(processLoop);
  }, [reset, initPose, processLoop]);

  // ── History helpers ─────────────────────────────────────────────────────────
  const handleDeleteSession = useCallback((id: string) => {
    deleteSession(id);
    setHistoryVersion((v) => v + 1);
  }, []);

  const sessions = view === 'history' ? loadSessions() : [];

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          PMFA <span className={styles.subtitle}>Powerlifting Form Analysis</span>
        </h1>
        {!rulesLoaded && view === 'analyze' && (
          <span className={styles.rulesNote}>Rules: built-in defaults</span>
        )}
        <div className={styles.viewToggle}>
          <button
            className={styles.viewBtn}
            data-active={view === 'analyze'}
            onClick={() => setView('analyze')}
          >
            Analyze
          </button>
          <button
            className={styles.viewBtn}
            data-active={view === 'history'}
            onClick={() => setView('history')}
          >
            History
          </button>
        </div>
      </header>

      {view === 'history' ? (
        // historyVersion forces re-read of localStorage after delete
        <HistoryView
          key={historyVersion}
          sessions={sessions}
          onDeleteSession={handleDeleteSession}
        />
      ) : (
        <>
          <LiftSelector selected={lift} onChange={setLift} />

          {mode === 'idle' && <CameraGuide lift={lift} />}

          <div className={styles.analysisArea}>
            <div ref={videoContainerRef} className={styles.videoContainer}>
              {cameraError && (
                <div className={styles.errorBanner} role="alert">
                  <span>{cameraError}</span>
                  <button onClick={() => setCameraError(null)} aria-label="Dismiss error">✕</button>
                </div>
              )}
              <VideoCapture
                mode={mode}
                onVideoReady={handleVideoReady}
                onWebcamReady={handleWebcamReady}
                onStop={handleStop}
                onError={(msg) => setCameraError(msg)}
              />
              <PoseOverlay ref={overlayRef} containerRef={videoContainerRef} />
            </div>

            {mode !== 'idle' && currentAngles && (
              <AngleDashboard
                lift={lift}
                angles={currentAngles}
                phase={phase}
                repCount={repCount}
                lastScore={lastScore}
                sessionAvg={sessionAvg}
                violations={violations}
                fatigueMessage={fatigueMsg}
                fatigueSeverity={fatigueSev}
              />
            )}
          </div>

          {mode !== 'idle' && frameData.length > 0 && (
            <AngleChart frameData={frameData} lift={lift} />
          )}

          <RepTimeline reps={repHistory} />
        </>
      )}

      {/* ── Save toast ── */}
      {savedFeedback && (
        <div className={styles.toast}>Session saved to history</div>
      )}
    </div>
  );
}
