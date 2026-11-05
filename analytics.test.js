import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  getHeatmapIntensity,
  resolvePhysicalKey,
  resolveExpectedKey,
  recordSubstitution,
  getTopSubstitution,
  calculateRealWpm
} from './analytics.js';

// Setup lightweight DOM environment for testing real browser event handlers in script.js
class MockElement extends EventTarget {
  constructor(id = '') {
    super();
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.dataset = {};
    this.classList = {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; }
    };
    this.style = {};
    this.disabled = false;
    this.selectionStart = 0;
    this.selectionEnd = 0;
  }
  querySelector() { return new MockElement(); }
  querySelectorAll() { return [new MockElement()]; }
  scrollIntoView() {}
  focus() {}
  getContext() {
    return {
      clearRect() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      fillText() {},
      arc() {},
      fill() {}
    };
  }
}

class KeyboardEventMock extends Event {
  constructor(type, init = {}) {
    super(type, init);
    this.key = init.key || '';
    this.code = init.code || '';
    this.ctrlKey = Boolean(init.ctrlKey);
    this.metaKey = Boolean(init.metaKey);
    this.altKey = Boolean(init.altKey);
  }
}

class InputEventMock extends Event {
  constructor(type, init = {}) {
    super(type, init);
    this.inputType = init.inputType || 'insertText';
  }
}

function loadScriptInstance() {
  const elements = {};
  function getEl(id) {
    if (!elements[id]) elements[id] = new MockElement(id);
    return elements[id];
  }

  const doc = {
    getElementById: getEl,
    querySelectorAll: () => [new MockElement()],
    body: new MockElement('body')
  };
  const win = {
    location: { href: '' },
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  const storage = { getItem: () => null, setItem: () => {} };

  const scriptCode = fs.readFileSync(new URL('./script.js', import.meta.url), 'utf8');
  const fn = new Function('document', 'window', 'localStorage', 'KeyboardEvent', 'Event', 'module', 'exports', scriptCode);
  const mod = { exports: {} };

  fn(doc, win, storage, KeyboardEventMock, Event, mod, mod.exports);
  return { ...mod.exports, elements };
}

// -------------------------------------------------------------
// 1. Unit Tests for Analytics Core
// -------------------------------------------------------------

test('Heatmap intensity matches UI design thresholds', () => {
  assert.equal(getHeatmapIntensity(0), 'intensity-0');
  assert.equal(getHeatmapIntensity(1), 'intensity-1');
  assert.equal(getHeatmapIntensity(2), 'intensity-1');
  assert.equal(getHeatmapIntensity(3), 'intensity-2');
  assert.equal(getHeatmapIntensity(5), 'intensity-2');
  assert.equal(getHeatmapIntensity(6), 'intensity-3');
  assert.equal(getHeatmapIntensity(9), 'intensity-3');
  assert.equal(getHeatmapIntensity(10), 'intensity-4');
  assert.equal(getHeatmapIntensity(25), 'intensity-4');
});

test('Physical key resolution and Enter/newline mapping are consistent', () => {
  // Letters and numbers
  assert.equal(resolvePhysicalKey('KeyA', 'a'), 'A');
  assert.equal(resolvePhysicalKey('KeyZ', 'w'), 'Z');
  assert.equal(resolvePhysicalKey('Digit5', '5'), '5');
  assert.equal(resolvePhysicalKey('Space', ' '), 'SPACE');

  // Extended keys: brackets, quotes, backslash, slash
  assert.equal(resolvePhysicalKey('BracketLeft', '['), '[');
  assert.equal(resolvePhysicalKey('BracketRight', ']'), ']');
  assert.equal(resolvePhysicalKey('Quote', "'"), "'");
  assert.equal(resolvePhysicalKey('Backquote', '`'), '`');
  assert.equal(resolvePhysicalKey('Backslash', '\\'), '\\');
  assert.equal(resolvePhysicalKey('Slash', '/'), '/');
  assert.equal(resolvePhysicalKey('Semicolon', ';'), ';');
  assert.equal(resolvePhysicalKey('Minus', '-'), '-');
  assert.equal(resolvePhysicalKey('Equal', '='), '=');

  // Enter and newline consistency
  assert.equal(resolvePhysicalKey('Enter', '\n'), 'ENTER');
  assert.equal(resolveExpectedKey('\n'), 'ENTER');
  assert.equal(resolveExpectedKey(' '), 'SPACE');

  // Mobile / virtual keyboard fallback
  assert.equal(resolvePhysicalKey('', 'e'), 'E');
  assert.equal(resolvePhysicalKey(null, ' '), 'SPACE');
  assert.equal(resolvePhysicalKey(null, '\n'), 'ENTER');

  // Non-printable modifier keys ignored
  assert.equal(resolvePhysicalKey('ShiftLeft', 'Shift'), null);
});

test('Expected-to-pressed key substitution matrix tracks confusions accurately', () => {
  const substitutions = {};

  recordSubstitution(substitutions, 'E', 'R');
  recordSubstitution(substitutions, 'E', 'R');
  recordSubstitution(substitutions, 'E', 'W');

  assert.equal(substitutions['E']['R'], 2);
  assert.equal(substitutions['E']['W'], 1);

  const top = getTopSubstitution(substitutions, 'E');
  assert.deepEqual(top, { pressedKey: 'R', count: 2 });

  // Correct key matches should not record a substitution error
  recordSubstitution(substitutions, 'E', 'E');
  assert.equal(substitutions['E']['E'], undefined);
});

test('Real WPM calculation is accurate and handles edge cases', () => {
  assert.equal(calculateRealWpm(250, 60), 50);
  assert.equal(calculateRealWpm(125, 30), 50);
  assert.equal(calculateRealWpm(0, 30), 0);
  assert.equal(calculateRealWpm(100, 0), 0);
});

// -------------------------------------------------------------
// 2. Integration Tests: Actual Browser Event Handlers in script.js
// -------------------------------------------------------------

test('Integration: Actual keydown and input events with Backspace correction', () => {
  const app = loadScriptInstance();
  const inputEl = app.elements['typing-input'];
  app.setTestPassage('The quick brown fox');
  app.setTestTyping(true);

  // 1. Type 'T' correctly
  inputEl.dispatchEvent(new KeyboardEventMock('keydown', { key: 'T', code: 'KeyT' }));
  inputEl.value = 'T';
  inputEl.dispatchEvent(new InputEventMock('input'));

  let state = app.getTestState();
  assert.equal(state.charStates[0], 'correct');
  assert.equal(state.correctTyped, 1);
  assert.equal(state.mistakes, 0);

  // 2. Type 'x' instead of 'h' (Mistake)
  inputEl.dispatchEvent(new KeyboardEventMock('keydown', { key: 'x', code: 'KeyX' }));
  inputEl.value = 'Tx';
  inputEl.dispatchEvent(new InputEventMock('input'));

  state = app.getTestState();
  assert.equal(state.charStates[1], 'wrong');
  assert.equal(state.mistakes, 1);
  assert.equal(state.keyMistakes['H'], 1);
  assert.equal(state.keySubstitutions['H']['X'], 1);

  // 3. Backspace to delete 'x'
  inputEl.dispatchEvent(new KeyboardEventMock('keydown', { key: 'Backspace', code: 'Backspace' }));
  inputEl.value = 'T';
  inputEl.dispatchEvent(new InputEventMock('input'));

  state = app.getTestState();
  assert.equal(state.charStates[1], '');
  assert.equal(state.mistakes, 0); // Active buffer mistakes cleared
  assert.equal(state.keyMistakes['H'], 1, 'Cumulative error count must be retained across Backspace');

  // 4. Retype correctly as 'h'
  inputEl.dispatchEvent(new KeyboardEventMock('keydown', { key: 'h', code: 'KeyH' }));
  inputEl.value = 'Th';
  inputEl.dispatchEvent(new InputEventMock('input'));

  state = app.getTestState();
  assert.equal(state.charStates[1], 'correct');
  assert.equal(state.correctTyped, 2);
  assert.equal(state.keyMistakes['H'], 1, 'Historical mistake on H remains intact');
});

test('Integration: Editing edge cases (Ctrl+Backspace, selection deletion, repeated corrections)', () => {
  const app = loadScriptInstance();
  const inputEl = app.elements['typing-input'];
  app.setTestPassage('apple pie');
  app.setTestTyping(true);

  // 1. Repeated corrections on same key:
  // Target 'a' -> correct
  inputEl.dispatchEvent(new KeyboardEventMock('keydown', { key: 'a', code: 'KeyA' }));
  inputEl.value = 'a';
  inputEl.dispatchEvent(new InputEventMock('input'));

  // Target 'p' -> error 1 (typed 'o')
  inputEl.dispatchEvent(new KeyboardEventMock('keydown', { key: 'o', code: 'KeyO' }));
  inputEl.value = 'ao';
  inputEl.dispatchEvent(new InputEventMock('input'));
  assert.equal(app.getTestState().keyMistakes['P'], 1);

  // Backspace
  inputEl.dispatchEvent(new KeyboardEventMock('keydown', { key: 'Backspace', code: 'Backspace' }));
  inputEl.value = 'a';
  inputEl.dispatchEvent(new InputEventMock('input'));

  // Target 'p' -> error 2 (typed 'l')
  inputEl.dispatchEvent(new KeyboardEventMock('keydown', { key: 'l', code: 'KeyL' }));
  inputEl.value = 'al';
  inputEl.dispatchEvent(new InputEventMock('input'));
  assert.equal(app.getTestState().keyMistakes['P'], 2, 'Mistakes on same key accumulate across repeated corrections');

  // Backspace again and type correctly
  inputEl.dispatchEvent(new KeyboardEventMock('keydown', { key: 'Backspace', code: 'Backspace' }));
  inputEl.value = 'a';
  inputEl.dispatchEvent(new InputEventMock('input'));

  inputEl.dispatchEvent(new KeyboardEventMock('keydown', { key: 'p', code: 'KeyP' }));
  inputEl.value = 'ap';
  inputEl.dispatchEvent(new InputEventMock('input'));
  assert.equal(app.getTestState().keyMistakes['P'], 2);

  // 2. Ctrl+Backspace / Multi-character word deletion:
  // Type extra characters 'ple'
  inputEl.value = 'apple';
  inputEl.dispatchEvent(new InputEventMock('input'));
  assert.equal(app.getTestState().charIndex, 5);

  // User hits Ctrl+Backspace to delete 'ple' back to 'ap'
  inputEl.dispatchEvent(new KeyboardEventMock('keydown', { key: 'Backspace', code: 'Backspace', ctrlKey: true }));
  inputEl.value = 'ap';
  inputEl.dispatchEvent(new InputEventMock('input'));

  const state = app.getTestState();
  assert.equal(state.charIndex, 2);
  assert.equal(state.charStates[2], '');
  assert.equal(state.charStates[3], '');
  assert.equal(state.charStates[4], '');
  assert.equal(state.keyMistakes['P'], 2, 'Cumulative errors preserved after Ctrl+Backspace');
});

test('Integration: Middle-of-text selection deletion and replacement at arbitrary cursor position', () => {
  const app = loadScriptInstance();
  const inputEl = app.elements['typing-input'];
  app.setTestPassage('The quick brown fox');
  app.setTestTyping(true);

  // 1. Initial typing: "The quick" (9 characters, all correct)
  inputEl.value = 'The quick';
  inputEl.dispatchEvent(new InputEventMock('input'));

  let state = app.getTestState();
  assert.equal(state.charIndex, 9);
  assert.equal(state.correctTyped, 9);
  assert.equal(state.mistakes, 0);

  // 2. Middle-of-text selection deletion:
  // User selects "quick" (from index 4 to 9) and deletes it -> text becomes "The "
  inputEl.value = 'The ';
  inputEl.dispatchEvent(new InputEventMock('input'));

  state = app.getTestState();
  assert.equal(state.charIndex, 4);
  assert.equal(state.correctTyped, 4);
  assert.equal(state.mistakes, 0);
  assert.equal(state.charStates[4], '');
  assert.equal(state.charStates[5], '');
  assert.equal(state.charStates[8], '');

  // 3. Middle-of-text replacement at arbitrary cursor position:
  // User types "quack" instead -> "The quack" ('a' is wrong at index 6)
  inputEl.value = 'The quack';
  inputEl.dispatchEvent(new InputEventMock('input'));

  state = app.getTestState();
  assert.equal(state.charIndex, 9);
  assert.equal(state.correctTyped, 8); // 'T', 'h', 'e', ' ', 'q', 'u', 'c', 'k' are correct
  assert.equal(state.mistakes, 1);    // 'a' vs 'i' is wrong
  assert.equal(state.charStates[6], 'wrong');
  assert.equal(state.charStates[4], 'correct'); // 'q'
  assert.equal(state.charStates[5], 'correct'); // 'u'
  assert.equal(state.charStates[7], 'correct'); // 'c'
  // 4. Caret-position tracking in handleKeyDown at arbitrary cursor position:
  // User places caret at index 4 (where expected character is 'q') and types 'z'
  inputEl.selectionStart = 4;
  inputEl.selectionEnd = 4;
  inputEl.dispatchEvent(new KeyboardEventMock('keydown', { key: 'z', code: 'KeyZ' }));

  state = app.getTestState();
  assert.equal(state.keyMistakes['Q'], 1, 'Physical mistake must be attributed to character at selectionStart (Q), not buffer end');
  assert.equal(state.keySubstitutions['Q']['Z'], 1);
});

test('Integration: Robust paste handling without affecting subsequent normal typing', () => {
  const app = loadScriptInstance();
  const inputEl = app.elements['typing-input'];
  app.setTestPassage('The quick brown fox');
  app.setTestTyping(true);

  // 1. Paste event with typos
  inputEl.dispatchEvent(new Event('paste'));
  inputEl.value = 'Thx quic';
  inputEl.dispatchEvent(new InputEventMock('input', { inputType: 'insertFromPaste' }));

  let state = app.getTestState();
  assert.equal(state.mistakes, 1); // Checked against passage ('x' vs 'e')
  assert.equal(state.keyMistakes['E'], undefined, 'Pasted text must NOT record physical keyMistakes');
  assert.equal(state.keySubstitutions['E'], undefined, 'Pasted text must NOT record physical substitutions');

  // 2. Normal typing immediately after paste
  // Type next character 'k' correctly (expected is 'k')
  inputEl.dispatchEvent(new KeyboardEventMock('keydown', { key: 'k', code: 'KeyK' }));
  inputEl.value = 'Thx quick';
  inputEl.dispatchEvent(new InputEventMock('input', { inputType: 'insertText' }));

  // Type next character with deliberate error: space expected, types 'b'
  inputEl.dispatchEvent(new KeyboardEventMock('keydown', { key: 'b', code: 'KeyB' }));
  inputEl.value = 'Thx quickb';
  inputEl.dispatchEvent(new InputEventMock('input', { inputType: 'insertText' }));

  state = app.getTestState();
  // Normal typing right after paste IS tracked properly
  assert.equal(state.keyMistakes['SPACE'], 1, 'Subsequent normal keystroke after paste is tracked normally');
  assert.equal(state.keySubstitutions['SPACE']['B'], 1);
});
