/* ═══════════════════════════════════════════════════════
   DefectAI — Frontend Logic
   Dual-model detection, Chart.js frequency chart,
   history tracking, damage report download.
   ═══════════════════════════════════════════════════════ */

"use strict";

// ── State ──────────────────────────────────────────────────────────────
let selectedModel = "pipeline";   // "pipeline" | "cnn" | "yolo"
let lastResult = null;
let lastReport = null;
let stats = { total: 0, passed: 0, failed: 0 };
let defectFreqMap = {};      // { label: count }
let historyList = [];
let freqChart = null;
let originalImgB64 = null;

// Defect class colours (matches CLASS_INFO in model_service.py)
const CLASS_COLORS = {
    "Crack": "#FF5050", "Blowhole": "#FFA000", "Break": "#FF3CB4",
    "Fray": "#8C50FF", "Open": "#3CB4FF", "Short": "#32DC78",
    "Mousebite": "#FFDC1E", "Spur": "#C87832", "Copper": "#78C832",
    "Pin Hole": "#00BED2", "DEFECTIVE": "#FF3D5A", "GOOD": "#00E5A0",
};

// ── DOM refs ───────────────────────────────────────────────────────────
const dropZone = document.getElementById("dropZone");
const dropContent = document.getElementById("dropContent");
const dropPreview = document.getElementById("dropPreview");
const imageInput = document.getElementById("imageInput");
const previewImg = document.getElementById("previewImg");
const detectBtn = document.getElementById("detectBtn");
const detectBtnTxt = document.getElementById("detectBtnText");
const idleCard = document.getElementById("idleCard");
const loadingCard = document.getElementById("loadingCard");
const resultsPanel = document.getElementById("resultsPanel");
const loadingModel = document.getElementById("loadingModel");

// Stats bar
const elTotal = document.getElementById("totalInspected");
const elPassed = document.getElementById("totalPassed");
const elFailed = document.getElementById("totalFailed");
const elRate = document.getElementById("passRate");

// Result elements
const ringFill = document.getElementById("ringFill");
const ringLabel = document.getElementById("ringLabel");
const verdictBadge = document.getElementById("verdictBadge");
const verdictConf = document.getElementById("verdictConf");
const verdictModel = document.getElementById("verdictModel");
const origImage = document.getElementById("origImage");
const resultImage = document.getElementById("resultImage");
const defectsCard = document.getElementById("defectsCard");
const defectsList = document.getElementById("defectsList");
const defectCount = document.getElementById("defectCount");
const analysisCard = document.getElementById("analysisCard");
const analysisBars = document.getElementById("analysisBars");
const reportBody = document.getElementById("reportBody");
const histListEl = document.getElementById("historyList");
const histCountEl = document.getElementById("historyCount");

// ── Initialise ─────────────────────────────────────────────────────────
(function init() {
    initChart();
    fetchHealth();
    setupDragDrop();
    setupRipple();
    setInterval(fetchHealth, 30000);
})();

// ── Ripple effect on buttons ────────────────────────────────────────────
function setupRipple() {
    document.querySelectorAll('.btn-detect, .btn-browse, .btn-dl, .btn-chart-reset').forEach(btn => {
        btn.addEventListener('click', function (e) {
            const rect = btn.getBoundingClientRect();
            const ripple = document.createElement('span');
            ripple.className = 'ripple';
            ripple.style.left = (e.clientX - rect.left) + 'px';
            ripple.style.top = (e.clientY - rect.top) + 'px';
            btn.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        });
    });
}

// ── Health check ───────────────────────────────────────────────────────
async function fetchHealth() {
    try {
        const r = await fetch("/health");
        const d = await r.json();
        const dot = document.getElementById("statusDot");
        const txt = document.getElementById("statusText");
        dot.classList.add("active");
        txt.textContent = `${d.yolo_model === "custom trained" ? "YOLOv8 ✓" : "YOLOv8 (fallback)"} · ${d.cnn_lstm_model === "trained" ? "CNN+LSTM ✓" : "CNN+LSTM (init)"}`;
    } catch {
        document.getElementById("statusText").textContent = "Server offline";
    }
}

// ── Model selection ────────────────────────────────────────────────────
// Model selection is now hardcoded to the full pipeline.
// Only one engine exists for the user.

// ── File handling ──────────────────────────────────────────────────────
function setupDragDrop() {
    dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("drag-over"); });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
    dropZone.addEventListener("drop", e => {
        e.preventDefault(); dropZone.classList.remove("drag-over");
        const file = e.dataTransfer?.files?.[0];
        if (file) handleFile(file);
    });
    dropZone.addEventListener("click", e => {
        if (!e.target.closest(".btn-browse") && !e.target.closest(".btn-change") && !e.target.closest("input"))
            imageInput.click();
    });
    imageInput.addEventListener("change", () => {
        if (imageInput.files[0]) handleFile(imageInput.files[0]);
    });
}

function handleFile(file) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = ev => {
        originalImgB64 = ev.target.result;
        previewImg.src = originalImgB64;
        origImage.src = originalImgB64;
        // Fade in original image once loaded
        origImage.classList.remove("loaded");
        origImage.onload = () => origImage.classList.add("loaded");
        dropContent.classList.add("hidden");
        dropPreview.classList.remove("hidden");
        detectBtn.disabled = false;
    };
    reader.readAsDataURL(file);
}

// ── Detection ──────────────────────────────────────────────────────────
async function runDetection() {
    if (!imageInput.files[0]) return;

    detectBtn.disabled = true;
    detectBtnTxt.textContent = "Inspecting…";
    loadingModel.textContent = "Pipeline (YOLO+CNN)";
    showState("loading");

    const formData = new FormData();
    formData.append("image", imageInput.files[0]);

    try {
        let endpoint = "/api/pipeline";

        const resp = await fetch(endpoint, { method: "POST", body: formData });
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        lastResult = data;

        // Generate report
        const rResp = await fetch("/api/report", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        if (rResp.ok) lastReport = (await rResp.json()).report;

        renderResults(data);
        updateStats(data);
        updateChart(data);
        addHistory(data, imageInput.files[0].name);
        showState("results");

        // Toast notification
        const isPass = (data.verdict_label || data.status) === "PASS" || (data.verdict_label || data.status) === "GOOD";
        showToast(isPass ? "✅ PASS — Component OK" : "❌ FAIL — Defects Detected", isPass ? "pass" : "fail");

    } catch (err) {
        alert("Detection failed: " + err.message);
        showState("idle");
    } finally {
        detectBtn.disabled = false;
        detectBtnTxt.textContent = "Inspect Item";
    }
}

function showState(state) {
    idleCard.classList.toggle("hidden", state !== "idle");
    loadingCard.classList.toggle("hidden", state !== "loading");
    resultsPanel.classList.toggle("hidden", state !== "results");
}

// ── Render Results ─────────────────────────────────────────────────────
function renderResults(data) {
    const isCNN = data.model_type === "CNN+LSTM";
    const isPass = (data.verdict_label || data.status) === "PASS" ||
        (data.verdict_label || data.status) === "GOOD";
    const conf = data.confidence ?? 0;
    const pct = Math.round(conf * 100);

    // Verdict ring — updated to white-theme colours
    const circumference = 314;
    ringFill.style.strokeDashoffset = circumference - (circumference * conf);
    ringFill.style.stroke = isPass ? "#10B981" : "#EF4444";
    ringLabel.textContent = pct + "%";
    ringLabel.style.color = isPass ? "#10B981" : "#EF4444";

    // Verdict card background tint
    const verdictCard = document.getElementById("verdictCard");
    verdictCard.style.background = isPass
        ? "linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)"
        : "linear-gradient(135deg, #fff5f5 0%, #ffffff 100%)";
    verdictCard.style.borderColor = isPass ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)";

    // Verdict badge
    const verdictText = data.verdict_label || data.verdict || data.status;
    verdictBadge.textContent = verdictText;
    verdictBadge.className = "verdict-badge " + (isPass ? "badge-pass" : "badge-fail");
    verdictConf.textContent = `Confidence: ${(conf * 100).toFixed(1)}%`;
    verdictModel.textContent = `Model: ${data.model_type || (data.model_info?.type) || "—"}`;

    // Images — hide Original on PASS, show both on FAIL
    const resultB64 = data.heatmap_image || data.annotated_image;
    if (resultB64) resultImage.src = `data:image/png;base64,${resultB64}`;
    document.getElementById("resultImageTitle").textContent =
        isCNN ? "Grad-CAM Heatmap" : (isPass ? "✅ Annotated — No Defects Found" : "❌ Annotated — Defects Highlighted");

    // PASS → hide original card, full-width annotated
    // FAIL → show both side by side
    const origCard = document.getElementById("origCard");
    const imagesRow = document.querySelector(".images-row");
    if (isPass) {
        origCard.classList.add("hidden");
        imagesRow.style.gridTemplateColumns = "1fr";
    } else {
        origCard.classList.remove("hidden");
        imagesRow.style.gridTemplateColumns = "1fr 1fr";
    }

    // CNN+LSTM analysis bars
    analysisCard.classList.toggle("hidden", !isCNN);
    if (isCNN && data.analysis) {
        const a = data.analysis;
        const gp = Math.round((a.healthy_probability ?? 0) * 100);
        const dp = Math.round((a.defect_probability ?? 0) * 100);
        analysisBars.innerHTML = `
      <div class="analysis-row">
        <div class="analysis-label">Healthy</div>
        <div class="analysis-bar-wrap">
          <div class="analysis-bar-fill bar-good" style="width:0%" data-w="${gp}%"></div>
        </div>
        <div class="analysis-val">${gp}%</div>
      </div>
      <div class="analysis-row">
        <div class="analysis-label">Defective</div>
        <div class="analysis-bar-wrap">
          <div class="analysis-bar-fill bar-def" style="width:0%" data-w="${dp}%"></div>
        </div>
        <div class="analysis-val">${dp}%</div>
      </div>`;
        setTimeout(() => {
            analysisBars.querySelectorAll(".analysis-bar-fill").forEach(el => {
                el.style.width = el.dataset.w;
            });
        }, 50);
    }

    // YOLOv8 / Pipeline defect chips
    const isPipeline = data.model_info?.type?.includes("Pipeline");
    const defects = data.defects ?? [];
    const discarded = data.discarded_defects ?? [];

    defectsCard.classList.toggle("hidden", isCNN || (defects.length === 0 && discarded.length === 0));

    if (!isCNN && (defects.length > 0 || discarded.length > 0)) {
        defectCount.textContent = defects.length;

        let html = "";

        // Show verified defects
        if (defects.length > 0) {
            html += defects.map(d => `
              <div class="defect-chip" style="border: 1px solid #FF3D5A;">
                <span class="chip-name">${d.class}</span>
                <span class="chip-conf">${(d.confidence * 100).toFixed(1)}%</span>
                ${isPipeline ? `<div style="font-size:0.65rem; color:#FF3D5A; margin-top:4px;">CNN Ver: ${(d.verification.confidence * 100).toFixed(1)}%</div>` : ""}
              </div>`).join("");
        }

        // Show discarded defects (false positives caught by CNN)
        if (isPipeline && discarded.length > 0) {
            html += discarded.map(d => `
              <div class="defect-chip" style="opacity: 0.6; border: 1px dashed #00E5A0;">
                <span class="chip-name" style="text-decoration: line-through;">${d.class}</span>
                <span class="chip-conf">${(d.confidence * 100).toFixed(1)}%</span>
                <div style="font-size:0.65rem; color:#00E5A0; margin-top:4px;">CNN Rejected: ${(d.verification.confidence * 100).toFixed(1)}%</div>
              </div>`).join("");
        }

        defectsList.innerHTML = html;
    }

    // Damage report
    renderReport(lastReport);
}

function renderReport(r) {
    if (!r) { reportBody.innerHTML = "<p style='color:var(--text-muted);font-size:.8rem'>No report yet.</p>"; return; }
    const isPass = r.verdict === "PASS" || r.verdict === "GOOD";
    reportBody.innerHTML = `
    <div class="report-line"><span class="report-key">Report ID</span><span class="report-val mono">${r.report_id}</span></div>
    <div class="report-line"><span class="report-key">Timestamp</span><span class="report-val mono">${r.timestamp.replace("T", " ").slice(0, 19)}</span></div>
    <div class="report-line"><span class="report-key">Model</span><span class="report-val">${r.model_used}</span></div>
    <div class="report-line"><span class="report-key">Verdict</span><span class="report-val ${isPass ? "pass" : "fail"}">${r.verdict}</span></div>
    <div class="report-line"><span class="report-key">Confidence</span><span class="report-val mono">${(r.confidence * 100).toFixed(1)}%</span></div>
    <div class="report-line"><span class="report-key">Defects Found</span><span class="report-val ${r.num_defects > 0 ? "fail" : "pass"}">${r.num_defects}</span></div>
    <div class="report-rec ${isPass ? "rec-pass" : "rec-fail"}">${r.recommendation}</div>`;
}

// ── Stats ──────────────────────────────────────────────────────────────
function updateStats(data) {
    const isPass = (data.verdict_label || data.verdict || data.status) === "PASS" ||
        (data.verdict_label || data.verdict || data.status) === "GOOD";
    stats.total++;
    if (isPass) stats.passed++; else stats.failed++;
    elTotal.textContent = stats.total;
    elPassed.textContent = stats.passed;
    elFailed.textContent = stats.failed;
    elRate.textContent = stats.total > 0
        ? Math.round((stats.passed / stats.total) * 100) + "%" : "—";
}

// ── Chart.js Frequency Chart ───────────────────────────────────────────
function initChart() {
    const ctx = document.getElementById("defectFreqChart").getContext("2d");

    Chart.defaults.color = "#6b8aa8";
    Chart.defaults.font.family = "'Inter', sans-serif";

    freqChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: [],
            datasets: [{
                label: "Detections",
                data: [],
                backgroundColor: [],
                borderColor: [],
                borderWidth: 2,
                borderRadius: 6,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 600, easing: "easeOutQuart" },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "rgba(6,11,20,0.92)",
                    borderColor: "rgba(0,212,255,0.25)",
                    borderWidth: 1,
                    titleColor: "#00D4FF",
                    bodyColor: "#e2eaf4",
                    padding: 10,
                    callbacks: {
                        title: items => items[0].label,
                        label: item => ` Detected ${item.raw} time${item.raw !== 1 ? "s" : ""}`,
                    },
                },
            },
            scales: {
                x: {
                    grid: { color: "rgba(255,255,255,0.03)" },
                    ticks: { color: "#6b8aa8", font: { size: 11 } },
                },
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1, color: "#6b8aa8", font: { size: 11 } },
                    grid: { color: "rgba(255,255,255,0.05)" },
                    border: { color: "rgba(255,255,255,0.08)" },
                },
            },
        },
    });
}

function updateChart(data) {
    const isPipeline = data.model_info?.type?.includes("Pipeline");

    // Collect labels from CNN or YOLO result
    if (data.model_type === "CNN+LSTM") {
        const label = data.verdict === "DEFECTIVE" ? "DEFECTIVE" : "GOOD";
        defectFreqMap[label] = (defectFreqMap[label] || 0) + 1;
    } else {
        const defects = data.defects ?? [];
        if (defects.length === 0) {
            defectFreqMap["No Defect"] = (defectFreqMap["No Defect"] || 0) + 1;
        } else {
            defects.forEach(d => {
                defectFreqMap[d.class] = (defectFreqMap[d.class] || 0) + 1;
            });
        }

        if (isPipeline) {
            const discarded = data.discarded_defects ?? [];
            discarded.forEach(d => {
                defectFreqMap["Saved False Positive"] = (defectFreqMap["Saved False Positive"] || 0) + 1;
            });
        }
    }

    rebuildChart();
}

function rebuildChart() {
    // Sort by count descending
    const entries = Object.entries(defectFreqMap).sort((a, b) => b[1] - a[1]);
    const labels = entries.map(e => e[0]);
    const values = entries.map(e => e[1]);
    const bgColors = labels.map(l => hexToRgba(CLASS_COLORS[l] || "#00D4FF", 0.25));
    const bdrColors = labels.map(l => CLASS_COLORS[l] || "#00D4FF");

    freqChart.data.labels = labels;
    freqChart.data.datasets[0].data = values;
    freqChart.data.datasets[0].backgroundColor = bgColors;
    freqChart.data.datasets[0].borderColor = bdrColors;
    freqChart.update("active");

    // Legend
    const legendEl = document.getElementById("chartLegend");
    legendEl.innerHTML = entries.map(([label, count]) => `
    <div class="leg-item">
      <div class="leg-dot" style="background:${CLASS_COLORS[label] || "#00D4FF"}"></div>
      <span>${label}: <strong>${count}</strong></span>
    </div>`).join("");
}

function resetChart() {
    defectFreqMap = {};
    freqChart.data.labels = [];
    freqChart.data.datasets[0].data = [];
    freqChart.data.datasets[0].backgroundColor = [];
    freqChart.data.datasets[0].borderColor = [];
    freqChart.update();
    document.getElementById("chartLegend").innerHTML = "";
    // Reset stats too
    stats = { total: 0, passed: 0, failed: 0 };
    elTotal.textContent = "0"; elPassed.textContent = "0";
    elFailed.textContent = "0"; elRate.textContent = "—";
    historyList = [];
    histListEl.innerHTML = '<div class="history-empty">No inspections yet</div>';
    histCountEl.textContent = "0 records";
}

// ── History ────────────────────────────────────────────────────────────
function addHistory(data, filename) {
    const isPass = (data.verdict_label || data.verdict || data.status) === "PASS" ||
        (data.verdict_label || data.verdict || data.status) === "GOOD";
    const entry = {
        file: filename || "image",
        model: data.model_type || (data.model_info?.type) || "—",
        verdict: isPass ? "PASS" : "FAIL",
        conf: ((data.confidence ?? 0) * 100).toFixed(1),
        time: new Date().toLocaleTimeString(),
        ndefs: (data.defects ?? []).length,
    };
    historyList.unshift(entry);
    if (historyList.length > 50) historyList.pop();

    histCountEl.textContent = `${historyList.length} record${historyList.length !== 1 ? "s" : ""}`;
    histListEl.innerHTML = historyList.map((h, i) => `
    <div class="history-item">
      <div class="hist-verdict ${h.verdict === "PASS" ? "hist-pass" : "hist-fail"}">${h.verdict}</div>
      <div class="hist-info">
        <div class="hist-file">${h.file}</div>
        <div class="hist-meta">${h.model} · ${h.conf}% · ${h.time}${h.ndefs > 0 ? " · " + h.ndefs + " defects" : ""}</div>
      </div>
    </div>`).join("");
}

// ── Report Download ────────────────────────────────────────────────────
function downloadReport() {
    if (!lastReport) return;
    const blob = new Blob([JSON.stringify(lastReport, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${lastReport.report_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── Utility ────────────────────────────────────────────────────────────
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

// ── Toast Notifications ────────────────────────────────────────────────
function showToast(message, type = "pass") {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
}

// ── Image fade-in on load ──────────────────────────────────────────────
resultImage.addEventListener("load", () => resultImage.classList.add("loaded"));
resultImage.addEventListener("error", () => resultImage.classList.add("loaded"));


// ── Active Learning ────────────────────────────────────────────────────
async function fetchPendingImages() {
    try {
        const resp = await fetch("/api/pending-images");
        const data = await resp.json();
        const pendingList = document.getElementById("pendingList");

        if (!data.pending || data.pending.length === 0) {
            pendingList.innerHTML = '<div class="history-empty">No pending images left for review</div>';
            return;
        }

        pendingList.innerHTML = data.pending.map(filename => `
            <div class="card" style="padding: 1rem;">
                <img src="/api/pending-images/${filename}" style="width: 100%; border-radius: 8px; margin-bottom: 1rem;">
                <p style="font-size: 0.8rem; margin-bottom: 0.5rem; word-break: break-all;">${filename}</p>
                <div style="display: flex; gap: 0.5rem;">
                    <select id="sel-${filename.replace(/[^a-zA-Z0-9]/g, '')}" style="flex: 1; padding: 0.5rem; background: rgba(0,212,255,0.05); color: #00D4FF; border: 1px solid rgba(0,212,255,0.2);">
                        <option value="0">Crack</option>
                        <option value="1">Blowhole</option>
                        <option value="2">Break</option>
                        <option value="3">Fray</option>
                        <option value="4">Open</option>
                        <option value="5">Short</option>
                        <option value="6">Mousebite</option>
                        <option value="7">Spur</option>
                        <option value="8">Copper</option>
                        <option value="9">Pin Hole</option>
                        <option value="10">Good</option>
                    </select>
                    <button class="btn-detect" style="padding: 0.5rem 1rem;" onclick="submitLabel('${filename}')">Submit</button>
                </div>
            </div>
        `).join("");
    } catch (err) {
        console.error("Failed to fetch pending images", err);
    }
}

async function submitLabel(filename) {
    const selId = "sel-" + filename.replace(/[^a-zA-Z0-9]/g, '');
    const labelClass = document.getElementById(selId).value;

    // Simplistic bounding box for MVP
    const bboxes = labelClass !== "10" ? [{ class_id: labelClass, cx: 0.5, cy: 0.5, w: 0.5, h: 0.5 }] : [];

    try {
        const resp = await fetch("/api/label", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename, label_class: labelClass, bboxes })
        });

        if (resp.ok) {
            fetchPendingImages();
        } else {
            alert("Failed to submit label");
        }
    } catch (err) {
        alert("Error submitting label: " + err.message);
    }
}

fetchPendingImages();
