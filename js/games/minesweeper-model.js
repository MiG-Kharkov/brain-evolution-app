// Minesweeper logic (no DOM). Cells are indices r * cols + c.
//   placeMines   — after the first opening, uniformly among the cells outside the 3×3 square around it
//   open         — opens a safe cell with the flood fill of zeros; returns the cells it opened
//   chordTargets — the closed neighbours a tap on a satisfied number opens
//   score        — E per opened safe cell, B per blown mine, t per second (BUG-MS-01)

export function createField(rows, cols, mines) {
  const n = rows * cols;
  return {rows, cols, mines, mine: new Uint8Array(n), open: new Uint8Array(n), flag: new Uint8Array(n), blown: new Uint8Array(n),
    count: new Uint8Array(n), placed: false, opened: 0, exploded: 0};
}

export function neighbours(f, i) {
  const r = Math.floor(i / f.cols), c = i % f.cols, out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < f.rows && cc >= 0 && cc < f.cols) out.push(rr * f.cols + cc);
  }
  return out;
}

// Uniform placement (decision: the v1 bias towards the lower rows was an artefact of the port).
export function placeMines(f, first, random = Math.random) {
  const keep = new Set([first, ...neighbours(f, first)]);
  let free = [];
  for (let i = 0; i < f.mine.length; i++) if (!keep.has(i)) free.push(i);
  if (free.length < f.mines) free = [...free, ...[...keep].filter(i => i !== first)]; // tiny fields only
  for (let k = 0; k < f.mines; k++) {
    const j = k + Math.floor(random() * (free.length - k));
    [free[k], free[j]] = [free[j], free[k]];
    f.mine[free[k]] = 1;
  }
  for (let i = 0; i < f.mine.length; i++) f.count[i] = neighbours(f, i).reduce((n, j) => n + f.mine[j], 0);
  f.placed = true;
}

// Opens a closed safe cell without a flag; zeros open their neighbours (flags stay closed).
export function open(f, start) {
  const opened = [], stack = [start];
  while (stack.length) {
    const i = stack.pop();
    if (f.open[i] || f.flag[i] || f.mine[i]) continue;
    f.open[i] = 1; f.opened++; opened.push(i);
    if (!f.count[i]) for (const j of neighbours(f, i)) if (!f.open[j] && !f.flag[j]) stack.push(j);
  }
  return opened;
}

// A tap on an open number whose flags and blown mines around equal the number opens the rest.
export function chordTargets(f, i) {
  if (!f.open[i] || f.mine[i] || !f.count[i]) return [];
  const around = neighbours(f, i);
  if (around.filter(j => f.flag[j] || f.blown[j]).length !== f.count[i]) return [];
  return around.filter(j => !f.open[j] && !f.flag[j] && !f.blown[j]);
}

export const safeCells = f => f.rows * f.cols - f.mines;
export const minesLeft = f => Math.max(0, f.mines - f.flag.reduce((n, v) => n + v, 0) - f.exploded);

export function score({cell, blown, second}, opened, exploded, seconds) {
  return Math.max(0, Math.round(cell * opened + blown * exploded + second * seconds));
}
