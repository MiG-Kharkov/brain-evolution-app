// Quadronica (CZnax): find rectangles whose four corners share a colour. Marking two opposite
// corners is enough; marking the corners of a side first is allowed too. v2 rules (docs/decisions.md):
// the field size depends on the difficulty, only the cells inside a removed rectangle are refilled
// (nothing falls), the generator keeps at least `min_rects` rectangles on the field, a rectangle
// scores cost × area plus a size bonus, the score never drops below 0. In the test the Brain Mark
// parameters of znax_game_field (bm_diff_max_time, sp_points_*) apply.
import { RestoredGame, tr, escapeHTML } from './restored-game.js';
import { arrayValue } from '../original.js';
import { audio } from '../audio.js';
import { fmt } from '../core/dom.js';

// v2 defaults; data/balance/quadronica.json (rules.quadronica) overrides them.
// fields: [columns, rows] per difficulty (portrait); colors: colours per difficulty;
// min_rects: rectangles the field always offers; size_bonus: share of the cell cost paid per cell above 4.
// test_field / test_colors: the field of the Brain Mark test (v2.1: the medium field, tiles stay large on a phone).
export const DEFAULT_RULES = {fields: [[6, 8], [7, 10], [8, 11]], colors: [4, 5, 5], test_field: [7, 10], test_colors: 5, min_rects: 3, size_bonus: 0.5};
const REROLLS = 60;

// ---------------------------------------------------------------- model (pure, used by the simulations)
export function settings(config, diff, inTest) {
  const rules = {...DEFAULT_RULES, ...(config.rules?.quadronica || {})};
  const field = config.games.znax_game_field, d = Math.min(Math.max(diff, 0), 2), p = inTest ? 'sp_' : '';
  const [cols, rows] = inTest ? rules.test_field : rules.fields[d];
  return {cols, rows, colors: inTest ? rules.test_colors : rules.colors[d], minRects: rules.min_rects, bonus: rules.size_bonus,
    time: arrayValue(field[inTest ? 'bm_diff_max_time' : 'diff_max_time'], d),
    cost: arrayValue(field[`${p}points_good_move_arr`], d),
    penalty: Math.abs(arrayValue(field[`${p}points_wrong_move_arr`], d))};
}

// Points for a w × h rectangle: cost per cell × area plus bonus × cost for every cell above four.
export const rectPoints = (w, h, cost, bonus) => w * h * cost + Math.round(bonus * cost * (w * h - 4));

// Every rectangle (sides ≥ 2 cells) whose corners share a colour; grid is flat, index = r * cols + c.
export function findRects(grid, cols, rows, limit = Infinity) {
  const list = [];
  for (let r1 = 0; r1 < rows - 1; r1++) for (let r2 = r1 + 1; r2 < rows; r2++) {
    const a = r1 * cols, b = r2 * cols;
    for (let c1 = 0; c1 < cols - 1; c1++) {
      const k = grid[a + c1];
      if (grid[b + c1] !== k) continue;
      for (let c2 = c1 + 1; c2 < cols; c2++) {
        if (grid[a + c2] !== k || grid[b + c2] !== k) continue;
        list.push({r1, c1, r2, c2, color: k});
        if (list.length >= limit) return list;
      }
    }
  }
  return list;
}
export const countRects = (grid, cols, rows, limit) => findRects(grid, cols, rows, limit).length;

const roll = (rand, n) => Math.floor(rand() * n);

// Gives the cells one colour on the four corners of a random rectangle inside the area.
function plant(grid, cols, area, colors, rand) {
  const pick = (lo, hi) => { const a = lo + roll(rand, hi - lo); return [a, a + 1 + roll(rand, hi - a)]; };
  const [r1, r2] = pick(area.r1, area.r2), [c1, c2] = pick(area.c1, area.c2), k = roll(rand, colors);
  for (const i of [r1 * cols + c1, r1 * cols + c2, r2 * cols + c1, r2 * cols + c2]) grid[i] = k;
}

// A new random field with at least minRects rectangles.
export function createBoard(cols, rows, colors, minRects, rand = Math.random) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const grid = Array.from({length: cols * rows}, () => roll(rand, colors));
    if (countRects(grid, cols, rows, minRects) >= minRects) return grid;
  }
  const grid = Array.from({length: cols * rows}, () => roll(rand, colors));
  while (countRects(grid, cols, rows, minRects) < minRects) plant(grid, cols, {r1: 0, r2: rows - 1, c1: 0, c2: cols - 1}, colors, rand);
  return grid;
}

// Refills only the cells inside the removed rectangle. The new colours are drawn again (up to
// REROLLS times; in the second half a rectangle is also planted inside the area) until the field
// offers minRects rectangles. Otherwise the best draw is kept, and if that one has no rectangle at
// all, one is planted inside the area. Returns the refilled indices.
export function refill(grid, cols, rows, area, colors, minRects, rand = Math.random) {
  const cells = [];
  for (let r = area.r1; r <= area.r2; r++) for (let c = area.c1; c <= area.c2; c++) cells.push(r * cols + c);
  let best = null, bestCount = -1;
  for (let t = 0; t < REROLLS; t++) {
    for (const i of cells) grid[i] = roll(rand, colors);
    if (t >= REROLLS / 2) plant(grid, cols, area, colors, rand);
    const n = countRects(grid, cols, rows, minRects);
    if (n >= minRects) return cells;
    if (n > bestCount) { bestCount = n; best = cells.map(i => grid[i]); }
  }
  cells.forEach((i, k) => { grid[i] = best[k]; });
  if (bestCount < 1) plant(grid, cols, area, colors, rand);
  return cells;
}

// ---------------------------------------------------------------- view
const COLOR_NAMES = () => [tr('красный', 'red'), tr('жёлтый', 'yellow'), tr('зелёный', 'green'), tr('синий', 'blue'),
  tr('фиолетовый', 'purple'), tr('бирюзовый', 'teal')];
const ARROWS = {ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1]};

export class QuadronicaGame extends RestoredGame {
  id = 'quadronica';
  get title() { return tr('Квадроника', 'Quadronica'); }
  // Stats of the finished game for the achievements (js/achievements.js).
  // `bestMove`: the most points one rectangle brought (the «Big catch» achievement); hinted rectangles bring none.
  feats() { return {perfect: this.mistakes === 0 && this.found >= 15, mistakes: this.mistakes, found: this.found, bestMove: this.bestMove || 0, hints: this.hints || 0}; }

  async init(difficulty = 'easy') {
    if (!await this.begin(difficulty)) return;
    this.level = settings(this.config, this.diff, this.inTest);
    const {cols, rows, colors, minRects, time} = this.level;
    this.grid = createBoard(cols, rows, colors, minRects);
    Object.assign(this, {marks: [], found: 0, mistakes: 0, earned: 0, lost: 0, largest: null, left: time, hinted: null, hints: 0, bestMove: 0,
      cursor: Math.floor(rows / 2) * cols + Math.floor(cols / 2)});
    this.render();
    this.tick(() => this.second());
    this.keyHandler = event => this.onKey(event);
    window.addEventListener('keydown', this.keyHandler);
  }

  render() {
    const {cols, rows} = this.level, names = COLOR_NAMES();
    const cells = this.grid.map((k, i) => `<button class="quad-cell" data-i="${i}" tabindex="${i === this.cursor ? 0 : -1}" aria-label="${escapeHTML(this.cellLabel(i, names))}" aria-pressed="false"><span class="quad-tile" data-color="${k}"></span></button>`).join('');
    this.frame(this.title, `
      <div class="quad-wrap">
        <div class="quad-time" aria-hidden="true"><i data-time></i></div>
        <p class="board-note quad-note" data-note></p>
        <div class="quad-board" data-board role="group" aria-label="${escapeHTML(tr('Поле', 'Field'))}" style="--cols:${cols};--rows:${rows}">${cells}</div>
      </div>`, this.hintButton() ? `<div class="quad-tools">${this.hintButton()}</div>` : '');
    this.bindHint();
    this.board = this.container.querySelector('[data-board]');
    this.board.addEventListener('click', event => {
      const cell = event.target.closest('.quad-cell');
      if (cell) this.press(Number(cell.dataset.i));
    });
    this.board.addEventListener('animationend', event => { if (event.target === this.board) this.board.classList.remove('is-wrong'); });
    this.setClock(this.left);
    this.drawTime();
    this.drawMarks();
    this.updateScore();
    this.drawStatus();
  }

  cellLabel(i, names = COLOR_NAMES()) {
    const {cols} = this.level;
    return `${names[this.grid[i]]}, ${tr('строка', 'row')} ${Math.floor(i / cols) + 1}, ${tr('столбец', 'column')} ${i % cols + 1}`;
  }
  cell(i) { return this.board?.children[i]; }
  drawStatus() { this.setStatus(`${tr('Найдено', 'Found')}: ${this.found}`); }

  drawTime() {
    const bar = this.container.querySelector('[data-time]');
    if (!bar) return;
    bar.style.transform = `scaleX(${Math.max(0, this.left / this.level.time)})`;
    bar.parentElement.classList.toggle('low', this.left <= 10);
  }

  second() {
    this.left = Math.max(0, this.left - 1);
    this.elapsed++;
    this.setClock(this.left);
    this.drawTime();
    if (this.left <= 0) this.end();
    else if (this.left <= 5) audio.play('tick');
  }

  drawMarks() {
    const note = this.container.querySelector('[data-note]');
    // The hint teaches the v2 rule: after the first corner the opposite one is enough.
    if (note) note.textContent = this.marks.length
      ? tr('Теперь — противоположный угол того же цвета', 'Now the opposite corner of the same colour')
      : tr('Найдите прямоугольник с углами одного цвета', 'Find a rectangle with corners of one colour');
    const set = new Set(this.marks);
    for (let i = 0; i < this.grid.length; i++) {
      const el = this.cell(i);
      el.classList.toggle('is-marked', set.has(i));
      el.setAttribute('aria-pressed', String(set.has(i)));
    }
  }

  moveCursor(index, focus) {
    const old = this.cell(this.cursor);
    if (old) old.tabIndex = -1;
    this.cursor = index;
    const el = this.cell(index);
    if (!el) return;
    el.tabIndex = 0;
    if (focus) el.focus({preventScroll: false});
  }

  press(i) {
    if (!this.playable) return;
    const {cols} = this.level;
    this.moveCursor(i, false);
    const at = this.marks.indexOf(i);
    if (at >= 0) { this.marks.splice(at, 1); audio.play('click'); this.drawMarks(); return; }
    const color = this.grid[i];
    if (this.marks.length && this.grid[this.marks[0]] !== color) return this.wrong(i);
    this.marks.push(i);
    const rs = [...new Set(this.marks.map(m => Math.floor(m / cols)))].sort((a, b) => a - b);
    const cs = [...new Set(this.marks.map(m => m % cols))].sort((a, b) => a - b);
    if (rs.length > 2 || cs.length > 2) return this.wrong(i);
    if (rs.length === 2 && cs.length === 2) {
      // Two opposite corners are marked: the rectangle is defined.
      const [r1, r2] = rs, [c1, c2] = cs;
      const corners = [r1 * cols + c1, r1 * cols + c2, r2 * cols + c1, r2 * cols + c2];
      return corners.every(k => this.grid[k] === color) ? this.hit({r1, c1, r2, c2}) : this.wrong(i);
    }
    audio.play('znaxMark');
    this.drawMarks();
  }

  // Shows one rectangle (the smallest, the easiest to see): pulsing corners and a dashed frame. It scores 0.
  hint() {
    const {cols, rows} = this.level;
    const list = findRects(this.grid, cols, rows);
    if (!list.length) return;
    const size = r => (r.r2 - r.r1 + 1) * (r.c2 - r.c1 + 1);
    const r = list.reduce((a, b) => (size(b) < size(a) ? b : a));
    this.clearHint();
    this.hinted = r; this.hints++;
    this.marks = []; this.drawMarks();
    for (const i of [r.r1 * cols + r.c1, r.r1 * cols + r.c2, r.r2 * cols + r.c1, r.r2 * cols + r.c2]) this.cell(i)?.classList.add('is-hint');
    const frame = document.createElement('div');
    frame.className = 'quad-hint';
    frame.style.gridArea = `${r.r1 + 1} / ${r.c1 + 1} / ${r.r2 + 2} / ${r.c2 + 2}`;
    this.board.append(frame);
    const note = this.container.querySelector('[data-note]');
    if (note) note.textContent = tr('Вот прямоугольник: нажмите два противоположных угла. Очков за него не будет', 'Here is a rectangle: tap two opposite corners. It brings no points');
  }
  clearHint() {
    this.board?.querySelectorAll('.quad-hint').forEach(el => el.remove());
    this.board?.querySelectorAll('.is-hint').forEach(el => el.classList.remove('is-hint'));
  }

  hit(area) {
    const {cols, rows, colors, minRects, cost, bonus} = this.level;
    const h0 = this.hinted, fromHint = h0 && h0.r1 === area.r1 && h0.r2 === area.r2 && h0.c1 === area.c1 && h0.c2 === area.c2;
    this.hinted = null; this.clearHint();
    const w = area.c2 - area.c1 + 1, h = area.r2 - area.r1 + 1, points = fromHint ? 0 : rectPoints(w, h, cost, bonus);
    this.score += points; this.earned += points; this.found++;
    this.bestMove = Math.max(this.bestMove, points);
    if (!this.largest || w * h > this.largest.w * this.largest.h) this.largest = {w, h};
    this.marks = [];
    audio.play('good');
    const before = this.grid.slice();
    const changed = refill(this.grid, cols, rows, area, colors, minRects);
    const names = COLOR_NAMES();
    // The removal is visible but never blocks the next tap (v3.3): the old tiles burst as ghosts above the cells
    // (no pointer events), the new ones pop in right behind them, in a wave from the corner of the rectangle.
    for (const i of changed) {
      const el = this.cell(i), tile = el?.firstElementChild;
      if (!tile) continue;
      el.querySelectorAll('.quad-ghost').forEach(old => old.remove());
      const ghost = document.createElement('span');
      ghost.className = 'quad-tile quad-ghost';
      ghost.dataset.color = before[i];
      ghost.addEventListener('animationend', () => ghost.remove(), {once: true});
      el.append(ghost);
      tile.dataset.color = this.grid[i];
      el.setAttribute('aria-label', this.cellLabel(i, names));
      const wave = (Math.floor(i / cols) - area.r1) + (i % cols - area.c1);
      el.style.setProperty('--quad-delay', `${110 + Math.min(wave, 9) * 14}ms`);
      el.classList.remove('is-new'); void el.offsetWidth; el.classList.add('is-new');
    }
    this.drawMarks();
    this.overlay('quad-hit', area);
    this.badge(area, points ? `+${fmt(points)}` : tr('Подсказка', 'Hint'), 'good');
    this.updateScore();
    this.drawStatus();
  }

  wrong(i) {
    const {cols, penalty} = this.level;
    const lost = Math.min(this.score, penalty);
    this.score -= lost; this.lost += lost; this.mistakes++;
    this.marks = [];
    audio.play('wrong');
    this.drawMarks();
    this.board.classList.remove('is-wrong'); void this.board.offsetWidth; this.board.classList.add('is-wrong');
    const r = Math.floor(i / cols), c = i % cols;
    if (lost > 0) this.badge({r1: r, c1: c, r2: r, c2: c}, `−${fmt(lost)}`, 'bad');
    this.updateScore();
  }

  // A short-lived element over the grid area of the rectangle (removed when its animation ends).
  overlay(className, area, text = '') {
    const el = document.createElement('div');
    el.className = className;
    el.style.gridArea = `${area.r1 + 1} / ${area.c1 + 1} / ${area.r2 + 2} / ${area.c2 + 2}`;
    if (text) el.textContent = text;
    el.addEventListener('animationend', () => el.remove(), {once: true});
    this.board.append(el);
    return el;
  }
  badge(area, text, kind) { this.overlay(`quad-badge ${kind}`, area, text).setAttribute('aria-hidden', 'true'); }

  onKey(event) {
    if (!this.playable || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target : document.body;
    const inBoard = !!target.closest('[data-board]');
    // Keys on other controls (the top bar buttons) belong to those controls.
    if (!inBoard && target !== document.body && target.closest('button, a, input, select, textarea, [role="dialog"]')) return;
    const step = ARROWS[event.key];
    if (step) {
      event.preventDefault();
      const {cols, rows} = this.level;
      const r = Math.min(rows - 1, Math.max(0, Math.floor(this.cursor / cols) + step[0]));
      const c = Math.min(cols - 1, Math.max(0, this.cursor % cols + step[1]));
      this.moveCursor(r * cols + c, true);
    } else if ((event.key === 'Enter' || event.key === ' ') && !inBoard) {
      // On a focused cell the button's own click handles the key.
      event.preventDefault();
      this.press(this.cursor);
    }
  }

  end() {
    const largest = this.largest ? ` · ${tr('самый большой', 'largest')} ${this.largest.w}×${this.largest.h}` : '';
    this.finish(this.score, null, {items: [
      {title: tr('Найдено прямоугольников', 'Rectangles found'), text: `${this.found}${largest}`, result: this.earned},
      {title: tr('Ошибки', 'Mistakes'), text: String(this.mistakes), result: -this.lost}]});
  }

  destroy() {
    super.destroy();
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
  }
}
