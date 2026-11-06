import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

class MockElement extends EventTarget {
  constructor(id = '') {
    super();
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.dataset = {};
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
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
    return { clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillText() {}, arc() {}, fill() {} };
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

function loadApp() {
  const elements = {};
  const getEl = (id) => (elements[id] ||= new MockElement(id));
  const doc = {
    getElementById: getEl,
    querySelectorAll: () => [new MockElement()],
    body: new MockElement('body')
  };
  const win = { location: { href: '' }, addEventListener() {}, removeEventListener() {} };
  const storage = { getItem: () => null, setItem() {} };
  const code = fs.readFileSync(new URL('./script.js', import.meta.url), 'utf8');
  const fn = new Function(
    'document', 'window', 'localStorage', 'KeyboardEvent', 'Event',
    'cancelAnimationFrame', 'requestAnimationFrame', 'performance',
    'module', 'exports', code
  );
  const mod = { exports: {} };
  fn(
    doc, win, storage, KeyboardEventMock, Event,
    () => {}, () => 0, { now: () => Date.now() },
    mod, mod.exports
  );
  return { ...mod.exports, elements };
}

// Counts setInterval calls so tests can prove only one timer exists.
function withIntervalCounter(run) {
  const original = globalThis.setInterval;
  let count = 0;
  globalThis.setInterval = (...args) => { count++; return original(...args); };
  try {
    run(() => count);
  } finally {
    globalThis.setInterval = original;
  }
}

function type(app, value, inputType = 'insertText') {
  const input = app.elements['typing-input'];
  input.value = value;
  input.dispatchEvent(new InputEventMock('input', { inputType }));
}

test('first character auto-starts the test exactly once', () => {
  withIntervalCounter((count) => {
    const app = loadApp();
    app.setTestPassage('The quick brown fox');
    assert.equal(app.getTestState().testState, 'READY');

    type(app, 'T');
    let state = app.getTestState();
    assert.equal(state.testState, 'RUNNING');
    assert.equal(state.correctTyped, 1, 'first character is counted once');
    assert.equal(count(), 1);

    type(app, 'Th');
    assert.equal(count(), 1, 'further typing must not start another timer');
    app.resetTest();
  });
});

test('manual Start then typing does not create a second timer', () => {
  withIntervalCounter((count) => {
    const app = loadApp();
    app.setTestPassage('The quick brown fox');

    app.elements['start-btn'].dispatchEvent(new Event('click'));
    assert.equal(app.getTestState().testState, 'RUNNING');
    assert.equal(count(), 1);

    type(app, 'T');
    type(app, 'Th');
    assert.equal(count(), 1);
    app.elements['start-btn'].dispatchEvent(new Event('click'));
    assert.equal(count(), 1, 'second Start click must be ignored');
    app.resetTest();
  });
});

test('empty input and Backspace on an empty box do not start the test', () => {
  withIntervalCounter((count) => {
    const app = loadApp();
    app.setTestPassage('The quick brown fox');
    const input = app.elements['typing-input'];

    input.dispatchEvent(new KeyboardEventMock('keydown', { key: 'Backspace', code: 'Backspace' }));
    type(app, '');
    assert.equal(app.getTestState().testState, 'READY');
    assert.equal(count(), 0);
  });
});

test('pasted text as first input starts the test and is counted once', () => {
  withIntervalCounter((count) => {
    const app = loadApp();
    app.setTestPassage('The quick brown fox');
    const input = app.elements['typing-input'];

    input.dispatchEvent(new Event('paste'));
    type(app, 'The qu', 'insertFromPaste');

    const state = app.getTestState();
    assert.equal(state.testState, 'RUNNING');
    assert.equal(state.totalTyped, 6);
    assert.equal(count(), 1);
    app.resetTest();
  });
});

test('whitespace as the first character starts the test', () => {
  withIntervalCounter((count) => {
    const app = loadApp();
    app.setTestPassage(' leading space');
    type(app, ' ');
    assert.equal(app.getTestState().testState, 'RUNNING');
    assert.equal(count(), 1);
    app.resetTest();
  });
});

test('reset restores READY and allows a fresh auto-start', () => {
  withIntervalCounter((count) => {
    const app = loadApp();
    app.setTestPassage('The quick brown fox');

    type(app, 'T');
    app.resetTest();
    assert.equal(app.getTestState().testState, 'READY');
    assert.equal(app.elements['typing-input'].disabled, false);

    type(app, 'T');
    assert.equal(app.getTestState().testState, 'RUNNING');
    assert.equal(count(), 2, 'one timer per test, two tests');
    app.resetTest();
  });
});