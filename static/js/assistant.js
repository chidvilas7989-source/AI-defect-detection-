/* ═══════════════════════════════════════════════════════════
   assistant.js — AI Chat interface
   ═══════════════════════════════════════════════════════════ */
"use strict";

let historyCache = [];
let healthCache = {};
let msgCount = 0;

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
     await loadData();
     updateInsights();
});

async function loadData() {
     try {
          const [hRes, hlRes] = await Promise.all([
               fetch('/api/history'),
               fetch('/health'),
          ]);
          historyCache = (await hRes.json()).history || [];
          healthCache = await hlRes.json();
     } catch { }

     // Update model info
     setText('miYolo', healthCache.yolo_model || '—');
     setText('miCnn', healthCache.cnn_lstm_model || '—');
     setText('miAnomaly', healthCache.anomaly_model || '—');
}

function updateInsights() {
     const h = historyCache;
     if (!h.length) return;

     const last = h[0];
     const total = h.length;
     const passed = h.filter(r => r.verdict !== 'FAIL').length;
     const rate = Math.round(passed / total * 100);
     const highConf = h.reduce((best, r) => r.confidence > best.confidence ? r : best, h[0]);

     // Defect frequency
     const freq = {};
     h.forEach(r => { if (r.num_defects > 0) freq['FAIL'] = (freq['FAIL'] || 0) + 1; });

     setText('insLastResult', (last.verdict === 'FAIL' ? '❌ FAIL' : '✅ PASS') + ` — ${((last.confidence || 0) * 100).toFixed(1)}%`);
     setText('insLastTime', last.timestamp || '—');
     setText('insHighConf', (highConf.confidence * 100).toFixed(1) + '%');
     setText('insHighConfFile', highConf.filename || '—');
     setText('insMostCommon', h.some(r => r.num_defects > 0) ? 'Defective' : 'All PASS');
     setText('insMostCommonCount', `${h.filter(r => r.num_defects > 0).length} / ${total} inspections`);
     setText('insPassRate', rate + '%');
     setText('insPassRateSub', `${passed} passed out of ${total} total`);

     const action = rate >= 90 ? '✅ System performing well' :
          rate >= 70 ? '⚠️ Monitor defect frequency' :
               '🔴 High failure rate — recommend retraining';
     setText('insAction', action);
}

// ── Chat ──────────────────────────────────────────────────────
async function sendMessage() {
     const input = document.getElementById('chatInput');
     const text = input.value.trim();
     if (!text) return;
     input.value = '';
     input.style.height = 'auto';
     addMessage('user', text);
     await generateResponse(text);
}

function sendQuickMsg(text) {
     document.getElementById('chatInput').value = text;
     sendMessage();
}

function addMessage(role, html, isTyping = false) {
     const container = document.getElementById('chatMessages');
     const idx = ++msgCount;
     const div = document.createElement('div');
     div.className = `msg ${role} fade-up`;
     div.style.animationDelay = '0s';
     div.id = `msg-${idx}`;

     const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
     const avatar = role === 'ai' ? '🤖' : '👤';
     div.innerHTML = `
    <div class="msg-avatar">${avatar}</div>
    <div>
      <div class="msg-bubble" id="bubble-${idx}">${isTyping ? typingHTML() : html}</div>
      <div class="msg-time">${time}</div>
    </div>`;
     container.appendChild(div);
     container.scrollTop = container.scrollHeight;
     return idx;
}

function typingHTML() {
     return `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
}

async function generateResponse(userText) {
     const typingId = addMessage('ai', '', true);
     await sleep(600 + Math.random() * 400);

     const response = buildResponse(userText.toLowerCase());
     const bubble = document.getElementById(`bubble-${typingId}`);

     // Type out the response
     if (bubble) {
          bubble.innerHTML = '';
          await typeEffect(bubble, response);
     }
     document.getElementById('chatMessages').scrollTop = 99999;
}

async function typeEffect(el, text, delay = 18) {
     el.innerHTML = '';
     // For HTML content, set directly after a brief pause
     const cleaned = text.replace(/<[^>]+>/g, '').length;
     if (cleaned < 200) {
          await sleep(delay * Math.min(cleaned, 60));
          el.innerHTML = text;
     } else {
          el.innerHTML = text;
     }
}

function buildResponse(q) {
     const h = historyCache;
     const total = h.length;
     const passed = h.filter(r => r.verdict !== 'FAIL').length;
     const failed = total - passed;
     const rate = total ? Math.round(passed / total * 100) : null;
     const avgConf = total ? (h.reduce((s, r) => s + (r.confidence || 0), 0) / total * 100).toFixed(1) : null;
     const last = h[0];

     if (q.includes('last 5') || q.includes('recent')) {
          if (!h.length) return '📭 No inspections recorded yet. Upload an image on the Dashboard to start!';
          const rows = h.slice(0, 5).map((r, i) => `<br>${i + 1}. <strong>${r.filename || 'Image'}</strong> — <span style="color:${r.verdict === 'FAIL' ? 'var(--red)' : 'var(--green)'}">${r.verdict || '?'}</span> · ${((r.confidence || 0) * 100).toFixed(1)}% · ${r.timestamp || ''}`)
          return `📋 <strong>Last 5 Inspections:</strong>${rows.join('')}`;
     }

     if (q.includes('pass rate') || q.includes('today')) {
          if (!total) return '📊 No data yet. Run some inspections first!';
          return `📊 <strong>Current Pass Rate: ${rate}%</strong><br>${passed} / ${total} inspections passed.<br>${failed > 0 ? `⚠️ ${failed} failure(s) detected.` : '✅ All clear so far!'}`;
     }

     if (q.includes('common') || q.includes('frequent')) {
          const failRate = total ? Math.round(failed / total * 100) : 0;
          return `🔍 <strong>Defect Analysis:</strong><br>FAIL rate: <strong>${failRate}%</strong><br>${failed} inspection(s) detected defects out of ${total} total.`;
     }

     if (q.includes('confident') || q.includes('confidence')) {
          if (!total) return '🎯 No confidence data yet. Run an inspection first.';
          const high = h.reduce((b, r) => r.confidence > b.confidence ? r : b, h[0]);
          return `🎯 <strong>Model Confidence:</strong><br>Average: <strong>${avgConf}%</strong><br>Highest: <strong>${(high.confidence * 100).toFixed(1)}%</strong> on <em>${high.filename || 'image'}</em>`;
     }

     if (q.includes('latest') || q.includes('last result') || q.includes('explain')) {
          if (!last) return '📭 No recent inspection found.';
          const isPass = last.verdict !== 'FAIL';
          return `🧠 <strong>Latest Inspection:</strong><br>File: <em>${last.filename || '—'}</em><br>Result: <span style="color:${isPass ? 'var(--green)' : 'var(--red)'}">${isPass ? '✅ PASS' : '❌ FAIL'}</span><br>Confidence: <strong>${((last.confidence || 0) * 100).toFixed(1)}%</strong><br>Defects: <strong>${last.num_defects || 0}</strong><br>${isPass ? 'Component cleared for assembly.' : 'Recommended: manual inspection required.'}`;
     }

     if (q.includes('health') || q.includes('system') || q.includes('status')) {
          const y = healthCache.yolo_model || '—';
          const c = healthCache.cnn_lstm_model || '—';
          const a = healthCache.anomaly_model || '—';
          return `🖥️ <strong>System Health:</strong><br>YOLOv8: <strong>${y}</strong><br>CNN+LSTM: <strong>${c}</strong><br>Anomaly: <strong>${a}</strong><br>API: <span style="color:var(--green)">✅ Online</span>`;
     }

     if (q.includes('retrain') || q.includes('train')) {
          return `🎓 <strong>Retraining:</strong> The system flags low-confidence images (&lt;80%) for active learning review. Once ${50} images are labeled, incremental retraining can begin. Check the <a href="/history" style="color:var(--cyan)">History</a> page to review pending images.`;
     }

     if (q.includes('hello') || q.includes('hi') || q.includes('hey')) {
          return `👋 Hello! I'm your DefectAI Assistant. I can help you with:<br>• Inspection history & statistics<br>• Model confidence analysis<br>• Defect pattern insights<br>• System health status<br><br>What would you like to know?`;
     }

     // Default fallback
     const tips = [
          `💡 Try asking: <em>"What is today's pass rate?"</em>`,
          `💡 Ask me: <em>"Show last 5 defects"</em>`,
          `💡 Ask me: <em>"How confident is the model?"</em>`,
          `💡 Ask me: <em>"Explain the latest inspection"</em>`,
     ];
     return `🤖 I'm not sure about that specific query. Here's a tip:<br><br>${tips[Math.floor(Math.random() * tips.length)]}<br><br>${total ? `📊 Quick stats: ${total} inspections, ${rate}% pass rate, avg confidence ${avgConf}%.` : '📭 No inspection data yet. Upload an image on the Dashboard!'}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function setText(id, val) {
     const el = document.getElementById(id);
     if (el) el.textContent = val;
}

// Auto-resize chat input
document.addEventListener('DOMContentLoaded', () => {
     const inp = document.getElementById('chatInput');
     if (inp) {
          inp.addEventListener('input', () => {
               inp.style.height = 'auto';
               inp.style.height = Math.min(inp.scrollHeight, 120) + 'px';
          });
     }
});
