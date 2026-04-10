/**
 * PMFA Phase 1 POC — main entry point.
 *
 * Orchestrates:
 *  1. Video upload & playback
 *  2. MediaPipe BlazePose frame processing
 *  3. Angle computation (angles.js)
 *  4. Canvas skeleton rendering (renderer.js)
 *  5. Chart.js angle graph (chart.js)
 *  6. Rule-based violation display
 */

import { extractSquatAngles, checkSquatViolations } from './angles.js';
import { drawSkeleton, drawAngleLabel, drawPositioningGuide } from './renderer.js';
import { initChart, appendAngle, updatePlayhead, resetChart } from './chart.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const videoInput      = document.getElementById('video-input');
const video           = document.getElementById('video');
const overlay         = document.getElementById('overlay');
const scrubber        = document.getElementById('scrubber');
const playPauseBtn    = document.getElementById('play-pause');
const timeDisplay     = document.getElementById('time-display');
const analysisSection = document.getElementById('analysis-section');
const chartSection    = document.getElementById('chart-section');
const violationsEl    = document.getElementById('violations');
const violationList   = document.getElementById('violation-list');
const angleChartCanvas= document.getElementById('angle-chart');
const debugLog        = document.getElementById('debug-log');

// ── State ─────────────────────────────────────────────────────────────────────
/** @type {import('@mediapipe/pose').Pose|null} */
let pose = null;

/** @type {Array<{time: number, kneeAngle: number, hipAngle: number, trunkLean: number, violations: Array}>} */
const frameData = [];

let isProcessing     = false;
let processingFrame  = false;
let animFrameId      = null;
let lastProcessedTime = -1;
const PROCESS_INTERVAL_SEC = 1 / 30; // target ~30 FPS analysis

// ── Logging ───────────────────────────────────────────────────────────────────
function log(msg) {
  const line = `[${new Date().toISOString().slice(11, 23)}] ${msg}`;
  console.log(line);
  debugLog.textContent = line + '\n' + debugLog.textContent.slice(0, 3000);
}

// ── MediaPipe init ────────────────────────────────────────────────────────────
async function initPose() {
  log('Loading MediaPipe BlazePose…');

  // BlazePose Full via CDN (loaded in index.html via importmap or global)
  pose = new Pose({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`,
  });

  pose.setOptions({
    modelComplexity: 1,       // 0=Lite, 1=Full, 2=Heavy
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

  if (!results.poseLandmarks) {
    log(`t=${video.currentTime.toFixed(2)}s — no pose detected`);
    return;
  }

  const lm      = results.poseLandmarks;
  const angles  = extractSquatAngles(lm);
  const viols   = checkSquatViolations(angles, lm);
  const t       = video.currentTime;

  frameData.push({ time: t, ...angles, violations: viols });

  // Sync canvas size to actual render size
  overlay.width  = overlay.offsetWidth;
  overlay.height = overlay.offsetHeight;

  drawSkeleton(overlay, lm);
  drawAngleLabel(overlay, lm, angles.kneeAngle);

  appendAngle(t, angles.kneeAngle);
  updatePlayhead(t);
  updateViolationPanel(viols);

  log(
    `t=${t.toFixed(2)}s | knee=${angles.kneeAngle.toFixed(1)}° hip=${angles.hipAngle.toFixed(1)}° trunk=${angles.trunkLean.toFixed(1)}° viols=${viols.length}`
  );
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

// ── Main analysis loop ────────────────────────────────────────────────────────
function processLoop() {
  if (!isProcessing) return;

  const t = video.currentTime;
  const dt = t - lastProcessedTime;

  if (!processingFrame && dt >= PROCESS_INTERVAL_SEC) {
    lastProcessedTime = t;
    processingFrame   = true;

    overlay.width  = overlay.offsetWidth;
    overlay.height = overlay.offsetHeight;

    // Send current video frame to MediaPipe
    pose.send({ image: video }).catch((err) => {
      processingFrame = false;
      log(`pose.send error: ${err.message}`);
    });
  }

  scrubber.value   = video.duration ? (t / video.duration) * 100 : 0;
  timeDisplay.textContent = `${t.toFixed(2)}s`;

  animFrameId = requestAnimationFrame(processLoop);
}

// ── Video upload ──────────────────────────────────────────────────────────────
videoInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  log(`Loaded: ${file.name} (${(file.size / 1e6).toFixed(1)} MB)`);

  // Reset state
  frameData.length  = 0;
  lastProcessedTime = -1;
  resetChart();
  violationsEl.classList.add('hidden');
  cancelAnimationFrame(animFrameId);

  video.src = URL.createObjectURL(file);
  await video.load();

  analysisSection.classList.remove('hidden');
  chartSection.classList.remove('hidden');

  if (!pose) await initPose();

  log('Ready. Press Play to analyze.');
});

// ── Playback controls ─────────────────────────────────────────────────────────
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
  isProcessing = false;
  cancelAnimationFrame(animFrameId);
  playPauseBtn.textContent = 'Play';
});

// ── Scrubber ──────────────────────────────────────────────────────────────────
scrubber.addEventListener('input', () => {
  if (!video.duration) return;
  video.currentTime = (scrubber.value / 100) * video.duration;
  timeDisplay.textContent = `${video.currentTime.toFixed(2)}s`;
  updatePlayhead(video.currentTime);
});

// ── Summary log ───────────────────────────────────────────────────────────────
function logSummary() {
  const valid = frameData.filter((f) => !isNaN(f.kneeAngle));
  if (valid.length === 0) { log('No valid frames detected.'); return; }

  const minKnee  = Math.min(...valid.map((f) => f.kneeAngle));
  const maxTrunk = Math.max(...valid.map((f) => f.trunkLean));
  const totalViol= frameData.reduce((n, f) => n + f.violations.length, 0);

  log('── Summary ─────────────────────────────');
  log(`Frames analyzed : ${valid.length}`);
  log(`Min knee angle  : ${minKnee.toFixed(1)}°  (depth proxy)`);
  log(`Max trunk lean  : ${maxTrunk.toFixed(1)}°`);
  log(`Total violations: ${totalViol}`);
  log(`Depth check     : ${minKnee < 100 ? 'PASS (below parallel)' : 'FAIL (above parallel)'}`);
  log('────────────────────────────────────────');

  // Expose for manual ground-truth comparison
  window.__pmfaFrameData = frameData;
  log('Raw data exposed at window.__pmfaFrameData');
}

// ── Init ──────────────────────────────────────────────────────────────────────
initChart(angleChartCanvas);
log('PMFA POC initialized. Upload a squat video to begin.');
