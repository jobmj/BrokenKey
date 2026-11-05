// Analytics & Heatmap Engine for KeyRush (BrokenKey) — Phase 1

export function getHeatmapIntensity(errCount) {
  if (!errCount || errCount <= 0) return 'intensity-0';
  if (errCount <= 2) return 'intensity-1';
  if (errCount <= 5) return 'intensity-2';
  if (errCount <= 9) return 'intensity-3';
  return 'intensity-4';
}

export function resolvePhysicalKey(code, key = '') {
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

export function resolveExpectedKey(char) {
  if (!char) return null;
  if (char === ' ') return 'SPACE';
  if (char === '\n') return 'ENTER';
  return char.toUpperCase();
}

export function recordSubstitution(substitutions, expectedKey, pressedKey) {
  if (!expectedKey || !pressedKey || expectedKey === pressedKey) return substitutions;
  if (!substitutions[expectedKey]) {
    substitutions[expectedKey] = {};
  }
  substitutions[expectedKey][pressedKey] = (substitutions[expectedKey][pressedKey] || 0) + 1;
  return substitutions;
}

export function getTopSubstitution(substitutions, expectedKey) {
  const map = substitutions && substitutions[expectedKey];
  if (!map) return null;
  const entries = Object.entries(map);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return { pressedKey: entries[0][0], count: entries[0][1] };
}

export function calculateRealWpm(correctCharacters, elapsedSeconds) {
  if (!elapsedSeconds || elapsedSeconds <= 0 || !correctCharacters) return 0;
  const elapsedMinutes = elapsedSeconds / 60;
  return Math.round((correctCharacters / 5) / elapsedMinutes);
}
