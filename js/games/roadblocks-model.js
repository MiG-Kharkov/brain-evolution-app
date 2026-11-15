// Roadblocks (Balltracker) — rules of the field.
// Field: rows of '.' floor, '+' block, '*' start, '> < ^ v' exits. The ball rolls until a block (it stops
// in front of it), an exit or the edge of the field (the ball is lost).
// v2 (BUG-RB-01): an exit lets the ball out only when the ball enters it moving in the arrow's
// direction; approached from any other side the arrow is a wall.
export const EXIT_DIRECTION = {'>': [0, 1], '<': [0, -1], 'v': [1, 0], '^': [-1, 0]};
export const DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const isExit = cell => cell in EXIT_DIRECTION;

// -> {path: [{r, c}...], lost, goal, blockedBy: {r, c} | null}
export function rollBall(rows, start, dr, dc) {
  if (Math.abs(dr) + Math.abs(dc) !== 1) throw new Error('Invalid roll direction');
  const path = [];
  let r = start.r, c = start.c;
  for (;;) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= rows.length || nc < 0 || nc >= rows[0].length) return {path, lost: true, goal: false, blockedBy: null};
    const cell = rows[nr][nc];
    if (cell === '+') return {path, lost: false, goal: false, blockedBy: {r: nr, c: nc}};
    if (isExit(cell)) {
      const [er, ec] = EXIT_DIRECTION[cell];
      if (er !== dr || ec !== dc) return {path, lost: false, goal: false, blockedBy: {r: nr, c: nc}};
      path.push({r: nr, c: nc});
      return {path, lost: false, goal: true, blockedBy: null};
    }
    r = nr; c = nc; path.push({r, c});
  }
}

export function findStart(rows) {
  for (let r = 0; r < rows.length; r++) { const c = rows[r].indexOf('*'); if (c >= 0) return {r, c}; }
  return null;
}

// Shortest solution (fewest rolls) by BFS; null when the exit cannot be reached without losing the ball.
export function solveRoadblocks(rows) {
  const start = findStart(rows);
  if (!start) return null;
  const pending = [{position: start, moves: []}], seen = new Set([`${start.r},${start.c}`]);
  for (let index = 0; index < pending.length; index++) for (const [dr, dc] of DIRECTIONS) {
    const current = pending[index], result = rollBall(rows, current.position, dr, dc);
    if (result.goal) return [...current.moves, [dr, dc]];
    if (result.lost || !result.path.length) continue;
    const position = result.path.at(-1), key = `${position.r},${position.c}`;
    if (!seen.has(key)) { seen.add(key); pending.push({position, moves: [...current.moves, [dr, dc]]}); }
  }
  return null;
}

// Next fields of a session from the not-done pool (ids in a fixed order, so starting again does not reroll the
// fields). The first round deals the fields in the order of the data file — from the simpler to the harder ones
// (tools/roadblocks_resort.mjs); when a round is over the next one is shuffled. When fewer than `count` are left,
// a new shuffled pool continues the list.
// `pool` — the saved list, or anything but an array when the difficulty has not been dealt yet.
// -> {fields: [id...], pool: [id...]} (pool still holds the dealt fields until they are solved).
export function dealFields(pool, allIds, count, shuffle) {
  const valid = new Set(allIds);
  let list = Array.isArray(pool) ? pool.filter((id, i, a) => valid.has(id) && a.indexOf(id) === i) : allIds.slice();
  if (!list.length) list = shuffle(allIds);
  if (list.length < count) list = [...list, ...shuffle(allIds.filter(id => !list.includes(id)))];
  return {fields: list.slice(0, Math.min(count, allIds.length)), pool: list};
}
