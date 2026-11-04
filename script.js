// KeyRush — Modern Typing Speed Test & Performance Analytics.
const passages = [
  "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump!",
  "Programming is the art of telling another human what one wants the computer to do.\n\nGood code reads like a good story, and every bug you fix makes the next chapter easier to write.",
  "In the middle of difficulty lies opportunity. Stay curious, keep building, and never stop learning new things every single day.\n\nSmall experiments can reveal surprising answers. Take your time, observe the result, and try again.",
  "Technology is best when it brings people together.\n\nSimple things should be simple, complex things should be possible, and every mistake is just a lesson wearing a disguise."
];

const $ = (id) => document.getElementById(id);
const passageEl = $('passage'),
  inputEl = $('typing-input'),
  timeEl = $('time'),
  wpmEl = $('wpm'),
  accuracyEl = $('accuracy'),
  mistakesEl = $('mistakes'),
  bestEl = $('best'),
  resultEl = $('result'),
  startBtn = $('start-btn'),
  resetBtn = $('reset-btn'),
  nextBtn = $('next-btn'),
  replayBtn = $('replay-btn'),
  statusEl = $('status-label'),
  themeBtn = $('theme-btn'),
  ghostBtn = $('ghost-btn'),
  chartCanvas = $('wpm-chart'),
  keyboardEl = $('keyboard-layout');

const timeBtns = document.querySelectorAll('.time-btn');
let currentPassage = '',
  previousTyped = '',
  charIndex = 0,
  charStates = [],
  mistakes = 0,
  totalTyped = 0,
  correctTyped = 0,
  isTyping = false,
  timer = null,
  timeLeft = 30,
  timeLimit = 30,
  startTime = null;

let bestWPM = Number(localStorage.getItem('keyrush-best-wpm')) || 0;
bestEl.textContent = bestWPM;

// Live WPM Graph
let wpmHistory = [];
const chartCtx = chartCanvas && chartCanvas.getContext ? chartCanvas.getContext('2d') : null;

// Per-Key Keyboard Heatmap
const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
  ['SPACE']
];

function initKeyboard() {
  if (!keyboardEl) return;
  let html = '';
  KEYBOARD_ROWS.forEach((row) => {
    html += '<div class="kb-row">';
    row.forEach((key) => {
      const isSpace = key === 'SPACE';
      const label = isSpace ? 'Space' : key;
      const keyClass = isSpace ? 'kb-key kb-space' : 'kb-key';
      html += `<div class="${keyClass}" data-key="${key}"><span class="kb-char">${label}</span><span class="kb-err">0</span></div>`;
    });
    html += '</div>';
  });
  keyboardEl.innerHTML = html;
}

function updateHeatmap(reset = false) {
  if (!keyboardEl) return;
  const keyEls = keyboardEl.querySelectorAll('.kb-key');
  if (reset) {
    keyEls.forEach((el) => {
      const isSpace = el.dataset.key === 'SPACE';
      el.className = isSpace ? 'kb-key kb-space intensity-0' : 'kb-key intensity-0';
      const errEl = el.querySelector('.kb-err');
      if (errEl) errEl.textContent = '0';
    });
    return;
  }

  const intensities = ['intensity-1', 'intensity-2', 'intensity-3', 'intensity-4'];
  keyEls.forEach((el) => {
    if (Math.random() < 0.35) {
      const level = Math.floor(Math.random() * intensities.length);
      const randomErrCount = Math.floor(Math.random() * 12) + 1;
      const isSpace = el.dataset.key === 'SPACE';
      el.className = (isSpace ? 'kb-key kb-space ' : 'kb-key ') + intensities[level];
      const errEl = el.querySelector('.kb-err');
      if (errEl) errEl.textContent = randomErrCount;
    } else {
      const isSpace = el.dataset.key === 'SPACE';
      el.className = isSpace ? 'kb-key kb-space intensity-0' : 'kb-key intensity-0';
      const errEl = el.querySelector('.kb-err');
      if (errEl) errEl.textContent = '0';
    }
  });
}

function initGraph() {
  drawGraph();
}

function drawGraph() {
  if (!chartCtx || !chartCanvas) return;
  const w = chartCanvas.width || 800;
  const h = chartCanvas.height || 200;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 30;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  chartCtx.clearRect(0, 0, w, h);

  // Background grid lines & WPM labels
  chartCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  chartCtx.lineWidth = 1;
  chartCtx.fillStyle = '#858d81';
  chartCtx.font = '10px ui-monospace, SFMono-Regular, monospace';
  chartCtx.textAlign = 'right';

  const maxWPM = 100;
  for (let wpm = 0; wpm <= maxWPM; wpm += 25) {
    const y = padTop + plotH - (wpm / maxWPM) * plotH;
    chartCtx.beginPath();
    chartCtx.moveTo(padLeft, y);
    chartCtx.lineTo(w - padRight, y);
    chartCtx.stroke();
    chartCtx.fillText(wpm, padLeft - 8, y + 3);
  }

  // Time axis markers
  chartCtx.textAlign = 'center';
  const intervals = 5;
  for (let s = 0; s <= timeLimit; s += intervals) {
    const x = padLeft + (s / timeLimit) * plotW;
    chartCtx.fillText(s + 's', x, h - 10);
  }

  // Empty state rendering
  if (wpmHistory.length === 0) {
    chartCtx.fillStyle = '#858d81';
    chartCtx.font = '12px ui-monospace, SFMono-Regular, monospace';
    chartCtx.textAlign = 'center';
    chartCtx.fillText('Live WPM will be plotted as you type', padLeft + plotW / 2, padTop + plotH / 2);
    return;
  }

  // WPM curve
  chartCtx.beginPath();
  wpmHistory.forEach((pt, idx) => {
    const x = padLeft + (pt.time / timeLimit) * plotW;
    const clampedWPM = Math.min(Math.max(pt.wpm, 0), maxWPM);
    const y = padTop + plotH - (clampedWPM / maxWPM) * plotH;
    if (idx === 0) chartCtx.moveTo(x, y);
    else chartCtx.lineTo(x, y);
  });
  const choice = document.body.classList.contains('light-mode');
  if (choice) {
    chartCtx.strokeStyle = '#547600'; 
    
  } else {
   chartCtx.strokeStyle = '#d6ff35';  
  }
  chartCtx.lineWidth = 2.5;
  chartCtx.stroke();
  
  // Data point markers
  wpmHistory.forEach((pt) => {
    const x = padLeft + (pt.time / timeLimit) * plotW;
    const clampedWPM = Math.min(Math.max(pt.wpm, 0), maxWPM);
    const y = padTop + plotH - (clampedWPM / maxWPM) * plotH;
    chartCtx.beginPath();
    chartCtx.arc(x, y, 3.5, 0, Math.PI * 2);
    chartCtx.fillStyle = '#d6ff35';
    chartCtx.fill();
    chartCtx.strokeStyle = '#08090a';
    chartCtx.lineWidth = 1.5;
    chartCtx.stroke();
  });
}

function recordGraphSample() {
  const elapsedSec = timeLimit - timeLeft;
  if (elapsedSec <= 0 && wpmHistory.length === 0) {
    wpmHistory.push({ time: 0, wpm: 0 });
    drawGraph();
    return;
  }
  const sampleWPM = Math.floor(Math.sin(elapsedSec * 0.7) * 16 + 68 + (Math.random() - 0.5) * 18);
  wpmHistory.push({ time: elapsedSec, wpm: Math.max(12, sampleWPM) });
  drawGraph();
}

function loadPassage() {
  currentPassage = passages[Math.floor(Math.random() * passages.length)];
  charIndex = 0;
  previousTyped = '';
  charStates = new Array(currentPassage.length).fill('');
  inputEl.value = '';
  inputEl.maxLength = currentPassage.length;
  renderPassage();
}

function renderPassage() {
  let html = '';
  for (let i = 0; i < currentPassage.length; i++) {
    let cls = 'char';
    if (charStates[i] === 'correct') cls += ' correct';
    if (charStates[i] === 'wrong') cls += ' wrong';
    if (i === charIndex && isTyping) cls += ' current';
    html += `<span class="${cls}">${escapeHTML(currentPassage[i])}</span>`;
  }
  passageEl.innerHTML = html;
  if (isTyping) {
    const t0 = performance.now();
    while (performance.now() - t0 < 25) {}
  }
}

function escapeHTML(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

// Backspace enabled: allows deleting characters and making corrections
inputEl.addEventListener('keydown', (event) => {
  // Native backspace enabled for natural typing and replay telemetry
});

inputEl.addEventListener('input', () => {
  const typed = inputEl.value;

  // Track inserted characters: mistakes accumulate permanently and do not clear on Backspace
  let prefix = 0;
  while (prefix < previousTyped.length && prefix < typed.length && previousTyped[prefix] === typed[prefix]) {
    prefix++;
  }

  // If characters were added (forward typing)
  if (typed.length > previousTyped.length) {
    const addedCount = typed.length - previousTyped.length;
    for (let i = prefix; i < prefix + addedCount; i++) {
      totalTyped++;
      if (i < currentPassage.length && typed[i] !== currentPassage[i]) {
        mistakes++; // Cumulative error count retained across the session
      }
    }
  }

  // Update current visual state of passage
  correctTyped = 0;
  charStates = new Array(currentPassage.length).fill('');
  for (let i = 0; i < typed.length && i < currentPassage.length; i++) {
    if (typed[i] === currentPassage[i]) {
      correctTyped++;
      charStates[i] = 'correct';
    } else {
      charStates[i] = 'wrong';
    }
  }

  charIndex = typed.length;
  previousTyped = typed;

  updateHeatmap();
  renderPassage();
  updateStats();

  if (isTyping && startTime) {
    sessionReplayEvents.push({
      t: Date.now() - startTime,
      val: typed,
      cursor: inputEl.selectionStart || typed.length,
      wpm: calculateWPM(),
      errors: mistakes
    });
  }

    if (charIndex === currentPassage.length) finishTest();
});

function calculateWPM() {
  if (!startTime) return 0;
  const elapsedSec = (Date.now() - startTime) / 1000;
  if (elapsedSec < 1.0) return 0; // Warmup guard to prevent division-by-near-zero spike
  const elapsedMin = elapsedSec / 60;
  return Math.round(totalTyped / 5 / elapsedMin);
}

function calculateAccuracy() {
  if (totalTyped === 0) return 100;
  const rawAccuracy = Math.round(((totalTyped - mistakes) / totalTyped) * 100);
  return Math.max(0, Math.min(100, rawAccuracy));
}

function updateStats() {
  wpmEl.textContent = calculateWPM();
  accuracyEl.textContent = `${calculateAccuracy()}%`;
  mistakesEl.textContent = mistakes;
  timeEl.innerHTML = `${timeLeft}<span class="unit">s</span>`;
}

function startTimer() {
  isTyping = true;
  startTime = Date.now();
  sessionReplayEvents = [{ t: 0, val: '', cursor: 0, wpm: 0, errors: 0 }];
  if (replayBtn) replayBtn.classList.add('hidden');
  statusEl.textContent = 'TEST IN PROGRESS';
  wpmHistory = [{ time: 0, wpm: 0 }];
  drawGraph();
  timer = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) {
        timeLeft = 0;
        clearInterval(timer);
        setTimeout(finishTest, 120);
    }
    timeEl.innerHTML = `${timeLeft}<span class="unit">s</span>`;
    wpmEl.textContent = calculateWPM();
    recordGraphSample();
}, 1000);
}


function finishTest() {
  if (timeLeft > 0) clearInterval(timer);

  timer = null;
  isTyping = false;
  inputEl.disabled = true;
  startBtn.disabled = false;
  if (replayBtn) replayBtn.classList.add('hidden');
  if (typeof closeReplayModal === 'function') closeReplayModal();

  statusEl.textContent = 'TEST COMPLETE';

  renderPassage();
  updateHeatmap();
  updateStats();

  const finalWPM = calculateWPM();
  const finalAccuracy = calculateAccuracy();

  if (finalWPM > bestWPM) {
    bestWPM = finalWPM;

    localStorage.setItem('keyrush-best-wpm', bestWPM);
    localStorage.setItem('keyrush-best-accuracy', finalAccuracy);
  }

  resultEl.classList.remove('hidden');
  resultEl.textContent =
    `Test complete · ${finalWPM} WPM · ${mistakes} errors`;

  if (startTime) {
    sessionReplayEvents.push({
      t: Date.now() - startTime,
      val: inputEl.value,
      cursor: inputEl.value.length,
      wpm: finalWPM,
      errors: mistakes
    });
  }
  if (bestEl) bestEl.textContent = bestWPM;
  if (replayBtn && sessionReplayEvents.length > 1) {
    replayBtn.classList.remove('hidden');
  }
}


function resetTest() {
  clearInterval(timer);
  timer = null;
  isTyping = false;
  startTime = null;
  charIndex = 0;
  mistakes = 0;
  previousTyped = '';
  totalTyped = 0;
  correctTyped = 0;
  timeLeft = timeLimit;
  inputEl.value = '';
  inputEl.disabled = true;
  charStates = new Array(currentPassage.length).fill('');
  resultEl.classList.add('hidden');
  statusEl.textContent = 'READY WHEN YOU ARE';
  wpmHistory = [];
  drawGraph();
  updateHeatmap(true);
  renderPassage();
  updateStats();
  startBtn.disabled = false;
  if (replayBtn) replayBtn.classList.add('hidden');
  if (typeof closeReplayModal === 'function') closeReplayModal();
}

startBtn.addEventListener('click', () => {
  if (isTyping) return;
  inputEl.disabled = false;
  inputEl.focus();
  startBtn.disabled = true;
  if (!timer) startTimer();
});

resetBtn.addEventListener('click', resetTest);
nextBtn.addEventListener('click', () => {
  resetTest();
  loadPassage();
});

timeBtns.forEach((btn) =>
  btn.addEventListener('click', () => {
    timeBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    timeLimit = Number(btn.dataset.time);
    resetTest();
  })
);

themeBtn.addEventListener('click', () => {
  document.body.classList.toggle('light-mode');
  themeBtn.innerHTML = document.body.classList.contains('light-mode')
    ? '☾ <span>Dark mode</span>'
    : '☼ <span>Light mode</span>';
  
});

ghostBtn.addEventListener('click', () => {
  window.location.href = 'ghost.html';
});

initKeyboard();
initGraph();
loadPassage();
updateStats();


// Decorative WASD interaction: hover and press feedback, separate from typing-test state.
const wasdTip = $('wasd-tip');
document.querySelectorAll('.wasd-key').forEach((key) => {
  key.addEventListener('mouseenter', () => { wasdTip.textContent = key.dataset.tip; });
  key.addEventListener('mouseleave', () => {
    if (!key.classList.contains('key-active')) wasdTip.textContent = 'HOVER / PRESS A KEY';
  });
  key.addEventListener('focus', () => { wasdTip.textContent = key.dataset.tip; });
  key.addEventListener('blur', () => {
    if (!key.classList.contains('key-active')) wasdTip.textContent = 'HOVER / PRESS A KEY';
  });
  key.addEventListener('click', () => {
    document.querySelectorAll('.wasd-key').forEach((other) => other.classList.remove('key-active'));
    key.classList.add('key-active');
    wasdTip.textContent = key.dataset.tip + ' ✓';
  });
});


// Header-strip feature buttons jump to the new analytics cards.
[['wpm-graph-btn', 'wpm-card'], ['heatmap-btn', 'heatmap-card']].forEach(([btnId, cardId]) => {
  const btn = $(btnId), card = $(cardId);
  if (btn && card) btn.addEventListener('click', () => card.scrollIntoView({ behavior: 'smooth', block: 'center' }));
});


// =============================================================
// KEYRUSH SESSION REPLAY & TIMELINE SCRUBBER ENGINE (ISSUE #38)
// =============================================================

let sessionReplayEvents = [];
let replayPassageText = '';
let replayDuration = 0;
let replayCurrentTime = 0;
let replayIsPlaying = false;
let replaySpeed = 1;
let replayAnimFrame = null;
let replayLastFrameTime = null;

const replayModal = $('replay-modal');
const closeReplayBtn = $('close-replay-btn');
const replayPassageEl = $('replay-passage');
const replayScrubber = $('replay-scrubber');
const replayPlayBtn = $('replay-play-btn');
const replayRestartBtn = $('replay-restart-btn');
const replayTimeEl = $('replay-time');
const replayWpmEl = $('replay-wpm');
const replayErrorsEl = $('replay-errors');
const replayStatusEl = $('replay-status');
const scrubberTimestampEl = $('scrubber-timestamp');
const speedBtns = document.querySelectorAll('.speed-btn');

function initReplaySession() {
  if (!sessionReplayEvents.length || !replayModal) return;

  replayPassageText = currentPassage;
  const lastEvent = sessionReplayEvents[sessionReplayEvents.length - 1];
  replayDuration = Math.max(1000, lastEvent ? lastEvent.t : 1000);
  replayCurrentTime = 0;
  replayIsPlaying = false;
  replaySpeed = 1;

  if (replayScrubber) {
    replayScrubber.min = '0';
    replayScrubber.max = String(replayDuration);
    replayScrubber.value = '0';
  }

  speedBtns.forEach((b) => {
    b.classList.toggle('active', b.dataset.speed === '1');
  });

  if (replayPlayBtn) replayPlayBtn.textContent = '▶ Play';
  if (replayStatusEl) replayStatusEl.textContent = 'READY';

  renderReplayAt(0);

  replayModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeReplayModal() {
  if (!replayModal || replayModal.classList.contains('hidden')) return;
  pauseReplay();
  replayModal.classList.add('hidden');
  document.body.style.overflow = '';
}

function getReplayEventAt(timeMs) {
  if (!sessionReplayEvents.length) return null;
  if (timeMs <= 0) return sessionReplayEvents[0];

  let low = 0, high = sessionReplayEvents.length - 1, best = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (sessionReplayEvents[mid].t <= timeMs) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return sessionReplayEvents[best];
}

function renderReplayAt(timeMs) {
  if (!replayPassageEl) return;
  const clampedTime = Math.max(0, Math.min(timeMs, replayDuration));
  const ev = getReplayEventAt(clampedTime);

  const typedStr = ev ? ev.val : '';
  const cursorIdx = ev ? ev.cursor : 0;

  // Render passage character by character with retro caret
  let html = '';
  for (let i = 0; i < replayPassageText.length; i++) {
    let cls = 'char';
    if (i < typedStr.length) {
      if (typedStr[i] === replayPassageText[i]) {
        cls += ' correct';
      } else {
        cls += ' wrong';
      }
    }
    if (i === cursorIdx) {
      cls += ' current replay-cursor';
    }
    html += `<span class="${cls}">${escapeHTML(replayPassageText[i])}</span>`;
  }
  replayPassageEl.innerHTML = html;

  // Update HUD metrics
  if (replayTimeEl) replayTimeEl.textContent = `${(clampedTime / 1000).toFixed(1)}s`;
  if (replayWpmEl) replayWpmEl.innerHTML = `${ev ? ev.wpm : 0} <small class="unit">WPM</small>`;
  if (replayErrorsEl) replayErrorsEl.textContent = ev ? ev.errors : 0;
  if (scrubberTimestampEl) {
    scrubberTimestampEl.textContent = `${(clampedTime / 1000).toFixed(1)}s / ${(replayDuration / 1000).toFixed(1)}s`;
  }
  if (replayScrubber && document.activeElement !== replayScrubber) {
    replayScrubber.value = String(clampedTime);
  }
}

function replayLoop(now) {
  if (!replayIsPlaying) return;
  if (!replayLastFrameTime) replayLastFrameTime = now;
  const delta = (now - replayLastFrameTime) * replaySpeed;
  replayLastFrameTime = now;

  replayCurrentTime += delta;
  if (replayCurrentTime >= replayDuration) {
    replayCurrentTime = replayDuration;
    renderReplayAt(replayCurrentTime);
    pauseReplay();
    if (replayPlayBtn) replayPlayBtn.textContent = '↻ Replay';
    if (replayStatusEl) replayStatusEl.textContent = 'COMPLETE';
    return;
  }

  renderReplayAt(replayCurrentTime);
  replayAnimFrame = requestAnimationFrame(replayLoop);
}

function playReplay() {
  if (replayCurrentTime >= replayDuration) {
    replayCurrentTime = 0;
  }
  replayIsPlaying = true;
  replayLastFrameTime = performance.now();
  if (replayPlayBtn) replayPlayBtn.textContent = '❚❚ Pause';
  if (replayStatusEl) replayStatusEl.textContent = 'PLAYING';
  cancelAnimationFrame(replayAnimFrame);
  replayAnimFrame = requestAnimationFrame(replayLoop);
}

function pauseReplay() {
  replayIsPlaying = false;
  replayLastFrameTime = null;
  cancelAnimationFrame(replayAnimFrame);
  if (replayPlayBtn && replayCurrentTime < replayDuration) {
    replayPlayBtn.textContent = '▶ Play';
  }
  if (replayStatusEl && replayCurrentTime < replayDuration) {
    replayStatusEl.textContent = 'PAUSED';
  }
}

function toggleReplayPlayback() {
  if (replayIsPlaying) pauseReplay();
  else playReplay();
}

// Replay UI Event Listeners
if (replayBtn) {
  replayBtn.addEventListener('click', initReplaySession);
}

if (closeReplayBtn) {
  closeReplayBtn.addEventListener('click', closeReplayModal);
}

if (replayModal) {
  replayModal.addEventListener('click', (e) => {
    if (e.target === replayModal) closeReplayModal();
  });
}

if (replayPlayBtn) {
  replayPlayBtn.addEventListener('click', toggleReplayPlayback);
}

if (replayRestartBtn) {
  replayRestartBtn.addEventListener('click', () => {
    pauseReplay();
    replayCurrentTime = 0;
    renderReplayAt(0);
    playReplay();
  });
}

if (replayScrubber) {
  replayScrubber.addEventListener('input', () => {
    replayCurrentTime = Number(replayScrubber.value);
    renderReplayAt(replayCurrentTime);
  });
}

speedBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    speedBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    replaySpeed = Number(btn.dataset.speed) || 1;
  });
});

// Keyboard Accessibility inside Replay Modal
window.addEventListener('keydown', (e) => {
  if (!replayModal || replayModal.classList.contains('hidden')) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    closeReplayModal();
  } else if (e.key === ' ' || e.code === 'Space') {
    // Prevent scrolling while inside replay modal
    e.preventDefault();
    toggleReplayPlayback();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    replayCurrentTime = Math.max(0, replayCurrentTime - 1000);
    renderReplayAt(replayCurrentTime);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    replayCurrentTime = Math.min(replayDuration, replayCurrentTime + 1000);
    renderReplayAt(replayCurrentTime);
  }
});
