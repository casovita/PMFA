/**
 * Angle chart manager — wraps Chart.js for the squat angle time-series.
 *
 * Datasets:
 *   0 — Knee Flexion (blue line)
 *   1 — Trunk Lean   (amber dashed line)
 *   2 — Rep Bottoms  (purple scatter markers)
 */

let chart = null;

/**
 * Initialize (or reinitialize) the angle chart.
 *
 * @param {HTMLCanvasElement} canvas
 */
export function initChart(canvas) {
  if (chart) {
    chart.destroy();
  }

  chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Knee Flexion (°)',
          data: [],
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.1)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          fill: true,
          order: 2,
        },
        {
          label: 'Trunk Lean (°)',
          data: [],
          borderColor: '#f59e0b',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [4, 3],
          pointRadius: 0,
          tension: 0.3,
          fill: false,
          order: 3,
        },
        {
          label: 'Rep Bottom',
          type: 'scatter',
          data: [],  // { x: timeString, y: kneeAngle }
          borderColor: '#a855f7',
          backgroundColor: '#a855f7',
          pointRadius: 7,
          pointStyle: 'triangle',
          showLine: false,
          order: 1,
        },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          title: { display: true, text: 'Time (s)', color: '#666' },
          ticks: { color: '#666', maxTicksLimit: 10 },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
        y: {
          title: { display: true, text: 'Angle (°)', color: '#666' },
          ticks: { color: '#666' },
          grid: { color: 'rgba(255,255,255,0.05)' },
          min: 0,
          max: 200,
        },
      },
      plugins: {
        legend: { labels: { color: '#aaa' } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}°`,
          },
        },
      },
    },
  });

  return chart;
}

/**
 * Append a knee flexion data point to the chart without full re-render.
 * Also advances the shared time labels array.
 *
 * @param {number} time  - seconds
 * @param {number} angle - degrees
 */
export function appendAngle(time, angle) {
  if (!chart || isNaN(angle)) return;

  chart.data.labels.push(time.toFixed(2));
  chart.data.datasets[0].data.push(angle);
  chart.update('none');
}

/**
 * Append a trunk lean data point. Labels are shared with appendAngle;
 * call appendAngle first for the same frame.
 *
 * @param {number} time  - seconds (unused — label already pushed by appendAngle)
 * @param {number} angle - trunk lean degrees
 */
export function appendTrunkLean(time, angle) {
  if (!chart || isNaN(angle)) return;
  chart.data.datasets[1].data.push(angle);
  chart.update('none');
}

/**
 * Add a rep-bottom scatter marker at the given time and knee angle.
 *
 * @param {number} time      - seconds (matched to label string format)
 * @param {number} kneeAngle - degrees at the bottom of the rep
 */
export function addRepBottomMarker(time, kneeAngle) {
  if (!chart || isNaN(kneeAngle) || time == null) return;
  chart.data.datasets[2].data.push({ x: time.toFixed(2), y: kneeAngle });
  chart.update('none');
}

/**
 * Draw a vertical playhead line at the given time.
 * Scrolls chart window if data exceeds 30 s of history.
 *
 * @param {number} currentTime - seconds
 */
export function updatePlayhead(currentTime) {
  if (!chart) return;

  const labels = chart.data.labels;
  if (labels.length === 0) return;

  // Keep x-axis window to 30 s
  const windowSec = 30;
  const minTime = Math.max(0, currentTime - windowSec);
  chart.options.scales.x.min = minTime.toFixed(2);
  chart.options.scales.x.max = (minTime + windowSec).toFixed(2);
  chart.update('none');
}

/**
 * Reset chart data (called when a new video is loaded or session resets).
 */
export function resetChart() {
  if (!chart) return;
  chart.data.labels = [];
  chart.data.datasets[0].data = [];
  chart.data.datasets[1].data = [];
  chart.data.datasets[2].data = [];
  chart.options.scales.x.min = undefined;
  chart.options.scales.x.max = undefined;
  chart.update('none');
}
