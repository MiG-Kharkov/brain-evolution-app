// The record book (3.11, owner: one more set of achievements for the best results and times — records that are
// simply beaten again and again, not steps that end with platinum). A record has no last step: it shows its value,
// and a better result replaces it.
// A record is kept per level of a game (a result of Easy is not compared with one of Hard); `level: false` — one
// for the game. kind 'max' — the larger the better (points, counts, per cent), 'min' — the smaller (time).
// The first record of a game in the list is the one its tile shows (`short` — its caption there, when the record has no level).
// State: profile.stats.rec = {"<record id>[:<level>]": {v, at, n, p}} — the value, when it was set (ms), how many
// times it was set (1 — the first result) and the value before it. The points record of a level also lives in
// profile.bestByDiff; a profile older than 3.11 has only that, so the record is shown without a date.
// A test task has its own length and prices and never sets a record (as it never sets the record of a level).
import { ensureStats } from './achievements.js';

export const LEVELS = ['easy', 'medium', 'hard', 'ultra'];

// g — the finished game: {gameId, level, score, before, feats, clock, run}; clock — the seconds of the game clock.
const clean = g => Boolean(g.feats?.perfect) && !(g.feats?.hints > 0);
const points = game => ({id: `${game}_score`, game, kind: 'max', unit: 'points', score: true, title: ['Best score', 'Лучший результат'],
  value: g => g.score});
const fastest = (game, en, ru) => ({id: `${game}_time`, game, kind: 'min', unit: 'time', title: [en, ru], value: g => (clean(g) ? g.clock : null)});
const best = (id, game, unit, en, ru, value, extra = {}) => ({id, game, kind: 'max', unit, title: [en, ru], value, ...extra});

export const RECORDS = [
  fastest('arithmetics', 'Fastest game without mistakes', 'Самая быстрая партия без ошибок'), points('arithmetics'),
  points('quadronica'),
  best('quadronica_move', 'quadronica', 'points', 'Points for one rectangle', 'Очков за один прямоугольник', g => g.feats?.bestMove),
  best('quadronica_count', 'quadronica', 'count', 'Rectangles in one game', 'Прямоугольников за партию', g => g.feats?.found),
  points('memorics'),
  fastest('sudoku', 'Fastest solution without mistakes and hints', 'Самое быстрое решение без ошибок и подсказок'), points('sudoku'),
  points('pairs'),
  points('numbers'), fastest('numbers', 'Fastest field without mistakes', 'Самое быстрое поле без ошибок'),
  best('numbers_combo', 'numbers', 'count', 'Digits cleared by one move', 'Цифр убрано одним ходом', g => g.feats?.combo),
  points('roadblocks'),
  points('guess_who'), fastest('guess_who', 'Fastest game without mistakes', 'Самая быстрая партия без ошибок'),
  fastest('minesweeper', 'Fastest field without a blast', 'Самое быстрое поле без взрывов'), points('minesweeper'),
  points('geometry'),
  best('geometry_accuracy', 'geometry', 'percent', 'Accuracy of the weakest figure', 'Точность самой слабой фигуры', g => g.feats?.minAccuracy),
  points('encyclopedia'),
  // Matches gives a fixed prize, so its points say nothing; its record is a run of puzzles solved with the first check.
  best('matches_run', 'matches', 'count', 'Puzzles in a row solved with the first check', 'Головоломок подряд с первой проверки', g => g.run, {level: false, short: ['in a row', 'подряд']}),
];
export const recordsOf = gameId => RECORDS.filter(def => def.game === gameId);
const keyOf = (def, level) => (def.level === false ? def.id : `${def.id}:${level}`);

export function ensureRecords(profile) {
  const s = ensureStats(profile);
  if (!s.rec || typeof s.rec !== 'object' || Array.isArray(s.rec)) s.rec = {};
  return s.rec;
}

// The record of a level: {v, at, n, p} or null.
export function recordOf(profile, def, level) {
  const entry = ensureRecords(profile)[keyOf(def, level)];
  if (entry && Number.isFinite(entry.v)) return entry;
  const old = def.score ? profile.bestByDiff?.[def.game]?.[level] : 0;
  return old > 0 ? {v: old, at: null, n: 1} : null;
}

// What the tile of a game shows: its first record that has a value, on the highest level that has one.
export function headline(profile, gameId) {
  for (const def of recordsOf(gameId)) {
    if (def.level === false) { const entry = recordOf(profile, def, null); if (entry) return {def, level: null, entry}; continue; }
    for (const level of [...LEVELS].reverse()) { const entry = recordOf(profile, def, level); if (entry) return {def, level, entry}; }
  }
  return null;
}

// How many records the book holds.
export function recordCount(profile) {
  return RECORDS.reduce((n, def) => n + (def.level === false ? (recordOf(profile, def, null) ? 1 : 0) : LEVELS.filter(level => recordOf(profile, def, level)).length), 0);
}

// A finished game of training or free play. Sets the records it beats and returns them: [{def, level, value, prev}];
// prev is null for the first result of its kind (nothing was beaten). `before` — the points record of the level
// before this game (storage has already taken the new score in).
export function noteRecords(profile, g, now = Date.now()) {
  const rec = ensureRecords(profile), s = profile.stats, out = [];
  if (g.gameId === 'matches') s.matchRun = clean(g) ? (s.matchRun || 0) + 1 : 0;
  const game = {...g, run: s.matchRun || 0};
  for (const def of recordsOf(g.gameId)) {
    const value = Math.floor(Number(def.value(game)));
    if (!Number.isFinite(value) || value <= 0) continue;
    const key = keyOf(def, g.level), old = rec[key];
    const prev = old && Number.isFinite(old.v) ? old.v : def.score && g.before > 0 ? g.before : null;
    if (prev !== null && (def.kind === 'min' ? value >= prev : value <= prev)) continue;
    rec[key] = {v: value, at: now, n: (old?.n || (prev !== null ? 1 : 0)) + 1, ...(prev !== null ? {p: prev} : {})};
    out.push({def, level: def.level === false ? null : g.level, value, prev});
  }
  // «Record breaker» counts every record beaten (before 3.11 — only the points records).
  s.records = (s.records || 0) + out.filter(r => r.prev !== null).length;
  return out;
}
