import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Core Replay Math & Event Sourcing Unit Logic
function getReplayEventAt(events, timeMs) {
  if (!events.length) return null;
  if (timeMs <= 0) return events[0];

  let low = 0, high = events.length - 1, best = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (events[mid].t <= timeMs) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return events[best];
}

function calculatePlaybackStep(currentTime, deltaMs, speed, maxDuration) {
  const nextTime = currentTime + deltaMs * speed;
  if (nextTime >= maxDuration) {
    return { time: maxDuration, finished: true };
  }
  return { time: nextTime, finished: false };
}

describe('KeyRush Session Replay Engine', () => {
  const mockEvents = [
    { t: 0, val: '', cursor: 0, wpm: 0, errors: 0 },
    { t: 500, val: 'T', cursor: 1, wpm: 24, errors: 0 },
    { t: 1000, val: 'Th', cursor: 2, wpm: 32, errors: 0 },
    { t: 1500, val: 'The', cursor: 3, wpm: 45, errors: 0 },
    { t: 2000, val: 'The x', cursor: 5, wpm: 40, errors: 1 }, // Typo
    { t: 2500, val: 'The ', cursor: 4, wpm: 38, errors: 1 },  // Backspaced typo
    { t: 3000, val: 'The q', cursor: 5, wpm: 42, errors: 1 }, // Corrected
    { t: 5000, val: 'The quick', cursor: 9, wpm: 55, errors: 1 }
  ];

  test('Lookup at initial timestamp t=0 returns start state', () => {
    const ev = getReplayEventAt(mockEvents, 0);
    assert.equal(ev.t, 0);
    assert.equal(ev.val, '');
    assert.equal(ev.cursor, 0);
  });

  test('Lookup between event intervals returns latest preceding state', () => {
    // At t=1200ms, event should be t=1000 ('Th')
    const ev = getReplayEventAt(mockEvents, 1200);
    assert.equal(ev.t, 1000);
    assert.equal(ev.val, 'Th');
    assert.equal(ev.cursor, 2);
  });

  test('Correctly captures Backspace and text correction sequence', () => {
    // At t=2000: 'The x' (typo)
    const typoEv = getReplayEventAt(mockEvents, 2000);
    assert.equal(typoEv.val, 'The x');
    assert.equal(typoEv.errors, 1);

    // At t=2500: Backspaced to 'The '
    const backspaceEv = getReplayEventAt(mockEvents, 2500);
    assert.equal(backspaceEv.val, 'The ');
    assert.equal(backspaceEv.cursor, 4);

    // At t=3000: Corrected to 'The q'
    const correctedEv = getReplayEventAt(mockEvents, 3000);
    assert.equal(correctedEv.val, 'The q');
  });

  test('Lookup past max timestamp returns final session state', () => {
    const ev = getReplayEventAt(mockEvents, 99999);
    assert.equal(ev.t, 5000);
    assert.equal(ev.val, 'The quick');
  });

  test('Playback stepping advances accurately with speed multipliers', () => {
    // 1x speed: 100ms delta -> +100ms
    const step1x = calculatePlaybackStep(1000, 100, 1.0, 5000);
    assert.equal(step1x.time, 1100);
    assert.equal(step1x.finished, false);

    // 2x speed: 100ms delta -> +200ms
    const step2x = calculatePlaybackStep(1000, 100, 2.0, 5000);
    assert.equal(step2x.time, 1200);
    assert.equal(step2x.finished, false);

    // Finishing bounds clamp at maxDuration
    const stepEnd = calculatePlaybackStep(4950, 100, 1.0, 5000);
    assert.equal(stepEnd.time, 5000);
    assert.equal(stepEnd.finished, true);
  });
});
