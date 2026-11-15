// Guess Who (CAntHead_GameField) — exact port of the original round generator (see re/README.md):
//   createObject   FUN_4a07eecc   4 antennas (L,T,R,B), shape, texture, colour and a packed code
//   makeQuestion   FUN_4a080230   features from gen_var digits (1 antennas, 2 shape, 3 texture, 4 colour)
//   createRound    FUN_4a080c64   target + distractors that never satisfy the question, retried until
//                                 enough distractors share each asked feature (qa_gen_var)
export const COUNTS = {antennas: 7, shapes: 5, textures: 4, colors: 5};

const rnd = (rand, n) => n > 0 ? (rand() % 0x7fff) % n : 0;

// Packed like the original: colour+1 | (texture+1)<<4 | (shape+1)<<8 | antennaTypeMask<<16.
export function code(o) {
  const mask = o.antennas.reduce((m, t) => m | (1 << t), 0);
  return ((o.color + 1) & 0xf) | (((o.texture + 1) << 4) & 0xff) | (((o.shape + 1) & 0xf) << 8) | (mask << 16);
}

export function createPools(counts = COUNTS) {
  const range = n => Array.from({length: n}, (_, i) => i);
  return {color: range(counts.colors), shape: range(counts.shapes), texture: range(counts.textures), picked: {}};
}

// Target attributes come from pools so consecutive rounds avoid repeating them (FUN_4a08090c).
export function consumePools(pools, counts = COUNTS) {
  const total = {color: counts.colors, shape: counts.shapes, texture: counts.textures};
  for (const key of ['color', 'shape', 'texture']) {
    const index = pools.picked[key];
    if (index === undefined) continue;
    pools[key].splice(index, 1);
    if (!pools[key].length) pools[key] = Array.from({length: total[key]}, (_, i) => i);
  }
  pools.picked = {};
}

export function createObject(rand, question = 0, pools = null, counts = COUNTS) {
  for (let tries = 100; ; ) {
    const antennas = [0, 1, 2, 3].map(() => rnd(rand, counts.antennas));
    let shape, texture, color;
    if (pools) {
      pools.picked.shape = rnd(rand, pools.shape.length); shape = pools.shape[pools.picked.shape];
      pools.picked.texture = rnd(rand, pools.texture.length); texture = pools.texture[pools.picked.texture];
      pools.picked.color = rnd(rand, pools.color.length); color = pools.color[pools.picked.color];
    } else {
      shape = rnd(rand, counts.shapes); texture = rnd(rand, counts.textures); color = rnd(rand, counts.colors);
    }
    const object = {antennas, shape, texture, color};
    object.code = code(object);
    if (!question) return object;
    // A distractor must not contain every bit of the question (the original compares packed codes).
    if ((object.code & question) !== question) return object;
    if (--tries <= 0) return null;
  }
}

export function makeQuestion(target, features, maxFeatures, rand) {
  const parts = [0, 0, 0, 0]; // antennas mask, shape+1, texture+1, colour+1
  let digits = features || 1234, used = 0;
  for (let i = 0; i < 4; i++, digits = Math.trunc(digits / 10)) {
    const d = digits % 10;
    if (d === 1) parts[0] = target.code >>> 16;
    else if (d === 2) parts[1] = target.shape + 1;
    else if (d === 3) parts[2] = target.texture + 1;
    else if (d === 4) parts[3] = target.color + 1;
    else continue;
    used++;
  }
  for (; maxFeatures < used; maxFeatures++) {
    let slot;
    for (let tries = 100; tries > 0; tries--) { slot = Math.min(3, rnd(rand, 4)); if (parts[slot]) break; }
    parts[slot] = 0;
  }
  if (parts[0]) {
    const types = [];
    for (let t = 0; t < 16; t++) if (parts[0] & (1 << t)) types.push(t);
    parts[0] = 1 << types[Math.min(types.length - 1, rnd(rand, types.length))];
  }
  return (parts[3] & 0xf) | ((parts[2] & 0xf) << 4) | ((parts[1] & 0xf) << 8) | (parts[0] << 16);
}

export function decodeQuestion(q) {
  const mask = q >>> 16, shape = ((q >> 8) & 0xf) - 1, texture = ((q >> 4) & 0xf) - 1, color = (q & 0xf) - 1;
  return {antenna: mask ? Math.log2(mask & -mask) : -1, shape, texture, color};
}

// True when the object has every asked feature (the unique answer).
export function satisfies(object, q) {
  const d = decodeQuestion(q);
  return (d.antenna < 0 || object.antennas.includes(d.antenna)) && (d.shape < 0 || object.shape === d.shape)
    && (d.texture < 0 || object.texture === d.texture) && (d.color < 0 || object.color === d.color);
}

// genVar: [features, maxFeatures, objectCount, rounds]; qa: minimum distractors sharing [antenna, shape, texture, colour].
// v2: when no attempt meets qa, the attempt closest to it is used (v1 kept the last one, BUG-GW-05).
export function createRound(genVar, qa, pools, rand) {
  let best, bestFit = -1;
  for (let attempt = 0; attempt < 500; attempt++) {
    const target = createObject(rand, 0, pools);
    const question = makeQuestion(target, genVar[0], genVar[1], rand);
    const d = decodeQuestion(question);
    const shared = [d.antenna < 0 ? 1000 : 0, d.shape < 0 ? 1000 : 0, d.texture < 0 ? 1000 : 0, d.color < 0 ? 1000 : 0];
    const objects = [target];
    for (let i = 1; i < genVar[2]; i++) {
      const o = createObject(rand, question);
      if (!o) continue;
      if (((o.code >>> 16) & (question >>> 16)) !== 0) shared[0]++;
      if (o.shape === d.shape) shared[1]++;
      if (o.texture === d.texture) shared[2]++;
      if (o.color === d.color) shared[3]++;
      objects.push(o);
    }
    // Fit: the worst share of the required similar distractors (1 = qa met).
    const fit = Math.min(1, ...shared.map((n, i) => qa[i] > 0 ? n / qa[i] : 1));
    if (fit > bestFit) { best = {objects, target, question}; bestFit = fit; }
    if (fit >= 1) break;
  }
  consumePools(pools);
  return best;
}

// v2 layout (BUG-GW-01): a jittered grid. The objects take random cells of a cols × rows grid (3 × 4
// for up to 12 objects, 4 × 5 for up to 20) and are moved randomly inside their cell, so they never
// overlap and the target can be anywhere. Returns the field size in cells and, per object, the centre
// and size in cell units plus the cell (row, col) for keyboard moves.
export function layout(count, rand, {size = 0.86} = {}) {
  const cols = count <= 12 ? 3 : 4, rows = Math.max(Math.ceil(count / cols), count <= 12 ? 4 : 5);
  const cells = Array.from({length: cols * rows}, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) { const j = rnd(rand, i + 1); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  const free = (1 - size) / 2, jitter = () => (rnd(rand, 1001) / 1000 * 2 - 1) * free;
  return {cols, rows, size, items: cells.slice(0, count).map(cell => {
    const row = Math.floor(cell / cols), col = cell % cols;
    return {row, col, x: col + 0.5 + jitter(), y: row + 0.5 + jitter()};
  })};
}
