/**
 * Angle chart manager — wraps Chart.js for the knee flexion time-series.
 */

let chart = null;

/**
 * Initialize (or reinitialize) the knee angle chart.
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
            label: (ctx) => `${ctx.parsed.y.toFixed(1)}°`,
          },
        },
      },
    },
  });

  return chart;
}

/**
 * Append a data point to the chart without full re-render.
 *
 * @param {number} time  - seconds
 * @param {number} angle - degrees
 */
export function appendAngle(time, angle) {
  if (!chart || isNaN(angle)) return;

  chart.data.labels.push(time.toFixed(2));
  chart.data.datasets[0].data.push(angle);
  chart.update('none'); // skip animation
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
 * Reset chart data (called when a new video is loaded).
 */
export function resetChart() {
  if (!chart) return;
  chart.data.labels = [];
  chart.data.datasets[0].data = [];
  chart.options.scales.x.min = undefined;
  chart.options.scales.x.max = undefined;
  chart.update('none');
}
