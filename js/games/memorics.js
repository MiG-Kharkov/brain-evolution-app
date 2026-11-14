// Memorics: remember the field, then show every figure that answers the question. Logic and scoring —
// memorics-model.js (port of the original); v2 view: DOM grid with vector figures, animated states.
import { RestoredGame, tr, escapeHTML } from './restored-game.js';
import { createRandom } from '../original.js';
import { audio } from '../audio.js';
import { i18n } from '../i18n.js';
import { icon } from '../core/icons.js';
import { fmt } from '../core/dom.js';
import * as M from './memorics-model.js';

const DONE_TICK_MS = 100; // g_nDoneShowTimer is counted in 100 ms ticks

// Polygon with rounded corners (quadratic curves through the vertices).
function roundedPath(points, radius) {
  const n = points.length, f = v => Math.round(v * 10) / 10;
  let d = '';
  for (let i = 0; i < n; i++) {
    const [px, py] = points[(i + n - 1) % n], [x, y] = points[i], [nx, ny] = points[(i + 1) % n];
    const l1 = Math.hypot(px - x, py - y), l2 = Math.hypot(nx - x, ny - y);
    const t1 = Math.min(radius, l1 / 2) / l1, t2 = Math.min(radius, l2 / 2) / l2;
    d += `${i ? 'L' : 'M'}${f(x + (px - x) * t1)} ${f(y + (py - y) * t1)}Q${f(x)} ${f(y)} ${f(x + (nx - x) * t2)} ${f(y + (ny - y) * t2)}`;
  }
  return `${d}Z`;
}
const STAR = Array.from({length: 10}, (_, i) => {
  const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 18 : 42;
  return [50 + r * Math.cos(a), 51 + r * Math.sin(a)];
});
// Figures in a 100×100 box: 1 square, 2 line, 3 triangle, 4 star (cr_figure_1..4).
const SHAPES = {
  1: '<rect x="20" y="20" width="60" height="60" rx="12"/>',
  2: '<rect x="8" y="38" width="84" height="24" rx="12"/>',
  3: `<path d="${roundedPath([[50, 9], [88, 74], [12, 74]], 9)}"/>`,
  4: `<path d="${roundedPath(STAR, 3.5)}"/>`,
};
const STATE_CLASS = {1: 'is-static', 2: 'is-pulse', 3: 'is-spin'};

export class MemoricsGame extends RestoredGame {
  id = 'memorics';
  get title() { return tr('Запоминалка', 'Memorics'); }
  // Stats of the finished game for the achievements (js/achievements.js).
  feats() { return {perfect: this.wrong === 0 && this.right > 0, mistakes: this.wrong, tries: this.right + this.wrong}; }

  // While the game is paused (menu or rules) the remember countdown stops, so the field is covered
  // (BUG-MEM-01); the figures' animation stops too.
  get isPaused() { return this._paused; }
  set isPaused(value) { this._paused = value; this.syncPause(); }

  async init(difficulty = 'easy') {
    if (!await this.begin(difficulty)) return;
    const g = this.original, d = Math.min(this.diff, 2);
    // The test (Medium) plays cr_lev_4: 2 forms × 2 colours × 2 states; its prices are Medium's.
    this.level = M.levelParams(g[`cr_lev_${d + (this.inTest ? 3 : 0)}`]);
    const prefix = this.inTest ? 'Med' : ['Easy', 'Med', 'Hard'][d];
    this.cost = Number(g.cr_game_wnd[`g_nCR${prefix}LevelCost`]);
    this.wrongPercent = Number(g.cr_game_wnd[`g_nCR${prefix}WrongAnswerCfx`]);
    this.rand = createRandom(Date.now());
    this.rounds = this.level.rounds;
    this.roundIndex = 0; this.right = 0; this.wrong = 0; this.focusSlot = 0;
    this.render();
    this.startRound();
    this.tick(() => {
      this.elapsed++; this.setClock();
      if (this.phase !== 'remember') return;
      this.remaining--;
      if (this.remaining <= 0) this.startAnswer(); else this.updateTimer();
    });
  }

  render() {
    const cells = Array.from({length: M.SLOTS}, (_, slot) => `<button class="mem-cell" data-slot="${slot}" tabindex="${slot ? -1 : 0}"></button>`).join('');
    this.frame(this.title, `
      <div class="board mem-board" data-board>
        <div class="mem-head" data-head aria-live="polite"></div>
        <div class="mem-grid" data-grid role="group" aria-label="${escapeHTML(tr('Поле: 6 столбцов, 5 строк', 'Field: 6 columns, 5 rows'))}">
          ${cells}
          <div class="mem-mask" aria-hidden="true">${escapeHTML(i18n.t('Paused', 'Пауза'))}</div>
        </div>
        <div class="mem-meta" data-meta></div>
      </div>`,
      `<button class="btn btn-primary btn-block btn-lg" data-action></button>`);
    this.board = this.container.querySelector('[data-board]');
    this.grid = this.container.querySelector('[data-grid]');
    this.cells = [...this.grid.querySelectorAll('.mem-cell')];
    this.cells.forEach((cell, slot) => { cell.onclick = () => { this.setRoving(slot); this.tapSlot(slot); }; });
    this.grid.addEventListener('keydown', event => this.onGridKey(event));
    this.container.querySelector('[data-action]').onclick = () => this.action();
    this.setClock(0);
    this.syncPause();
  }

  // Arrow keys move the focus between the cells (one tab stop for the whole field); Enter / Space tap.
  onGridKey(event) {
    const step = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -M.COLS, ArrowDown: M.COLS}[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const col = this.focusSlot % M.COLS;
    if ((step === -1 && col === 0) || (step === 1 && col === M.COLS - 1)) return;
    const next = this.focusSlot + step;
    if (next < 0 || next >= M.SLOTS) return;
    this.focusCell(next);
  }

  setRoving(slot) {
    this.cells[this.focusSlot]?.setAttribute('tabindex', '-1');
    this.focusSlot = slot;
    this.cells[slot].setAttribute('tabindex', '0');
  }

  focusCell(slot) { this.setRoving(slot); this.cells[slot].focus(); }

  startRound() {
    this.round = M.createRound(this.level, this.rand);
    this.answer = {tries: this.round.tries, found: new Set(), crossed: new Set(), right: 0, wrong: 0, log: []};
    this.remaining = this.level.demoTime;
    this.cells.forEach((cell, slot) => {
      const f = this.round.figures.find(item => item.slot === slot);
      cell.innerHTML = (f ? `<svg class="mem-fig ${STATE_CLASS[f.state]}" viewBox="0 0 100 100" aria-hidden="true"
          style="--fig:var(--mem-c${f.color});--ph:${f.phase}"><g class="mem-shape">${SHAPES[f.form]}</g></svg>` : '')
        + '<span class="mem-badge" aria-hidden="true"></span>';
    });
    this.setPhase('remember');
    this.setStatus(`${tr('Раунд', 'Round')} ${this.roundIndex + 1} / ${this.rounds}`);
  }

  setPhase(phase) {
    this.phase = phase;
    this.board.dataset.phase = phase;
    this.updateCells(); this.updateHead(); this.updateMeta(); this.updateAction();
    this.syncPause();
  }

  startAnswer() {
    if (!this.playable || this.phase !== 'remember') return;
    const fromButton = document.activeElement === this.container.querySelector('[data-action]');
    this.setPhase('answer');
    // The button hides during the answer; keyboard focus moves to the field.
    if (fromButton) this.focusCell(this.focusSlot);
  }

  action() {
    if (!this.playable) return;
    if (this.phase === 'remember') { audio.play('click'); this.startAnswer(); }
    else if (this.phase === 'review') this.nextRound();
  }

  tapSlot(slot) {
    if (!this.playable || this.phase !== 'answer') return;
    const right = M.tap(this.round, this.answer, slot);
    if (right === null) return;
    this.answer.log.push(right);
    if (right) { this.right++; audio.play('good'); }
    else {
      this.wrong++; audio.play('wrong');
      const cell = this.cells[slot];
      cell.classList.remove('is-shake'); void cell.offsetWidth; cell.classList.add('is-shake');
    }
    this.updateCells(); this.updateMeta();
    if (this.answer.tries <= 0) {
      // The original field appears after g_nDoneShowTimer ticks (CCR_ShowField::v19).
      this.phase = 'done';
      this.updateAction();
      this.defer(() => this.setPhase('review'), Number(this.original.cr_game_wnd.g_nDoneShowTimer) * DONE_TICK_MS);
    }
  }

  nextRound() {
    if (!this.playable || this.phase !== 'review') return;
    audio.play('click');
    if (++this.roundIndex >= this.rounds) { this.finishGame(); return; }
    this.startRound();
  }

  // Spoken name of a figure for the cell's label; colour and state reuse the config words' keys.
  describe(f) {
    const forms = {1: tr('квадрат', 'square'), 2: tr('линия', 'line'), 3: tr('треугольник', 'triangle'), 4: tr('звезда', 'star')};
    const colors = {1: tr('цвет синий', 'blue'), 2: tr('цвет зелёный', 'green'), 3: tr('цвет красный', 'red'), 4: tr('цвет жёлтый', 'yellow')};
    const states = {1: tr('не движется', 'static'), 2: tr('пульсирует', 'pulsing'), 3: tr('вращается', 'rotating')};
    return `${forms[f.form]}, ${colors[f.color]}, ${states[f.state]}`;
  }

  updateCells() {
    const showAll = this.phase === 'remember' || this.phase === 'review';
    const q = this.round.question;
    this.cells.forEach((cell, slot) => {
      const f = this.round.figures.find(item => item.slot === slot);
      const found = this.answer.found.has(slot), crossed = this.answer.crossed.has(slot);
      const missed = this.phase === 'review' && f && M.matches(q, f) && !found;
      cell.classList.toggle('is-found', found);
      cell.classList.toggle('is-crossed', crossed);
      cell.classList.toggle('is-missed', Boolean(missed));
      cell.classList.toggle('has-fig', Boolean(f) && (showAll || found));
      cell.querySelector('.mem-badge').innerHTML = found ? icon('check', 16).outerHTML : crossed ? icon('close', 16).outerHTML : '';
      const where = `${tr('Клетка', 'Cell')} ${Math.floor(slot / M.COLS) + 1}–${slot % M.COLS + 1}`;
      const what = f && (showAll || found) ? `: ${this.describe(f)}` : '';
      const mark = found ? ` (${tr('верно', 'right')})` : crossed ? ` (${tr('ошибка', 'mistake')})` : '';
      cell.setAttribute('aria-label', where + what + mark);
    });
  }

  questionChips() {
    const lib = this.original.cr_figures_lib, parts = M.questionParts(this.round.question);
    const chips = [];
    if (parts.state) chips.push(`<span class="mem-chip"><svg class="mem-fig mini ${STATE_CLASS[parts.state]}" viewBox="0 0 100 100" aria-hidden="true" style="--fig:var(--ink-3)"><g class="mem-shape"><rect x="22" y="22" width="56" height="56" rx="14"/></g></svg>${escapeHTML(i18n.t(lib[`cr_state${parts.state}_show`]))}</span>`);
    if (parts.color) chips.push(`<span class="mem-chip"><i class="mem-dot" style="--fig:var(--mem-c${parts.color})"></i>${escapeHTML(i18n.t(lib[`cr_col${parts.color}_show`]))}</span>`);
    if (parts.form) chips.push(`<span class="mem-chip"><svg class="mem-fig mini is-static" viewBox="0 0 100 100" aria-hidden="true" style="--fig:var(--ink-2)"><g class="mem-shape">${SHAPES[parts.form]}</g></svg>${escapeHTML(i18n.t(this.original[`cr_figure_${parts.form}`].show_quest))}</span>`);
    const end = parts.form ? lib.cr_quest_show_end : lib.cr_quest_color_show_end;
    return `<span class="mem-q">${chips.join('')}<span class="mem-q-end">${escapeHTML(i18n.t(end))}</span></span>`;
  }

  updateHead() {
    const head = this.container.querySelector('[data-head]'), g = this.original;
    if (this.phase === 'remember') head.innerHTML = `<span class="mem-title">${escapeHTML(i18n.t(g.cr_remember_txt.text))}</span>`;
    // The review repeats the question, so the marks on the field can be checked against it.
    else if (this.phase === 'review') head.innerHTML = `<span class="mem-title">${escapeHTML(i18n.t(g.cr_original_txt.text))}</span>${this.questionChips()}`;
    else head.innerHTML = `<span class="mem-lead">${escapeHTML(i18n.t(g.cr_figures_lib.cr_quest_show_begin))}</span>${this.questionChips()}`;
    if (this.phase === 'review') head.querySelector('.mem-q').classList.add('is-small');
  }

  updateTimer() {
    const meta = this.container.querySelector('[data-meta]');
    meta.querySelector('[data-left]').textContent = `${Math.max(0, this.remaining)} ${tr('с', 's')}`;
    meta.querySelector('[data-bar]').style.width = `${Math.max(0, this.remaining) / this.level.demoTime * 100}%`;
  }

  updateMeta() {
    const meta = this.container.querySelector('[data-meta]');
    if (this.phase === 'remember') {
      meta.innerHTML = `<div class="bar mem-bar"><i data-bar style="width:100%"></i></div><span class="mem-left num" data-left></span>`;
      this.updateTimer();
      return;
    }
    if (this.phase === 'review') {
      // Legend of the marks on the field, with the counts of the round.
      const missed = this.round.figures.filter(f => M.matches(this.round.question, f) && !this.answer.found.has(f.slot)).length;
      const item = (cls, text, n) => `<span><i class="${cls}"></i>${escapeHTML(text)} <b class="num">${n}</b></span>`;
      meta.innerHTML = `<span class="mem-legend">${item('ok', tr('верно', 'right'), this.answer.right)}`
        + (this.answer.wrong ? item('bad', tr('ошибка', 'mistake'), this.answer.wrong) : '')
        + (missed ? item('miss', tr('не найдено', 'missed'), missed) : '') + '</span>';
      return;
    }
    const total = this.round.tries, log = this.answer.log;
    const dots = Array.from({length: total}, (_, i) => `<i class="${i < log.length ? (log[i] ? 'ok' : 'bad') : ''}"></i>`).join('');
    const text = this.phase === 'answer' ? i18n.t(this.original.cr_tryesleft_txt.text).replace('%d', this.answer.tries) : '';
    meta.innerHTML = `<span class="mem-dots" aria-hidden="true">${dots}</span><span class="mem-left">${escapeHTML(text)}</span>`;
  }

  updateAction() {
    const button = this.container.querySelector('[data-action]');
    const last = this.roundIndex >= this.rounds - 1;
    button.hidden = false;
    button.classList.toggle('mem-idle', this.phase === 'answer' || this.phase === 'done');
    if (this.phase === 'remember') button.innerHTML = `${escapeHTML(tr('Готово', 'Ready'))}${icon('chevron').outerHTML}`;
    else if (this.phase === 'review') button.innerHTML = last ? `${icon('check').outerHTML}${escapeHTML(i18n.t('Result', 'Результат'))}` : `${escapeHTML(i18n.t('Next', 'Далее'))}${icon('chevron').outerHTML}`;
    button.tabIndex = button.classList.contains('mem-idle') ? -1 : 0;
  }

  syncPause() {
    const board = this.container?.querySelector('[data-board]');
    if (!board) return;
    const paused = Boolean(this._paused) && !this.finished;
    board.classList.toggle('is-paused', paused);
    board.classList.toggle('is-masked', paused && this.phase === 'remember');
  }

  finishGame() {
    const s = M.totalScore(this.right, this.wrong, this.cost, this.wrongPercent);
    const lib = this.original.cr_show_results;
    this.finish(s.total, null, {items: [
      {title: i18n.t(lib.i1_title), text: `${this.right} ${tr('из', 'of')} ${s.answers}`, result: s.rightPoints},
      {title: i18n.t(lib.i2_title), text: `${this.wrong} x ${fmt(s.perWrong)}`, result: s.wrongPoints},
    ]});
  }
}
