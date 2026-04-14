/**
 * PMFA Phase 1 POC — main entry point.
 *
 * Supports two input modes:
 *   video   — uploaded file, scrubber, play/pause
 *   webcam  — live getUserMedia stream, wall-clock time, stop button
 */

import {
  extractSquatAngles,
  checkSquatViolations,
  createRepState,
  updateRepStateMachine,
  accumulateViolationsToCurrentRep,
  scoreRep,
  scoreQuality,
  checkFatigue,
} from './angles.js';
import { drawSkeleton, drawAngleLabel } from './renderer.js';
import {
  initChart,
  appendAngle,
  appendTrunkLean,
  addRepBottomMarker,
  updatePlayhead,
  resetChart,
} from './chart.js';
import {
  computeDangerProximity,
  setRadarProximity,
  tickRadar,
  setRadarMuted,
  isRadarMuted,
} from './sound.js';
import { loadRules } from './rules.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const videoInput        = document.getElementById('video-input');
const btnWebcam         = document.getElementById('btn-webcam');
const cameraError       = document.getElementById('camera-error');
const cameraErrorDetail = document.getElementById('camera-error-detail');
const cameraErrorDismiss= document.getElementById('camera-error-dismiss');
const video           = document.getElementById('video');
const overlay         = document.getElementById('overlay');
const scrubber        = document.getElementById('scrubber');
const playPauseBtn    = document.getElementById('play-pause');
const stopWebcamBtn   = document.getElementById('stop-webcam');
const timeDisplay     = document.getElementById('time-display');
const muteRadarBtn    = document.getElementById('mute-radar');
const webcamBadge     = document.getElementById('webcam-badge');
const analysisSection = document.getElementById('analysis-section');
const chartSection    = document.getElementById('chart-section');
const violationsEl    = document.getElementById('violations');
const violationList   = document.getElementById('violation-list');
const angleChartCanvas= document.getElementById('angle-chart');
const debugLog        = document.getElementById('debug-log');

// Rep / score UI
const repStatusEl       = document.getElementById('rep-status');
const repCounterEl      = document.getElementById('rep-counter');
const repScoreBadgeEl   = document.getElementById('rep-score-badge');
const sessionScoreEl    = document.getElementById('session-score');
const fatigueBannerEl   = document.getElementById('fatigue-banner');
const repHistoryPanel   = document.getElementById('rep-history-panel');
const repHistoryToggle  = document.getElementById('rep-history-toggle');
const repHistoryList    = document.getElementById('rep-history-list');
const repHistoryChevron = document.getElementById('rep-history-chevron');

// ── State ─────────────────────────────────────────────────────────────────────
/** @type {'idle'|'video'|'webcam'} */
let mode = 'idle';

/** @type {import('@mediapipe/pose').Pose|null} */
let pose = null;

/** @type {MediaStream|null} */
let webcamStream = null;

/** @type {number} wall-clock ms when webcam started */
let webcamStartMs = 0;

const frameData = [];

let isProcessing    = false;
let processingFrame = false;
let animFrameId     = null;
let lastProcessedT  = -1;

const PROCESS_INTERVAL_SEC = 1 / 30; // ~30 FPS

// Rep state
let repState = createRepState();
const repScores = [];

// ── Helpers ───────────────────────────────────────────────────────────────────
function log(msg) {
  const line = `[${new Date().toISOString().slice(11, 23)}] ${msg}`;
  console.log(line);
  debugLog.textContent = line + '\n' + debugLog.textContent.slice(0, 3000);
}

function currentTimeSec() {
  if (mode === 'webcam') return (Date.now() - webcamStartMs) / 1000;
  return video.currentTime;
}

function resetState() {
  frameData.length = 0;
  lastProcessedT   = -1;
  isProcessing     = false;
  processingFrame  = false;
  cancelAnimationFrame(animFrameId);
  resetChart();
  setRadarProximity(0, 880);
  violationsEl.classList.add('hidden');

  // Reset rep tracking
  repState = createRepState();
  repScores.length = 0;
  repStatusEl.classList.add('hidden');
  fatigueBannerEl.classList.add('hidden');
  fatigueBannerEl.removeAttribute('data-severity');
  repHistoryPanel.classList.add('hidden');
  repHistoryList.innerHTML = '';
  repHistoryList.classList.add('hidden');
  repHistoryChevron.textContent = '▼';
  repCounterEl.textContent = 'Rep 0';
  repScoreBadgeEl.textContent = '—';
  repScoreBadgeEl.removeAttribute('data-quality');
  sessionScoreEl.textContent = '';
}

// ── MediaPipe init ────────────────────────────────────────────────────────────
async function initPose() {
  log('Loading MediaPipe BlazePose…');

  pose = new Pose({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`,
  });

  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    smoothSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  pose.onResults(onPoseResults);
  await pose.initialize();
  log('BlazePose ready.');
}

// ── Pose result handler ───────────────────────────────────────────────────────
function onPoseResults(results) {
  processingFrame = false;

  if (!results.poseLandmarks) return;

  const lm     = results.poseLandmarks;
  const angles = extractSquatAngles(lm);
  const t      = currentTimeSec();

  // 1. Advance rep state machine (sets repState.phase for this frame)
  const { completedRep } = updateRepStateMachine(repState, angles.kneeAngle, angles, t);

  // 2. Compute violations with current phase context
  const viols = checkSquatViolations(angles, lm, 0.5, repState.phase);

  // 3. Accumulate violations into the active rep
  accumulateViolationsToCurrentRep(repState, viols);

  // 4. Handle completed rep
  if (completedRep) {
    completedRep.score = scoreRep(completedRep);
    repScores.push(completedRep.score);

    const fatigueAlerts = checkFatigue(repState.repHistory);
    updateFatigueBanner(fatigueAlerts);
    updateRepHistoryPanel(completedRep);

    if (completedRep.bottomTime != null) {
      addRepBottomMarker(completedRep.bottomTime, completedRep.minKneeAngle);
    }

    const avg = repScores.reduce((a, b) => a + b, 0) / repScores.length;
    sessionScoreEl.textContent = `Session avg: ${avg.toFixed(0)}/100`;

    log(`Rep ${completedRep.repNumber} complete — score ${completedRep.score}/100, knee ${completedRep.minKneeAngle.toFixed(1)}°, TUT ${completedRep.timeUnderTension.toFixed(1)}s`);
  }

  // 5. Store frame
  frameData.push({ time: t, ...angles, violations: viols, phase: repState.phase });

  // 6. Audio radar
  const { proximity, freq } = computeDangerProximity(angles, lm);
  setRadarProximity(proximity, freq);

  // 7. Render
  overlay.width  = overlay.offsetWidth;
  overlay.height = overlay.offsetHeight;

  drawSkeleton(overlay, lm);
  drawAngleLabel(overlay, lm, angles.kneeAngle);
  appendAngle(t, angles.kneeAngle);
  appendTrunkLean(t, angles.trunkLean);
  updatePlayhead(t);
  updateViolationPanel(viols);
  updateRepStatusBar();

  if (!isNaN(angles.kneeAngle)) {
    log(`t=${t.toFixed(2)}s | ${repState.phase} | knee=${angles.kneeAngle.toFixed(1)}° trunk=${angles.trunkLean.toFixed(1)}° viols=${viols.length}`);
  }
}

// ── Violation panel ───────────────────────────────────────────────────────────
function updateViolationPanel(violations) {
  if (violations.length === 0) {
    violationsEl.classList.add('hidden');
    return;
  }
  violationsEl.classList.remove('hidden');
  violationList.innerHTML = '';
  for (const v of violations) {
    const li = document.createElement('li');
    li.textContent = v.message;
    li.dataset.severity = v.severity;
    violationList.appendChild(li);
  }
}

// ── Rep UI helpers ────────────────────────────────────────────────────────────
function updateRepStatusBar() {
  if (repState.repCount === 0 && repState.phase === 'IDLE') return;
  repStatusEl.classList.remove('hidden');
  repCounterEl.textContent = `Rep ${repState.repCount}`;
}

function updateFatigueBanner(alerts) {
  if (!alerts || alerts.length === 0) return;
  const RANK = { critical: 3, high_risk: 2, warning: 1 };
  const worst = [...alerts].sort((a, b) => RANK[b.severity] - RANK[a.severity])[0];
  fatigueBannerEl.textContent = worst.message;
  fatigueBannerEl.dataset.severity = worst.severity;
  fatigueBannerEl.classList.remove('hidden');
}

function updateRepHistoryPanel(repData) {
  repHistoryPanel.classList.remove('hidden');

  const q = scoreQuality(repData.score);

  // Update live score badge
  repScoreBadgeEl.textContent = `${repData.score}/100`;
  repScoreBadgeEl.dataset.quality = q;

  // Deduplicate violation types for the summary line
  const uniqueTypes = [...new Set(repData.violations.map((v) => v.type))];
  const violSummary = uniqueTypes.length > 0
    ? uniqueTypes.map((t) => t.replace(/_/g, ' ')).join(', ')
    : 'No violations';

  const kneeStr = repData.minKneeAngle === Infinity
    ? '—'
    : `${repData.minKneeAngle.toFixed(1)}°`;

  const li = document.createElement('li');
  li.className = 'rep-history-item';
  li.innerHTML = `
    <span class="rep-num">#${repData.repNumber}</span>
    <div>
      <div class="rep-stats">
        <span>Knee: ${kneeStr}</span>
        <span>Trunk: ${repData.maxTrunkLean.toFixed(1)}°</span>
        <span>TUT: ${repData.timeUnderTension.toFixed(1)}s</span>
      </div>
      <div class="rep-viols-mini">${violSummary}</div>
    </div>
    <span class="rep-mini-score" data-quality="${q}">${repData.score}/100</span>
  `;
  repHistoryList.appendChild(li);
}

repHistoryToggle.addEventListener('click', () => {
  const isHidden = repHistoryList.classList.toggle('hidden');
  repHistoryChevron.textContent = isHidden ? '▼' : '▲';
});

// ── Processing loop (shared) ──────────────────────────────────────────────────
function processLoop(timestamp = 0) {
  if (!isProcessing) return;

  tickRadar(timestamp);

  const t  = currentTimeSec();
  const dt = t - lastProcessedT;

  if (!processingFrame && dt >= PROCESS_INTERVAL_SEC) {
    lastProcessedT  = t;
    processingFrame = true;

    overlay.width  = overlay.offsetWidth;
    overlay.height = overlay.offsetHeight;

    pose.send({ image: video }).catch((err) => {
      processingFrame = false;
      log(`pose.send error: ${err.message}`);
    });
  }

  // Update scrubber only in video mode
  if (mode === 'video' && video.duration) {
    scrubber.value = (video.currentTime / video.duration) * 100;
  }
  timeDisplay.textContent = `${t.toFixed(2)}s`;

  animFrameId = requestAnimationFrame(processLoop);
}

// ── Video mode ────────────────────────────────────────────────────────────────
videoInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  await stopWebcam();
  resetState();
  mode = 'video';

  log(`Loaded: ${file.name} (${(file.size / 1e6).toFixed(1)} MB)`);

  video.srcObject = null;
  video.src = URL.createObjectURL(file);
  await video.load();

  setVideoModeUI();
  analysisSection.classList.remove('hidden');
  chartSection.classList.remove('hidden');

  if (!pose) await initPose();
  log('Ready. Press Play to analyze.');
});

playPauseBtn.addEventListener('click', () => {
  if (video.paused) {
    video.play();
    isProcessing = true;
    processLoop();
    playPauseBtn.textContent = 'Pause';
  } else {
    video.pause();
    isProcessing = false;
    cancelAnimationFrame(animFrameId);
    playPauseBtn.textContent = 'Play';
  }
});

video.addEventListener('ended', () => {
  isProcessing = false;
  cancelAnimationFrame(animFrameId);
  playPauseBtn.textContent = 'Play';
  log(`Analysis complete. ${frameData.length} frames processed.`);
  logSummary();
});

video.addEventListener('pause', () => {
  if (mode !== 'video') return;
  isProcessing = false;
  cancelAnimationFrame(animFrameId);
  playPauseBtn.textContent = 'Play';
});

scrubber.addEventListener('input', () => {
  if (!video.duration) return;
  video.currentTime = (scrubber.value / 100) * video.duration;
  timeDisplay.textContent = `${video.currentTime.toFixed(2)}s`;
  updatePlayhead(video.currentTime);
});

// ── Webcam mode ───────────────────────────────────────────────────────────────
btnWebcam.addEventListener('click', async () => {
  if (mode === 'webcam') return; // already running

  resetState();
  mode = 'webcam';

  log('Requesting camera access…');

  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    });
  } catch (err) {
    log(`Camera error: ${err.message}`);
    mode = 'idle';
    showCameraError(err);
    return;
  }

  video.srcObject = webcamStream;
  video.src       = '';

  await new Promise((resolve) => { video.onloadedmetadata = resolve; });
  video.play();

  webcamStartMs = Date.now();

  setWebcamModeUI();
  analysisSection.classList.remove('hidden');
  chartSection.classList.remove('hidden');

  if (!pose) await initPose();

  isProcessing = true;
  processLoop();
  log('Webcam live. Analyzing in real time…');
});

stopWebcamBtn.addEventListener('click', () => {
  stopWebcam();
  log(`Session ended. ${frameData.length} frames processed.`);
  logSummary();
  setIdleModeUI();
});

function showCameraError(err) {
  const hints = {
    NotAllowedError:  'Permission was denied. Allow camera access in your browser and/or macOS System Settings.',
    NotFoundError:    'No camera device found. Plug in a webcam and try again.',
    NotReadableError: 'Camera is in use by another app. Close other video apps and try again.',
  };
  cameraErrorDetail.textContent = hints[err.name] ?? err.message;
  cameraError.classList.remove('hidden');
}

cameraErrorDismiss.addEventListener('click', () => {
  cameraError.classList.add('hidden');
});

async function stopWebcam() {
  if (!webcamStream) return;
  isProcessing = false;
  cancelAnimationFrame(animFrameId);
  webcamStream.getTracks().forEach((t) => t.stop());
  webcamStream  = null;
  video.srcObject = null;
  mode = 'idle';
}

// ── UI mode helpers ───────────────────────────────────────────────────────────
function setVideoModeUI() {
  playPauseBtn.textContent = 'Play';
  playPauseBtn.classList.remove('hidden');
  stopWebcamBtn.classList.add('hidden');
  scrubber.classList.remove('hidden');
  webcamBadge.classList.add('hidden');
}

function setWebcamModeUI() {
  playPauseBtn.classList.add('hidden');
  stopWebcamBtn.classList.remove('hidden');
  scrubber.classList.add('hidden');
  webcamBadge.classList.remove('hidden');
}

function setIdleModeUI() {
  playPauseBtn.classList.add('hidden');
  stopWebcamBtn.classList.add('hidden');
  webcamBadge.classList.add('hidden');
  scrubber.classList.remove('hidden');
  analysisSection.classList.add('hidden');
  chartSection.classList.add('hidden');
}

// ── Summary ───────────────────────────────────────────────────────────────────
function logSummary() {
  const valid = frameData.filter((f) => !isNaN(f.kneeAngle));
  if (valid.length === 0) { log('No valid frames detected.'); return; }

  const minKnee  = Math.min(...valid.map((f) => f.kneeAngle));
  const maxTrunk = Math.max(...valid.map((f) => f.trunkLean));
  const totalViol= frameData.reduce((n, f) => n + f.violations.length, 0);
  const avgScore = repScores.length > 0
    ? (repScores.reduce((a, b) => a + b, 0) / repScores.length).toFixed(1)
    : 'N/A';

  log('── Summary ─────────────────────────────');
  log(`Frames analyzed : ${valid.length}`);
  log(`Reps completed  : ${repState.repCount}`);
  log(`Min knee angle  : ${minKnee.toFixed(1)}°`);
  log(`Max trunk lean  : ${maxTrunk.toFixed(1)}°`);
  log(`Total violations: ${totalViol}`);
  log(`Depth check     : ${minKnee < 100 ? 'PASS' : 'FAIL'}`);
  log(`Session score   : ${avgScore}/100`);
  if (repScores.length > 0) {
    log(`Per-rep scores  : ${repScores.join(', ')}`);
  }
  log('────────────────────────────────────────');

  window.__pmfaFrameData  = frameData;
  window.__pmfaRepHistory = repState.repHistory;
  log('Raw data: window.__pmfaFrameData, window.__pmfaRepHistory');
}

// ── Mute button ───────────────────────────────────────────────────────────────
muteRadarBtn.addEventListener('click', () => {
  const muted = !isRadarMuted();
  setRadarMuted(muted);
  muteRadarBtn.textContent = muted ? '🔇' : '🔔';
  muteRadarBtn.title = muted ? 'Unmute radar alerts' : 'Mute radar alerts';
});

// ── Init ──────────────────────────────────────────────────────────────────────
initChart(angleChartCanvas);
loadRules().then((fromJson) => {
  log(fromJson
    ? 'Rules loaded from movement_analysis_rules.json.'
    : 'Rules fallback: using built-in defaults (JSON not reachable).');
});
log('PMFA POC initialized. Upload a video or open webcam.');
