// vault-consistency.test.js
// Automated verification suite for KeyRush VaultDB, Keystroke Consistency Telemetry,
// JSON Portability, and Peer Challenge Protocol with In-Passage Ghost Cursor.

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import prod from './script.js';

describe('Production Keystroke Consistency Telemetry', () => {
  const { calculateConsistency } = prod;

  test('Boundary: Under 2 intervals (< 3 keystrokes) defaults to 100%', () => {
    assert.equal(calculateConsistency([]), 100);
    assert.equal(calculateConsistency(null), 100);
    assert.equal(calculateConsistency([150]), 100);
  });

  test('Metronomic rhythm: identical inter-keystroke intervals yield 100% consistency', () => {
    const perfectIntervals = [120, 120, 120, 120, 120, 120];
    const score = calculateConsistency(perfectIntervals);
    assert.equal(score, 100, 'Zero variance must yield 100% consistency');
  });

  test('Natural typing variance: steady cadence yields high consistency score (> 85%)', () => {
    // Realistic steady typing around 110ms with mild +/- 10ms variance
    const steadyIntervals = [105, 112, 108, 115, 110, 107, 114, 109];
    const score = calculateConsistency(steadyIntervals);
    assert.ok(score >= 85 && score <= 98, `Steady typing should yield ~90% consistency, got ${score}%`);
  });

  test('Erratic typing: wildly alternating flight times yield low consistency (< 40%)', () => {
    // Stuttering flight times alternating between bursts and stalls
    const erraticIntervals = [40, 480, 50, 520, 45, 490, 35, 510];
    const score = calculateConsistency(erraticIntervals);
    assert.ok(score < 40, `Erratic typing must yield low consistency, got ${score}%`);
  });

  test('Hesitation pause outlier capping: pauses > 2000ms are clamped to 2000ms', () => {
    // 8-second pause capped to 2000ms preserves reasonable rhythm calculation
    const normalWithHugePause = [1000, 1000, 1000, 8000, 1000, 1000];
    const scoreWithCap = calculateConsistency(normalWithHugePause);

    // With 2000ms cap, score evaluates to ~68%, whereas without capping it would collapse to 0%
    assert.ok(scoreWithCap > 50, `Capped outlier yields score > 50%, got ${scoreWithCap}%`);
    assert.ok(Number.isInteger(scoreWithCap), 'Score must be an integer');
  });

  test('Severe variance clamping: when standard deviation exceeds mean (CV >= 1), score is clamped to 0%', () => {
    // Highly extreme delta where variance exceeds mean
    const extremeIntervals = [5, 1900, 5, 1950, 5, 2000];
    const score = calculateConsistency(extremeIntervals);
    assert.equal(score, 0, 'Scores with CV >= 1 must clamp cleanly to 0% and never go negative');
  });

  test('Robotic / Zero Interval Guard: mean of zero returns 0% without division-by-zero crash', () => {
    const zeroIntervals = [0, 0, 0, 0];
    const score = calculateConsistency(zeroIntervals);
    assert.equal(score, 0, 'All-zero timestamps must return 0%');
  });

  test('Output constraint: consistency score is always an integer in [0, 100]', () => {
    const testCases = [
      [90, 110, 95, 105],
      [10, 500, 20, 400],
      [2000, 2000, 2000],
      [1, 2, 3, 4, 5],
      [500, 500, 500, 500, 500]
    ];
    testCases.forEach((intervals) => {
      const score = calculateConsistency(intervals);
      assert.ok(score >= 0 && score <= 100, `Score ${score} out of bounds [0, 100]`);
      assert.equal(score, Math.round(score), 'Score must be rounded integer');
    });
  });
});

describe('Production VaultDatabase Storage Engine (IndexedDB & Fallback)', () => {
  const { VaultDatabase } = prod;

  test('Initialization: degrades gracefully to in-memory store in headless Node environment', async () => {
    const db = new VaultDatabase();
    const result = await db.init();
    assert.equal(db.isIndexedDBAvailable, false, 'Node environment should flag indexedDB as unavailable');
    assert.equal(result, null);
    assert.deepEqual(db.memoryStore, []);
  });

  test('Transactional CRUD: saveSession creates record with auto-increment ID and proper schema', async () => {
    const db = new VaultDatabase();
    await db.init();

    const id1 = await db.saveSession({
      wpm: 78,
      accuracy: 98,
      consistency: 91,
      mistakes: 1,
      totalTyped: 120,
      timeLimit: 30,
      mode: '30s',
      cleanRun: false,
      passageSnippet: 'The quick brown fox jumps'
    });

    const id2 = await db.saveSession({
      wpm: 92,
      accuracy: 100,
      consistency: 95,
      mistakes: 0,
      totalTyped: 160,
      timeLimit: 0,
      mode: 'free',
      cleanRun: true,
      passageSnippet: 'Flawless run test passage'
    });

    assert.equal(id1, 1);
    assert.equal(id2, 2);

    const sessions = await db.getAllSessions();
    assert.equal(sessions.length, 2);
    // Reverse chronological order (latest first)
    assert.equal(sessions[0].id, 2);
    assert.equal(sessions[0].wpm, 92);
    assert.equal(sessions[0].cleanRun, true);
    assert.equal(sessions[1].id, 1);
    assert.equal(sessions[1].wpm, 78);
  });

  test('Query & Aggregation: getStats accurately computes aggregates across runs', async () => {
    const db = new VaultDatabase();
    await db.init();

    await db.saveSession({ wpm: 60, accuracy: 95, consistency: 80, mistakes: 2, cleanRun: false });
    await db.saveSession({ wpm: 80, accuracy: 100, consistency: 90, mistakes: 0, cleanRun: true });
    await db.saveSession({ wpm: 100, accuracy: 98, consistency: 100, mistakes: 1, cleanRun: false });

    const stats = await db.getStats();
    assert.equal(stats.totalRuns, 3);
    assert.equal(stats.bestWPM, 100);
    assert.equal(stats.avgWPM, 80); // (60 + 80 + 100) / 3
    assert.equal(stats.avgConsistency, 90); // (80 + 90 + 100) / 3
    assert.equal(stats.cleanRunsCount, 1);
  });

  test('Deletion: deleteSession removes target record by ID', async () => {
    const db = new VaultDatabase();
    await db.init();

    const id1 = await db.saveSession({ wpm: 70 });
    const id2 = await db.saveSession({ wpm: 85 });

    const deleted = await db.deleteSession(id1);
    assert.equal(deleted, true);

    const remaining = await db.getAllSessions();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, id2);
  });

  test('Wipe: clearAllSessions empties the entire vault database', async () => {
    const db = new VaultDatabase();
    await db.init();

    await db.saveSession({ wpm: 65 });
    await db.saveSession({ wpm: 75 });
    assert.equal((await db.getAllSessions()).length, 2);

    await db.clearAllSessions();
    assert.equal((await db.getAllSessions()).length, 0);
    const stats = await db.getStats();
    assert.equal(stats.totalRuns, 0);
  });

  test('Accidental Deletion & Undo Recovery: deleted session can be re-persisted to restore exact state', async () => {
    const db = new VaultDatabase();
    await db.init();

    const id = await db.saveSession({
      wpm: 88,
      accuracy: 99,
      consistency: 94,
      mistakes: 1,
      totalTyped: 140,
      mode: '30s'
    });

    const sessionsBefore = await db.getAllSessions();
    const sessionToDelete = sessionsBefore.find((s) => s.id === id);
    assert.ok(sessionToDelete);

    // Accidental deletion
    await db.deleteSession(id);
    assert.equal((await db.getAllSessions()).length, 0);

    // Undo action restores the deleted session
    const restoredId = await db.saveSession(sessionToDelete);
    assert.ok(restoredId > 0);

    const sessionsAfter = await db.getAllSessions();
    assert.equal(sessionsAfter.length, 1);
    assert.equal(sessionsAfter[0].wpm, 88);
    assert.equal(sessionsAfter[0].accuracy, 99);
  });
});

describe('Production JSON Portability (Export & Schema Validation)', () => {
  const { VaultDatabase } = prod;
  const db = new VaultDatabase();

  test('Export Schema: exportData produces valid keyrush-vault-v1 JSON backup', async () => {
    const mockSessions = [
      {
        id: 1,
        timestamp: 1731000000000,
        dateString: '2026-11-07, 8:00:00 PM',
        wpm: 84,
        accuracy: 99,
        consistency: 92,
        mistakes: 1,
        totalTyped: 135,
        timeLimit: 30,
        mode: '30s',
        cleanRun: false,
        passageSnippet: 'Programming is the art of telling another human'
      }
    ];

    const jsonStr = db.exportData(mockSessions);
    assert.equal(typeof jsonStr, 'string');

    const parsed = JSON.parse(jsonStr);
    assert.equal(parsed.schema, 'keyrush-vault-v1');
    assert.equal(parsed.version, 1);
    assert.equal(parsed.count, 1);
    assert.equal(parsed.sessions[0].wpm, 84);
  });

  test('Import Validation: accepts compliant JSON and parses sessions correctly', () => {
    const validJson = JSON.stringify({
      schema: 'keyrush-vault-v1',
      version: 1,
      exportedAt: new Date().toISOString(),
      count: 2,
      sessions: [
        {
          timestamp: 1731001000000,
          wpm: 76,
          accuracy: 97,
          consistency: 88,
          mistakes: 2,
          totalTyped: 110,
          timeLimit: 30,
          mode: '30s',
          cleanRun: false,
          passageSnippet: 'Sample passage 1'
        },
        {
          timestamp: 1731002000000,
          wpm: 90,
          accuracy: 100,
          consistency: 94,
          mistakes: 0,
          totalTyped: 150,
          timeLimit: 0,
          mode: 'free',
          cleanRun: true,
          passageSnippet: 'Sample passage 2'
        }
      ]
    });

    const result = db.validateImport(validJson);
    assert.equal(result.valid, true);
    assert.equal(result.sessions.length, 2);
    assert.equal(result.sessions[0].wpm, 76);
    assert.equal(result.sessions[1].cleanRun, true);
  });

  test('Import Security: rejects malformed JSON, wrong schema, and missing sessions', () => {
    // Non-string
    assert.equal(db.validateImport(null).valid, false);

    // Malformed JSON
    assert.equal(db.validateImport('{"bad json":').valid, false);

    // Unsupported schema
    const wrongSchema = JSON.stringify({ schema: 'other-app-v2', version: 2, sessions: [] });
    assert.equal(db.validateImport(wrongSchema).valid, false);

    // Missing sessions array
    const missingSessions = JSON.stringify({ schema: 'keyrush-vault-v1', version: 1 });
    assert.equal(db.validateImport(missingSessions).valid, false);

    // Empty sessions
    const emptySessions = JSON.stringify({ schema: 'keyrush-vault-v1', version: 1, sessions: [] });
    assert.equal(db.validateImport(emptySessions).valid, false);
  });

  test('Import Sanitization: drops invalid or corrupt entries while importing valid sessions', () => {
    const mixedJson = JSON.stringify({
      schema: 'keyrush-vault-v1',
      version: 1,
      sessions: [
        { wpm: 80, accuracy: 98, consistency: 90, mistakes: 1 }, // valid
        { wpm: 'invalid', accuracy: 90 }, // corrupt
        null, // corrupt
        { wpm: -10, accuracy: 90 }, // invalid bounds
        { wpm: 105, accuracy: 100, consistency: 96, mistakes: 0, cleanRun: true } // valid
      ]
    });

    const result = db.validateImport(mixedJson);
    assert.equal(result.valid, true);
    assert.equal(result.sessions.length, 2, 'Only the 2 valid sessions should be kept');
    assert.equal(result.sessions[0].wpm, 80);
    assert.equal(result.sessions[1].wpm, 105);
  });
});

describe('Production Peer Challenge Protocol & Ghost Cursor Pacer', () => {
  const { ChallengeProtocol } = prod;

  test('Challenge Encoding & Decoding: round-trip serialization maintains data fidelity', () => {
    const originalChallenge = {
      wpm: 82,
      accuracy: 99,
      consistency: 91,
      timeLimit: 30,
      passage: 'The quick brown fox jumps over the lazy dog.',
      events: [
        [0, 0],
        [150, 1],
        [320, 2],
        [490, 3],
        [650, 4]
      ]
    };

    const hash = ChallengeProtocol.encode(originalChallenge);
    assert.ok(hash.startsWith('#challenge='), 'Encoded challenge must begin with #challenge=');

    const decoded = ChallengeProtocol.decode(hash);
    assert.ok(decoded !== null, 'Decoded challenge must not be null');
    assert.equal(decoded.v, 1);
    assert.equal(decoded.wpm, 82);
    assert.equal(decoded.accuracy, 99);
    assert.equal(decoded.consistency, 91);
    assert.equal(decoded.timeLimit, 30);
    assert.equal(decoded.passage, originalChallenge.passage);
    assert.deepEqual(decoded.events, originalChallenge.events);
  });

  test('Security & Resilience: rejects invalid, tampered, or malformed challenge hashes', () => {
    assert.equal(ChallengeProtocol.decode(''), null);
    assert.equal(ChallengeProtocol.decode('#other=1234'), null);
    assert.equal(ChallengeProtocol.decode('#challenge=not_valid_base64!!!'), null);
    // Valid base64 of non-matching object
    const badObjHash = '#challenge=' + Buffer.from(JSON.stringify({ wrong: true })).toString('base64');
    assert.equal(ChallengeProtocol.decode(badObjHash), null);
  });

  test('Ghost Cursor Binary Interpolation: accurately locates challenger position along timeline', () => {
    const events = [
      [0, 0],
      [200, 1],
      [400, 2],
      [600, 3],
      [800, 4],
      [1000, 5]
    ];

    // At or before start
    assert.equal(ChallengeProtocol.interpolateGhostIndex(events, 0), 0);
    assert.equal(ChallengeProtocol.interpolateGhostIndex(events, -50), 0);

    // Exact matches
    assert.equal(ChallengeProtocol.interpolateGhostIndex(events, 200), 1);
    assert.equal(ChallengeProtocol.interpolateGhostIndex(events, 600), 3);

    // Between timestamps (should hold previous character position)
    assert.equal(ChallengeProtocol.interpolateGhostIndex(events, 350), 1);
    assert.equal(ChallengeProtocol.interpolateGhostIndex(events, 790), 3);
    assert.equal(ChallengeProtocol.interpolateGhostIndex(events, 950), 4);

    // At or past completion
    assert.equal(ChallengeProtocol.interpolateGhostIndex(events, 1000), 5);
    assert.equal(ChallengeProtocol.interpolateGhostIndex(events, 5000), 5);
  });

  test('Challenge Integration: active challenge outcome correctly reflects victory vs defeat', () => {
    prod.resetTest();
    prod.setActiveChallenge({
      v: 1,
      wpm: 75,
      accuracy: 98,
      consistency: 88,
      timeLimit: 30,
      passage: 'Challenge passage for battle.',
      events: [[0, 0], [1000, 5]]
    });

    // Case 1: Victory (User beats challenger)
    prod.setTestPassage('Challenge passage for battle.');
    prod.setTestTyping(true);
    prod.setTestTotalTyped(200);
    prod.setTestCorrectTyped(195);
    prod.setStartTime(Date.now() - 30000); // 30s elapsed, yields ~80 WPM
    prod.finishTest();

    const winSummary = prod.getLastResultSummary();
    assert.ok(winSummary.includes('CHALLENGE WON'), 'Exceeding challenger WPM must announce victory');

    // Case 2: Defeat (User falls short of challenger)
    prod.resetTest();
    prod.setActiveChallenge({
      v: 1,
      wpm: 120, // High benchmark
      accuracy: 100,
      consistency: 95,
      timeLimit: 30,
      passage: 'Challenge passage for battle.',
      events: [[0, 0]]
    });
    prod.setTestPassage('Challenge passage for battle.');
    prod.setTestTyping(true);
    prod.setTestTotalTyped(50);
    prod.setTestCorrectTyped(50);
    prod.setStartTime(Date.now() - 30000); // 30s elapsed, yields ~20 WPM
    prod.finishTest();

    const loseSummary = prod.getLastResultSummary();
    assert.ok(loseSummary.includes('CHALLENGE LOST'), 'Trailing challenger WPM must announce defeat');

    // Clean up
    prod.setActiveChallenge(null);
    prod.resetTest();
  });

  test('Solo Ghost Mode: activates in-passage ghost racing against Personal Best / target pace', () => {
    prod.resetTest();
    prod.setTestPassage('Practice makes progress. Keep typing!');
    prod.activateSoloGhostMode();

    const active = prod.getActiveChallenge();
    assert.ok(active !== null, 'Active challenge should be created for solo ghost');
    assert.equal(active.isSoloGhost, true, 'isSoloGhost flag must be true');
    assert.ok(active.wpm > 0, 'Target WPM must be positive');
    assert.ok(active.events.length > 0, 'Synthetic ghost events must be generated');

    // Ghost events must step through characters monotonically
    for (let i = 1; i < active.events.length; i++) {
      assert.ok(active.events[i][0] >= active.events[i - 1][0], 'Timestamps must increase');
      assert.ok(active.events[i][1] >= active.events[i - 1][1], 'Char indexes must advance');
    }

    // Finishing run against solo ghost announces personal best / ghost outcome
    prod.setTestTyping(true);
    prod.setTestTotalTyped(200);
    prod.setTestCorrectTyped(200);
    prod.setStartTime(Date.now() - 30000); // ~80 WPM
    prod.finishTest();

    const result = prod.getLastResultSummary();
    assert.ok(result.includes('DEFEATED'), 'Beating ghost pace must announce defeat of ghost/PB');

    prod.exitChallenge();
    assert.equal(prod.getActiveChallenge(), null, 'exitChallenge must clear activeChallenge');
  });

  test('Ghost Opponent Selection: supports benchmark speeds (30, 75, 100 WPM) and Vault historical sessions', () => {
    prod.resetTest();
    prod.setTestPassage('The quick brown fox jumps over the lazy dog.');

    // 1. Rookie benchmark (30 WPM)
    prod.activateSoloGhostMode(30, '30 WPM Rookie');
    let active = prod.getActiveChallenge();
    assert.equal(active.wpm, 30);
    assert.equal(active.challenger, '30 WPM Rookie');

    // 2. Ace benchmark (100 WPM)
    prod.activateSoloGhostMode(100, '100 WPM Ace');
    active = prod.getActiveChallenge();
    assert.equal(active.wpm, 100);
    assert.equal(active.challenger, '100 WPM Ace');

    // 3. Vault Historical Run (e.g. past record of 64 WPM)
    prod.activateSoloGhostMode(64, 'Vault Run #4 (64 WPM)');
    active = prod.getActiveChallenge();
    assert.equal(active.wpm, 64);
    assert.equal(active.challenger, 'Vault Run #4 (64 WPM)');

    prod.exitChallenge();
  });
});
