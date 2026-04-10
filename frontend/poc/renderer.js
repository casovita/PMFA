/**
 * Canvas skeleton renderer for MediaPipe BlazePose landmarks.
 * Draws joint connections and color-codes by visibility confidence.
 */

// MediaPipe BlazePose connections (pairs of landmark indices)
const POSE_CONNECTIONS = [
  // Torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // Left arm
  [11, 13], [13, 15],
  // Right arm
  [12, 14], [14, 16],
  // Left leg
  [23, 25], [25, 27], [27, 29], [27, 31],
  // Right leg
  [24, 26], [26, 28], [28, 30], [28, 32],
];

// Key joint indices relevant to squat (rendered larger)
const KEY_JOINTS = new Set([11, 12, 23, 24, 25, 26, 27, 28]);

/**
 * Clear and redraw skeleton overlay on canvas.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Array} landmarks - 33 MediaPipe pose landmarks
 * @param {number} [visThreshold=0.5]
 */
export function drawSkeleton(canvas, landmarks, visThreshold = 0.5) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!landmarks || landmarks.length === 0) return;

  const w = canvas.width;
  const h = canvas.height;

  const px = (lm) => lm.x * w;
  const py = (lm) => lm.y * h;

  // Draw connections
  for (const [i, j] of POSE_CONNECTIONS) {
    const a = landmarks[i];
    const b = landmarks[j];
    if (!a || !b) continue;

    const visible = a.visibility >= visThreshold && b.visibility >= visThreshold;

    ctx.beginPath();
    ctx.moveTo(px(a), py(a));
    ctx.lineTo(px(b), py(b));
    ctx.strokeStyle = visible ? 'rgba(0,220,80,0.85)' : 'rgba(220,60,60,0.5)';
    ctx.lineWidth = visible ? 2 : 1;
    ctx.stroke();
  }

  // Draw joints
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if (!lm) continue;

    const visible = lm.visibility >= visThreshold;
    const isKey = KEY_JOINTS.has(i);

    ctx.beginPath();
    ctx.arc(px(lm), py(lm), isKey ? 5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = visible
      ? (isKey ? '#00ff50' : '#00cc40')
      : 'rgba(220,60,60,0.6)';
    ctx.fill();
  }
}

/**
 * Draw the current knee flexion angle as a text label near the knee joint.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Array} landmarks
 * @param {number} kneeAngle
 */
export function drawAngleLabel(canvas, landmarks, kneeAngle) {
  if (isNaN(kneeAngle) || !landmarks[25]) return;

  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  const knee = landmarks[25];
  const x = knee.x * w + 10;
  const y = knee.y * h - 10;

  ctx.font = 'bold 14px system-ui';
  ctx.fillStyle = '#facc15';
  ctx.fillText(`${kneeAngle.toFixed(1)}°`, x, y);
}

/**
 * Draw a camera positioning guide overlay when no video is loaded.
 *
 * @param {HTMLCanvasElement} canvas
 */
export function drawPositioningGuide(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Target framing box — athlete should fill middle 60% of frame
  const margin = w * 0.2;
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(margin, h * 0.05, w - margin * 2, h * 0.9);
  ctx.setLineDash([]);

  ctx.font = '12px system-ui';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.textAlign = 'center';
  ctx.fillText('Position athlete in frame', w / 2, h / 2);
  ctx.textAlign = 'left';
}
