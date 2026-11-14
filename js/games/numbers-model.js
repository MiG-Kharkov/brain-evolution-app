// Numbers (CNumbers_GameField) — exact port of the original original game binary logic.
// Addresses refer to the decompiled image (see re/README.md):
//   createField   FUN_4a035d78   field generation
//   chooseDigit   FUN_4a037344   next task digit
//   startCell     FUN_4a038774   where the new number appears; field-cleared check
//   acceptMove    FUN_4a039580   placing the number
//   cellAtPoint   FUN_4a031ce0   touch -> nearest empty cell
// The field is 9x9; a cell is NONE (outside the playable rectangle), EMPTY or a digit 0..9.
export const SIZE = 9;
export const NONE = -1;
export const EMPTY = 10;
// Playable rectangle margins per difficulty (table at 0x4a2273c0 + 0x88 / + 0x94).
export const X_MARGIN = [1, 1, 0];
export const Y_MARGIN = [2, 1, 0];
// Minimum neighbour count preferred for the task digit (table at 0x4a2273c0 + 0xa0).
export const MIN_NEIGHBOURS = [2, 2, 3];

export { createRandom } from '../original.js';
const randomDigit = rand => { const d = Math.floor((rand() % 0x7fff) * 10 / 0x7fff); return d > 9 ? 0 : d; };
const randomIndex = (rand, count) => Math.min(count - 1, Math.floor((rand() % 0x7fff) * count / 0x7fff));

export const index = (x, y) => x * SIZE + y;
export const isEmpty = value => value === EMPTY;
export const isNumber = value => value >= 0 && value <= 9;

// The playable rectangle: margins of the original tables, or rules.numbers.fields [[columns, rows] per difficulty]
// (v3.3: hard is 9 × 7 with 35 digits instead of 9 × 9 with 49). Columns and rows are odd, 3…9.
export function margins(diff, fields = null) {
  const f = fields?.[diff];
  return f ? {mx: (SIZE - f[0]) / 2, my: (SIZE - f[1]) / 2} : {mx: X_MARGIN[diff] ?? 0, my: Y_MARGIN[diff] ?? 0};
}

export function createField(diff, rand, m = margins(diff)) {
  const field = Array(SIZE * SIZE).fill(NONE);
  const {mx, my} = m;
  for (let y = my; y < SIZE - my; y++) for (let x = mx; x < SIZE - mx; x++) field[index(x, y)] = EMPTY;
  // The outer ring of the rectangle stays empty; every inner cell gets a random digit.
  for (let y = my + 1; y < SIZE - 1 - my; y++) for (let x = mx + 1; x < SIZE - 1 - mx; x++) field[index(x, y)] = randomDigit(rand);
  return field;
}

// Sum and count of digits in the 3x3 window around (x, y).
export function neighbourhood(field, x, y) {
  let count = 0, sum = 0, zeros = 0;
  for (let yy = Math.max(0, y - 1); yy <= Math.min(SIZE - 1, y + 1); yy++)
    for (let xx = Math.max(0, x - 1); xx <= Math.min(SIZE - 1, x + 1); xx++) {
      const value = field[index(xx, yy)];
      if (!isNumber(value)) continue;
      count++; sum += value; if (value === 0) zeros++;
    }
  return {count, sum, zeros, digit: sum % 10};
}

export function chooseDigit(field, diff, rand) {
  // Candidate moves keyed like the original: count<<24 | digit<<16 | flags | x<<4 | y,
  // kept unique and sorted in descending key order.
  const keys = new Set(), digitUse = Array(10).fill(0);
  let withZero = 0, single = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (!isEmpty(field[index(x, y)])) continue;
    const {count, digit, zeros} = neighbourhood(field, x, y);
    if (!count) continue;
    const easy = zeros >= 1 && count <= 2;
    if (easy) withZero++;
    let flags = easy ? 0x100 : 0;
    if (count === 1) { single++; flags = easy ? 0x300 : 0x200; }
    digitUse[digit]++;
    keys.add((count << 24) | (digit << 16) | flags | (x << 4) | y);
  }
  if (!keys.size) return randomDigit(rand);
  const decode = key => ({count: key >>> 24, digit: (key >>> 16) & 0xff, flags: key & 0xf00});
  let chosen = [...keys].sort((a, b) => b - a).map(decode);
  let list = chosen.slice();
  if (list.length >= 2) {
    // Avoid digits that a lone neighbour or a zero-neighbourhood makes trivial.
    if (withZero < 1) withZero = single;
    if (withZero) {
      const zeroDigits = new Set(list.filter(c => c.flags & 0x100).map(c => c.digit));
      const singleDigits = new Set(list.filter(c => c.flags & 0x200).map(c => c.digit));
      if (singleDigits.size) {
        const filtered = list.filter(c => !singleDigits.has(c.digit));
        if (filtered.length > 1) chosen = filtered;
      }
      list = chosen.slice();
      if (list.length > 1 && zeroDigits.size) {
        const filtered = list.filter(c => !zeroDigits.has(c.digit));
        if (filtered.length > 1) chosen = filtered;
        list = chosen.slice();
      }
    }
  }
  let hardFiltered = false;
  if (diff === 2 && list.length > 1) {
    // Hard: drop digits that already appear in more than two places, most frequent first.
    const order = digitUse.map((n, d) => ({n, d})).sort((a, b) => b.n - a.n || b.d - a.d);
    for (const {n, d} of order) {
      if (n <= 2) continue;
      for (let i = list.length - 1; i >= 0 && list.length >= 2; i--) if (list[i].digit === d) list.splice(i, 1);
      if (list.length < 2) break;
    }
    if (list.length > 1) chosen = list.slice(); else hardFiltered = true;
  }
  if (!hardFiltered && list.length > 1) {
    const minimum = MIN_NEIGHBOURS[diff] ?? 2;
    if (list[0].count > 1) while (list.length > 1 && list[list.length - 1].count < minimum) list.pop();
    if (list.length > 1) chosen = list.slice();
  }
  return chosen[randomIndex(rand, chosen.length)].digit;
}

export function remaining(field) { return field.filter(isNumber).length; }
export function isCleared(field) { return !field.some(isNumber); }
// The new number always appears in the top-centre empty cell of the playable rectangle.
export function startCell(diff, m = margins(diff)) { return {x: 4, y: m.my}; }

export function acceptMove(field, x, y, digit) {
  if (!isEmpty(field[index(x, y)]) || !(digit >= 0 && digit <= 9)) return {valid: false};
  const {count, digit: sumDigit} = neighbourhood(field, x, y);
  if (!count) return {valid: false};
  if (sumDigit !== digit) return {valid: true, correct: false};
  const removed = [];
  for (let yy = Math.max(0, y - 1); yy <= Math.min(SIZE - 1, y + 1); yy++)
    for (let xx = Math.max(0, x - 1); xx <= Math.min(SIZE - 1, x + 1); xx++)
      if (isNumber(field[index(xx, yy)])) { removed.push(index(xx, yy)); field[index(xx, yy)] = EMPTY; }
  return {valid: true, correct: true, removed, count};
}

// Touch moves the new number to the tapped empty cell, or to the nearest empty cell.
export function cellAtPoint(field, px, py, cellWidth, cellHeight) {
  const x = Math.max(0, Math.min(SIZE - 1, Math.floor(px / cellWidth)));
  const y = Math.max(0, Math.min(SIZE - 1, Math.floor(py / cellHeight)));
  if (isEmpty(field[index(x, y)])) return {x, y};
  let best = null, bestDistance = Infinity;
  for (let cx = 0; cx < SIZE; cx++) for (let cy = 0; cy < SIZE; cy++) {
    if (!isEmpty(field[index(cx, cy)])) continue;
    const distance = (cx - x) ** 2 + (cy - y) ** 2;
    if (distance < bestDistance) { bestDistance = distance; best = {x: cx, y: cy}; }
  }
  return best;
}

// Keyboard cursor: step in a direction, wrapping around, to the next empty cell (FUN_4a0320f4).
export function stepCursor(field, x, y, dx, dy) {
  let cx = x, cy = y;
  for (let i = 0; i < SIZE * SIZE; i++) {
    cx = (cx + dx + SIZE) % SIZE; cy = (cy + dy + SIZE) % SIZE;
    if (isEmpty(field[index(cx, cy)])) return {x: cx, y: cy};
  }
  return {x, y};
}

// Result: elapsed seconds * time_penalty_arr[diff] + accumulated points (FUN_4a0b8270).
export function totalScore(points, seconds, timePenalty) {
  return Math.max(1, seconds) * timePenalty + points;
}
