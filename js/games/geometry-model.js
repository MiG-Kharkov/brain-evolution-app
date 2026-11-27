// Geometry (CGeometry_GameField): how a copy is compared and how the figures of a game are made (no DOM).
//   figureMatch      the places of the vertices once the copy is moved and scaled onto the original (3.12.5)
//   roundBand        the grade of a round (geometry_results_data)
//   generateFigures  random figures by the rules of a level (3.12.6)
// The original compared the angles only (FUN_4a0684c8, FUN_4a069f2c, see re/README.md); its port and the angle
// measure of 3.12.3–3.12.4 are kept for the analytics in tools/analysis/geometry_angles.mjs.
// Field pixels: the original field (geometry_game_field) is 443 × 443; the view takes its cursor step and press radius
// in these pixels.
export const FIELD_PIXELS = 443;

// How close the vertices of the copy are to their places (3.12.5, the accuracy of the game). The copy is moved and
// scaled onto the original — least squares over the vertices, for every start vertex and both directions of
// drawing, so where and how big the copy is drawn does not matter. It is not turned: the tilt, like the proportions
// and the angles, is part of the copy.
//   e         the root mean square distance of the moved copy's vertices from their places, in "radii" of the
//             original (the root mean square distance of its vertices from its centre)
//   accuracy  100 − 200·e, rounded down, 0..100: 100 — every vertex in its place; 50 — the vertices are on average a
//             quarter of the radius away (a copy a quarter too wide ≈ 78, a copy turned by 5° ≈ 82)
//   offsets   the distance of every vertex of the copy (drawing order) from its place, in radii
//   aligned   the copy moved and scaled onto the original (drawing order) — what the comparison shows
// The unit of the coordinates does not matter (field units of 0..100 in the game).
export function figureMatch(original, copy) {
  const n = original.length;
  if (n !== copy.length || n < 3) return {accuracy: 0, e: 1, offsets: copy.map(() => 1), aligned: copy.map(p => ({...p}))};
  const centre = list => ({x: list.reduce((t, p) => t + p.x, 0) / n, y: list.reduce((t, p) => t + p.y, 0) / n});
  const mo = centre(original), mc = centre(copy);
  const O = original.map(p => ({x: p.x - mo.x, y: p.y - mo.y})), C = copy.map(p => ({x: p.x - mc.x, y: p.y - mc.y}));
  const radius2 = O.reduce((t, p) => t + p.x * p.x + p.y * p.y, 0) / n;
  const size2 = C.reduce((t, p) => t + p.x * p.x + p.y * p.y, 0);
  let best = null;
  for (const dir of [1, -1]) for (let start = 0; start < n; start++) {
    // vertex k of the original takes vertex at(k) of the copy
    const at = k => ((start + dir * k) % n + n) % n;
    let dot = 0;
    for (let k = 0; k < n; k++) dot += C[at(k)].x * O[k].x + C[at(k)].y * O[k].y;
    const scale = size2 > 1e-9 ? Math.max(0, dot / size2) : 0;
    let sum = 0;
    for (let k = 0; k < n; k++) sum += (scale * C[at(k)].x - O[k].x) ** 2 + (scale * C[at(k)].y - O[k].y) ** 2;
    if (!best || sum < best.sum) best = {sum, scale, at};
  }
  const e = Math.sqrt(best.sum / n / radius2), radius = Math.sqrt(radius2);
  const aligned = C.map(p => ({x: mo.x + best.scale * p.x, y: mo.y + best.scale * p.y}));
  const offsets = copy.map(() => 0);
  for (let k = 0; k < n; k++) { const i = best.at(k); offsets[i] = Math.hypot(aligned[i].x - original[k].x, aligned[i].y - original[k].y) / radius; }
  return {accuracy: Math.max(0, Math.min(100, Math.floor(100 - 200 * e + 1e-9))), e, offsets, aligned};
}

// The result band of a round (geometry_results_data): the first n = 1..5 with accuracy <= res_n_percents.
// The accuracy is that of figureMatch(); the limits of every level are set in data/balance/geometry.json.
export function roundBand(results, diff, accuracy, value = (text, d) => Number(String(text).trim().split(/\s+/)[d + 1])) {
  const count = Number(results?.res_count) || 5;
  let band = count;
  for (let n = 1; n <= count; n++) if (accuracy <= value(results[`res_${n}_percents`], diff)) { band = n; break; }
  return {band, count, name: results[`res_${band}_name`] || '', points: value(results[`res_${band}_points`], diff) || 0};
}

// ---------------------------------------------------------------- the figures of a game (3.12.6)
// Every figure is made anew for every game (owner: «если это одно и то же повторяется каждую игру, даже если оно
// перемешивается, это вообще не годится»). Until 3.12.5 a level had a fixed pool (12 / 14 / 15 figures) dealt in
// rounds, so the same figures came back every few games. A kind is a rule that makes a random figure; rules.geometry
// (data/balance/geometry.json) gives the kinds of every level with their weights, the grid the vertices sit on, the
// shortest edge and how often one kind may come in a game. A figure is kept only if it is a simple polygon inside the
// field (10…90), every edge is at least min_edge long, every angle is at least min_angle and at least 20° away from a straight
// line, no vertex is closer than 6 to an edge it does not belong to, its box is at least 30 × 30, it has as many
// reflex (inward) vertices as its kind asks for (none for the convex kinds), and it is not like another figure of the
// same game (figureMatch below 80).
export const FIGURE_KINDS = ['triangle', 'rectangle', 'trapezoid', 'parallelogram', 'kite', 'quad', 'dart', 'pentagon', 'hexagon',
  'ell', 'concave5', 'concave6', 'notched', 'concave7', 'star'];
export const DEFAULT_FIGURE_RULES = {grid: [10, 10, 5], min_edge: [20, 15, 10], min_angle: [30, 35, 25], per_game: [2, 3, 2],
  kinds: [{triangle: 8, rectangle: 1, trapezoid: 1, parallelogram: 1, kite: 1}, {quad: 7, dart: 3},
    {pentagon: 3, hexagon: 2, ell: 2, concave5: 2, concave6: 2, notched: 1, concave7: 1, star: 1}]};
const LO = 10, HI = 90;
const between = (rand, a, b) => a + (b - a) * rand();
const count = (rand, a, b) => (b < a ? a : a + Math.floor(rand() * (b - a + 1)));   // a..b
const snap = (v, grid) => Math.min(HI, Math.max(LO, Math.round(v / grid) * grid));
const at = (x, y) => ({x, y});
// a box of w × h (multiples of the grid) at a random place of the field
function place(rand, grid, w, h) {
  return {x: LO + grid * count(rand, 0, Math.floor((HI - LO - w) / grid)), y: LO + grid * count(rand, 0, Math.floor((HI - LO - h) / grid))};
}
const size = (rand, grid, a, b) => { const lo = Math.ceil(a / grid); return grid * count(rand, lo, Math.max(lo, Math.floor(b / grid))); };

// symmetric shapes of Easy, sides along the grid
function rectangle(rand, grid) {
  const w = size(rand, grid, 30, 70), h = size(rand, grid, 30, 70), o = place(rand, grid, w, h);
  return [at(o.x, o.y), at(o.x + w, o.y), at(o.x + w, o.y + h), at(o.x, o.y + h)];
}
function trapezoid(rand, grid) {
  const w = size(rand, grid, 40, 80), h = size(rand, grid, 30, 60), d = size(rand, grid, 10, (w - 20) / 2), o = place(rand, grid, w, h);
  const top = [at(o.x + d, o.y), at(o.x + w - d, o.y)], bottom = [at(o.x + w, o.y + h), at(o.x, o.y + h)];
  return rand() < 0.5 ? [...top, ...bottom] : [at(o.x, o.y), at(o.x + w, o.y), at(o.x + w - d, o.y + h), at(o.x + d, o.y + h)];
}
function parallelogram(rand, grid) {
  const w = size(rand, grid, 30, 60), h = size(rand, grid, 30, 60), d = size(rand, grid, 10, 30), o = place(rand, grid, w + d, h);
  return rand() < 0.5 ? [at(o.x + d, o.y), at(o.x + d + w, o.y), at(o.x + w, o.y + h), at(o.x, o.y + h)]
    : [at(o.x, o.y), at(o.x + w, o.y), at(o.x + w + d, o.y + h), at(o.x + d, o.y + h)];
}
function kite(rand, grid) {
  const half = size(rand, grid, 15, 35), long = size(rand, grid, 40, 80), cross = size(rand, grid, 10, long - 20);
  const upright = rand() < 0.5, w = 2 * half, h = long, o = upright ? place(rand, grid, w, h) : place(rand, grid, h, w);
  return upright ? [at(o.x + half, o.y), at(o.x + w, o.y + cross), at(o.x + half, o.y + h), at(o.x, o.y + cross)]
    : [at(o.x, o.y + half), at(o.x + cross, o.y), at(o.x + h, o.y + half), at(o.x + cross, o.y + w)];
}
// vertices around a centre: random gaps of angle, an outer radius, `inner` vertices pulled in (not next to each other)
function radial(n, inner = 0, star = false) {
  return (rand, grid) => {
    const r = star ? between(rand, 32, 38) : between(rand, 26, 38), stretch = Math.exp(between(rand, -0.45, 0.45));
    const rx = Math.min(39, r * Math.sqrt(stretch)), ry = Math.min(39, r / Math.sqrt(stretch));
    const cx = between(rand, LO + rx, HI - rx), cy = between(rand, LO + ry, HI - ry);
    const gaps = Array.from({length: n}, () => (star ? between(rand, 0.85, 1.15) : between(rand, 0.55, 1.45)));
    const total = gaps.reduce((t, v) => t + v, 0);
    const pulled = new Set();
    if (star) for (let i = 1; i < n; i += 2) pulled.add(i);
    for (let tries = 0; pulled.size < inner && tries < 50; tries++) {
      const i = Math.floor(rand() * n);
      if (!pulled.has((i + 1) % n) && !pulled.has((i + n - 1) % n)) pulled.add(i);
    }
    let angle = rand() * 2 * Math.PI;
    return gaps.map((gap, i) => {
      angle += gap / total * 2 * Math.PI;
      const k = pulled.has(i) ? (star ? between(rand, 0.45, 0.6) : between(rand, 0.3, 0.55)) : between(rand, 0.85, 1);
      return at(snap(cx + rx * k * Math.cos(angle), grid), snap(cy + ry * k * Math.sin(angle), grid));
    });
  };
}
// an arrowhead: a triangle whose base is pulled in towards the opposite vertex
function dart(rand, grid) {
  const tri = radial(3)(rand, grid), k = count(rand, 0, 2), A = tri[k], B = tri[(k + 1) % 3], C = tri[(k + 2) % 3];
  const t = between(rand, 0.25, 0.5), shift = between(rand, -0.15, 0.15);
  const M = {x: (B.x + C.x) / 2 + shift * (C.x - B.x), y: (B.y + C.y) / 2 + shift * (C.y - B.y)};
  return [A, B, at(snap(M.x + t * (A.x - M.x), grid), snap(M.y + t * (A.y - M.y), grid)), C];
}
// a box with corner notches (an L: 6 vertices; two corners or a notch in a side: 8), sides along the grid
function orthogonal(cuts) {
  return (rand, grid) => {
    const w = size(rand, grid, 40, 70), h = size(rand, grid, 40, 70), o = place(rand, grid, w, h);
    let pts = [at(o.x, o.y), at(o.x + w, o.y), at(o.x + w, o.y + h), at(o.x, o.y + h)];
    const unit = (a, b) => ({x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y)});
    const corner = (list, i) => {
      const P = list[(i + list.length - 1) % list.length], C = list[i], N = list[(i + 1) % list.length];
      const din = unit(P, C), dout = unit(C, N), lin = Math.abs(C.x - P.x) + Math.abs(C.y - P.y), lout = Math.abs(N.x - C.x) + Math.abs(N.y - C.y);
      const a = size(rand, grid, 0.3 * lin, 0.6 * lin), b = size(rand, grid, 0.3 * lout, 0.6 * lout);
      const A = at(C.x - din.x * a, C.y - din.y * a), B = at(C.x + dout.x * b, C.y + dout.y * b);
      return [...list.slice(0, i), A, at(A.x + dout.x * b, A.y + dout.y * b), B, ...list.slice(i + 1)];
    };
    if (cuts === 1) return corner(pts, count(rand, 0, 3));
    if (rand() < 0.5) {   // two corners; the later one first, so that the index of the earlier one stays
      const first = count(rand, 0, 3), second = (first + count(rand, 1, 3)) % 4;
      return corner(corner(pts, Math.max(first, second)), Math.min(first, second));
    }
    const i = count(rand, 0, 3), C = pts[i], N = pts[(i + 1) % 4], dir = unit(C, N), inward = {x: -dir.y, y: dir.x};
    const len = Math.abs(N.x - C.x) + Math.abs(N.y - C.y), s1 = size(rand, grid, 0.2 * len, 0.4 * len), s2 = size(rand, grid, s1 + 0.2 * len, 0.8 * len);
    const depth = size(rand, grid, 15, 0.5 * (dir.x ? h : w));
    const E = s => at(C.x + dir.x * s, C.y + dir.y * s), F = s => at(C.x + dir.x * s + inward.x * depth, C.y + dir.y * s + inward.y * depth);
    pts = [...pts.slice(0, i + 1), E(s1), F(s1), F(s2), E(s2), ...pts.slice(i + 1)];
    return pts;
  };
}
const MAKERS = {triangle: radial(3), rectangle, trapezoid, parallelogram, kite, quad: radial(4), dart,
  pentagon: radial(5), hexagon: radial(6), ell: orthogonal(1), concave5: radial(5, 1), concave6: radial(6, 2),
  notched: orthogonal(2), concave7: radial(7, 2), star: radial(8, 0, true)};
// reflex vertices of every kind (the others are convex)
const REFLEX = {dart: 1, concave5: 1, concave6: 2, concave7: 2, star: 4, ell: 1, notched: 2};
// a figure of every kind that passes the checks of every level it is used on (the dart: tips of 37°, for the 35° of
// Medium), in case the random ones keep failing
const SPARE = {triangle: [[40, 10], [10, 60], [90, 60]], rectangle: [[20, 30], [80, 30], [80, 70], [20, 70]],
  trapezoid: [[25, 70], [75, 70], [60, 35], [40, 35]], parallelogram: [[15, 70], [65, 70], [85, 35], [35, 35]],
  kite: [[50, 10], [80, 40], [50, 90], [20, 40]], quad: [[15, 35], [75, 15], [85, 65], [25, 85]], dart: [[50, 20], [10, 80], [50, 65], [90, 80]],
  pentagon: [[20, 70], [15, 35], [50, 15], [85, 40], [70, 80]], hexagon: [[15, 50], [30, 20], [70, 20], [85, 50], [70, 80], [30, 80]],
  ell: [[20, 20], [20, 80], [80, 80], [80, 55], [45, 55], [45, 20]], concave5: [[30, 20], [40, 50], [30, 80], [70, 80], [70, 20]],
  concave6: [[15, 20], [50, 40], [85, 20], [85, 80], [50, 60], [15, 80]], notched: [[20, 20], [80, 20], [80, 40], [60, 40], [60, 80], [40, 80], [40, 40], [20, 40]],
  concave7: [[25, 60], [25, 15], [65, 30], [50, 40], [75, 65], [60, 75], [40, 50]], star: [[50, 10], [60, 40], [90, 50], [60, 60], [50, 90], [40, 60], [10, 50], [40, 40]]};

// The checks of a figure (see above).
export function figureOk(pts, {minEdge = 10, minAngle = 25, straight = 20, gap = 6, box = 30, reflex = null} = {}) {
  const n = pts.length;
  if (n < 3 || pts.some(p => p.x < LO || p.x > HI || p.y < LO || p.y > HI)) return false;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  if (Math.max(...xs) - Math.min(...xs) < box || Math.max(...ys) - Math.min(...ys) < box) return false;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; if (Math.hypot(b.x - a.x, b.y - a.y) < minEdge) return false; }
  // turns at the vertices; their sum is ±360° for a simple polygon, its sign is the direction of drawing
  const turns = pts.map((cur, i) => {
    const prev = pts[(i + n - 1) % n], next = pts[(i + 1) % n];
    const e1 = {x: cur.x - prev.x, y: cur.y - prev.y}, e2 = {x: next.x - cur.x, y: next.y - cur.y};
    return Math.atan2(e1.x * e2.y - e1.y * e2.x, e1.x * e2.x + e1.y * e2.y) * 180 / Math.PI;
  });
  const sum = turns.reduce((t, v) => t + v, 0);
  if (Math.abs(Math.abs(sum) - 360) > 1) return false;
  let inward = 0;
  for (const turn of turns) {
    const inside = 180 - Math.sign(sum) * turn;   // the interior angle
    if (inside < minAngle || inside > 360 - minAngle || Math.abs(inside - 180) < straight) return false;
    if (inside > 180) inward++;
  }
  if (reflex !== null && inward !== reflex) return false;
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const onSegment = (a, b, p) => Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y);
  const meets = (a, b, c, d) => {   // the segments cross or touch (collinear ones only if they overlap)
    const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    return (d1 === 0 && onSegment(c, d, a)) || (d2 === 0 && onSegment(c, d, b)) || (d3 === 0 && onSegment(a, b, c)) || (d4 === 0 && onSegment(a, b, d));
  };
  const toSegment = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue;   // edges with a common vertex
    if (meets(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return false;
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (j === i || (j + 1) % n === i) continue;   // the edges of vertex i
    if (toSegment(pts[i], pts[j], pts[(j + 1) % n]) < gap) return false;
  }
  return true;
}

// The figures of one game of a level (0 Easy, 1 Medium, 2 Hard): [{kind, points}].
export function generateFigures(rules, level, figures, rand = Math.random) {
  const r = rules || {}, d = DEFAULT_FIGURE_RULES;
  const kinds = Object.entries(r.kinds?.[level] || d.kinds[level]).filter(([kind, w]) => MAKERS[kind] && w > 0);
  const grid = r.grid?.[level] ?? d.grid[level], minEdge = r.min_edge?.[level] ?? d.min_edge[level], cap = r.per_game?.[level] ?? d.per_game[level];
  const minAngle = r.min_angle?.[level] ?? d.min_angle[level];
  const out = [], used = {};
  for (let k = 0; k < figures; k++) {
    const open = kinds.filter(([kind]) => (used[kind] || 0) < cap), list = open.length ? open : kinds;
    let x = rand() * list.reduce((t, [, w]) => t + w, 0), kind = list.at(-1)[0];
    for (const [name, w] of list) if ((x -= w) < 0) { kind = name; break; }
    let points = null;
    for (let attempt = 0; attempt < 400 && !points; attempt++) {
      const p = MAKERS[kind](rand, grid);
      if (figureOk(p, {minEdge, minAngle, reflex: REFLEX[kind] || 0}) && out.every(f => f.points.length !== p.length || figureMatch(f.points, p).accuracy < 80)) points = p;
    }
    points ||= SPARE[kind].map(([px, py]) => at(px, py));
    used[kind] = (used[kind] || 0) + 1;
    out.push({kind, points});
  }
  return out;
}
