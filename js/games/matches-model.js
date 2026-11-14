// Matches solution check — port of the original FUN_4a0909a4 (see re/README.md).
// Boards are 13 strings of 13 cells. Matches are encoded as direction codes 0..7
// (0 up, 1 up-right, 2 right, ... 7 up-left); without test_derection a match and its
// reverse are the same (0/4 -> 0, 1/5 -> 1, 2/6 -> 2, 3/7 -> 7). The board is compared
// cell by cell (no shifting) with each solution as given, rotated by 90/180/270 degrees,
// mirrored left-right or top-bottom and those mirrors rotated — except where the
// solution's no_mirror flags ("1", "2", "3", "x", "y") switch steps of that search off.
const N = 13;
const EMPTY = -1;

const DIRECTED = {'(': 3, ')': 5, '-': 2, '>': 2, '/': 1, '<': 6, '\\': 7, '^': 0, '|': 0, 'v': 4};
const UNDIRECTED = {'(': 7, '\\': 7, ')': 1, '/': 1, '-': 2, '<': 2, '>': 2, '^': 0, 'v': 0, '|': 0};
const fold = code => ({0: 0, 4: 0, 1: 1, 5: 1, 2: 2, 6: 2, 3: 7, 7: 7}[code] ?? EMPTY);

// Grid indexed [column][row] like the original (string index = column, string number = row).
export function encode(rows, directed = false) {
  const map = directed ? DIRECTED : UNDIRECTED;
  const grid = Array.from({length: N}, () => Array(N).fill(EMPTY));
  for (let row = 0; row < N; row++) {
    const text = String(rows[row] ?? '').slice(0, N);
    for (let col = 0; col < text.length; col++) grid[col][row] = map[text[col]] ?? EMPTY;
  }
  return grid;
}

const CHAR = {0: '|', 1: '/', 2: '-', 7: '\\'};
// Back to board strings (undirected codes), e.g. to build rotated boards in tests.
export function decode(grid) {
  return Array.from({length: N}, (_, row) => Array.from({length: N}, (_, col) => CHAR[grid[col][row]] ?? '.').join(''));
}

const turn = (code, directed) => {
  if (code === EMPTY || code >= 8) return code;
  const next = (code + 2) % 8;
  return directed ? next : fold(next);
};
// A mirror keeps vertical/horizontal matches and swaps the diagonals.
const flip = (code, directed) => (code !== EMPTY && code < 8 && code % 2 === 1 ? turn(code, directed) : code);

// new[12 - m][k] = turn(old[k][m])
export function rotate(grid, directed = false) {
  const out = Array.from({length: N}, () => Array(N).fill(EMPTY));
  for (let k = 0; k < N; k++) for (let m = 0; m < N; m++) out[N - 1 - m][k] = turn(grid[k][m], directed);
  return out;
}

// First mirror flips the first index (left-right), the second flips the second index (top-bottom).
export function mirror(grid, second, directed = false) {
  const out = Array.from({length: N}, () => Array(N).fill(EMPTY));
  for (let k = 0; k < N; k++) for (let m = 0; m < N; m++) {
    if (second) out[k][N - 1 - m] = flip(grid[k][m], directed);
    else out[N - 1 - k][m] = flip(grid[k][m], directed);
  }
  return out;
}

const same = (a, b) => a.every((column, i) => column.every((code, j) => code === b[i][j]));

export function matchesSolution(board, solution, noMirror = '', directed = false) {
  const flag = ch => noMirror.includes(ch);
  const noX = flag('x') || flag('X'), noY = flag('y') || flag('Y');
  const no1 = flag('1'), no2 = flag('2'), no3 = flag('3');
  const target = encode(board, directed), base = encode(solution, directed);
  let current = base, mirrors = 0;
  for (;;) {
    let turns = 0, equal = same(current, target);
    for (;;) {
      if (equal) return true;
      let step;
      if (no1 && turns === 0) { step = true; turns = 1; } else step = turns === 1;
      if (step && no2) { step = true; turns = 2; } else step = turns === 2;
      if ((step && no3) || turns > 2) break;
      current = rotate(current, directed); turns++; equal = same(current, target);
    }
    let step;
    if (noX && mirrors === 0) { step = true; mirrors = 1; } else step = mirrors === 1;
    if ((step && noY) || mirrors > 1) break;
    current = mirror(base, mirrors !== 0, directed); mirrors++;
  }
  return false;
}

// The reference boards of the level (the check of the original).
export function matchesReference(board, level) {
  const flags = level.no_mirror || [];
  return (level.solutions || []).some((solution, i) => matchesSolution(board, solution, flags[i] || '', Boolean(level.test_direction)));
}

// A level with a `rule` is solved by any board that does what the task says (3.11); the others — by a reference board.
export function isSolved(board, level) {
  return matchesReference(board, level) || ruleSolved(board, level);
}

// ---------------------------------------------------------------- level lattice (v2)
// Matches lie between vertices of a lattice with step 2 cells; a level uses one of four offsets.
// Vertex cells have the parity (rp, cp); a horizontal slot is (rp, !cp), a vertical slot (!rp, cp)
// and a diagonal slot — the centre of a unit square — (!rp, !cp). Diagonal slots are open only on
// levels whose board or solutions hold diagonals. The slot decides the orientation of a match:
// "-" or "|", and "/" or "\\" in a diagonal slot.
export const SIZE = N;
const PARITY = {'-': (r, c) => [r % 2, (c + 1) % 2], '|': (r, c) => [(r + 1) % 2, c % 2],
  '/': (r, c) => [(r + 1) % 2, (c + 1) % 2], '\\': (r, c) => [(r + 1) % 2, (c + 1) % 2]};
export const isDiagonal = ch => ch === '/' || ch === '\\';

export function lattice(level) {
  const votes = {};
  let diagonals = false;
  for (const rows of [level.board || [], ...(level.solutions || [])]) rows.forEach((row, r) => [...String(row)].forEach((ch, c) => {
    if (!PARITY[ch]) return;
    if (isDiagonal(ch)) diagonals = true;
    const key = PARITY[ch](r, c).join('');
    votes[key] = (votes[key] || 0) + 1;
  }));
  const [best = '11'] = Object.entries(votes).sort((a, b) => b[1] - a[1]).map(([key]) => key);
  return {rp: Number(best[0]), cp: Number(best[1]), diagonals};
}

// 'h' | 'v' | 'd' | null — what the cell (r, c) can hold on this lattice.
export function slotKind(lat, r, c) {
  if (r < 0 || c < 0 || r >= N || c >= N) return null;
  const onR = r % 2 === lat.rp, onC = c % 2 === lat.cp;
  if (onR && !onC) return c >= 1 && c <= N - 2 ? 'h' : null;
  if (!onR && onC) return r >= 1 && r <= N - 2 ? 'v' : null;
  if (!onR && !onC) return lat.diagonals && r >= 1 && c >= 1 && r <= N - 2 && c <= N - 2 ? 'd' : null;
  return null;
}

// The character a match takes in a slot: a diagonal keeps its slant, otherwise `slant` ("/" default).
export function charFor(kind, current, slant = '/') {
  if (kind === 'h') return '-';
  if (kind === 'v') return '|';
  if (kind === 'd') return isDiagonal(current) ? current : slant;
  return null;
}

// End points of a match in cell units (x = column, y = row; cell centres at integers).
export function segment(r, c, ch) {
  if (ch === '-') return [c - 1, r, c + 1, r];
  if (ch === '|') return [c, r - 1, c, r + 1];
  if (ch === '/') return [c - 1, r + 1, c + 1, r - 1];
  if (ch === '\\') return [c - 1, r - 1, c + 1, r + 1];
  return null;
}

// Does every match of `rows` stand in a slot of the lattice with the slot's orientation?
export function fitsLattice(rows, lat) {
  return rows.every((row, r) => [...String(row)].every((ch, c) => {
    if (ch === '.') return true;
    const kind = slotKind(lat, r, c);
    return kind === 'd' ? isDiagonal(ch) : charFor(kind, ch) === ch;
  }));
}

export const countMatches = rows => rows.join('').replace(/[^-|/\\]/g, '').length;

// Matches of the start board that are no longer where they were.
export function movedCount(start, rows) {
  let moved = 0;
  start.forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== '.' && rows[r][c] !== ch) moved++; }));
  return moved;
}

// Every board the check accepts for this level (each solution, its rotations and mirrors that its
// no_mirror flags allow), without duplicates.
export function acceptedBoards(level) {
  const directed = Boolean(level.test_direction), out = new Map();
  (level.solutions || []).forEach((solution, i) => {
    const flags = (level.no_mirror || [])[i] || '';
    const base = encode(solution, directed);
    for (const start of [base, mirror(base, false, directed), mirror(base, true, directed)]) {
      let grid = start;
      for (let k = 0; k < 4; k++) {
        const rows = decode(grid);
        if (matchesSolution(rows, solution, flags, directed)) out.set(rows.join('/'), rows);
        grid = rotate(grid, directed);
      }
    }
  });
  return [...out.values()];
}

// A level can be solved with the v2 controls when an accepted board lies on the level lattice and
// holds board + add - del matches (moves are free, "+" empties the hand, "-" removes up to del).
export function solvableBoards(level) {
  const lat = lattice(level), need = countMatches(level.board || []) + (level.add || 0) - (level.del || 0);
  return acceptedBoards(level).filter(rows => countMatches(rows) === need && fitsLattice(rows, lat));
}

// "Move 3 matches ..." -> 3 (shown as a hint "moved k of 3"); null for add / remove levels.
export function taskMoves(level) {
  if (level.add || level.del) return null;
  const m = /^\s*Move\s+(\d+)/i.exec(level.task || '');
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------- the task as a rule (3.11)
// The check of the original knows only its reference boards, and a task about squares usually has more answers
// than the references list (tools/analysis/matches_review.mjs finds them all): a right answer was called wrong.
// A level may carry `rule` — what its task asks, in squares:
//   {squares: N}   exactly N squares, of any size (a square is counted when its whole border is laid);
//   {unit: N}      exactly N squares of one match a side — "N equal squares"; a larger square that appears
//                  along the way does not count, as in the reference answers of the original;
//   {sizes: [..]}  the sizes of all the squares;
//   with different: true — no two squares of one size; pair: true — exactly two of one size; bigger: N — N of
//   the squares are larger than one match a side.
// Always: every match is a side of some square, and the board is reached the way the task says — "add" leaves
// the matches of the start where they were, "remove" moves none of those that stay, "move k" displaces at most k.
export function figure(rows, lat) {
  const at = (r, c) => rows[r]?.[c] ?? '.';
  let count = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const ch = at(r, c);
    if (ch === '.') continue;
    const kind = slotKind(lat, r, c);
    if (!(kind === 'h' && ch === '-') && !(kind === 'v' && ch === '|')) return null;   // a diagonal or a match off the lattice
    count++;
  }
  const sizes = [], used = new Set();
  for (let r0 = lat.rp; r0 < N; r0 += 2) for (let c0 = lat.cp; c0 < N; c0 += 2) for (let s = 1; r0 + 2 * s < N && c0 + 2 * s < N; s++) {
    const cells = [];
    for (let i = 0; i < s; i++) cells.push([r0, c0 + 1 + 2 * i, '-'], [r0 + 2 * s, c0 + 1 + 2 * i, '-'], [r0 + 1 + 2 * i, c0, '|'], [r0 + 1 + 2 * i, c0 + 2 * s, '|']);
    if (!cells.every(([r, c, ch]) => at(r, c) === ch)) continue;
    sizes.push(s);
    cells.forEach(([r, c]) => used.add(r * N + c));
  }
  sizes.sort((a, b) => a - b);
  return {sizes, unit: sizes.filter(s => s === 1).length, loose: count - used.size};
}

export function obeysRule(rule, fig) {
  if (!rule || !fig || fig.loose) return false;
  const distinct = new Set(fig.sizes).size;
  if (rule.different && distinct !== fig.sizes.length) return false;
  if (rule.pair && distinct !== fig.sizes.length - 1) return false;
  if (rule.bigger !== undefined && fig.sizes.length - fig.unit !== rule.bigger) return false;
  if (rule.squares !== undefined) return fig.sizes.length === rule.squares;
  if (rule.sizes) return fig.sizes.join() === [...rule.sizes].sort((a, b) => a - b).join();
  if (rule.unit !== undefined) return fig.unit === rule.unit;
  return false;
}

// What is wrong with a board of a level with a rule, for the line under a wrong check: null — nothing (or no rule),
// {kind: 'fixed'} — a match of an add / remove task was moved, {kind: 'moved', value, limit} — more matches moved
// than the task says, {kind: 'loose', value} — matches that are not a side of a square, {kind: 'count', value} —
// the number of squares the rule counts (all of them, or those of one match a side).
export function ruleFault(rows, level) {
  const rule = level.rule;
  if (!rule) return null;
  const start = (level.board || []).map(String);
  if (countMatches(rows) !== countMatches(start) + (level.add || 0) - (level.del || 0)) return {kind: 'fixed'};
  const moved = movedCount(start, rows);
  if (level.add || level.del) { if (moved !== (level.del || 0)) return {kind: 'fixed'}; }
  else { const k = taskMoves(level); if (k !== null && moved > k) return {kind: 'moved', value: moved, limit: k}; }
  const fig = figure(rows, lattice(level));
  if (!fig) return {kind: 'loose', value: 0};
  if (fig.loose) return {kind: 'loose', value: fig.loose};
  if (obeysRule(rule, fig)) return null;
  return {kind: 'count', value: rule.unit !== undefined && rule.bigger === undefined ? fig.unit : fig.sizes.length};
}

export function ruleSolved(rows, level) {
  return Boolean(level.rule) && ruleFault(rows, level) === null;
}

// ---------------------------------------------------------------- unsolved-level pools (v3, 3.11.4)
// profile.notDone.matches = {free: {easy: {done: [puzzle ids], last: id}, ...}, training: {...}}: the puzzles of a
// pool solved in this round and the one dealt last. A pool is dealt in its order: the next puzzle is the first
// unsolved one after the last dealt. When every puzzle of the pool is solved, a new round begins.
// Until 3.11.3 a pool kept the numbers of the unsolved puzzles ({left: [numbers], last: n}). The numbers changed
// when the pools were re-sorted (3.11, 3.11.4), so such a pool starts over; by id, a puzzle moved into a pool is
// unsolved there and one moved out is simply not in it.
export function readPool(modePools, diffName, ids) {
  const raw = modePools?.[diffName];
  const done = new Set(Array.isArray(raw?.done) ? raw.done.filter(id => ids.includes(id)) : []);
  let left = ids.filter(id => !done.has(id));
  const newRound = Array.isArray(raw?.done) && !left.length;
  if (!left.length) left = ids.slice();
  return {left, order: ids.slice(), last: typeof raw?.last === 'string' && ids.includes(raw.last) ? raw.last : null, newRound};
}

export function nextLevel(pool) {
  const at = pool.last === null ? -1 : pool.order.indexOf(pool.last);
  return pool.left.find(id => pool.order.indexOf(id) > at) ?? pool.left[0];
}

export const withoutLevel = (pool, id) => ({...pool, left: pool.left.filter(x => x !== id)});

// What a pool keeps in the profile.
export const poolState = pool => ({done: pool.order.filter(id => !pool.left.includes(id)), last: pool.last});

// FUN_4a14db10: prize fund (@DIST) = mips * points_good_move_arr; total = prize + MovesWrong *
// points_wrong_move_arr. The time is zeroed before time_penalty_arr is applied, so it never counts.
export function score(mips, wrongMoves, goodPoints, wrongPoints) {
  const prize = mips * goodPoints;
  return {prize, total: prize + wrongMoves * wrongPoints};
}
