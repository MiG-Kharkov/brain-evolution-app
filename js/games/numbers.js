// Numbers: place the task digit into an empty cell whose neighbours sum to it (last digit); the
// neighbours vanish. Clear the field. Logic — numbers-model.js (port of the original); v2 view (DOM grid).
import { RestoredGame, tr, escapeHTML } from './restored-game.js';
import { arrayValue } from '../original.js';
import { audio } from '../audio.js';
import { i18n } from '../i18n.js';
import { icon } from '../core/icons.js';
import { fmt } from '../core/dom.js';
import * as M from './numbers-model.js';

const VANISH_MS = 260, FLASH_MS = 420;
const STEPS = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};

export class NumbersGame extends RestoredGame {
  id = 'numbers';
  get title() { return tr('Числа', 'Numbers'); }
  // Stats of the finished game for the achievements (js/achievements.js).
  // `combo`: the most digits cleared by one move of the player's own (the «One sweep» achievement).
  feats() { return {perfect: this.wrong === 0, mistakes: this.wrong, hints: this.hints || 0, combo: this.combo || 0}; }

  // The field is covered while the game is paused (menu or rules): the clock stops, so the sums must
  // not be worked out meanwhile (BUG-NUM-05).
  get isPaused() { return this._paused; }
  set isPaused(value) { this._paused = value; this.syncMask(); }

  async init(difficulty = 'easy') {
    if (!await this.begin(difficulty)) return;
    const d = this.d = Math.min(this.diff, 2), cfg = this.original.numbers_game_field;
    // The test reads the sp_* prices of the config (BUG-NUM-02).
    const price = key => arrayValue(cfg[`${this.inTest ? 'sp_' : ''}${key}`], d);
    this.goodPoints = price('points_good_move_arr');
    this.wrongPoints = price('points_wrong_move_arr');
    this.timePenalty = price('time_penalty_arr');
    this.rand = M.createRandom(Date.now());
    const m = M.margins(d, this.config.rules?.numbers?.fields);
    this.field = M.createField(d, this.rand, m);
    this.mx = m.mx; this.my = m.my;
    this.cols = M.SIZE - 2 * this.mx; this.rows = M.SIZE - 2 * this.my;
    this.gained = 0; this.wrong = 0; this.moves = 0; this.hints = 0; this.combo = 0;
    this.nextTask();
    this.render();
    this.tick(() => { this.elapsed++; this.setClock(); });
    this.keyHandler = event => {
      if (!this.playable || event.ctrlKey || event.metaKey || event.altKey) return;
      const step = STEPS[event.key];
      if (step) { event.preventDefault(); this.cursor = M.stepCursor(this.field, this.cursor.x, this.cursor.y, ...step); this.paint(); return; }
      // Enter / Space accept the move, unless a button has the focus (it handles the key itself).
      if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest?.('button, a, input, select, textarea')) { event.preventDefault(); this.acceptMove(); }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  nextTask() {
    this.digit = M.chooseDigit(this.field, this.d, this.rand);
    this.cursor = M.startCell(this.d, {mx: this.mx, my: this.my});
    this.hinted = null;
  }

  // Moves the number to a fitting cell (the one that clears most digits) and shows the sum. The hinted move scores 0.
  hint() {
    let best = null;
    for (let y = this.my; y < M.SIZE - this.my; y++) for (let x = this.mx; x < M.SIZE - this.mx; x++) {
      if (!M.isEmpty(this.field[M.index(x, y)])) continue;
      const n = M.neighbourhood(this.field, x, y);
      if (n.count && n.digit === this.digit && (!best || n.count > best.count)) best = {x, y, ...n};
    }
    if (!best) { this.note(tr('Подходящей клетки сейчас нет — поставьте число в любую клетку рядом с цифрами', 'No cell fits now — place the number next to any digits')); return; }
    const digits = [];
    for (let yy = best.y - 1; yy <= best.y + 1; yy++) for (let xx = best.x - 1; xx <= best.x + 1; xx++) {
      const v = xx >= 0 && yy >= 0 && xx < M.SIZE && yy < M.SIZE ? this.field[M.index(xx, yy)] : M.NONE;
      if (M.isNumber(v)) digits.push(v);
    }
    this.cursor = {x: best.x, y: best.y};
    if (this.hinted !== M.index(best.x, best.y)) this.hints++;
    this.hinted = M.index(best.x, best.y);
    this.paint();
    this.windowEl.classList.add('is-hint');
    const sum = `${digits.join(' + ')} = ${best.sum}${best.sum > 9 ? ` → ${best.digit}` : ''}`;
    this.note(`${sum}. ${tr('Нажмите «Принять ход». Очков за этот ход не будет', 'Press «Accept move». This move brings no points')}`);
  }

  render() {
    const cells = [];
    for (let y = this.my; y < M.SIZE - this.my; y++) for (let x = this.mx; x < M.SIZE - this.mx; x++)
      cells.push(`<div class="num-cell" data-x="${x}" data-y="${y}" style="grid-area:${y - this.my + 1}/${x - this.mx + 1}"></div>`);
    this.frame(this.title, `
      <div class="board num-board" data-board>
        <div class="num-task" data-task aria-live="polite"></div>
        <div class="num-grid" data-grid style="--cols:${this.cols};--rows:${this.rows}" role="group"
          aria-label="${escapeHTML(tr('Поле. Стрелки или касание перемещают число, Enter принимает ход.', 'Field. Arrows or a tap move the number, Enter accepts the move.'))}">
          ${cells.join('')}
          <div class="num-window" data-window aria-hidden="true"></div>
          <div class="num-mask" aria-hidden="true">${escapeHTML(i18n.t('Paused', 'Пауза'))}</div>
        </div>
        <p class="board-note num-note" data-note aria-live="polite"></p>
      </div>`,
      `<div class="num-actions">${this.hintButton()}<button class="btn btn-primary btn-block btn-lg" data-accept>${icon('check').outerHTML}${escapeHTML(tr('Принять ход', 'Accept move'))}</button></div>`);
    this.bindHint();
    this.grid = this.container.querySelector('[data-grid]');
    this.board = this.container.querySelector('[data-board]');
    this.windowEl = this.container.querySelector('[data-window]');
    this.cellEls = new Map([...this.grid.querySelectorAll('.num-cell')].map(el => [M.index(Number(el.dataset.x), Number(el.dataset.y)), el]));
    this.container.querySelector('[data-accept]').onclick = () => this.acceptMove();
    let dragging = false;
    this.grid.addEventListener('pointerdown', event => { dragging = true; this.grid.setPointerCapture?.(event.pointerId); this.pointTo(event); });
    this.grid.addEventListener('pointermove', event => { if (dragging) this.pointTo(event); });
    const stop = () => { dragging = false; };
    this.grid.addEventListener('pointerup', stop);
    this.grid.addEventListener('pointercancel', stop);
    this.setClock(0);
    this.updateTask(); this.paint(); this.updateCounters(); this.syncMask();
  }

  updateTask() {
    const el = this.container.querySelector('[data-task]');
    if (!el) return;
    // "Find Sum:\n%d or %d or %d, ..." from the config: the label, then the values.
    const [label, values = '%d'] = i18n.t('Find Sum:\\n%d or %d or %d, ...').split(/\\n|\n/);
    let n = 0;
    const list = [this.digit, this.digit + 10, this.digit + 20];
    el.innerHTML = `<span class="num-task-label">${escapeHTML(label.trim())}</span>
      <span class="num-task-values">${escapeHTML(values.trim()).replace(/%d/g, () => `<b>${list[n++]}</b>`)}</span>`;
  }

  updateCounters() {
    this.score = Math.max(0, this.gained + this.wrong * this.wrongPoints);
    this.updateScore();
    this.setStatus(tr('Осталось: %d', 'Left: %d').replace('%d', M.remaining(this.field)));
  }

  // Redraws the cells, the number being placed and its 3×3 window.
  paint() {
    if (!this.grid) return;
    const {x: cx, y: cy} = this.cursor;
    for (const [i, el] of this.cellEls) {
      const x = Math.floor(i / M.SIZE), y = i % M.SIZE, value = this.field[i];
      if (el.dataset.gone) continue;
      const cursor = x === cx && y === cy, near = Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1 && !cursor;
      el.className = `num-cell${M.isNumber(value) ? ' is-digit' : ' is-empty'}${cursor ? ' is-cursor' : ''}${near && M.isNumber(value) ? ' in-window' : ''}`;
      el.textContent = cursor ? String(this.digit) : M.isNumber(value) ? String(value) : '';
    }
    if (this.hinted !== M.index(cx, cy)) this.windowEl.classList.remove('is-hint');
    // The window frame, clipped to the playable rectangle.
    const c0 = Math.max(this.mx, cx - 1), c1 = Math.min(M.SIZE - 1 - this.mx, cx + 1);
    const r0 = Math.max(this.my, cy - 1), r1 = Math.min(M.SIZE - 1 - this.my, cy + 1);
    this.windowEl.style.gridArea = `${r0 - this.my + 1}/${c0 - this.mx + 1}/${r1 - this.my + 2}/${c1 - this.mx + 2}`;
  }

  pointTo(event) {
    if (!this.playable) return;
    const box = this.grid.getBoundingClientRect();
    const fx = this.mx + (event.clientX - box.left) / box.width * this.cols;
    const fy = this.my + (event.clientY - box.top) / box.height * this.rows;
    const cell = M.cellAtPoint(this.field, fx, fy, 1, 1);
    if (cell && (cell.x !== this.cursor.x || cell.y !== this.cursor.y)) { this.cursor = cell; this.paint(); }
  }

  note(text = '') { const el = this.container.querySelector('[data-note]'); if (el) el.textContent = text; }

  flash(name) {
    for (const el of [this.board, this.windowEl]) { el.classList.remove(name); void el.offsetWidth; el.classList.add(name); }
    this.defer(() => { this.board?.classList.remove(name); this.windowEl?.classList.remove(name); }, FLASH_MS);
  }

  popup(value) {
    const el = document.createElement('div');
    el.className = `num-pop ${value >= 0 ? 'plus' : 'minus'}`;
    el.textContent = `${value >= 0 ? '+' : '−'}${fmt(Math.abs(value))}`;
    el.style.gridArea = `${this.cursor.y - this.my + 1}/${this.cursor.x - this.mx + 1}`;
    el.setAttribute('aria-hidden', 'true');
    this.grid.append(el);
    setTimeout(() => el.remove(), 1000);
  }

  acceptMove() {
    if (!this.playable) return;
    const {x, y} = this.cursor;
    const before = this.field.slice();
    const result = M.acceptMove(this.field, x, y, this.digit);
    if (!result.valid) {
      // No digits around the cell: nothing happens, no penalty (BUG-NUM-03: say why).
      audio.play('hitWall');
      this.flash('is-void');
      this.note(tr('Рядом с этой клеткой нет цифр — выберите другую', 'There are no digits around this cell — pick another one'));
      return;
    }
    if (!result.correct) {
      this.wrong++;
      audio.play('wrong');
      this.flash('is-wrong');
      this.popup(this.wrongPoints);
      this.note(tr('Сумма соседей не подходит', 'The neighbours do not add up to it'));
      this.updateCounters();
      return;
    }
    const gain = this.hinted === M.index(x, y) ? 0 : result.count * this.goodPoints;
    this.gained += gain; this.moves++;
    if (gain > 0) this.combo = Math.max(this.combo, result.count);
    audio.play('good');
    this.popup(gain);
    this.note('');
    // The neighbours and the placed number shrink away together.
    for (const i of [...result.removed, M.index(x, y)]) {
      const el = this.cellEls.get(i);
      if (!el) continue;
      el.dataset.gone = '1';
      el.className = `num-cell is-digit is-gone${i === M.index(x, y) ? ' is-cursor' : ''}`;
      el.textContent = String(i === M.index(x, y) ? this.digit : before[i]);
      setTimeout(() => { delete el.dataset.gone; this.paint(); }, VANISH_MS);
    }
    this.updateCounters();
    if (M.isCleared(this.field)) { this.finishGame(); return; }
    this.nextTask(); this.updateTask(); this.paint();
  }

  syncMask() {
    this.container?.querySelector('[data-board]')?.classList.toggle('is-masked', Boolean(this._paused) && !this.finished);
  }

  finishGame() {
    const seconds = Math.max(1, this.elapsed);
    const points = this.gained + this.wrong * this.wrongPoints;
    const total = M.totalScore(points, seconds, this.timePenalty);
    // Wrong moves are a separate results item (balance/numbers.json adds it to both sections).
    const section = this.original[this.inTest ? 'numbers_sp_show_results' : 'numbers_show_results'];
    this.finish(total, {section, values: {DIST: this.gained, P1: this.wrong, P2: this.wrongPoints, P3: this.timePenalty, TIME: seconds, TOTAL: total}});
  }

  destroy() {
    super.destroy();
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
  }
}
