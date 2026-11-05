import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Directly exercise actual production code from script.js
const {
  SoundEngine,
  sanitizeCustomPassage,
  countWords,
  validatePassage,
  CUSTOM_PRESETS,
  isValidTxtFile
} = require('./script.js');

// In-memory mock storage for exercising production persistence
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

describe('Production SoundEngine: Volume Persistence & Profile State', () => {
  let originalLocalStorage;

  beforeEach(() => {
    originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = new MockLocalStorage();
  });

  afterEach(() => {
    globalThis.localStorage = originalLocalStorage;
  });

  test('Volume persistence edge case: volume set to 0 remains 0 upon initialization (no fallback to 0.6)', () => {
    globalThis.localStorage.setItem('keyrush_sound_volume', '0');
    const engine = new SoundEngine();
    assert.equal(engine.volume, 0, 'Volume must be 0 when saved as 0, not 0.6');
  });

  test('setVolume(0) stores "0" in localStorage and preserves 0 value', () => {
    const engine = new SoundEngine();
    engine.setVolume(0);
    assert.equal(engine.volume, 0);
    assert.equal(globalThis.localStorage.getItem('keyrush_sound_volume'), '0');

    // Reconstruct new instance simulating page reload
    const reloadedEngine = new SoundEngine();
    assert.equal(reloadedEngine.volume, 0, 'Volume must persist as 0 after reload');
  });

  test('Default volume falls back to 0.6 only when no stored preference exists', () => {
    const engine = new SoundEngine();
    assert.equal(engine.volume, 0.6);
  });

  test('Arbitrary valid volume values are properly persisted and retrieved', () => {
    const engine = new SoundEngine();
    engine.setVolume(0.45);
    assert.equal(engine.volume, 0.45);
    assert.equal(globalThis.localStorage.getItem('keyrush_sound_volume'), '0.45');

    const reloaded = new SoundEngine();
    assert.equal(reloaded.volume, 0.45);
  });

  test('Clamps volume within [0, 1] range', () => {
    const engine = new SoundEngine();
    engine.setVolume(1.8);
    assert.equal(engine.volume, 1.0);

    engine.setVolume(-0.4);
    assert.equal(engine.volume, 0.0);
  });

  test('Switches and persists sound profiles between blue and brown', () => {
    const engine = new SoundEngine();
    assert.equal(engine.profile, 'blue');

    engine.setProfile('brown');
    assert.equal(engine.profile, 'brown');
    assert.equal(globalThis.localStorage.getItem('keyrush_sound_profile'), 'brown');

    const reloaded = new SoundEngine();
    assert.equal(reloaded.profile, 'brown');

    engine.setProfile('blue');
    assert.equal(engine.profile, 'blue');
  });

  test('Toggles and persists mute / audio enabled status', () => {
    const engine = new SoundEngine();
    assert.equal(engine.enabled, true);

    engine.setEnabled(false);
    assert.equal(engine.enabled, false);
    assert.equal(globalThis.localStorage.getItem('keyrush_sound_enabled'), 'false');

    const reloaded = new SoundEngine();
    assert.equal(reloaded.enabled, false);

    engine.setEnabled(true);
    assert.equal(engine.enabled, true);
  });

  test('Toggles and persists typo buzzer dissonance preference', () => {
    const engine = new SoundEngine();
    assert.equal(engine.typoBuzzer, true);

    engine.setTypoBuzzer(false);
    assert.equal(engine.typoBuzzer, false);
    assert.equal(globalThis.localStorage.getItem('keyrush_sound_typo'), 'false');

    const reloaded = new SoundEngine();
    assert.equal(reloaded.typoBuzzer, false);
  });

  test('playError() contains audio repeat throttle cooldown to prevent buzzer node flooding', () => {
    const engine = new SoundEngine();
    assert.equal(engine.lastErrorSoundTime, 0);

    // Mock AudioContext to test throttle timing
    let synthesizeCount = 0;
    engine.synthesizeTypoBuzzer = () => { synthesizeCount++; };
    engine.ctx = { currentTime: 0 };

    engine.playError();
    assert.equal(synthesizeCount, 1);
    const firstCallTime = engine.lastErrorSoundTime;
    assert.ok(firstCallTime > 0);

    // Immediate second call within 45ms must be throttled
    engine.playError();
    assert.equal(synthesizeCount, 1, 'Rapid repeated playError must be throttled');
  });
});

describe('Production Custom Passage: Sanitization & Text Processing', () => {
  test('Sanitizes smart/curly quotes, apostrophes, and unicode dashes to standard ASCII', () => {
    const raw = '“The greatest glory in living lies not in never falling—but in rising every time we fall.” – Nelson Mandela';
    const clean = sanitizeCustomPassage(raw);
    assert.equal(clean, '"The greatest glory in living lies not in never falling-but in rising every time we fall." - Nelson Mandela');
  });

  test('Strips unprintable ASCII control characters and collapses irregular whitespace/newlines', () => {
    const raw = "First line.\n\n\tSecond line\x00 with   irregular   spaces.\r\nThird line.\x1F";
    const clean = sanitizeCustomPassage(raw);
    assert.equal(clean, "First line. Second line with irregular spaces. Third line.");
  });

  test('Accurately counts words in sanitized passages', () => {
    const text = 'Quick brown fox jumps over the lazy dog today.';
    assert.equal(countWords(text), 9);
    assert.equal(countWords('   One   two   three   '), 3);
    assert.equal(countWords(''), 0);
  });
});

describe('Production Custom Passage: Validation Boundaries & Presets', () => {
  test('Rejects passages with fewer than 10 words', () => {
    const shortText = 'This sentence is far too short to test.';
    const result = validatePassage(shortText);
    assert.equal(result.valid, false);
    assert.match(result.reason, /at least 10 words/i);
  });

  test('Rejects passages exceeding 3000 characters', () => {
    const longText = 'word '.repeat(650); // > 3250 characters
    const result = validatePassage(longText);
    assert.equal(result.valid, false);
    assert.match(result.reason, /exceeds 3000 character limit/i);
  });

  test('Accepts valid custom passages meeting all criteria', () => {
    const validText = 'The quick brown fox jumps over the lazy dog while developers build open source projects together.';
    const result = validatePassage(validText);
    assert.equal(result.valid, true);
    assert.ok(result.words >= 10);
    assert.ok(result.chars <= 3000);
    assert.equal(result.text, validText);
  });

  test('All production presets (code, literature, tech) are valid passages', () => {
    assert.ok(CUSTOM_PRESETS.code, 'code preset must exist');
    assert.ok(CUSTOM_PRESETS.literature, 'literature preset must exist');
    assert.ok(CUSTOM_PRESETS.tech, 'tech preset must exist');

    assert.equal(validatePassage(CUSTOM_PRESETS.code).valid, true);
    assert.equal(validatePassage(CUSTOM_PRESETS.literature).valid, true);
    assert.equal(validatePassage(CUSTOM_PRESETS.tech).valid, true);
  });

  test('Strict .txt file validation: accepts .txt files only and rejects .csv or other formats', () => {
    assert.equal(isValidTxtFile({ name: 'passage.txt' }), true);
    assert.equal(isValidTxtFile({ name: 'NOTES.TXT' }), true);
    assert.equal(isValidTxtFile({ name: 'data.csv' }), false, 'Must reject .csv files');
    assert.equal(isValidTxtFile({ name: 'document.pdf' }), false, 'Must reject .pdf files');
    assert.equal(isValidTxtFile({ name: 'script.json' }), false, 'Must reject .json files');
    assert.equal(isValidTxtFile(null), false);
    assert.equal(isValidTxtFile({}), false);
  });
});
