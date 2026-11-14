// Game configuration: the extracted original config (data/original_config.json) with the v2 balance
// changes on top (data/balance/<name>.json). A balance file mirrors the config:
//   {"games": {"<section>": {"<key>": "<value>"}}, "shell": {...}, "rules": {...}, "why": {"<section>.<key>": "reason"}}
// Values replace the original ones key by key; "rules" holds v2-only settings read by the code.
import { APP_VERSION } from './version.js';

const BALANCE_FILES = ['core', 'arithmetics', 'quadronica', 'memorics', 'sudoku', 'pairs', 'numbers', 'roadblocks',
  'guess_who', 'minesweeper', 'geometry', 'encyclopedia', 'matches'];
let configPromise;

const fetchJSON = url => fetch(`${url}?v=${APP_VERSION}`).then(r => (r.ok ? r.json() : null)).catch(() => null);

function mergeInto(target, patch) {
  for (const [section, values] of Object.entries(patch || {})) {
    if (values && typeof values === 'object' && !Array.isArray(values)) target[section] = {...(target[section] || {}), ...values};
    else target[section] = values;
  }
}

export function loadOriginalConfig() {
  return configPromise ||= (async () => {
    const config = await fetchJSON('data/original_config.json');
    if (!config) throw new Error('Original configuration is unavailable');
    config.rules = {};
    config.balance = {};
    const patches = await Promise.all(BALANCE_FILES.map(name => fetchJSON(`data/balance/${name}.json`)));
    patches.forEach((patch, i) => {
      if (!patch) return;
      mergeInto(config.games, patch.games);
      mergeInto(config.shell, patch.shell);
      mergeInto(config.rules, patch.rules);
      config.balance[BALANCE_FILES[i]] = patch.why || {};
    });
    return config;
  })();
}

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'ultra'];
export const difficultyIndex = value => ({easy: 0, med: 1, medium: 1, hard: 2, ultra: 3}[value] ?? 0);
export const arrayValue = (value, index) => Number(String(value).trim().split(/\s+/)[index + 1]);
export const shuffle = values => {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
// newlib rand() used by the original game: 64-bit LCG, returns bits 32..62 (FUN_4a19b9f0).
export function createRandom(seed = Date.now()) {
  let state = BigInt.asUintN(64, BigInt(Math.floor(seed)));
  return () => {
    state = BigInt.asUintN(64, state * 6364136223846793005n + 1n);
    return Number((state >> 32n) & 0x7fffffffn);
  };
}
