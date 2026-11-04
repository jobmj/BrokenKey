import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Core Business Logic: Text Sanitization & Validation for Custom Passages
export function sanitizeCustomPassage(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  return rawText
    // Remove unprintable ASCII control characters (keep printable range 0x20 - 0x7E + unicode)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize smart / curly double quotes to ASCII double quote
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
    // Normalize smart / curly single quotes and apostrophes
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    // Normalize em-dashes and en-dashes to hyphen
    .replace(/[\u2013\u2014\u2015]/g, '-')
    // Normalize ellipsis
    .replace(/\u2026/g, '...')
    // Replace newlines, carriage returns, and tabs with single space
    .replace(/[\r\n\t]+/g, ' ')
    // Collapse multiple consecutive spaces into a single space
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function validatePassage(text) {
  const sanitized = sanitizeCustomPassage(text);
  const words = countWords(sanitized);
  const chars = sanitized.length;

  if (chars === 0) {
    return { valid: false, words: 0, chars: 0, reason: 'Passage cannot be empty.' };
  }
  if (words < 10) {
    return { valid: false, words, chars, reason: `Passage requires at least 10 words (currently ${words}).` };
  }
  if (chars > 3000) {
    return { valid: false, words, chars, reason: `Passage exceeds maximum limit of 3000 characters (currently ${chars}).` };
  }
  return { valid: true, words, chars, text: sanitized };
}

// Procedural Audio Engine Parameter Constants
export const AUDIO_PROFILES = {
  blue: {
    name: 'Cherry MX Blue',
    clickFreq1: 2400,
    clickFreq2: 3200,
    snapDecay: 0.008,
    spaceFreq: 130,
    spaceDecay: 0.035
  },
  brown: {
    name: 'Cherry MX Brown',
    thudFreq: 450,
    thudDecay: 0.018,
    spaceFreq: 105,
    spaceDecay: 0.045
  }
};

export const ERROR_TONE = {
  freq: 140,
  dissonanceFreq: 165,
  decay: 0.08
};

describe('Custom Passage Sanitization & Validation Engine', () => {
  test('Sanitizes smart quotes, apostrophes, and unicode dashes to standard ASCII', () => {
    const raw = '“The greatest glory in living lies not in never falling—but in rising every time we fall.” – Nelson Mandela';
    const clean = sanitizeCustomPassage(raw);
    assert.equal(clean, '"The greatest glory in living lies not in never falling-but in rising every time we fall." - Nelson Mandela');
  });

  test('Strips unprintable control characters and collapses redundant whitespace and newlines', () => {
    const raw = "First line.\n\n\tSecond line\x00 with   irregular   spaces.\r\nThird line.";
    const clean = sanitizeCustomPassage(raw);
    assert.equal(clean, "First line. Second line with irregular spaces. Third line.");
  });

  test('Accurately counts words in sanitized passages', () => {
    const text = 'Quick brown fox jumps over the lazy dog today.';
    assert.equal(countWords(text), 9);
    assert.equal(countWords('   One   two   three   '), 3);
    assert.equal(countWords(''), 0);
  });

  test('Rejects passages with fewer than 10 words', () => {
    const shortText = 'This sentence is far too short to test.';
    const result = validatePassage(shortText);
    assert.equal(result.valid, false);
    assert.match(result.reason, /at least 10 words/);
  });

  test('Rejects passages exceeding 3000 characters', () => {
    const longText = 'word '.repeat(650); // > 3250 characters
    const result = validatePassage(longText);
    assert.equal(result.valid, false);
    assert.match(result.reason, /exceeds maximum limit/);
  });

  test('Accepts valid passages meeting all criteria', () => {
    const validText = 'The quick brown fox jumps over the lazy dog while developers build open source projects together.';
    const result = validatePassage(validText);
    assert.equal(result.valid, true);
    assert.ok(result.words >= 10);
    assert.ok(result.chars <= 3000);
    assert.equal(result.text, validText);
  });
});

describe('Procedural Web Audio Engine Specification', () => {
  test('Contains valid audio profile acoustics configurations', () => {
    assert.ok(AUDIO_PROFILES.blue);
    assert.ok(AUDIO_PROFILES.brown);
    assert.equal(AUDIO_PROFILES.blue.clickFreq1, 2400);
    assert.equal(AUDIO_PROFILES.blue.clickFreq2, 3200);
    assert.equal(AUDIO_PROFILES.brown.thudFreq, 450);
  });

  test('Error buzzer tone utilizes low-frequency dissonant interval', () => {
    assert.equal(ERROR_TONE.freq, 140);
    assert.equal(ERROR_TONE.dissonanceFreq, 165);
    assert.ok(ERROR_TONE.decay <= 0.1);
  });
});
