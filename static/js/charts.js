/* ═══════════════════════════════════════════════════════════
   charts.js — Chart.js initialisation for all pages
   ═══════════════════════════════════════════════════════════ */
"use strict";

// ── Global chart instances ───────────────────────────────────
let dashCharts = {};
let analyticsCharts = {};

// ── Chart.js defaults ────────────────────────────────────────
Chart.defaults.color = '#64748B';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.plugins.legend.display = false;

const COLORS = {
     cyan: '#06B6D4', violet: '#7C3AED',
     green: '#10B981', red: '#EF4444',
     amber: '#F59E0B', blue: '#3B82F6',
     pink: '#EC4899',
};
const PALETTE = Object.values(COLORS);
function rgba(hex, a) {
     const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
     return `rgba(${r},${g},${b},${a})`;
}

// ── Shared chart options ─────────────────────────────────────
const gridStyle = { color: 'rgba(255,255,255,0.05)', drawBorder: false };
const tooltipStyle = {
     backgroundColor: 'rgba(10,15,30,0.95)',
     borderColor: 'rgba(6,182,212,0.3)',
     borderWidth: 1,
     titleColor: COLORS.cyan,
     bodyColor: '#e2eaf4',
     padding: 10,
};

// ── Dashboard Charts ─────────────────────────────────────────
function initDashboardCharts() {
     // Pie chart
     const pieCtx = document.getElementById('pieChart');
     if (pieCtx) {
          dashCharts.pie = new Chart(pieCtx, {
               type: 'doughnut',
               data: { labels: [], datasets: [{ data: [], backgroundColor: PALETTE.map(c => rgba(c, 0.8)), borderColor: PALETTE, borderWidth: 2, hoverOffset: 8 }] },
               options: {
                    responsive: true, maintainAspectRatio: false,
                    cutout: '65%',
                    animation: { animateRotate: true, duration: 800 },
                    plugins: { legend: { display: true, position: 'right', labels: { color: '#64748B', font: { size: 11 }, padding: 10, boxWidth: 12 } }, tooltip: { ...tooltipStyle } },
               }
          });
     }

     // Bar chart
     const barCtx = document.getElementById('barChart');
     if (barCtx) {
          dashCharts.bar = new Chart(barCtx, {
               type: 'bar',
               data: { labels: [], datasets: [{ label: 'Count', data: [], backgroundColor: PALETTE.map(c => rgba(c, 0.3)), borderColor: PALETTE, borderWidth: 2, borderRadius: 6, borderSkipped: false }] },
               options: {
                    responsive: true, maintainAspectRatio: false,
                    animation: { duration: 600, easing: 'easeOutQuart' },
                    scales: {
                         x: { grid: gridStyle, ticks: { color: '#64748B', font: { size: 10 } } },
                         y: { beginAtZero: true, grid: gridStyle, ticks: { color: '#64748B', font: { size: 10 }, stepSize: 1 } }
                    },
                    plugins: { tooltip: { ...tooltipStyle } }
               }
          });
     }

     // Line chart (confidence trend)
     const lineCtx = document.getElementById('lineChart');
     if (lineCtx) {
          dashCharts.line = new Chart(lineCtx, {
               type: 'line',
               data: {
                    labels: [],
                    datasets: [{
                         label: 'Confidence %', data: [],
                         borderColor: COLORS.cyan, backgroundColor: rgba(COLORS.cyan, 0.08),
                         borderWidth: 2, pointRadius: 4, pointBackgroundColor: COLORS.cyan,
                         tension: 0.4, fill: true,
                    }]
               },
               options: {
                    responsive: true, maintainAspectRatio: false,
                    animation: { duration: 500 },
                    scales: {
                         x: { grid: gridStyle, ticks: { color: '#64748B', font: { size: 10 }, maxTicksLimit: 10 } },
                         y: { beginAtZero: true, max: 100, grid: gridStyle, ticks: { color: '#64748B', font: { size: 10 }, callback: v => v + '%' } }
                    },
                    plugins: { tooltip: { ...tooltipStyle, callbacks: { label: i => `Confidence: ${i.raw}%` } } }
               }
          });
     }
}

// ── Update Dashboard Charts from a new detection result ──────
let scanIndex = 0;
function updateDashCharts(data, defectFreqMap, stats) {
     scanIndex++;
     const conf = Math.round((data.confidence || 0) * 100);

     // Line: add point
     if (dashCharts.line) {
          dashCharts.line.data.labels.push('#' + scanIndex);
          dashCharts.line.data.datasets[0].data.push(conf);
          if (dashCharts.line.data.labels.length > 20) {
               dashCharts.line.data.labels.shift();
               dashCharts.line.data.datasets[0].data.shift();
          }
          dashCharts.line.update('active');
     }

     // Pie + Bar: rebuild from defectFreqMap
     const entries = Object.entries(defectFreqMap).sort((a, b) => b[1] - a[1]);
     const labels = entries.map(e => e[0]);
     const values = entries.map(e => e[1]);

     if (dashCharts.pie) {
          dashCharts.pie.data.labels = labels;
          dashCharts.pie.data.datasets[0].data = values;
          dashCharts.pie.data.datasets[0].backgroundColor = PALETTE.slice(0, labels.length).map(c => rgba(c, 0.8));
          dashCharts.pie.data.datasets[0].borderColor = PALETTE.slice(0, labels.length);
          dashCharts.pie.update('active');
     }

     if (dashCharts.bar) {
          dashCharts.bar.data.labels = labels;
          dashCharts.bar.data.datasets[0].data = values;
          dashCharts.bar.data.datasets[0].backgroundColor = PALETTE.slice(0, labels.length).map(c => rgba(c, 0.3));
          dashCharts.bar.data.datasets[0].borderColor = PALETTE.slice(0, labels.length);
          dashCharts.bar.update('active');
     }
}

// ── Analytics Charts ─────────────────────────────────────────
async function initAnalyticsCharts() {
     let history = [];
     try {
          const r = await fetch('/api/history');
          const d = await r.json();
          history = d.history || [];
     } catch { }

     const total = history.length;
     const passed = history.filter(h => h.verdict !== 'FAIL').length;
     const failed = total - passed;
     const passRate = total ? Math.round(passed / total * 100) : 0;

     // Update confusion matrix numbers
     setText('cmTP', passed);
     setText('cmFP', failed);
     setText('cmTotal', total);

     // Gauge value
     const gv = document.getElementById('gaugeValue');
     if (gv) gv.textContent = (total ? passRate : '—') + (total ? '%' : '');

     // Build defect freq from history
     const freqMap = {};
     let alCount = 0;
     history.forEach(h => {
          if (h.num_defects > 0) {
               freqMap['FAIL'] = (freqMap['FAIL'] || 0) + 1;
          } else {
               freqMap['PASS'] = (freqMap['PASS'] || 0) + 1;
          }
     });

     // Pie chart (analytics)
     const aPieCtx = document.getElementById('aPieChart');
     if (aPieCtx) {
          analyticsCharts.pie = new Chart(aPieCtx, {
               type: 'doughnut',
               data: {
                    labels: ['PASS', 'FAIL'],
                    datasets: [{ data: [passed, failed], backgroundColor: [rgba(COLORS.green, 0.75), rgba(COLORS.red, 0.75)], borderColor: [COLORS.green, COLORS.red], borderWidth: 2, hoverOffset: 10 }]
               },
               options: {
                    responsive: true, maintainAspectRatio: false, cutout: '60%',
                    animation: { animateRotate: true, duration: 900 },
                    plugins: { legend: { display: true, position: 'bottom', labels: { color: '#64748B', font: { size: 11 }, padding: 12, boxWidth: 12 } }, tooltip: { ...tooltipStyle } }
               }
          });
     }

     // Gauge (doughnut half)
     const gaugeCtx = document.getElementById('gaugeChart');
     if (gaugeCtx) {
          analyticsCharts.gauge = new Chart(gaugeCtx, {
               type: 'doughnut',
               data: {
                    labels: ['Pass', 'Fail'],
                    datasets: [{ data: [passRate, 100 - passRate], backgroundColor: [rgba(COLORS.green, 0.8), 'rgba(255,255,255,0.05)'], borderColor: ['transparent', 'transparent'], borderWidth: 0 }]
               },
               options: {
                    responsive: true, maintainAspectRatio: false, cutout: '70%', rotation: -90, circumference: 180,
                    animation: { animateRotate: true, duration: 1000 },
                    plugins: { tooltip: { enabled: false }, legend: { display: false } }
               }
          });
     }

     // Line chart (confidence over time)
     const aLineCtx = document.getElementById('aLineChart');
     const confData = history.slice().reverse().map((h, i) => ({ x: '#' + (i + 1), y: Math.round((h.confidence || 0) * 100) }));
     if (aLineCtx) {
          analyticsCharts.line = new Chart(aLineCtx, {
               type: 'line',
               data: {
                    labels: confData.map(d => d.x),
                    datasets: [{
                         label: 'Confidence', data: confData.map(d => d.y),
                         borderColor: COLORS.cyan, backgroundColor: rgba(COLORS.cyan, 0.07),
                         borderWidth: 2, pointRadius: 3, tension: 0.4, fill: true,
                    }]
               },
               options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: {
                         x: { grid: gridStyle, ticks: { color: '#64748B', font: { size: 10 } } },
                         y: { beginAtZero: true, max: 100, grid: gridStyle, ticks: { color: '#64748B', font: { size: 10 }, callback: v => v + '%' } }
                    },
                    plugins: { tooltip: { ...tooltipStyle }, legend: { display: false } }
               }
          });
     }

     // Area chart (defect frequency)
     const aAreaCtx = document.getElementById('aAreaChart');
     const defectData = history.slice().reverse().map((h, i) => ({ x: '#' + (i + 1), y: h.num_defects || 0 }));
     if (aAreaCtx) {
          analyticsCharts.area = new Chart(aAreaCtx, {
               type: 'line',
               data: {
                    labels: defectData.map(d => d.x),
                    datasets: [{
                         label: 'Defects', data: defectData.map(d => d.y),
                         borderColor: COLORS.red, backgroundColor: rgba(COLORS.red, 0.12),
                         borderWidth: 2, pointRadius: 3, tension: 0.3, fill: true,
                    }]
               },
               options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: {
                         x: { grid: gridStyle, ticks: { color: '#64748B', font: { size: 10 } } },
                         y: { beginAtZero: true, grid: gridStyle, ticks: { color: '#64748B', font: { size: 10 }, stepSize: 1 } }
                    },
                    plugins: { tooltip: { ...tooltipStyle }, legend: { display: false } }
               }
          });
     }

     // Bar: PASS vs FAIL
     const aBarCtx = document.getElementById('aBarChart');
     if (aBarCtx) {
          analyticsCharts.bar = new Chart(aBarCtx, {
               type: 'bar',
               data: {
                    labels: ['PASS', 'FAIL'],
                    datasets: [{
                         label: 'Count', data: [passed, failed],
                         backgroundColor: [rgba(COLORS.green, 0.3), rgba(COLORS.red, 0.3)],
                         borderColor: [COLORS.green, COLORS.red],
                         borderWidth: 2, borderRadius: 8, borderSkipped: false,
                    }]
               },
               options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: {
                         x: { grid: gridStyle, ticks: { color: '#64748B' } },
                         y: { beginAtZero: true, grid: gridStyle, ticks: { color: '#64748B', stepSize: 1 } }
                    },
                    plugins: { tooltip: { ...tooltipStyle }, legend: { display: false } }
               }
          });
     }
}

// ── Utility ──────────────────────────────────────────────────
function setText(id, val) {
     const el = document.getElementById(id);
     if (el) el.textContent = val;
}
