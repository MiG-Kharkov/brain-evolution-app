// Sudoku logic (no DOM): generators, solver, pattern difficulty and the score formula. The ladder (v3.3):
//   easy   -> generateFullHouse: 12–16 empty cells, each the last gap of a row, column or box
//   medium -> generateSingles: 20 → 36 empty cells by the step of the progress bar (naked singles)
//   hard   -> generateSingles: 40 → 52 empty cells by the step (hidden singles appear)
//   ultra  -> an original pattern from _SUDOKU_PUZZLES2 (data/sudoku_puzzles.json): every pattern needs more than
//             singles; pickWindow takes it from a part of the pool ranked by solver branching, by the step
// In the original rule statistics r1 + r2 equal the number of empty cells, so rule 1 places a naked
// single and rule 2 a hidden single. diflev_0/1 allow only rules 1-2.
const UNITS = [];
for (let i = 0; i < 9; i++) {
  UNITS.push(Array.from({length: 9}, (_, c) => i * 9 + c));
  UNITS.push(Array.from({length: 9}, (_, r) => r * 9 + i));
  UNITS.push(Array.from({length: 9}, (_, k) => (Math.floor(i / 3) * 3 + Math.floor(k / 3)) * 9 + (i % 3) * 3 + k % 3));
}
export const ROW = i => (i / 9) | 0;
export const COL = i => i % 9;
export const BOX = i => ((i / 27) | 0) * 3 + (((i % 9) / 3) | 0);
export const PEERS = Array.from({length: 81}, (_, i) => [...new Set(UNITS.filter(u => u.includes(i)).flat())].filter(j => j !== i));
const R = Array.from({length: 81}, (_, i) => ROW(i)), C = Array.from({length: 81}, (_, i) => COL(i)), B = Array.from({length: 81}, (_, i) => BOX(i));
const ALL = 0x3fe; // digits 1..9 as bits 1..9
const rnd = (rand, n) => (rand() % 0x7fff) % n;
const bitCount = m => { let n = 0; for (; m; m &= m - 1) n++; return n; };
const lowDigit = m => 31 - Math.clz32(m & -m);

function candidates(grid, i) {
  if (grid[i]) return [];
  const used = new Set(PEERS[i].map(j => grid[j]));
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(d => !used.has(d));
}

export function fullGrid(rand) {
  const grid = Array(81).fill(0);
  const fill = i => {
    if (i === 81) return true;
    const options = candidates(grid, i);
    for (let k = options.length - 1; k > 0; k--) { const j = rnd(rand, k + 1); [options[k], options[j]] = [options[j], options[k]]; }
    for (const d of options) { grid[i] = d; if (fill(i + 1)) return true; }
    grid[i] = 0;
    return false;
  };
  fill(0);
  return grid;
}

// Solve with rule 1 (naked single) before rule 2 (hidden single); counts placements per rule.
export function solveWithSingles(puzzle) {
  const grid = puzzle.slice();
  let r1 = 0, r2 = 0;
  for (;;) {
    let placed = false;
    for (let i = 0; i < 81 && !placed; i++) {
      const c = candidates(grid, i);
      if (!grid[i] && c.length === 1) { grid[i] = c[0]; r1++; placed = true; }
    }
    if (!placed) {
      outer: for (const unit of UNITS) for (let d = 1; d <= 9; d++) {
        if (unit.some(i => grid[i] === d)) continue;
        const spots = unit.filter(i => !grid[i] && candidates(grid, i).includes(d));
        if (spots.length === 1) { grid[spots[0]] = d; r2++; placed = true; break outer; }
      }
    }
    if (!placed) break;
  }
  return {solved: !grid.includes(0), r1, r2, grid};
}

export function rulesFor(diflev) {
  const n = key => Number(String(diflev?.[key] ?? 0).trim());
  return {r1: [n('rule1min'), n('rule1max')], r2: [n('rule2min'), n('rule2max')]};
}

// FUN_4a05a4cc with symmetric templates: cells are taken out of a full grid a symmetric pair at a
// time (cell i and its 180° turn 80 − i; the centre alone). A step that leaves the puzzle unsolvable
// by the rules goes back to the previous kept state. The puzzle is the first kept state whose rule
// counts are inside the [diflev] ranges and that has at least `minEmpty` empty cells (v2: without
// it easy always stopped at 15 empty cells). After 150 steps the search starts again from a new grid.
export function generate(diflev, rand, minEmpty = 0) {
  const rules = rulesFor(diflev);
  const inRange = s => s.r1 >= rules.r1[0] && s.r1 <= rules.r1[1] && s.r2 >= rules.r2[0] && s.r2 <= rules.r2[1];
  let best = null, any = null;
  for (let restart = 0; restart < 60; restart++) {
    const solution = fullGrid(rand);
    let puzzle = solution.slice();
    const kept = [];
    for (let step = 0; step < 150; step++) {
      const filled = [];
      for (let i = 0; i <= 40; i++) if (puzzle[i]) filled.push(i);
      if (!filled.length) break;
      const next = puzzle.slice();
      const cell = filled[rnd(rand, filled.length)];
      next[cell] = 0; next[80 - cell] = 0;
      const s = solveWithSingles(next);
      if (!s.solved) {
        if (!kept.length) break;
        puzzle = kept.pop();
        continue;
      }
      const empty = s.r1 + s.r2;
      if (inRange(s) && empty >= minEmpty) return {puzzle: next, solution, r1: s.r1, r2: s.r2};
      kept.push(puzzle);
      puzzle = next;
      const found = {puzzle: next, solution, r1: s.r1, r2: s.r2};
      if (inRange(s) && (!best || empty > best.r1 + best.r2)) best = found;
      if (!any || empty > any.r1 + any.r2) any = found;
    }
    if (best && restart >= 9) break;
  }
  return best || any;
}

// Easy (v3.2.2, owner: easy was too hard for a child): the puzzle is solved by "full houses" only — a row,
// column or box with one empty cell takes the one missing digit, and every placed digit opens the next one.
export function solveFullHouse(puzzle) {
  const grid = puzzle.slice();
  let steps = 0;
  for (;;) {
    let placed = false;
    for (const unit of UNITS) {
      let gap = -1, empties = 0, used = 0;
      for (const i of unit) { if (grid[i]) used |= 1 << grid[i]; else { gap = i; empties++; } }
      if (empties !== 1) continue;
      grid[gap] = lowDigit(ALL & ~used); steps++; placed = true;
    }
    if (!placed) break;
  }
  return {solved: !grid.includes(0), steps, grid};
}

// Symmetric pairs leave the full grid while the puzzle stays solvable by full houses, until `target` empty
// cells (a random full grid allows 17–21 such cells; docs/games/sudoku.md, section 9).
export function generateFullHouse(rand, target) {
  let best = null;
  for (let restart = 0; restart < 40; restart++) {
    const solution = fullGrid(rand);
    let puzzle = solution.slice(), fails = 0;
    while (fails < 120) {
      const empty = puzzle.filter(v => !v).length;
      if (empty >= target) return {puzzle, solution};
      const filled = [];
      for (let i = 0; i <= 40; i++) if (puzzle[i]) filled.push(i);
      if (!filled.length) break;
      const cell = filled[rnd(rand, filled.length)], next = puzzle.slice();
      next[cell] = 0; next[80 - cell] = 0;
      if (solveFullHouse(next).solved) { puzzle = next; fails = 0; } else fails++;
    }
    if (!best || puzzle.filter(v => !v).length > best.puzzle.filter(v => !v).length) best = {puzzle, solution};
  }
  return best;
}

// Medium and hard (v3.3): solvable by singles (naked first, then hidden), `target` empty cells or one pair more. Up to
// about 40 cells naked singles are enough; from 44 on hidden singles appear (median 1 at 48, 9 at 52). The target
// grows with the progress bar of the level (rules.sudoku.medium_sizes / hard_sizes).
export function generateSingles(rand, target) {
  let best = null;
  for (let restart = 0; restart < 40; restart++) {
    const solution = fullGrid(rand);
    let puzzle = solution.slice(), fails = 0;
    while (fails < 120) {
      const empty = puzzle.filter(v => !v).length;
      if (empty >= target) return {puzzle, solution, ...solveWithSingles(puzzle)};
      const filled = [];
      for (let i = 0; i <= 40; i++) if (puzzle[i]) filled.push(i);
      if (!filled.length) break;
      const cell = filled[rnd(rand, filled.length)], next = puzzle.slice();
      next[cell] = 0; next[80 - cell] = 0;
      if (solveWithSingles(next).solved) { puzzle = next; fails = 0; } else fails++;
    }
    if (!best || puzzle.filter(v => !v).length > best.puzzle.filter(v => !v).length) best = {puzzle, solution, ...solveWithSingles(puzzle)};
  }
  return best;
}

// Bit-mask search state: grid + used digits per row, column and box.
function stateOf(puzzle) {
  const s = {g: Int8Array.from(puzzle), r: new Uint16Array(9), c: new Uint16Array(9), b: new Uint16Array(9)};
  for (let i = 0; i < 81; i++) {
    const v = s.g[i];
    if (!v) continue;
    const bit = 1 << v;
    if ((s.r[R[i]] | s.c[C[i]] | s.b[B[i]]) & bit) return null; // invalid givens
    s.r[R[i]] |= bit; s.c[C[i]] |= bit; s.b[B[i]] |= bit;
  }
  return s;
}
const copyState = s => ({g: s.g.slice(), r: s.r.slice(), c: s.c.slice(), b: s.b.slice()});
const maskAt = (s, i) => ALL & ~(s.r[R[i]] | s.c[C[i]] | s.b[B[i]]);
function put(s, i, v) { const bit = 1 << v; s.g[i] = v; s.r[R[i]] |= bit; s.c[C[i]] |= bit; s.b[B[i]] |= bit; }
function unput(s, i, v) { const bit = ~(1 << v); s.g[i] = 0; s.r[R[i]] &= bit; s.c[C[i]] &= bit; s.b[B[i]] &= bit; }

// Plain search: the empty cell with the fewest candidates first. Counts solutions up to `limit`
// and the branching points (nodes with two or more candidates) of the search tree.
function search(s, limit, out) {
  let count = 0, branches = 0;
  const rec = () => {
    let best = -1, bestMask = 0, bestCnt = 10;
    for (let i = 0; i < 81; i++) {
      if (s.g[i]) continue;
      const m = maskAt(s, i), n = bitCount(m);
      if (n < bestCnt) { best = i; bestMask = m; bestCnt = n; if (n <= 1) break; }
    }
    if (best < 0) {
      if (out && count === 0) for (let i = 0; i < 81; i++) out[i] = s.g[i];
      return ++count >= limit;
    }
    if (!bestCnt) return false;
    if (bestCnt > 1) branches++;
    for (let m = bestMask; m; m &= m - 1) {
      const v = lowDigit(m);
      put(s, best, v);
      if (rec()) return true;
      unput(s, best, v);
    }
    return false;
  };
  rec();
  return {count, branches};
}

// The unique solution of a puzzle (null if it has none or several).
export function solve(puzzle) {
  const s = stateOf(puzzle);
  if (!s) return null;
  const out = new Array(81).fill(0);
  return search(s, 2, out).count === 1 ? out : null;
}

// Places naked and hidden singles until none is left; false on a contradiction.
function singles(s) {
  for (;;) {
    let placed = false;
    for (let i = 0; i < 81; i++) {
      if (s.g[i]) continue;
      const m = maskAt(s, i);
      if (!m) return false;
      if (!(m & (m - 1))) { put(s, i, lowDigit(m)); placed = true; }
    }
    for (const unit of UNITS) {
      let used = 0;
      for (const i of unit) if (s.g[i]) used |= 1 << s.g[i];
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << d;
        if (used & bit) continue;
        let spot = -1, spots = 0;
        for (const i of unit) if (!s.g[i] && maskAt(s, i) & bit) { spot = i; if (++spots > 1) break; }
        if (!spots) return false;
        if (spots === 1) { put(s, spot, d); used |= bit; placed = true; }
      }
    }
    if (!placed) return true;
  }
}

// Pattern difficulty: the branching points of an exhaustive search that places every single (naked
// and hidden) at each node — the guesses a player who knows only singles has to make. Ties are broken
// by the empty cells left when singles first stall, then by the branching of the plain search.
export function difficulty(puzzle) {
  const start = stateOf(puzzle);
  if (!start) return {branches: 0, stalled: 0, plain: 0, key: 0};
  let branches = 0;
  const rec = s => {
    if (!singles(s)) return;
    let best = -1, bestMask = 0, bestCnt = 10;
    for (let i = 0; i < 81; i++) {
      if (s.g[i]) continue;
      const m = maskAt(s, i), n = bitCount(m);
      if (n < bestCnt) { best = i; bestMask = m; bestCnt = n; }
    }
    if (best < 0) return;
    branches++;
    for (let m = bestMask; m; m &= m - 1) { const next = copyState(s); put(next, best, lowDigit(m)); rec(next); }
  };
  const first = copyState(start);
  singles(first);
  const stalled = first.g.reduce((n, v) => n + (v ? 0 : 1), 0);
  rec(copyState(start));
  const plain = search(copyState(start), 2, null).branches;
  return {branches, stalled, plain, key: branches * 1e6 + stalled * 1e3 + Math.min(plain, 999)};
}

// Ranks the pool once: easiest first. rank[k] = {index, pattern, key}.
const rankCache = new WeakMap();
export function rankPool(patterns) {
  if (rankCache.has(patterns)) return rankCache.get(patterns);
  const ranked = patterns.map((pattern, index) => ({index, pattern, ...difficulty(pattern.split('').map(Number))}))
    .sort((a, b) => a.key - b.key || a.index - b.index);
  rankCache.set(patterns, ranked);
  return ranked;
}

// A uniform draw from a window [lo, hi] (shares of the ranked pool, easiest first). `place` is the pattern's position
// in the whole pool from 0 to 1; equal keys share the mean position.
export function pickWindow(patterns, [lo, hi] = [0, 1], random = Math.random) {
  const ranked = rankPool(patterns), n = ranked.length;
  const first0 = Math.max(0, Math.min(n - 1, Math.floor(lo * n))), last0 = Math.max(first0, Math.min(n - 1, Math.ceil(hi * n) - 1));
  const k = first0 + Math.floor(random() * (last0 - first0 + 1));
  const key = ranked[k].key;
  let first = k, last = k;
  while (first > 0 && ranked[first - 1].key === key) first--;
  while (last < n - 1 && ranked[last + 1].key === key) last++;
  return {...ranked[k], place: n > 1 ? (first + last) / 2 / (n - 1) : 0.5};
}

// Level cost of a pattern: the base cost × a factor from scale[0] (easiest) to scale[1] (hardest).
export const costFactor = (place, scale = [1, 1]) => Math.round((scale[0] + (scale[1] - scale[0]) * place) * 100) / 100;

// S = L − |w|·W − |t|·T − |p|·P, never below 0 (coefficients as in the config, negative).
export function score({cost, wrong, time, cheat}, W, T, P) {
  return Math.max(0, Math.round(cost + wrong * W + time * T + cheat * P));
}
