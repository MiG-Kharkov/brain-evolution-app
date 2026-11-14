// Geometry (CGeometry_GameField) — port of the original figure comparison (see re/README.md):
//   normalize       FUN_4a0684c8   interior angles in 1/100 degree, drawing direction normalised
//   figureAccuracy  FUN_4a069f2c   best start alignment, percentage of tolerance
// Coordinates are compared in field pixels (geometry_game_field is 443x443) as integers.
// v2 (BUG-GEO-01): the angle sequences are aligned from every vertex, not only from the vertices in
// the top tenth of the figure height, so a slightly rotated exact copy is no longer scored 0 — the
// rules say that only the angles matter.
export const FIELD_PIXELS = 443;

export function toFieldPixels(points, fieldSize = 100) {
  return points.map(p => ({x: Math.round(p.x * FIELD_PIXELS / fieldSize), y: Math.round(p.y * FIELD_PIXELS / fieldSize)}));
}

export function normalize(points) {
  const n = points.length;
  const angles = points.map((cur, i) => {
    const prev = points[(i + n - 1) % n], next = points[(i + 1) % n];
    let degrees = (Math.atan2(prev.y - cur.y, prev.x - cur.x) - Math.atan2(next.y - cur.y, next.x - cur.x)) * 180 / Math.PI;
    if (degrees < 0) degrees += 360;
    return Math.trunc(degrees * 100);
  });
  const sum = list => list.reduce((total, value) => total + value, 0);
  const complement = angles.map(a => 36000 - a);
  // Keep the direction whose angle sum is the interior one; otherwise walk the figure backwards.
  // order: which vertex of `points` each angle belongs to.
  const order = points.map((_, i) => i);
  if (sum(angles) <= sum(complement)) return {angles, points: points.slice(), order};
  return {angles: complement.reverse(), points: points.slice().reverse(), order: order.reverse()};
}

// Indices of vertices within the top tenth of the figure height (screen y grows downwards) — the
// start vertices of the original; kept for the analytics scripts (allStarts: false).
export function topVertices(points) {
  const ys = points.map(p => p.y), min = Math.min(...ys), max = Math.max(...ys);
  let limit = min + Math.trunc(Math.abs(max - min) / 10);
  if (limit <= min) limit = min + 1;
  return ys.map((y, i) => (y >= min && y <= limit ? i : -1)).filter(i => i >= 0);
}

const rotate = (list, start) => list.slice(start).concat(list.slice(0, start));

// The comparison of the original: 0..100, the share of the tolerance left. missPercent is max_fig_diff_miss_percent
// for the difficulty (default 50). The game used it until 3.12.2; kept for the analytics that compare the two.
export function figureAccuracy(original, copy, missPercent = 50, {allStarts = true} = {}) {
  if (original.length !== copy.length || copy.length < 3) return 0;
  const a = normalize(original), b = normalize(copy);
  const every = list => list.map((_, i) => i);
  const starts = allStarts ? [0] : topVertices(a.points), userStarts = allStarts ? every(b.points) : topVertices(b.points);
  if (!starts.length) return 0;
  let error = Infinity;
  for (const i of starts) for (const j of userStarts) {
    const x = rotate(a.angles, i), y = rotate(b.angles, j);
    error = Math.min(error, x.reduce((total, value, k) => total + Math.abs(value - y[k]), 0));
  }
  if (!Number.isFinite(error)) return 0;
  const tolerance = Math.trunc(a.angles.reduce((total, v) => total + v, 0) * missPercent / 100);
  if (error >= tolerance) return 0;
  return Math.max(0, Math.min(100, 100 + Math.trunc(-error * 100 / tolerance)));
}

// How alike the copy is, on one scale for every level (3.12.3). Until then the game showed figureAccuracy() — the share
// of the tolerance of the level that is left — so one and the same drawing read differently on every level: a hexagon
// with 63° of angle differences in all (of 720°) was 86 % on Easy, 71 % on Medium and 57 % on Hard (owner: «выглядит
// прям очень похоже и уж точно непонятно, почему»).
//   accuracy  100 − the sum of the angle differences in percent of the sum of the angles of the figure, at the best
//             alignment, rounded down: the angles of the copy are on average that close to the original
//             (that hexagon: 91). No tolerance: how strict a level is, the bands say.
//   diffs     the difference of the angle at every vertex of the copy, in degrees (the view marks the big ones).
export function figureMatch(original, copy) {
  const n = original.length;
  if (n !== copy.length || n < 3) return {accuracy: 0, diffs: copy.map(() => 0)};
  const a = normalize(original), b = normalize(copy);
  let error = Infinity, shift = 0;
  for (let j = 0; j < n; j++) {
    const e = a.angles.reduce((total, value, k) => total + Math.abs(value - b.angles[(j + k) % n]), 0);
    if (e < error) { error = e; shift = j; }
  }
  const total = a.angles.reduce((sum, v) => sum + v, 0);
  const diffs = copy.map(() => 0);
  a.angles.forEach((value, k) => { diffs[b.order[(shift + k) % n]] = Math.abs(value - b.angles[(shift + k) % n]) / 100; });
  return {accuracy: Math.max(0, Math.min(100, Math.floor(100 - error * 100 / total))), diffs};
}

// The result band of a round (geometry_results_data): the first n = 1..5 with accuracy <= res_n_percents.
// Since 3.12.3 the accuracy is that of figureMatch() and the limits are set for every level in
// data/balance/geometry.json; they are the bands of the original moved to the new scale.
export function roundBand(results, diff, accuracy, value = (text, d) => Number(String(text).trim().split(/\s+/)[d + 1])) {
  const count = Number(results?.res_count) || 5;
  let band = count;
  for (let n = 1; n <= count; n++) if (accuracy <= value(results[`res_${n}_percents`], diff)) { band = n; break; }
  return {band, count, name: results[`res_${band}_name`] || '', points: value(results[`res_${band}_points`], diff) || 0};
}

// The figures of one game from the pool of its level (3.12.1, owner: «каждый раз всё повторяется… пару тренировок одно
// и то же»). Until then every game took `count` random figures of the pool, so two games in a row shared a figure more
// often than not. Now a pool is dealt in rounds: a game takes figures not shown yet in this round; when fewer are left
// than a game needs, the rest is shown and the game is filled from the figures shown before, but not from the last
// game, and those start the new round. state = {shown: [keys of this round], last: [keys of the last game]}.
export function dealFigures(state, keys, count, shuffle) {
  const shown = (Array.isArray(state?.shown) ? state.shown : []).filter(k => keys.includes(k));
  const last = (Array.isArray(state?.last) ? state.last : []).filter(k => keys.includes(k));
  // Not shown in this round; the figures of the last game (the rest of the round before, shown at its end) go last.
  const fresh = [...shuffle(keys.filter(k => !shown.includes(k) && !last.includes(k))), ...shuffle(keys.filter(k => !shown.includes(k) && last.includes(k)))];
  if (fresh.length >= count) {
    const figures = fresh.slice(0, count);
    return {figures, state: {shown: [...shown, ...figures], last: figures}};
  }
  const avoid = new Set([...fresh, ...last]);
  let fill = shuffle(keys.filter(k => !avoid.has(k)));
  if (fill.length < count - fresh.length) fill = fill.concat(shuffle(last.filter(k => !fresh.includes(k))));   // a pool smaller than two games
  fill = fill.slice(0, count - fresh.length);
  const figures = shuffle([...fresh, ...fill]);
  return {figures, state: {shown: fill, last: figures}};
}
