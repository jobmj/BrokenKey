const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
// KeyRush — Modern Typing Speed Test & Performance Analytics.
const passages = [
  "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump!",
  "Programming is the art of telling another human what one wants the computer to do.\n\nGood code reads like a good story, and every bug you fix makes the next chapter easier to write.",
  "In the middle of difficulty lies opportunity. Stay curious, keep building, and never stop learning new things every single day.\n\nSmall experiments can reveal surprising answers. Take your time, observe the result, and try again.",
  "Technology is best when it brings people together.\n\nSimple things should be simple, complex things should be possible, and every mistake is just a lesson wearing a disguise."
];

const $ = (id) => (isBrowser ? document.getElementById(id) : null);
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

const timeBtns = isBrowser ? document.querySelectorAll('.time-btn') : [];
let currentPassage = '',
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

let bestWPM = (typeof localStorage !== 'undefined' && Number(localStorage.getItem('keyrush-best-wpm'))) || 0;
if (bestEl) bestEl.textContent = bestWPM;

// Live WPM Graph
let wpmHistory = [];
const chartCtx = chartCanvas && chartCanvas.getContext ? chartCanvas.getContext('2d') : null;

// Per-Key Keyboard Heatmap and Mistake Tracking
let keyMistakes = {};
let keySubstitutions = {};
let lastTrackedKeydownPos = -1;
let lastProcessedLength = 0;

function resolvePhysicalKey(code, key = '') {
  if (code) {
    if (code === 'Space') return 'SPACE';
    if (code === 'Enter') return 'ENTER';
    if (code.startsWith('Key') && code.length === 4) return code.slice(3).toUpperCase();
    if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
    if (code === 'BracketLeft') return '[';
    if (code === 'BracketRight') return ']';
    if (code === 'Quote') return "'";
    if (code === 'Backquote') return '`';
    if (code === 'Backslash') return '\\';
    if (code === 'Slash') return '/';
    if (code === 'Semicolon') return ';';
    if (code === 'Comma') return ',';
    if (code === 'Period') return '.';
    if (code === 'Minus') return '-';
    if (code === 'Equal') return '=';
  }
  // Fallback for virtual / mobile keyboards without physical code
  if (key === ' ') return 'SPACE';
  if (key === '\n' || key === 'Enter') return 'ENTER';
  if (typeof key === 'string' && key.length === 1) return key.toUpperCase();
  return null;
}

function resolveExpectedKey(char) {
  if (!char) return null;
  if (char === ' ') return 'SPACE';
  if (char === '\n') return 'ENTER';
  return char.toUpperCase();
}

function recordSubstitution(expectedKey, pressedKey) {
  if (!expectedKey || !pressedKey || expectedKey === pressedKey) return;
  if (!keySubstitutions[expectedKey]) {
    keySubstitutions[expectedKey] = {};
  }
  keySubstitutions[expectedKey][pressedKey] = (keySubstitutions[expectedKey][pressedKey] || 0) + 1;
}

function getTopSubstitution(expectedKey) {
  const map = keySubstitutions[expectedKey];
  if (!map) return null;
  const entries = Object.entries(map);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return { pressedKey: entries[0][0], count: entries[0][1] };
}

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
  ['SPACE', 'ENTER']
];

function initKeyboard() {
  if (!keyboardEl) return;
  let html = '';
  KEYBOARD_ROWS.forEach((row) => {
    html += '<div class="kb-row">';
    row.forEach((key) => {
      const isSpace = key === 'SPACE';
      const isEnter = key === 'ENTER';
      let label = key;
      if (isSpace) label = 'Space';
      if (isEnter) label = 'Enter';
      const keyClass = isSpace ? 'kb-key kb-space' : (isEnter ? 'kb-key kb-enter' : 'kb-key');
      html += `<div class="${keyClass}" data-key="${key}"><span class="kb-char">${label}</span><span class="kb-err">0</span></div>`;
    });
    html += '</div>';
  });
  keyboardEl.innerHTML = html;
}

function getHeatmapIntensity(errCount) {
  if (!errCount || errCount <= 0) return 'intensity-0';
  if (errCount <= 2) return 'intensity-1';
  if (errCount <= 5) return 'intensity-2';
  if (errCount <= 9) return 'intensity-3';
  return 'intensity-4';
}

function updateHeatmap(reset = false) {
  if (!keyboardEl) return;
  const keyEls = keyboardEl.querySelectorAll('.kb-key');
  if (reset) {
    keyMistakes = {};
    keySubstitutions = {};
    lastTrackedKeydownPos = -1;
    lastProcessedLength = 0;
    keyEls.forEach((el) => {
      const isSpace = el.dataset.key === 'SPACE';
      const isEnter = el.dataset.key === 'ENTER';
      const baseClass = isSpace ? 'kb-key kb-space' : (isEnter ? 'kb-key kb-enter' : 'kb-key');
      el.className = baseClass + ' intensity-0';
      const errEl = el.querySelector('.kb-err');
      if (errEl) errEl.textContent = '0';
    });
    return;
  }

  keyEls.forEach((el) => {
    const rawKey = el.dataset.key;
    const count = keyMistakes[rawKey] || 0;
    const isSpace = rawKey === 'SPACE';
    const isEnter = rawKey === 'ENTER';
    const baseClass = isSpace ? 'kb-key kb-space ' : (isEnter ? 'kb-key kb-enter ' : 'kb-key ');
    const intensity = getHeatmapIntensity(count);
    el.className = baseClass + intensity;
    const errEl = el.querySelector('.kb-err');
    if (errEl) errEl.textContent = count;
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
  const elapsedMin = elapsedSec / 60;
  const currentWPM = elapsedMin > 0 ? Math.round((correctTyped / 5) / elapsedMin) : 0;
  wpmHistory.push({ time: elapsedSec, wpm: Math.max(0, currentWPM) });
  drawGraph();
}

let isCustomPassage = false;
let customPassageText = '';

function loadPassage() {
  if (isCustomPassage && customPassageText) {
    currentPassage = customPassageText;
  } else {
    currentPassage = passages[Math.floor(Math.random() * passages.length)];
  }
  charIndex = 0;
  charStates = new Array(currentPassage.length).fill('');
  if (inputEl) {
    inputEl.value = '';
    inputEl.maxLength = currentPassage.length;
  }
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
}

function escapeHTML(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

let isPasting = false;
let pasteResetTimeout = null;

function handlePaste() {
  isPasting = true;
  clearTimeout(pasteResetTimeout);
  pasteResetTimeout = setTimeout(() => {
    isPasting = false;
  }, 100);
}

function handleKeyDown(event) {
  // Allow default Backspace behavior so users can correct typos (coordinates with PR #36)
  if (event.key === 'Backspace') {
    return;
  }

  // Ignore modifier combinations (shortcuts like Ctrl+C, Cmd+V)
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  // Ignore non-printable keys (Shift, CapsLock, Tab, Arrow keys)
  if (event.key.length > 1 && event.key !== 'Enter') return;

  if (!isTyping || !currentPassage) return;
  const currentPos = (inputEl && typeof inputEl.selectionStart === 'number')
    ? inputEl.selectionStart
    : inputEl.value.length;
  if (currentPos >= currentPassage.length) return;

  const expectedChar = currentPassage[currentPos];
  const expectedKey = resolveExpectedKey(expectedChar);
  const pressedKey = resolvePhysicalKey(event.code, event.key);
  const typedChar = event.key === 'Enter' ? '\n' : event.key;

  if (typedChar !== expectedChar) {
    // Cumulative error count for this expected target key
    keyMistakes[expectedKey] = (keyMistakes[expectedKey] || 0) + 1;
    if (pressedKey) {
      recordSubstitution(expectedKey, pressedKey);
    }
    lastTrackedKeydownPos = currentPos;
    updateHeatmap();
  }
}

function handleInput(event) {
  const typed = inputEl.value;
  const wasPasted = Boolean(
    isPasting ||
    (event && (event.inputType === 'insertFromPaste' || event.inputType === 'insertReplacementText')) ||
    (typed.length - lastProcessedLength > 1)
  );
  isPasting = false;
  clearTimeout(pasteResetTimeout);

  // Procedural mechanical sound feedback (Issue #42)
  if (typeof soundEngine !== 'undefined' && !wasPasted) {
    if (typed.length > lastProcessedLength) {
      const newlyTypedChar = typed[typed.length - 1];
      const targetPos = typed.length - 1;
      const isTypo = targetPos < currentPassage.length && newlyTypedChar !== currentPassage[targetPos];
      if (isTypo) {
        soundEngine.playError();
      } else {
        soundEngine.playKey(newlyTypedChar === ' ');
      }
    } else if (typed.length < lastProcessedLength) {
      soundEngine.playKey(false);
    }
  }

  totalTyped = 0;
  correctTyped = 0;
  mistakes = 0;
  charIndex = 0;
  charStates = new Array(currentPassage.length).fill('');

  while (charIndex < typed.length && charIndex < currentPassage.length) {
    totalTyped++;

    const typedChar = typed[charIndex];
    const targetChar = currentPassage[charIndex];

    if (typedChar === targetChar) {
      correctTyped++;
      charStates[charIndex] = 'correct';
    } else {
      mistakes++;
      charStates[charIndex] = 'wrong';

      // Fallback for virtual keyboards without keydown events
      // Pasted input is validated against the passage, but MUST NOT be recorded as physical keystrokes or substitutions
      if (!wasPasted && charIndex > lastTrackedKeydownPos && charIndex >= lastProcessedLength) {
        const targetKey = resolveExpectedKey(targetChar);
        const fallbackPressed = resolvePhysicalKey(null, typedChar);
        keyMistakes[targetKey] = (keyMistakes[targetKey] || 0) + 1;
        if (fallbackPressed) {
          recordSubstitution(targetKey, fallbackPressed);
        }
      }
    }

    charIndex++;
  }

  lastProcessedLength = typed.length;
  updateHeatmap();
  renderPassage();
  updateStats();

  if (isTyping && startTime && typeof sessionReplayEvents !== 'undefined') {
    sessionReplayEvents.push({
      t: Date.now() - startTime,
      val: typed,
      cursor: (inputEl && inputEl.selectionStart !== undefined) ? inputEl.selectionStart : typed.length,
      wpm: calculateWPM(),
      errors: mistakes
    });
  }

  if (charIndex === currentPassage.length) finishTest();
}

if (inputEl) {
  inputEl.addEventListener('paste', handlePaste);
  inputEl.addEventListener('keydown', handleKeyDown);
  inputEl.addEventListener('input', handleInput);
}

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

  const worstKeys = Object.entries(keyMistakes)
    .filter(([k, cnt]) => cnt > 0 && k !== 'SPACE')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  let breakdownStr = '';
  if (worstKeys.length > 0) {
    const details = worstKeys.map(([k, cnt]) => {
      const topSub = getTopSubstitution(k);
      return topSub ? `${k} (${cnt}x, confused with ${topSub.pressedKey})` : `${k} (${cnt}x)`;
    });
    breakdownStr = ` · Weak keys: ${details.join(', ')}`;
  }

  resultEl.classList.remove('hidden');
  resultEl.textContent =
    `Test complete · ${finalWPM} WPM · ${mistakes} errors${breakdownStr}`;

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
  isPasting = false;
  clearTimeout(pasteResetTimeout);
  startTime = null;
  charIndex = 0;
  mistakes = 0;
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

if (startBtn) {
  startBtn.addEventListener('click', () => {
    if (isTyping) return;
    if (inputEl) {
      inputEl.disabled = false;
      inputEl.focus();
    }
    startBtn.disabled = true;
    if (!timer) startTimer();
  });
}

if (resetBtn) resetBtn.addEventListener('click', resetTest);
if (nextBtn) {
  nextBtn.addEventListener('click', () => {
    resetTest();
    loadPassage();
  });
}

if (timeBtns && timeBtns.forEach) {
  timeBtns.forEach((btn) =>
    btn.addEventListener('click', () => {
      timeBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      timeLimit = Number(btn.dataset.time);
      resetTest();
    })
  );
}

if (themeBtn) {
  themeBtn.addEventListener('click', () => {
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('light-mode');
      themeBtn.innerHTML = document.body.classList.contains('light-mode')
        ? '☾ <span>Dark mode</span>'
        : '☼ <span>Light mode</span>';
    }
  });
}

if (ghostBtn) {
  ghostBtn.addEventListener('click', () => {
    if (typeof window !== 'undefined' && window.location) {
      window.location.href = 'ghost.html';
    }
  });
}

if (isBrowser) {
  initKeyboard();
  initGraph();
  loadPassage();
  updateStats();
}

// Decorative WASD interaction: hover and press feedback, separate from typing-test state.
const wasdTip = $('wasd-tip');
if (isBrowser && typeof document !== 'undefined' && document.querySelectorAll) {
  document.querySelectorAll('.wasd-key').forEach((key) => {
    key.addEventListener('mouseenter', () => { if (wasdTip) wasdTip.textContent = key.dataset.tip; });
    key.addEventListener('mouseleave', () => {
      if (wasdTip && !key.classList.contains('key-active')) wasdTip.textContent = 'HOVER / PRESS A KEY';
    });
    key.addEventListener('focus', () => { if (wasdTip) wasdTip.textContent = key.dataset.tip; });
    key.addEventListener('blur', () => {
      if (wasdTip && !key.classList.contains('key-active')) wasdTip.textContent = 'HOVER / PRESS A KEY';
    });
    key.addEventListener('click', () => {
      document.querySelectorAll('.wasd-key').forEach((other) => other.classList.remove('key-active'));
      key.classList.add('key-active');
      if (wasdTip) wasdTip.textContent = key.dataset.tip + ' ✓';
    });
  });
}


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
const speedBtns = isBrowser ? document.querySelectorAll('.speed-btn') : [];

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
if (typeof window !== 'undefined' && window.addEventListener) {
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
}


// ==========================================================================
// ISSUE #42: PROCEDURAL MECHANICAL AUDIO SYNTHESIZER (WEB AUDIO API)
// ==========================================================================

class SoundEngine {
  constructor() {
    this.ctx = null;
    const storage = typeof localStorage !== 'undefined' ? localStorage : null;
    this.enabled = storage ? storage.getItem('keyrush_sound_enabled') !== 'false' : true;
    this.profile = storage ? (storage.getItem('keyrush_sound_profile') || 'blue') : 'blue';
    
    // Volume persistence fix: 0 is a valid volume and must not fall back to 0.6
    const savedVol = storage ? storage.getItem('keyrush_sound_volume') : null;
    this.volume = (savedVol !== null && !isNaN(Number(savedVol))) ? Math.max(0, Math.min(1, Number(savedVol))) : 0.6;
    
    this.typoBuzzer = storage ? storage.getItem('keyrush_sound_typo') !== 'false' : true;
    this.lastSoundTime = 0;
    this.lastErrorSoundTime = 0;
  }

  ensureContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setProfile(profile) {
    this.profile = profile;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('keyrush_sound_profile', profile);
    }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, Number(vol)));
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('keyrush_sound_volume', String(this.volume));
    }
  }

  setEnabled(val) {
    this.enabled = Boolean(val);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('keyrush_sound_enabled', String(this.enabled));
    }
  }

  setTypoBuzzer(val) {
    this.typoBuzzer = Boolean(val);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('keyrush_sound_typo', String(this.typoBuzzer));
    }
  }

  playKey(isSpace = false) {
    if (!this.enabled || this.volume <= 0) return;
    const now = Date.now();
    if (this.lastSoundTime && now - this.lastSoundTime < 28) return; // Audio throttle cooldown for key-repeat
    this.lastSoundTime = now;
    this.ensureContext();
    if (!this.ctx) return;

    if (this.profile === 'blue') {
      this.synthesizeSatisfyingMechanicalClick(isSpace);
    } else {
      this.synthesizeCherryBrown(isSpace);
    }
  }

  playError() {
    if (!this.enabled || !this.typoBuzzer || this.volume <= 0) return;
    const now = Date.now();
    if (this.lastErrorSoundTime && now - this.lastErrorSoundTime < 45) return; // Audio throttle cooldown for rapid error repeat
    this.lastErrorSoundTime = now;
    this.ensureContext();
    if (!this.ctx) return;

    this.synthesizeTypoBuzzer();
  }

  // Ultra-Satisfying Mechanical Switch Click (Cherry MX Blue / Box White style)
  // Combines: 1. Sharp leaf snap impulse, 2. Secondary metallic ping, 3. Solid chassis bottom-out thud
  synthesizeSatisfyingMechanicalClick(isSpace) {
    const t = this.ctx.currentTime;
    const masterGain = this.ctx.createGain();
    masterGain.gain.setValueAtTime(this.volume * 0.55, t);
    masterGain.connect(this.ctx.destination);

    if (isSpace) {
      // Spacebar: deep hollow body resonance (~125Hz) + metallic wire stabilizer clack (~880Hz)
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(135, t);
      osc1.frequency.exponentialRampToValueAtTime(50, t + 0.045);
      gain1.gain.setValueAtTime(0.9, t);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
      osc1.connect(gain1);
      gain1.connect(masterGain);
      osc1.start(t);
      osc1.stop(t + 0.048);

      // Stabilizer bar clack
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, t);
      gain2.gain.setValueAtTime(0.4, t);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
      osc2.connect(gain2);
      gain2.connect(masterGain);
      osc2.start(t);
      osc2.stop(t + 0.015);

      this.createNoiseTransient(masterGain, 900, 0.018, 0.4);
    } else {
      // 1. Primary leaf snap: high-frequency crisp impulse at 2600Hz
      const snapOsc1 = this.ctx.createOscillator();
      const snapGain1 = this.ctx.createGain();
      snapOsc1.type = 'sine';
      snapOsc1.frequency.setValueAtTime(2600, t);
      snapGain1.gain.setValueAtTime(0.8, t);
      snapGain1.gain.exponentialRampToValueAtTime(0.001, t + 0.006);
      snapOsc1.connect(snapGain1);
      snapGain1.connect(masterGain);
      snapOsc1.start(t);
      snapOsc1.stop(t + 0.008);

      // 2. Secondary rebound ping at 3400Hz (3ms later for acoustic realism)
      const snapOsc2 = this.ctx.createOscillator();
      const snapGain2 = this.ctx.createGain();
      snapOsc2.type = 'sine';
      snapOsc2.frequency.setValueAtTime(3400, t + 0.0025);
      snapGain2.gain.setValueAtTime(0, t);
      snapGain2.gain.setValueAtTime(0.65, t + 0.0025);
      snapGain2.gain.exponentialRampToValueAtTime(0.001, t + 0.014);
      snapOsc2.connect(snapGain2);
      snapGain2.connect(masterGain);
      snapOsc2.start(t + 0.0025);
      snapOsc2.stop(t + 0.016);

      // 3. Chassis bottom-out thud: punchy 320Hz body resonance
      const bodyOsc = this.ctx.createOscillator();
      const bodyGain = this.ctx.createGain();
      bodyOsc.type = 'triangle';
      bodyOsc.frequency.setValueAtTime(320, t);
      bodyOsc.frequency.exponentialRampToValueAtTime(140, t + 0.022);
      bodyGain.gain.setValueAtTime(0.5, t);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.022);
      bodyOsc.connect(bodyGain);
      bodyGain.connect(masterGain);
      bodyOsc.start(t);
      bodyOsc.stop(t + 0.024);

      // 4. Keycap plastic collision texture
      this.createNoiseTransient(masterGain, 2400, 0.011, 0.45);
    }
  }

  // Cherry MX Brown tactile profile (gentle bump + soft mechanical thud)
  synthesizeCherryBrown(isSpace) {
    const t = this.ctx.currentTime;
    const masterGain = this.ctx.createGain();
    masterGain.gain.setValueAtTime(this.volume * 0.42, t);
    masterGain.connect(this.ctx.destination);

    const freq = isSpace ? 110 : 450;
    const decay = isSpace ? 0.045 : 0.018;

    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.35, t + decay);
    oscGain.gain.setValueAtTime(0.75, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + decay);
    osc.connect(oscGain);
    oscGain.connect(masterGain);
    osc.start(t);
    osc.stop(t + decay + 0.002);

    this.createNoiseTransient(masterGain, isSpace ? 650 : 1300, decay * 0.7, 0.28);
  }

  // Synthesize Typo Buzzer (discordant dyad: 140Hz & 165Hz sawtooth waves)
  synthesizeTypoBuzzer() {
    const t = this.ctx.currentTime;
    const masterGain = this.ctx.createGain();
    masterGain.gain.setValueAtTime(this.volume * 0.48, t);
    masterGain.connect(this.ctx.destination);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(650, t);
    filter.connect(masterGain);

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(140, t);
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(165, t);

    gainNode.gain.setValueAtTime(0.55, t);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(filter);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.085);
    osc2.stop(t + 0.085);
  }

  createNoiseTransient(destination, filterFreq, duration, peakGain) {
    try {
      const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(filterFreq, this.ctx.currentTime);
      filter.Q.setValueAtTime(1.6, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(peakGain, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(destination);

      noise.start();
    } catch (_) {}
  }
}

const soundEngine = new SoundEngine();

// ==========================================================================
// ISSUE #42: MULTI-SOURCE CUSTOM PASSAGE STUDIO (WITH DIRECT EDITING)
// ==========================================================================

const CUSTOM_PRESETS = {
  code: 'async function fetchUserData(userId) { try { const response = await fetch(`/api/users/${userId}`); if (!response.ok) throw new Error("Failed to load user"); const user = await response.json(); return user; } catch (error) { console.error("Error fetching user data:", error); return null; } }',
  literature: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.',
  tech: 'This is the Unix philosophy: Write programs that do one thing and do it well. Write programs to work together. Write programs to handle text streams, because that is a universal interface. Simple algorithms and clean data structures yield robust software.'
};

function sanitizeCustomPassage(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  return rawText
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function validatePassage(text) {
  const sanitized = sanitizeCustomPassage(text);
  const words = countWords(sanitized);
  const chars = sanitized.length;

  if (chars === 0) {
    return { valid: false, words: 0, chars: 0, reason: 'Passage cannot be empty.' };
  }
  if (words < 10) {
    return { valid: false, words, chars, reason: `Enter at least 10 words (${words} entered)` };
  }
  if (chars > 3000) {
    return { valid: false, words, chars, reason: `Exceeds 3000 character limit (${chars} entered)` };
  }
  return { valid: true, words, chars, text: sanitized };
}

// Custom Passage UI Elements
const customPassageBtn = $('custom-passage-btn');
const customPassageModal = $('custom-passage-modal');
const closeCustomPassageBtn = $('close-custom-passage-btn');

// 3 Synchronized Text Inputs (Type, Upload, Voice)
const customPassageInput = $('custom-passage-input');
const customUploadInput = $('custom-upload-input');
const customVoiceInput = $('custom-voice-input');

const customWordCountEl = $('custom-word-count');
const customCharCountEl = $('custom-char-count');
const customValidationMsgEl = $('custom-validation-msg');
const applyCustomPassageBtn = $('apply-custom-passage-btn');
const clearCustomInputBtn = $('clear-custom-input-btn');
const customActiveTag = $('custom-active-tag');
const clearCustomPassageBtn = $('clear-custom-passage-btn');

const customTabBtns = isBrowser ? document.querySelectorAll('.custom-tab-btn') : [];
const customTabPanels = isBrowser ? document.querySelectorAll('.custom-tab-panel') : [];
const presetChips = isBrowser ? document.querySelectorAll('.preset-chip') : [];

// Dropzone & File Upload Elements
const customDropzone = $('custom-dropzone');
const customFileInput = $('custom-file-input');
const fileMetaEl = $('file-meta');
const fileNameEl = $('file-name');
const fileSizeEl = $('file-size');

// Voice Dictation Elements
const voiceRecordBtn = $('voice-record-btn');
const voiceStatusEl = $('voice-status');
const voiceMeterEl = (typeof document !== 'undefined' && typeof document.querySelector === 'function')
  ? document.querySelector('.voice-activity-meter')
  : null;
let voiceRecognition = null;
let isVoiceRecording = false;
let shouldKeepVoiceListening = false;

// Synchronize all 3 text inputs seamlessly
function syncCustomText(sourceValue, senderInput = null) {
  if (customPassageInput && senderInput !== customPassageInput) {
    customPassageInput.value = sourceValue;
  }
  if (customUploadInput && senderInput !== customUploadInput) {
    customUploadInput.value = sourceValue;
  }
  if (customVoiceInput && senderInput !== customVoiceInput) {
    customVoiceInput.value = sourceValue;
  }
  updateCustomMetrics();
}

function updateCustomMetrics() {
  const raw = (customPassageInput ? customPassageInput.value : '') ||
              (customUploadInput ? customUploadInput.value : '') ||
              (customVoiceInput ? customVoiceInput.value : '');

  const sanitized = sanitizeCustomPassage(raw);
  const words = countWords(sanitized);
  const chars = sanitized.length;

  if (customWordCountEl) customWordCountEl.textContent = String(words);
  if (customCharCountEl) customCharCountEl.textContent = String(chars);

  const validation = validatePassage(raw);
  if (applyCustomPassageBtn) applyCustomPassageBtn.disabled = !validation.valid;

  if (customValidationMsgEl) {
    if (validation.valid) {
      customValidationMsgEl.textContent = `Ready (${words} words, ${chars} chars)`;
      customValidationMsgEl.classList.add('valid');
    } else {
      customValidationMsgEl.textContent = validation.reason;
      customValidationMsgEl.classList.remove('valid');
    }
  }
}

function openCustomPassageModal() {
  if (!customPassageModal) return;
  customPassageModal.classList.remove('hidden');
  updateCustomMetrics();
  if (customPassageInput) customPassageInput.focus();
}

function closeCustomPassageModal() {
  if (!customPassageModal) return;
  stopVoiceDictation();
  customPassageModal.classList.add('hidden');
}

function switchCustomTab(tabKey) {
  customTabBtns.forEach((btn) => {
    const isActive = btn.dataset.tab === tabKey;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  customTabPanels.forEach((panel) => {
    panel.classList.toggle('hidden', panel.id !== `tab-panel-${tabKey}`);
    panel.classList.toggle('active', panel.id === `tab-panel-${tabKey}`);
  });

  // Focus the respective editor in the active tab
  if (tabKey === 'type' && customPassageInput) customPassageInput.focus();
  if (tabKey === 'upload' && customUploadInput) customUploadInput.focus();
  if (tabKey === 'voice' && customVoiceInput) customVoiceInput.focus();
}

function applyCustomPassage() {
  const currentText = (customPassageInput ? customPassageInput.value : '') ||
                      (customUploadInput ? customUploadInput.value : '') ||
                      (customVoiceInput ? customVoiceInput.value : '');

  const validation = validatePassage(currentText);
  if (!validation.valid) return;

  isCustomPassage = true;
  customPassageText = validation.text;
  if (customActiveTag) customActiveTag.classList.remove('hidden');

  closeCustomPassageModal();
  resetTest();
  loadPassage();
}

function clearCustomPassage() {
  isCustomPassage = false;
  customPassageText = '';
  if (customActiveTag) customActiveTag.classList.add('hidden');
  resetTest();
  loadPassage();
}

// File Drag & Drop Handlers with Direct Editing
function isValidTxtFile(file) {
  if (!file || !file.name) return false;
  return file.name.toLowerCase().endsWith('.txt');
}

function handleCustomFile(file) {
  if (!file) return;
  if (!isValidTxtFile(file)) {
    alert('Please upload a .txt file only.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    syncCustomText(content);

    if (fileMetaEl && fileNameEl && fileSizeEl) {
      fileNameEl.textContent = file.name;
      fileSizeEl.textContent = `(${(file.size / 1024).toFixed(1)} KB)`;
      fileMetaEl.classList.remove('hidden');
    }
  };
  reader.readAsText(file);
}

// Native Zero-Dependency Web Speech API Voice Dictation
function initVoiceDictation() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (voiceStatusEl) {
      voiceStatusEl.textContent = 'SpeechRecognition API is not supported in this browser. Please use Chrome/Edge or edit in the Type/Upload tabs.';
      voiceStatusEl.style.color = 'var(--wrong)';
    }
    if (voiceRecordBtn) voiceRecordBtn.disabled = true;
    return;
  }

  voiceRecognition = new SpeechRecognition();
  voiceRecognition.continuous = true;
  voiceRecognition.interimResults = true;
  voiceRecognition.lang = 'en-US';

  voiceRecognition.onstart = () => {
    isVoiceRecording = true;
    if (voiceRecordBtn) voiceRecordBtn.classList.add('recording');
    if (voiceMeterEl) voiceMeterEl.classList.add('active');
    if (voiceStatusEl) {
      voiceStatusEl.textContent = 'LISTENING... SPEAK CLEARLY (WORDS STREAM DIRECTLY INTO EDITOR)';
      voiceStatusEl.style.color = 'var(--accent)';
    }
  };

  voiceRecognition.onspeechstart = () => {
    if (voiceMeterEl) voiceMeterEl.classList.add('active');
  };

  voiceRecognition.onspeechend = () => {
    // Keep active visual rhythm while recording
  };

  voiceRecognition.onresult = (event) => {
    let interim = '';
    let finalChunk = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalChunk += transcript + ' ';
      } else {
        interim += transcript;
      }
    }

    // Real-time live status update while speaking
    if (interim && voiceStatusEl) {
      voiceStatusEl.textContent = `🗣️ Hearing: "${interim.trim()}..."`;
      voiceStatusEl.style.color = 'var(--accent)';
      if (voiceMeterEl) voiceMeterEl.classList.add('active');
    }

    // Direct streaming insertion into editable inputs
    if (finalChunk) {
      const existing = (customVoiceInput ? customVoiceInput.value : '').trim();
      const updated = existing ? `${existing} ${finalChunk.trim()}` : finalChunk.trim();
      syncCustomText(updated);
      if (voiceStatusEl) {
        voiceStatusEl.textContent = 'LISTENING... SPEAK CLEARLY (WORDS STREAM DIRECTLY INTO EDITOR)';
      }
    }
  };

  voiceRecognition.onerror = (e) => {
    if (e.error === 'no-speech') {
      // Normal pause in speech, don't break session
      return;
    }
    if (voiceStatusEl) {
      voiceStatusEl.textContent = `Microphone note: ${e.error || 'Check browser permissions'}`;
      voiceStatusEl.style.color = 'var(--wrong)';
    }
  };

  voiceRecognition.onend = () => {
    // If the user hasn't explicitly stopped dictation, auto-reconnect to prevent browser silence timeouts
    if (shouldKeepVoiceListening) {
      try {
        voiceRecognition.start();
        return;
      } catch (_) {}
    }
    stopVoiceDictation();
  };
}

function startVoiceDictation() {
  if (!voiceRecognition) initVoiceDictation();
  if (voiceRecognition && !isVoiceRecording) {
    shouldKeepVoiceListening = true;
    try {
      voiceRecognition.start();
    } catch (_) {}
  }
}

function stopVoiceDictation() {
  shouldKeepVoiceListening = false;
  isVoiceRecording = false;
  if (voiceRecordBtn) voiceRecordBtn.classList.remove('recording');
  if (voiceMeterEl) voiceMeterEl.classList.remove('active');
  if (voiceStatusEl) {
    voiceStatusEl.textContent = 'Dictation paused. Click microphone to resume or edit text directly below.';
    voiceStatusEl.style.color = 'var(--muted)';
  }
  if (voiceRecognition) {
    try {
      voiceRecognition.stop();
    } catch (_) {}
  }
}

function toggleVoiceDictation() {
  if (isVoiceRecording) stopVoiceDictation();
  else startVoiceDictation();
}

// Custom Passage Event Listeners
if (customPassageBtn) customPassageBtn.addEventListener('click', openCustomPassageModal);
if (closeCustomPassageBtn) closeCustomPassageBtn.addEventListener('click', closeCustomPassageModal);
if (customPassageModal) {
  customPassageModal.addEventListener('click', (e) => {
    if (e.target === customPassageModal) closeCustomPassageModal();
  });
}

// Real-time bidirectional synchronization across all 3 textareas
if (customPassageInput) {
  customPassageInput.addEventListener('input', () => syncCustomText(customPassageInput.value, customPassageInput));
}
if (customUploadInput) {
  customUploadInput.addEventListener('input', () => syncCustomText(customUploadInput.value, customUploadInput));
}
if (customVoiceInput) {
  customVoiceInput.addEventListener('input', () => syncCustomText(customVoiceInput.value, customVoiceInput));
}

customTabBtns.forEach((btn) => {
  btn.addEventListener('click', () => switchCustomTab(btn.dataset.tab));
});

presetChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    const text = CUSTOM_PRESETS[chip.dataset.preset];
    if (text) syncCustomText(text);
  });
});

if (clearCustomInputBtn) {
  clearCustomInputBtn.addEventListener('click', () => {
    syncCustomText('');
    if (fileMetaEl) fileMetaEl.classList.add('hidden');
  });
}

if (applyCustomPassageBtn) applyCustomPassageBtn.addEventListener('click', applyCustomPassage);
if (clearCustomPassageBtn) clearCustomPassageBtn.addEventListener('click', clearCustomPassage);

// Dropzone Listeners
if (customDropzone && customFileInput) {
  customDropzone.addEventListener('click', () => customFileInput.click());
  customFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) handleCustomFile(e.target.files[0]);
  });
  ['dragenter', 'dragover'].forEach((evName) => {
    customDropzone.addEventListener(evName, (e) => {
      e.preventDefault();
      customDropzone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach((evName) => {
    customDropzone.addEventListener(evName, (e) => {
      e.preventDefault();
      customDropzone.classList.remove('dragover');
    });
  });
  customDropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleCustomFile(e.dataTransfer.files[0]);
    }
  });
}

// Voice Record Button Listener
if (voiceRecordBtn) voiceRecordBtn.addEventListener('click', toggleVoiceDictation);

// ==========================================================================
// ISSUE #42: AUDIO FEEDBACK SETTINGS & HUD INTEGRATION
// ==========================================================================

const audioToggleBtn = $('audio-toggle-btn');
const audioSettingsBtn = $('audio-settings-btn');
const audioIconEl = $('audio-icon');
const audioLabelEl = $('audio-label');
const audioSettingsModal = $('audio-settings-modal');
const closeAudioSettingsBtn = $('close-audio-settings-btn');
const audioMasterSwitch = $('audio-master-switch');
const audioTypoSwitch = $('audio-typo-switch');
const audioVolumeSlider = $('audio-volume-slider');
const audioVolumeVal = $('audio-volume-val');
const profileCards = isBrowser ? document.querySelectorAll('.profile-card') : [];

const testAudioKeyBtn = $('test-audio-key-btn');
const testAudioSpaceBtn = $('test-audio-space-btn');
const testAudioErrorBtn = $('test-audio-error-btn');

function updateAudioUI() {
  const isEnabled = soundEngine.enabled;
  if (audioIconEl) audioIconEl.textContent = isEnabled ? '🔊' : '🔇';
  if (audioLabelEl) audioLabelEl.textContent = isEnabled ? 'Sound' : 'Muted';
  if (audioToggleBtn) {
    audioToggleBtn.title = isEnabled ? 'Audio feedback enabled (Ctrl+M to mute)' : 'Audio feedback muted (Ctrl+M to unmute)';
  }
  if (audioMasterSwitch) audioMasterSwitch.checked = isEnabled;
  if (audioTypoSwitch) audioTypoSwitch.checked = soundEngine.typoBuzzer;
  if (audioVolumeSlider) audioVolumeSlider.value = String(Math.round(soundEngine.volume * 100));
  if (audioVolumeVal) audioVolumeVal.textContent = `${Math.round(soundEngine.volume * 100)}%`;

  profileCards.forEach((card) => {
    card.classList.toggle('active', card.dataset.profile === soundEngine.profile);
  });
}

function openAudioSettings() {
  if (!audioSettingsModal) return;
  updateAudioUI();
  audioSettingsModal.classList.remove('hidden');
}

function closeAudioSettings() {
  if (!audioSettingsModal) return;
  audioSettingsModal.classList.add('hidden');
}

if (audioToggleBtn) {
  audioToggleBtn.addEventListener('click', () => {
    soundEngine.setEnabled(!soundEngine.enabled);
    updateAudioUI();
  });
}

if (audioSettingsBtn) audioSettingsBtn.addEventListener('click', openAudioSettings);
if (closeAudioSettingsBtn) closeAudioSettingsBtn.addEventListener('click', closeAudioSettings);
if (audioSettingsModal) {
  audioSettingsModal.addEventListener('click', (e) => {
    if (e.target === audioSettingsModal) closeAudioSettings();
  });
}

if (audioMasterSwitch) {
  audioMasterSwitch.addEventListener('change', (e) => {
    soundEngine.setEnabled(e.target.checked);
    updateAudioUI();
  });
}

if (audioTypoSwitch) {
  audioTypoSwitch.addEventListener('change', (e) => {
    soundEngine.setTypoBuzzer(e.target.checked);
    updateAudioUI();
  });
}

if (audioVolumeSlider) {
  audioVolumeSlider.addEventListener('input', (e) => {
    const val = Number(e.target.value) / 100;
    soundEngine.setVolume(val);
    updateAudioUI();
  });
}

profileCards.forEach((card) => {
  card.addEventListener('click', () => {
    soundEngine.setProfile(card.dataset.profile);
    updateAudioUI();
    soundEngine.playKey(false);
  });
});

if (testAudioKeyBtn) testAudioKeyBtn.addEventListener('click', () => soundEngine.playKey(false));
if (testAudioSpaceBtn) testAudioSpaceBtn.addEventListener('click', () => soundEngine.playKey(true));
if (testAudioErrorBtn) testAudioErrorBtn.addEventListener('click', () => soundEngine.playError());

// Global Hotkeys: Ctrl+M to toggle audio, Escape to close modals
if (typeof window !== 'undefined') window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
    e.preventDefault();
    soundEngine.setEnabled(!soundEngine.enabled);
    updateAudioUI();
  } else if (e.key === 'Escape') {
    if (customPassageModal && !customPassageModal.classList.contains('hidden')) {
      closeCustomPassageModal();
    }
    if (audioSettingsModal && !audioSettingsModal.classList.contains('hidden')) {
      closeAudioSettings();
    }
  }
});

// Initialize Audio UI state on page load
updateAudioUI();



if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    passages,
    resolvePhysicalKey,
    resolveExpectedKey,
    recordSubstitution,
    getTopSubstitution,
    getHeatmapIntensity,
    calculateWPM,
    calculateAccuracy,
    updateHeatmap,
    resetTest,
    finishTest,
    handleKeyDown,
    handleInput,
    handlePaste,
    getTestState: () => ({
      keyMistakes,
      keySubstitutions,
      charStates,
      charIndex,
      mistakes,
      correctTyped,
      totalTyped,
      isTyping,
      currentPassage,
      inputEl
    }),
    setTestPassage: (p) => { currentPassage = p; },
    setTestTyping: (v) => { isTyping = v; },
    SoundEngine,
    soundEngine,
    sanitizeCustomPassage,
    countWords,
    validatePassage,
    CUSTOM_PRESETS,
    isValidTxtFile
  };
}
