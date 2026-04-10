/**
 * PMFA Phase 1 POC — main entry point.
 *
 * Supports two input modes:
 *   video   — uploaded file, scrubber, play/pause
 *   webcam  — live getUserMedia stream, wall-clock time, stop button
 */

import { extractSquatAngles, checkSquatViolations } from './angles.js';
import { drawSkeleton, drawAngleLabel } from './renderer.js';
import { initChart, appendAngle, updatePlayhead, resetChart } from './chart.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const videoInput      = document.getElementById('video-input');
const btnWebcam       = document.getElementById('btn-webcam');
const video           = document.getElementById('video');
const overlay         = document.getElementById('overlay');
const scrubber        = document.getElementById('scrubber');
const playPauseBtn    = document.getElementById('play-pause');
const stopWebcamBtn   = document.getElementById('stop-webcam');
const timeDisplay     = document.getElementById('time-display');
const webcamBadge     = document.getElementById('webcam-badge');
const analysisSection = document.getElementById('analysis-section');
const chartSection    = document.getElementById('chart-section');
const violationsEl    = document.getElementById('violations');
const violationList   = document.getElementById('violation-list');
const angleChartCanvas= document.getElementById('angle-chart');
const debugLog        = document.getElementById('debug-log');

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
  violationsEl.classList.add('hidden');
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
  const viols  = checkSquatViolations(angles, lm);
  const t      = currentTimeSec();

  frameData.push({ time: t, ...angles, violations: viols });

  overlay.width  = overlay.offsetWidth;
  overlay.height = overlay.offsetHeight;

  drawSkeleton(overlay, lm);
  drawAngleLabel(overlay, lm, angles.kneeAngle);
  appendAngle(t, angles.kneeAngle);
  updatePlayhead(t);
  updateViolationPanel(viols);

  if (!isNaN(angles.kneeAngle)) {
    log(`t=${t.toFixed(2)}s | knee=${angles.kneeAngle.toFixed(1)}° trunk=${angles.trunkLean.toFixed(1)}° viols=${viols.length}`);
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

// ── Processing loop (shared) ──────────────────────────────────────────────────
function processLoop() {
  if (!isProcessing) return;

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

  log('── Summary ─────────────────────────────');
  log(`Frames analyzed : ${valid.length}`);
  log(`Min knee angle  : ${minKnee.toFixed(1)}°`);
  log(`Max trunk lean  : ${maxTrunk.toFixed(1)}°`);
  log(`Total violations: ${totalViol}`);
  log(`Depth check     : ${minKnee < 100 ? 'PASS' : 'FAIL'}`);
  log('────────────────────────────────────────');

  window.__pmfaFrameData = frameData;
  log('Raw data at window.__pmfaFrameData');
}

// ── Init ──────────────────────────────────────────────────────────────────────
initChart(angleChartCanvas);
log('PMFA POC initialized. Upload a video or open webcam.');
