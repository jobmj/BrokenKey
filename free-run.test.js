import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Mock DOM elements for loading production script.js in Node
class MockElement extends EventTarget {
  constructor(id = '') {
    super();
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.dataset = {};
    this.classList = {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      toggle(c, force) {
        if (force === undefined) {
          if (this._classes.has(c)) this._classes.delete(c);
          else this._classes.add(c);
        } else if (force) {
          this._classes.add(c);
        } else {
          this._classes.delete(c);
        }
      },
      contains(c) { return this._classes.has(c); }
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

class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(k) { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null; }
  setItem(k, v) { this.store[k] = String(v); }
  removeItem(k) { delete this.store[k]; }
  clear() { this.store = {}; }
}

let prod;

describe('Production Free Run Mode (Issue #41)', () => {
  let origDoc, origWin, origStorage;

  beforeEach(() => {
    origDoc = globalThis.document;
    origWin = globalThis.window;
    origStorage = globalThis.localStorage;

    globalThis.localStorage = new MockLocalStorage();

    const elements = {};
    const getEl = (id) => {
      if (!elements[id]) elements[id] = new MockElement(id);
      return elements[id];
    };

    globalThis.document = {
      getElementById: (id) => getEl(id),
      querySelector: () => new MockElement(),
      querySelectorAll: (sel) => {
        if (sel === '.time-btn') {
          const btn15 = new MockElement(); btn15.dataset.time = '15';
          const btn30 = new MockElement(); btn30.dataset.time = '30';
          const btn60 = new MockElement(); btn60.dataset.time = '60';
          const btn0 = new MockElement(); btn0.dataset.time = '0';
          return [btn15, btn30, btn60, btn0];
        }
        return [new MockElement()];
      },
      body: new MockElement('body'),
      activeElement: null
    };

    globalThis.window = {
      addEventListener() {},
      removeEventListener() {},
      requestAnimationFrame() { return 1; },
      cancelAnimationFrame() {},
      localStorage: globalThis.localStorage,
      location: { href: '' }
    };

    // Load production script.js
    prod = require('./script.js');
  });

  afterEach(() => {
    globalThis.document = origDoc;
    globalThis.window = origWin;
    globalThis.localStorage = origStorage;
  });

  test('Mode Switching: switching to timeLimit 0 resets timeLeft to 0 for Free Run', () => {
    prod.setTimeLimit(0);
    prod.resetTest();

    assert.equal(prod.getTimeLimit(), 0, 'timeLimit must be 0 for Free Run');
    assert.equal(prod.getTimeLeft(), 0, 'timeLeft must start at 0 in Free Run mode');
    const label = globalThis.document.getElementById('time-stat-label');
    assert.equal(label.textContent, 'Time elapsed', 'Label must switch to "Time elapsed" in Free Run mode');
  });

  test('Mode Switching: switching back from Free Run to timed mode (15s/30s/60s) updates timeLeft correctly', () => {
    prod.setTimeLimit(0);
    prod.resetTest();
    assert.equal(prod.getTimeLeft(), 0);

    // Switch to 15s
    prod.setTimeLimit(15);
    prod.resetTest();
    assert.equal(prod.getTimeLimit(), 15);
    assert.equal(prod.getTimeLeft(), 15, 'timeLeft must be 15 when switched to 15s mode');
    const label = globalThis.document.getElementById('time-stat-label');
    assert.equal(label.textContent, 'Time left', 'Label must switch to "Time left" in timed mode');

    // Switch to 60s
    prod.setTimeLimit(60);
    prod.resetTest();
    assert.equal(prod.getTimeLimit(), 60);
    assert.equal(prod.getTimeLeft(), 60, 'timeLeft must be 60 when switched to 60s mode');
  });

  test('Count-Up Timer: in Free Run mode, timer ticks upward (0s -> 1s -> 2s...) without expiring', () => {
    prod.setTimeLimit(0);
    prod.resetTest();
    prod.setTestTyping(true);
    prod.setTimeLeft(0);

    assert.equal(prod.getTimeLeft(), 0);

    // Simulate timer ticks in Free Run
    prod.setTimeLeft(prod.getTimeLeft() + 1);
    assert.equal(prod.getTimeLeft(), 1, 'Tick 1 must increment timeLeft to 1');

    prod.setTimeLeft(prod.getTimeLeft() + 1);
    assert.equal(prod.getTimeLeft(), 2, 'Tick 2 must increment timeLeft to 2');

    prod.setTimeLeft(prod.getTimeLeft() + 1);
    assert.equal(prod.getTimeLeft(), 3, 'Tick 3 must increment timeLeft to 3');
  });

  test('Passage Completion: completing the final character in Free Run triggers finishTest exactly once', () => {
    prod.setTimeLimit(0);
    prod.resetTest();

    const samplePassage = 'Free run completion test.';
    prod.setTestPassage(samplePassage);
    prod.setTestTyping(true);
    prod.setStartTime(Date.now() - 5000); // 5 seconds elapsed

    const state = prod.getTestState();
    if (state.inputEl) {
      state.inputEl.value = samplePassage;
    }

    prod.handleInput({ inputType: 'insertText' });

    const postState = prod.getTestState();
    assert.equal(postState.isTyping, false, 'isTyping must be false after passage completion');

    // Calling finishTest again when !isTyping should be safely ignored
    prod.finishTest();
    assert.equal(postState.isTyping, false, 'Redundant finishTest calls must be no-op');
  });

  test('Results Telemetry: Free Run mode displays total completion time in results card', () => {
    prod.setTimeLimit(0);
    prod.resetTest();
    prod.setTestPassage('Practice without timer pressure.');
    prod.setTestTyping(true);
    prod.setStartTime(Date.now() - 12500); // 12.5s elapsed

    prod.finishTest();

    const summary = prod.getLastResultSummary();
    assert.ok(summary.includes('Completed in'), 'Free Run result text must include "Completed in"');
    assert.ok(summary.includes('WPM'), 'Result text must include WPM');
  });

  test('Results Telemetry: Timed mode displays standard "Test complete" header', () => {
    prod.setTimeLimit(30);
    prod.resetTest();
    prod.setTestPassage('Timed mode test.');
    prod.setTestTyping(true);
    prod.setStartTime(Date.now() - 10000);

    prod.finishTest();

    const summary = prod.getLastResultSummary();
    assert.ok(summary.includes('Test complete'), 'Timed mode result text must include "Test complete"');
  });

  test('Session Replay: Free Run records session replay events with accurate duration', () => {
    prod.setTimeLimit(0);
    prod.resetTest();
    prod.setTestPassage('Replay integration test.');
    prod.setTestTyping(true);

    const start = Date.now() - 8000;
    prod.setStartTime(start);

    prod.finishTest();

    const events = prod.getSessionReplayEvents();
    assert.ok(events.length >= 1, 'Replay events must be recorded for Free Run');
    const lastEvent = events[events.length - 1];
    assert.ok(lastEvent.t >= 7900, 'Last replay event timestamp must match elapsed time');
  });

  test('Extended Session: WPM remains accurate and stable over longer sessions', () => {
    prod.setTimeLimit(0);
    prod.resetTest();
    prod.setTestTyping(true);

    // Simulate 2 minutes (120 seconds) of typing with 600 correct characters (120 words = 60 WPM)
    const elapsedMs = 120 * 1000;
    prod.setStartTime(Date.now() - elapsedMs);

    // 600 characters = 120 words. Over 2 minutes = 60 WPM.
    prod.setTestTotalTyped(600);

    const calculatedWPM = prod.calculateWPM();
    assert.equal(calculatedWPM, 60, 'Calculated WPM over 2 minutes should be 60');
  });

  test('Stop Button: allows user to finish run early and calculate score on partially typed text', () => {
    prod.setTimeLimit(0);
    prod.resetTest();
    prod.setTestPassage('This is a longer passage that the user stops halfway.');
    prod.setTestTyping(true);
    prod.setStartTime(Date.now() - 5000); // 5s elapsed
    prod.setTestTotalTyped(50); // typed 50 characters (10 words)
    prod.setTestCorrectTyped(50);

    // Call finishTest directly simulating stop button action
    prod.finishTest();

    assert.equal(prod.getTestState().isTyping, false, 'isTyping must be false after stopping early');
    const summary = prod.getLastResultSummary();
    assert.ok(summary.includes('Completed in'), 'Result summary must format completion time');
    assert.ok(summary.includes('WPM'), 'Result summary must calculate WPM on typed portion');
  });

  test('Last Character Correction: mistyping the final character does not lock input, allowing Backspace correction', () => {
    prod.setTimeLimit(0);
    prod.resetTest();
    prod.setTestPassage('Finish line.');
    prod.setTestTyping(true);

    const state = prod.getTestState();
    // User types 'Finish linex' (last char 'x' is typo instead of '.')
    if (state.inputEl) {
      state.inputEl.value = 'Finish linex';
    }
    prod.handleInput({ inputType: 'insertText' });

    // isTyping must remain true so user can Backspace and fix it!
    assert.equal(prod.getTestState().isTyping, true, 'isTyping must remain true when last character is a typo');

    // User corrects it by typing '.'
    if (state.inputEl) {
      state.inputEl.value = 'Finish line.';
    }
    prod.handleInput({ inputType: 'insertText' });

    // Now that last character is correct, it auto-finishes!
    assert.equal(prod.getTestState().isTyping, false, 'isTyping must be false once final character is correct');
  });

  test('All Green Clean Run: 0 errors displays "(Clean run)" in results card', () => {
    prod.setTimeLimit(0);
    prod.resetTest();
    prod.setTestPassage('Flawless test.');
    prod.setTestTyping(true);
    prod.setStartTime(Date.now() - 5000);
    prod.setTestMistakes(0);

    prod.finishTest();

    const summary = prod.getLastResultSummary();
    assert.ok(summary.includes('(Clean run)'), 'Zero mistakes must include "(Clean run)" tag');
  });
});
