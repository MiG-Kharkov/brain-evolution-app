// Minesweeper: open every safe cell. A blown mine costs points and the game goes on (as in the
// original); points come for every opened safe cell (BUG-MS-01). Logic — minesweeper-model.js; v2 view.
import { RestoredGame, tr, escapeHTML } from './restored-game.js';
import { arrayValue } from '../original.js';
import { audio } from '../audio.js';
import { i18n } from '../i18n.js';
import { gameGlyph } from '../core/icons.js';
import { hasSheet } from '../ui/overlay.js';
import * as M from './minesweeper-model.js';

const LEVEL_KEYS = ['Easy', 'Med', 'Hard'];
// Long press = flag. 3.6 (owner: the long tap was hard to make): 300 ms instead of 420, the cell fills while the
// finger is held (.holding), the finger may drift up to 0.4 of a cell, and a board that fits the screen takes the
// touch for itself (touch-action: none), so the browser does not turn a held finger into a scroll.
const HOLD_MS = 300;
const FLAG_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21V3.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M8 4h10l-2.8 4.2L18 12.5H8z" fill="currentColor"/></svg>';
const OPEN_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 12.5l2 2 4-4.5" stroke-linecap="round"/></svg>';
const MINE_SVG = gameGlyph('minesweeper', 24).outerHTML;

export class MinesweeperGame extends RestoredGame {
  id = 'minesweeper';
  get title() { return tr('Сапёр', 'Minesweeper'); }
  // Stats of the finished (won) game for the achievements (js/achievements.js).
  feats() { return {perfect: this.field?.exploded === 0, mistakes: this.field?.exploded || 0, seconds: this.elapsed}; }

  async init(difficulty = 'easy') {
    if (!await this.begin(difficulty)) return;
    const wnd = this.original.ms_game_wnd, res = this.original.ms_show_results;
    this.level = Math.min(this.diff, 2); // no ultra section: 'ultra' plays hard
    const num = key => Number(String(wnd[`g_n${LEVEL_KEYS[this.level]}${key}`]).trim());
    const f = this.field = M.createField(num('YFieldSize'), num('XFieldSize'), num('BombsOnField'));
    // The points come from [ms_show_results], as in the results sheet (one source).
    this.points = {cell: arrayValue(res.i1_points_arr, this.level), blown: arrayValue(res.i2_points_arr, this.level), second: arrayValue(res.i3_points_arr, this.level)};
    this.gesture = Number(String(wnd.g_nGestureOffset ?? '').trim()) || 8;
    this.flagMode = false;
    this.started = false;
    this.cursor = Math.floor(f.rows / 2) * f.cols + Math.floor(f.cols / 2);
    this.render();
    // The clock starts on the first opening (BUG-MS-06).
    this.tick(() => { if (!this.started) return; this.elapsed++; this.setClock(); this.updateInfo(); });
    this.keyHandler = event => this.onKey(event);
    window.addEventListener('keydown', this.keyHandler);
  }

  // ms_help: the goal (2_value) and the numbers and chords (3_value), then the v2 controls.
  helpText() {
    const help = this.original?.ms_help || {};
    const part = key => (help[key] ? i18n.t(help[key]).replace(/\\n/g, '\n').replace(/^-/, '').trim() : '');
    return [part('2_value'), part('3_value'), tr('Мина не заканчивает игру, но снимает очки. Очки начисляются за каждую открытую клетку, время идёт с первого открытия. Флажок — долгое нажатие, правая кнопка мыши, клавиша F или режим «Флажки».',
      'A mine does not end the game but costs points. Every opened cell brings points; the clock starts with the first opening. Flag: long press, right click, the F key or the Flags mode.')].filter(Boolean).join('\n\n');
  }

  render() {
    const f = this.field;
    const cells = Array.from({length: f.rows * f.cols}, (_, i) => `<button class="ms-cell" data-i="${i}" tabindex="${i === this.cursor ? 0 : -1}"></button>`).join('');
    this.frame(this.title, `
      <div class="board ms-board">
        <div class="ms-scroll">
          <div class="ms-grid${f.cols >= 13 ? ' dense' : ''}" role="group" aria-label="${escapeHTML(tr('Минное поле', 'Minefield'))}" style="--ms-cols:${f.cols};--ms-rows:${f.rows}">${cells}</div>
        </div>
      </div>
      <div class="ms-controls">
        <div class="segmented ms-mode" role="group" aria-label="${escapeHTML(tr('Режим нажатия', 'Tap mode'))}">
          <button data-mode="open" aria-pressed="true">${OPEN_SVG}<span>${escapeHTML(tr('Открывать', 'Open'))}</span></button>
          <button data-mode="flag" aria-pressed="false">${FLAG_SVG}<span>${escapeHTML(tr('Флажки', 'Flags'))}</span></button>
        </div>
        <p class="board-note ms-hint-touch">${escapeHTML(tr('Долгое нажатие на клетку ставит флажок', 'Long press a cell to place a flag'))}</p>
        <p class="board-note ms-hint-keys">${escapeHTML(tr('Стрелки — выбор клетки, Enter или пробел — открыть, F или правая кнопка — флажок', 'Arrows move, Enter or Space opens, F or right click places a flag'))}</p>
      </div>`);
    this.board = this.container.querySelector('.ms-board');
    this.gridEl = this.container.querySelector('.ms-grid');
    this.cells = [...this.gridEl.children];
    this.container.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => this.setMode(b.dataset.mode === 'flag'); });
    this.gridEl.style.setProperty('--ms-hold', `${HOLD_MS}ms`);
    this.bindPointer();
    this.fitTouch();
    this.resizeHandler = () => this.fitTouch();
    window.addEventListener('resize', this.resizeHandler);
    this.cells.forEach((_, i) => this.paint(i));
    this.setClock(0);
    this.updateInfo();
  }

  // The board takes the touch for itself when nothing has to scroll: neither the board inside its card nor the
  // page. Then a finger that drifts during a long press is not taken by the browser as the start of a scroll.
  fitTouch() {
    const scroll = this.gridEl?.parentElement, page = document.documentElement;
    if (!scroll) return;
    const scrolls = scroll.scrollWidth > scroll.clientWidth + 1 || scroll.scrollHeight > scroll.clientHeight + 1 || page.scrollHeight > page.clientHeight + 1;
    this.gridEl.style.touchAction = scrolls ? '' : 'none';
  }

  // Tap opens (or flags in flag mode); a long press or the right button toggles a flag. Moving the finger further
  // than 0.4 of a cell (at least g_nGestureOffset px) cancels the long press, so a board that scrolls can scroll.
  bindPointer() {
    const grid = this.gridEl, cellOf = event => event.target.closest?.('.ms-cell');
    const release = () => { if (this.hold) { clearTimeout(this.hold.timer); this.hold.el?.classList.remove('holding'); } };
    grid.addEventListener('pointerdown', event => {
      const el = cellOf(event);
      this.cancelHold();
      if (!el || !this.playable || event.button > 0) return;
      const i = Number(el.dataset.i), f = this.field;
      const hold = this.hold = {i, el, x: event.clientX, y: event.clientY, fired: false, reach: Math.max(this.gesture, el.offsetWidth * 0.4)};
      if (!f.open[i] && !f.blown[i]) el.classList.add('holding');
      hold.timer = setTimeout(() => {
        if (this.hold !== hold || !this.playable) return;
        hold.fired = true;
        el.classList.remove('holding');
        this.moveCursor(i, false);
        if (this.toggleFlag(i)) navigator.vibrate?.(15);
      }, HOLD_MS);
    });
    grid.addEventListener('pointermove', event => {
      const hold = this.hold;
      if (hold && !hold.fired && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > hold.reach) this.cancelHold();
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) grid.addEventListener(type, release);
    grid.addEventListener('click', event => {
      const el = cellOf(event);
      const hold = this.hold;
      this.hold = null;
      if (!el || hold?.fired) return; // the long press already placed the flag
      const i = Number(el.dataset.i);
      this.moveCursor(i, false);
      this.activate(i);
    });
    grid.addEventListener('contextmenu', event => {
      const el = cellOf(event);
      if (!el) return;
      event.preventDefault();
      if (this.hold?.fired) return;
      this.cancelHold();
      this.toggleFlag(Number(el.dataset.i));
    });
  }

  cancelHold() {
    if (this.hold) { clearTimeout(this.hold.timer); this.hold.el?.classList.remove('holding'); }
    this.hold = null;
  }

  setMode(flag) {
    if (!this.playable || this.flagMode === flag) return;
    this.flagMode = flag;
    audio.play('click');
    this.container.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.mode === 'flag') === flag)));
    this.gridEl.classList.toggle('flagging', flag);
  }

  // ---------- moves ----------
  activate(i) {
    if (!this.playable) return;
    const f = this.field;
    if (f.open[i]) { this.chord(i); return; }
    if (this.flagMode) { this.toggleFlag(i); return; }
    if (f.flag[i] || f.blown[i]) return;
    this.openCell(i, true);
    this.afterMove();
  }

  // One closed safe cell (with its flood fill) or a mine; `sound` is off inside a chord.
  openCell(i, sound) {
    const f = this.field;
    if (!f.placed) { M.placeMines(f, i); this.started = true; }
    if (f.mine[i]) {
      f.blown[i] = 1; f.exploded++;
      audio.play('wrong');
      this.paint(i);
      this.board.classList.remove('boom'); void this.board.offsetWidth; this.board.classList.add('boom');
      return;
    }
    const opened = M.open(this.field, i);
    if (sound && opened.length) audio.play('mineOpen');
    opened.forEach(j => this.paint(j));
  }

  chord(i) {
    const targets = M.chordTargets(this.field, i);
    if (!targets.length) return;
    const safe = targets.every(j => !this.field.mine[j]);
    for (const j of targets) this.openCell(j, false);
    if (safe) audio.play('mineOpen');
    this.afterMove();
  }

  toggleFlag(i) {
    const f = this.field;
    if (!this.playable || f.open[i] || f.blown[i]) return false;
    f.flag[i] ^= 1;
    audio.play('click');
    this.paint(i);
    this.updateInfo();
    return true;
  }

  afterMove() {
    this.updateInfo();
    const f = this.field;
    if (f.opened < M.safeCells(f)) return;
    // Won: the mines left closed are shown flagged.
    for (let k = 0; k < f.mine.length; k++) if (f.mine[k] && !f.blown[k] && !f.flag[k]) { f.flag[k] = 1; this.paint(k); }
    this.gridEl.classList.add('won');
    this.updateInfo();
    const raw = this.points.cell * f.opened + this.points.blown * f.exploded + this.points.second * this.elapsed;
    this.finish(raw, {section: this.original.ms_show_results, values: {P1: f.opened, P2: f.exploded, TIME: this.elapsed, TOTAL: raw}});
  }

  // ---------- keyboard ----------
  onKey(event) {
    if (!this.playable || hasSheet() || event.altKey || event.ctrlKey || event.metaKey) return;
    const active = document.activeElement, onCell = !!active?.classList?.contains('ms-cell');
    if (!onCell && active && active !== document.body) return;
    const f = this.field;
    const move = {ArrowUp: -f.cols, ArrowDown: f.cols, ArrowLeft: -1, ArrowRight: 1}[event.key];
    if (move) {
      event.preventDefault();
      const r = Math.floor(this.cursor / f.cols), c = this.cursor % f.cols;
      const next = event.key === 'ArrowLeft' ? (c > 0 ? this.cursor - 1 : this.cursor)
        : event.key === 'ArrowRight' ? (c < f.cols - 1 ? this.cursor + 1 : this.cursor)
        : (r + Math.sign(move) >= 0 && r + Math.sign(move) < f.rows ? this.cursor + move : this.cursor);
      this.moveCursor(next, true);
      return;
    }
    if (event.code === 'KeyF') { event.preventDefault(); this.toggleFlag(this.cursor); return; }
    // On a focused cell Enter and Space are its own click.
    if (!onCell && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); this.activate(this.cursor); }
  }

  moveCursor(i, focus) {
    if (this.cells[this.cursor]) this.cells[this.cursor].tabIndex = -1;
    this.cursor = i;
    this.cells[i].tabIndex = 0;
    if (focus) this.cells[i].focus();
  }

  // ---------- view ----------
  paint(i) {
    const f = this.field, el = this.cells[i];
    const r = Math.floor(i / f.cols) + 1, c = i % f.cols + 1;
    let cls = 'ms-cell', html = '', state;
    if (f.blown[i]) { cls += ' blown'; html = MINE_SVG; state = tr('мина', 'mine'); }
    else if (f.open[i]) { cls += ` open n${f.count[i]}`; html = f.count[i] ? String(f.count[i]) : ''; state = f.count[i] ? String(f.count[i]) : tr('пусто', 'empty'); }
    else if (f.flag[i]) { cls += ' flag'; html = FLAG_SVG; state = tr('флажок', 'flag'); }
    else state = tr('закрыта', 'closed');
    el.className = cls;
    el.innerHTML = html;
    el.setAttribute('aria-label', `${r}, ${c}: ${state}`);
  }

  updateInfo() {
    const f = this.field;
    this.score = M.score(this.points, f.opened, f.exploded, this.elapsed);
    this.updateScore();
    this.setStatus(`${tr('Мины', 'Mines')}: ${M.minesLeft(f)}`);
  }

  destroy() {
    super.destroy();
    this.cancelHold();
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
  }
}
