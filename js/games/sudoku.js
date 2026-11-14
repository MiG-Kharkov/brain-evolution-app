// Sudoku: fill the 9×9 grid so that every row, column and 3×3 box holds 1–9. Every digit is checked
// against the solution at once (a wrong one costs points); pencil marks are free, auto marks cost
// PMCheatCost. Logic, generator and pattern difficulty — sudoku-model.js; v2 view.
import { RestoredGame, tr, escapeHTML } from './restored-game.js';
import { buildResults } from './results-window.js';
import { createRandom } from '../original.js';
import { APP_VERSION } from '../version.js';
import { audio } from '../audio.js';
import { i18n } from '../i18n.js';
import { icon } from '../core/icons.js';
import { h, fmt } from '../core/dom.js';
import { hasSheet } from '../ui/overlay.js';
import * as M from './sudoku-model.js';
import { storage } from '../storage.js';
import { trainingInfo } from '../progression.js';

const LEVEL_KEYS = ['Easy', 'Med', 'Hard', 'Ultra'];
const FALLBACK_PATTERN = '000190000750002000916400000008000005240000910570000340000910863000006092000800000';
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const SVG = paths => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const UNDO_SVG = SVG('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>');
const ERASE_SVG = SVG('<path d="M20 20H8.5L4 15.5a1.8 1.8 0 0 1 0-2.5L13 4a1.8 1.8 0 0 1 2.5 0L20 8.5a1.8 1.8 0 0 1 0 2.5L11 20"/><path d="m9 9 6 6"/>');

let patternsPromise;
const loadPatterns = () => patternsPromise ||= fetch(`data/sudoku_puzzles.json?v=${APP_VERSION}`)
  .then(r => (r.ok ? r.json() : [])).catch(() => [])
  .then(list => (Array.isArray(list) && list.length ? list : [FALLBACK_PATTERN]));

export class SudokuGame extends RestoredGame {
  id = 'sudoku';
  get title() { return tr('Судоку', 'Sudoku'); }
  // Which step of this level the player is on in training: 0 … steps − 1 while the game is at this level, the last
  // step once the player is above it (free play of a passed level), 0 below it.
  ladderStep(steps) {
    const info = trainingInfo(storage.getProfile(), this.config, 'sudoku');
    if (info.diff > this.level || info.champion) return steps - 1;
    if (info.diff < this.level) return 0;
    return Math.max(0, Math.min(steps - 1, info.progress));
  }
  // Stats of the finished game for the achievements (js/achievements.js).
  feats() { return {perfect: this.wrong === 0 && this.cheats === 0, mistakes: this.wrong}; }

  async init(difficulty = 'easy') {
    if (!await this.begin(difficulty)) return;
    const generation = this.generation;
    const g = this.original, rules = this.config.rules?.sudoku || {};
    this.level = Math.min(this.diff, 3);
    this.coef = this.coefficients(g.sudoku_game_wnd || {});
    // The ladder (v3.3, owner: every level is a natural next step, and each level grows with its own progress bar):
    //   easy    12–16 empty cells, each the last gap of a row, column or box (full houses);
    //   medium  20 → 36 empty cells by the step of the bar, solved by singles (rules.sudoku.medium_sizes);
    //   hard    40 → 52 empty cells by the step, singles with more and more hidden ones (hard_sizes);
    //   ultra   the 300 patterns (all need more than singles), from the easier to the hardest by the step (ultra_windows).
    let givens, solution, place = null;
    if (this.level === 3) {
      const patterns = await loadPatterns();
      if (generation !== this.generation || this.destroyed) return;
      const windows = rules.ultra_windows || [[0, 1]];
      const info = trainingInfo(storage.getProfile(), this.config, 'sudoku');
      const pick = M.pickWindow(patterns, info.diff === 3 && !info.champion ? windows[this.ladderStep(windows.length)] : [0, 1]);
      givens = pick.pattern.split('').map(Number);
      solution = M.solve(givens);
      place = pick.place;
      if (!solution) { givens = FALLBACK_PATTERN.split('').map(Number); solution = M.solve(givens); place = 0.5; }
    } else {
      const random = createRandom(Date.now());
      let made;
      if (this.level === 0) {
        const [lo, hi] = rules.easy_empty || [12, 16];
        made = M.generateFullHouse(random, lo + Math.floor(Math.random() * (hi - lo + 1)));
      } else {
        const sizes = (this.level === 1 ? rules.medium_sizes : rules.hard_sizes) || (this.level === 1 ? [28] : [46]);
        made = M.generateSingles(random, sizes[this.ladderStep(sizes.length)]);
      }
      givens = made.puzzle; solution = made.solution;
    }
    // Level cost: on ultra it follows the pattern's place in the pool (owner's decision).
    this.factor = place === null ? 1 : M.costFactor(place, rules.level_cost_scale || [1, 1]);
    this.cost = Math.round(this.coef.cost * this.factor);
    this.givens = givens.slice();
    this.grid = givens.slice();
    this.solution = solution;
    this.marks = new Array(81).fill(0);     // pencil marks: digit d = bit d
    this.autoMask = new Array(81).fill(0);  // the marks that auto marks added
    this.autoOn = false;
    this.undoStack = [];
    this.pencil = false;
    this.wrong = 0; this.cheats = 0;
    this.sel = this.grid.indexOf(0);
    this.render();
    this.tick(() => { this.elapsed++; this.setClock(); this.updateLive(); });
    this.keyHandler = event => this.onKey(event);
    window.addEventListener('keydown', this.keyHandler);
  }

  // [sudoku_game_wnd] g_nSud<Level>*; ultra falls back to hard when the balance file has no ultra values.
  coefficients(wnd) {
    const read = (level, key) => { const raw = String(wnd[`g_nSud${level}${key}`] ?? '').trim(); return raw === '' ? NaN : Number(raw); };
    const pick = key => { const value = read(LEVEL_KEYS[this.level], key); return Number.isFinite(value) ? value : read('Hard', key); };
    return {cost: pick('LevelCost'), wrong: pick('WrongAnswerCfx'), time: pick('TimePenaltyCfx'), cheat: pick('PMCheatCost')};
  }

  helpText() {
    return [super.helpText(), tr('Цифра сразу проверяется: ошибка снимает очки, время тоже. Пометки бесплатны; «Авто» расставляет все пометки за очки, повторное нажатие убирает их. Верная цифра закрепляется в клетке.',
      'Each digit is checked at once: a mistake costs points, and so does time. Notes are free; Auto sets every note for a price, a second press takes them off. A right digit stays in its cell.')].filter(Boolean).join('\n\n');
  }

  render() {
    const cell = i => `<button class="sudoku-cell" data-i="${i}" tabindex="-1"><span class="sudoku-v"></span><span class="sudoku-marks" aria-hidden="true">${DIGITS.map(() => '<i></i>').join('')}</span></button>`;
    const boxes = Array.from({length: 9}, (_, b) => {
      const top = Math.floor(b / 3) * 27 + (b % 3) * 3;
      return `<div class="sudoku-box">${[0, 1, 2, 9, 10, 11, 18, 19, 20].map(k => cell(top + k)).join('')}</div>`;
    }).join('');
    const cheat = Math.abs(this.coef.cheat);
    this.frame(this.title, `
      <div class="sudoku-wrap">
        <div class="sudoku-grid" role="group" aria-label="${escapeHTML(tr('Поле судоку', 'Sudoku grid'))}">${boxes}</div>
        <div class="sudoku-tools">
          <button class="sudoku-tool" data-undo>${UNDO_SVG}<span>${escapeHTML(tr('Отменить', 'Undo'))}</span></button>
          <button class="sudoku-tool" data-pencil aria-pressed="false">${icon('edit', 22).outerHTML}<span>${escapeHTML(tr('Пометки', 'Notes'))}</span></button>
          <button class="sudoku-tool" data-auto>${icon('spark', 22).outerHTML}<span class="sudoku-tool-row"><span data-auto-label></span><small class="sudoku-cost">−${escapeHTML(fmt(cheat))}</small></span></button>
        </div>
        <div class="sudoku-pad">
          ${DIGITS.map(d => `<button class="key" data-digit="${d}"><span>${d}</span><small class="sudoku-left"></small></button>`).join('')}
          <button class="key muted" data-erase aria-label="${escapeHTML(tr('Стереть', 'Erase'))}">${ERASE_SVG}</button>
        </div>
        <p class="sudoku-keys">${escapeHTML(tr('Клавиатура: цифры, стрелки, Backspace — стереть, P — пометки, Ctrl+Z — отмена', 'Keyboard: digits, arrows, Backspace to erase, P for notes, Ctrl+Z to undo'))}</p>
      </div>`);
    const q = sel => this.container.querySelector(sel);
    this.cells = [...this.container.querySelectorAll('.sudoku-cell')].sort((a, b) => a.dataset.i - b.dataset.i);
    this.gridEl = q('.sudoku-grid');
    this.gridEl.addEventListener('click', event => {
      const el = event.target.closest('.sudoku-cell');
      if (el) this.select(Number(el.dataset.i));
    });
    this.container.querySelectorAll('[data-digit]').forEach(b => { b.onclick = () => this.input(Number(b.dataset.digit)); });
    q('[data-erase]').onclick = () => this.erase();
    q('[data-undo]').onclick = () => this.undo();
    q('[data-pencil]').onclick = () => this.togglePencil();
    q('[data-auto]').onclick = () => this.autoMarks();
    this.setClock(0);
    this.update();
  }

  // ---------- state helpers ----------
  isFixed(i) { return this.givens[i] !== 0 || (this.grid[i] !== 0 && this.grid[i] === this.solution[i]); }
  placed(d) { let n = 0; for (let i = 0; i < 81; i++) if (this.grid[i] === d && this.solution[i] === d) n++; return n; }
  emptyLeft() { let n = 0; for (let i = 0; i < 81; i++) if (this.grid[i] !== this.solution[i]) n++; return n; }
  snap(i) { return {i, v: this.grid[i], m: this.marks[i]}; }
  // Candidates from the givens and the right digits only (wrong digits do not hide candidates: SUD-06).
  candidates(i) {
    let used = 0;
    for (const j of M.PEERS[i]) if (this.grid[j] && this.grid[j] === this.solution[j]) used |= 1 << this.grid[j];
    return 0x3fe & ~used;
  }
  pushUndo(entry) { this.undoStack.push(entry); }
  get liveScore() { return M.score({...this.coef, cost: this.cost}, this.wrong, this.elapsed, this.cheats); }
  updateLive() { this.score = this.liveScore; this.updateScore(); }

  // ---------- input ----------
  select(i) {
    if (!this.playable || i < 0 || i > 80) return;
    if (i !== this.sel) audio.play('click');
    this.sel = i;
    this.update();
    this.cells[i].focus({preventScroll: true});
  }

  input(d, asMark = false) {
    if (!this.playable || this.sel < 0) return;
    const i = this.sel;
    if (this.isFixed(i)) return;
    if (this.pencil || asMark) {
      if (this.grid[i]) return; // marks only in empty cells
      this.pushUndo({cells: [this.snap(i)]});
      this.marks[i] ^= 1 << d;
      audio.play('pencil');
      this.update();
      return;
    }
    if (this.grid[i] === d || this.placed(d) === 9) return;
    const entry = {cells: [this.snap(i)]};
    this.grid[i] = d;
    this.marks[i] = 0;
    if (d === this.solution[i]) {
      audio.play('good');
      // The digit leaves the marks of its row, column and box; undo brings them back (SUD-07).
      for (const j of M.PEERS[i]) if (this.marks[j] & (1 << d)) { entry.cells.push(this.snap(j)); this.marks[j] &= ~(1 << d); }
    } else {
      this.wrong++;
      audio.play('wrong');
      this.flash(i);
    }
    this.pushUndo(entry);
    this.update();
    this.updateLive();
    if (this.emptyLeft() === 0) this.finishGame();
  }

  erase() {
    if (!this.playable || this.sel < 0) return;
    const i = this.sel;
    if (this.isFixed(i) || (!this.grid[i] && !this.marks[i])) return;
    this.pushUndo({cells: [this.snap(i)]});
    this.grid[i] = 0; this.marks[i] = 0;
    audio.play('click');
    this.update();
  }

  undo() {
    if (!this.playable) return;
    const entry = this.undoStack.pop();
    if (!entry) return;
    for (const s of entry.cells) { this.grid[s.i] = s.v; this.marks[s.i] = s.m; }
    if (entry.auto) { this.autoOn = entry.auto.on; this.autoMask = entry.auto.mask; }
    audio.play('click');
    this.update();
  }

  togglePencil() {
    if (!this.playable) return;
    this.pencil = !this.pencil;
    audio.play('click');
    this.update();
  }

  // Auto marks (sud_msgbox, PMCheatCost): the first press sets every candidate for a price; the second
  // press takes the auto marks off for free ("Clear Pencilmarks"). The clock runs while the question
  // is open, so "No" is no free pause (SUD-08).
  autoMarks() {
    if (!this.playable) return;
    audio.play('click');
    if (this.autoOn) { this.clearAutoMarks(); return; }
    const text = i18n.t(this.original.sud_msgbox?.sud_msg_box_pmcost_text || 'By using this option you will lose\\n%d points.\\n \\nProceed?')
      .replace('%d', fmt(Math.abs(this.coef.cheat))).replace(/\\n/g, '\n').replace(/\n\s*\n/g, '\n\n').trim();
    let yes = false;
    const s = this.openSheet({title: i18n.t('Autoset Pencilmarks', 'Автопометки'), body: [h('p', {class: 'help-text'}, text)],
      actions: [
        h('button', {class: 'btn btn-primary btn-block', onclick: () => { yes = true; s.close(); }}, tr('Да', 'Yes')),
        h('button', {class: 'btn btn-block btn-ghost', onclick: () => s.close()}, tr('Нет', 'No'))],
      onClose: () => { if (yes && this.playable) this.applyAutoMarks(); }});
  }

  applyAutoMarks() {
    const cells = [], mask = new Array(81).fill(0);
    for (let i = 0; i < 81; i++) {
      if (this.grid[i]) continue;
      const next = this.candidates(i);
      cells.push(this.snap(i));
      mask[i] = next & ~this.marks[i];
      this.marks[i] = next;
    }
    if (!cells.length) return;
    this.pushUndo({cells, auto: {on: this.autoOn, mask: this.autoMask}});
    this.autoMask = mask; this.autoOn = true;
    this.cheats++;
    audio.play('pencil');
    this.update();
    this.updateLive();
  }

  clearAutoMarks() {
    const cells = [];
    for (let i = 0; i < 81; i++) if (this.marks[i] & this.autoMask[i]) { cells.push(this.snap(i)); this.marks[i] &= ~this.autoMask[i]; }
    this.pushUndo({cells, auto: {on: true, mask: this.autoMask}});
    this.autoMask = new Array(81).fill(0); this.autoOn = false;
    this.update();
  }

  onKey(event) {
    if (!this.playable || hasSheet() || event.altKey || event.target.closest?.('input, textarea, select')) return;
    const key = event.key, code = event.code || '';
    if ((event.ctrlKey || event.metaKey) && code === 'KeyZ') { event.preventDefault(); this.undo(); return; }
    if (event.ctrlKey || event.metaKey) return;
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code)?.[1] ?? (/^[1-9]$/.test(key) ? key : null);
    if (digit) { event.preventDefault(); this.input(Number(digit), event.shiftKey); return; }
    if (key === 'Backspace' || key === 'Delete' || key === '0' || code === 'Digit0' || code === 'Numpad0') { event.preventDefault(); this.erase(); return; }
    if (code === 'KeyP' || code === 'KeyN') { event.preventDefault(); this.togglePencil(); return; }
    const move = {ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1]}[key];
    if (move) {
      event.preventDefault();
      const from = this.sel < 0 ? 0 : this.sel;
      this.select(((M.ROW(from) + move[0] + 9) % 9) * 9 + (M.COL(from) + move[1] + 9) % 9);
    }
  }

  flash(i) {
    const el = this.cells[i];
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  // ---------- view ----------
  update() {
    const sel = this.sel, selValue = sel >= 0 ? this.grid[sel] : 0;
    const label = (i, v) => `${tr('Строка', 'Row')} ${M.ROW(i) + 1}, ${tr('столбец', 'column')} ${M.COL(i) + 1}: ${v || tr('пусто', 'empty')}`;
    for (let i = 0; i < 81; i++) {
      const el = this.cells[i], v = this.grid[i], given = this.givens[i] !== 0, wrong = !given && v && v !== this.solution[i];
      const peer = sel >= 0 && i !== sel && (M.ROW(i) === M.ROW(sel) || M.COL(i) === M.COL(sel) || M.BOX(i) === M.BOX(sel));
      el.className = `sudoku-cell${given ? ' given' : v ? ' user' : ''}${wrong ? ' wrong' : ''}${i === sel ? ' sel' : ''}${peer ? ' peer' : ''}${selValue && v === selValue && i !== sel ? ' same' : ''}${el.classList.contains('flash') ? ' flash' : ''}`;
      el.tabIndex = i === sel ? 0 : -1;
      el.firstChild.textContent = v || '';
      const marks = el.lastChild.children;
      for (let d = 1; d <= 9; d++) {
        const on = !v && (this.marks[i] & (1 << d));
        marks[d - 1].textContent = on ? d : '';
        marks[d - 1].className = on && d === selValue ? 'hit' : '';
      }
      el.setAttribute('aria-label', label(i, v) + (wrong ? ` (${tr('ошибка', 'wrong')})` : ''));
      el.setAttribute('aria-current', i === sel ? 'true' : 'false');
    }
    this.gridEl.classList.toggle('pencil', this.pencil);
    this.container.querySelector('.sudoku-pad').classList.toggle('pencil', this.pencil);
    for (const b of this.container.querySelectorAll('[data-digit]')) {
      const left = 9 - this.placed(Number(b.dataset.digit));
      b.querySelector('.sudoku-left').textContent = left || '';
      b.disabled = left === 0;
      b.setAttribute('aria-label', `${b.dataset.digit}${left ? '' : ` (${tr('все на месте', 'all placed')})`}`);
    }
    const q = sel => this.container.querySelector(sel);
    q('[data-undo]').disabled = !this.undoStack.length;
    q('[data-pencil]').setAttribute('aria-pressed', String(this.pencil));
    const auto = q('[data-auto]');
    auto.classList.toggle('on', this.autoOn);
    q('[data-auto-label]').textContent = this.autoOn ? tr('Убрать', 'Clear') : tr('Авто', 'Auto');
    auto.setAttribute('aria-label', this.autoOn ? i18n.t('Clear Pencilmarks', 'Убрать автопометки') : `${i18n.t('Autoset Pencilmarks', 'Автопометки')}: −${fmt(Math.abs(this.coef.cheat))}`);
    this.setStatus(tr('Осталось %d', '%d left').replace('%d', this.emptyLeft()));
    this.updateLive();
  }

  // [sudoku_show_results]: Level Summary (@DIST), Wrong Moves (@P1), Time Penalty (@TIME), Pencilmarks
  // Cheats (@P2). The points come from [sudoku_game_wnd] — one source for the formula and the sheet (SUD-11).
  finishGame() {
    const c = this.coef;
    this.gridEl.classList.add('solved');
    const section = {...this.original.sudoku_show_results, i2_points_arr: `1 ${c.wrong}`, i3_points_arr: `1 ${c.time}`, i4_points_arr: `1 ${c.cheat}`};
    const total = this.liveScore;
    const built = buildResults(section, {DIST: this.cost, P1: this.wrong, P2: this.cheats, TIME: this.elapsed, TOTAL: total}, 0);
    if (this.level >= 2 && built.items[0]) built.items[0].text = tr('Трудность поля ×%s', 'Grid difficulty ×%s').replace('%s', fmt(this.factor, 2));
    this.finish(total, null, {items: built.items});
  }

  destroy() {
    super.destroy();
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
  }
}
