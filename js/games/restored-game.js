// Base class of every v2 game. It draws the game screen (top bar, status line, stage, footer), runs
// the clock, the pause sheet and the rules, records the result the moment the game ends and shows
// the results sheet. Games call: begin(), frame(), tick(), updateScore(), finish(), menu(), help().
//
//   new Game(container, host)
//   host = {mode: 'free'|'training'|'test', difficulty, level (the difficulty shown in the header; a test task may
//          be shown under another level than the one it plays by), testStep: {index, total}|null,
//          onResult(score, details) -> Promise<outcome>,   // records; outcome shapes the results sheet
//          onDone(outcome), onExit(), onRestart(finished)}
import { audio } from '../audio.js';
import { i18n } from '../i18n.js';
import { loadOriginalConfig, difficultyIndex } from '../original.js';
import { buildResults } from './results-window.js';
import { icon } from '../core/icons.js';
import { h, fmt } from '../core/dom.js';
import { sheet, confirmDialog } from '../ui/overlay.js';
import { rulesText, demoBlock } from '../ui/demos.js';

// Strings made for the web: Russian text, else the English key through the locale tables.
export const tr = (ru, en) => i18n.getLang() === 'ru' ? ru : i18n.t(en);
export const escapeHTML = value => String(value).replace(/[&<>"']/g, c =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export const HELP_KEYS = {memorics: 'cr_help', numbers: 'numbers_help', geometry: 'geometry_help', encyclopedia: 'iv_help',
  guess_who: 'ant_head_help', arithmetics: 'cc_help', roadblocks: 'rb_help', minesweeper: 'ms_help', pairs: 'pairs_help',
  quadronica: 'znax_help', sudoku: 'sudoku_help', matches: 'matches_help'};
export const DIFF_LABEL = () => ({easy: i18n.t('Easy', 'Легко'), medium: i18n.t('Medium', 'Средне'), hard: i18n.t('Hard', 'Сложно'), ultra: i18n.t('Maximum', 'Максимум')});

const svgHTML = name => icon(name).outerHTML;

export class RestoredGame {
  constructor(container, host = {}) {
    this.container = container;
    this.host = typeof host === "object" && host ? host : {};
    this.mode = this.host.mode || 'free';
    this.generation = 0;
    this.timers = new Set();
    this.sheets = new Set();
  }

  async begin(difficulty) {
    this.destroy();
    const generation = this.generation;
    Object.assign(this, {destroyed: false, finished: false, isPaused: false, difficulty, diff: difficultyIndex(difficulty), score: 0, elapsed: 0, shownScore: undefined,
      startedAt: Date.now()});
    try {
      this.config = await loadOriginalConfig();
      this.original = this.config.games;
    } catch (error) {
      if (generation === this.generation) this.container.replaceChildren(h('p', {class: 'empty', role: 'alert'}, tr('Не удалось загрузить игровые данные.', 'Unable to load game data.')));
      throw error;
    }
    return generation === this.generation && !this.destroyed;
  }

  get playable() { return !this.destroyed && !this.finished && !this.isPaused; }
  get inTest() { return this.mode === 'test' || this.mode === 'marking'; }

  tick(callback) {
    // `ticking` marks the clock's own score changes: they are not shown as a gain or a loss of a move.
    const timer = setInterval(() => {
      if (!this.playable || document.hidden) return;
      this.ticking = true;
      try { callback(); } finally { this.ticking = false; }
    }, 1000);
    this.timers.add(timer);
    return timer;
  }
  // setTimeout that dies with the game and waits while paused.
  defer(callback, delay = 0) {
    const generation = this.generation;
    const run = () => {
      this.timers.delete(timer);
      if (generation !== this.generation || this.destroyed) return;
      if (this.isPaused) { timer = setTimeout(run, 60); this.timers.add(timer); return; }
      callback();
    };
    let timer = setTimeout(run, delay);
    this.timers.add(timer);
    return timer;
  }

  subtitle() {
    const parts = [DIFF_LABEL()[this.host.level || this.difficulty] || ''];
    if (this.mode === 'training') parts.push(i18n.t('Training', 'Тренировка'));
    if (this.inTest && this.host.testStep) parts.push(`${i18n.t('Test', 'Тест')} ${this.host.testStep.index + 1}/${this.host.testStep.total}`);
    return parts.filter(Boolean).join(' · ');
  }

  // body and footer are markup strings built by the game (dynamic text escaped with escapeHTML).
  frame(title, body, footer = '') {
    const step = this.inTest && this.host.testStep
      ? `<span class="test-step" aria-hidden="true">${Array.from({length: this.host.testStep.total}, (_, i) => `<i class="${i < this.host.testStep.index ? 'on' : i === this.host.testStep.index ? 'cur' : ''}"></i>`).join('')}</span>` : '';
    this.container.innerHTML = `<div class="game-screen ${this.id}-screen" data-game="${this.id}">
      <header class="game-bar">
        <button class="icon-btn" data-game-exit aria-label="${escapeHTML(i18n.t('Back', 'Назад'))}">${svgHTML('back')}</button>
        <div class="gb-title"><b>${escapeHTML(title)}</b><span>${escapeHTML(this.subtitle())} ${step}</span></div>
        <button class="icon-btn" data-game-help aria-label="${escapeHTML(i18n.t('Rules', 'Правила'))}">${svgHTML('help')}</button>
        <button class="icon-btn" data-game-pause aria-label="${escapeHTML(i18n.t('Pause', 'Пауза'))}">${svgHTML('pause')}</button>
      </header>
      <div class="game-status">
        <span class="gs-item accent">${svgHTML('star')}<span data-score>${Math.max(0, Math.round(this.score))}</span></span>
        <span class="gs-item" data-clock-wrap hidden>${svgHTML('timer')}<span data-clock></span></span>
        <span class="gs-item" data-status-wrap><span data-status></span></span>
      </div>
      <div class="game-stage">${body}</div>
      <div class="game-footer">${footer}</div></div>`;
    const q = sel => this.container.querySelector(sel);
    q('[data-game-exit]').onclick = () => this.exit();
    q('[data-game-pause]').onclick = () => this.menu();
    q('[data-game-help]').onclick = () => this.help();
    this.syncStatus();
  }

  // Hides the status chip that has no text.
  syncStatus() {
    const wrap = this.container.querySelector('[data-status-wrap]');
    if (wrap) wrap.hidden = !wrap.textContent.trim();
  }

  // Shows the clock chip in the status row (seconds counted by the game, or this.elapsed).
  setClock(seconds = this.elapsed) {
    const wrap = this.container.querySelector('[data-clock-wrap]'), el = this.container.querySelector('[data-clock]');
    if (!wrap || !el) return;
    wrap.hidden = false;
    const v = Math.max(0, Math.round(seconds));
    el.textContent = `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
  }

  // Shows text in the status chip (e.g. "3 / 20").
  setStatus(text) {
    const el = this.container.querySelector('[data-status]');
    if (el) el.textContent = text;
    this.syncStatus();
  }

  // Shows the score; what the last move gave or cost pops up as a badge at the score chip (v3.3: in every game the
  // player sees the points of a move, also without sound). The per-second change of the clock is not shown.
  updateScore() {
    const el = this.container.querySelector('[data-score]');
    const shown = Math.max(0, Math.round(this.score));
    if (el) {
      el.textContent = fmt(shown);
      // gain(points) names the exact value of the move (when the shown total also moves with time or is cut at 0).
      const delta = this.pendingGain ?? (this.shownScore === undefined ? 0 : shown - this.shownScore);
      if (delta && !this.ticking && !this.finished) this.scoreDelta(el, delta);
    }
    this.pendingGain = undefined;
    this.shownScore = shown;
    this.syncStatus();
  }
  gain(points) { this.pendingGain = points; }
  scoreDelta(el, delta) {
    const chip = el.closest('.gs-item');
    if (!chip) return;
    chip.querySelectorAll('.gs-delta').forEach(old => old.remove());
    const badge = h('span', {class: `gs-delta ${delta > 0 ? 'plus' : 'minus'}`, 'aria-hidden': 'true'}, `${delta > 0 ? '+' : '−'}${fmt(Math.abs(delta))}`);
    badge.addEventListener('animationend', () => badge.remove(), {once: true});
    chip.append(badge);
    chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump');
  }

  openSheet(options) {
    const s = sheet({...options, onClose: reason => { this.sheets.delete(s); options.onClose?.(reason); }});
    this.sheets.add(s);
    return s;
  }

  menu() {
    if (!this.playable) return;
    this.isPaused = true;
    audio.play('click');
    const resume = () => { this.isPaused = false; this.onResume?.(); };
    let picked = false;
    const s = this.openSheet({
      title: i18n.t('Paused', 'Пауза'),
      onClose: () => { if (!picked) resume(); },
      actions: [
        h('button', {class: 'btn btn-primary btn-block btn-lg', onclick: () => { picked = true; s.close(); resume(); }}, icon('play'), i18n.t('Resume', 'Продолжить')),
        this.inTest ? null : h('button', {class: 'btn btn-block', onclick: () => { picked = true; s.close(); this.restart(); }}, icon('restart'), i18n.t('New Game', 'Новая игра')),
        h('button', {class: 'btn btn-block', onclick: () => { picked = true; s.close(); this.help(true); }}, icon('help'), i18n.t('Rules', 'Правила')),
        h('button', {class: 'btn btn-block btn-ghost', onclick: () => { picked = true; s.close(); this.exit(true); }}, icon('back'), i18n.t('Exit', 'Выйти')),
      ]});
  }

  restart() { this.isPaused = false; this.host.onRestart ? this.host.onRestart(this.finished) : this.init(this.difficulty); }

  // The back arrow asks before dropping a game that has run for a while (the result of an unfinished game is not
  // kept); `sure` — the player has just chosen Exit in the pause menu.
  async exit(sure = false) {
    if (!this.inTest && !this.finished && !sure && Date.now() - (this.startedAt || 0) > 20000) {
      const paused = this.isPaused;
      this.isPaused = true;
      const ok = await confirmDialog({title: i18n.t('Leave the game?', 'Выйти из игры?'),
        text: i18n.t('The result of this game will not be saved.', 'Результат этой партии не сохранится.'),
        ok: i18n.t('Exit', 'Выйти'), cancel: i18n.t('Stay', 'Остаться')});
      if (!ok) { this.isPaused = paused; if (!paused) this.onResume?.(); return; }
    }
    if (this.inTest && !this.finished) {
      this.isPaused = true;
      const ok = await confirmDialog({title: i18n.t('Leave the test?', 'Выйти из теста?'),
        text: i18n.t('The test is saved. When you continue, this task starts again.', 'Тест сохранится. Когда вы продолжите, это задание начнётся заново.'),
        ok: i18n.t('Exit', 'Выйти'), cancel: i18n.t('Stay', 'Остаться')});
      if (!ok) { this.isPaused = false; this.onResume?.(); return; }
    }
    this.destroy();
    this.host.onExit?.();
  }

  // Step-by-step rules of js/ui/demos.js win over the original text.
  helpText() {
    const own = rulesText(this.id);
    if (own) return own;
    const help = this.original?.[HELP_KEYS[this.id]];
    return help?.['2_value'] ? i18n.t(help['2_value']).replace(/\\n/g, '\n').replace(/@\w+/g, '').trim() : '';
  }

  help(fromMenu = false) {
    const wasPaused = this.isPaused;
    if (!this.finished) this.isPaused = true;
    const s = this.openSheet({title: this.title, body: [h('p', {class: 'help-text'}, this.helpText() || this.host.description || ''), demoBlock(this.id)],
      actions: [h('button', {class: 'btn btn-primary btn-block', onclick: () => s.close()}, i18n.t('Got it', 'Понятно'))],
      onClose: () => { if (fromMenu) this.menu(); else if (!wasPaused && !this.finished) { this.isPaused = false; this.onResume?.(); } }});
  }

  // The lightbulb button of games with a hint() (not in the test: there the hint would give away a move).
  // A hinted move scores 0, so the hint teaches without paying.
  hintButton() {
    if (this.inTest || !this.hint) return '';
    return `<button class="btn btn-hint" data-game-hint>${svgHTML('bulb')}${escapeHTML(i18n.t('Hint', 'Подсказка'))}</button>`;
  }
  bindHint() {
    const btn = this.container.querySelector('[data-game-hint]');
    if (btn) btn.onclick = () => { if (this.playable) { audio.play('click'); this.hint(); } };
  }

  // results: {section: [*_show_results], values: {DIST, TIME, P1, ...}} — the original results items.
  async finish(score = this.score, results = null, extra = {}) {
    if (this.finished || this.destroyed) return;
    this.finished = true;
    this.timers.forEach(clearInterval); this.timers.forEach(clearTimeout); this.timers.clear();
    const built = results ? buildResults(results.section, results.values, Math.min(this.diff, 2)) : null;
    this.score = Math.max(0, Math.round(built ? built.total : score));
    this.updateScore();
    audio.play('levelUp');
    const items = extra.items || built?.items || [];
    let outcome = {};
    let feats = null;
    try { feats = this.feats?.() || null; } catch (e) { feats = null; }
    const seconds = this.startedAt ? Math.round((Date.now() - this.startedAt) / 1000) : null;
    try { outcome = (await this.host.onResult?.(this.score, {items, difficulty: this.difficulty, feats, seconds, clock: this.elapsed})) || {}; }
    catch (error) { console.error('Recording the result failed:', error); }
    if (this.destroyed) return;
    this.showResults(items, outcome);
  }

  showResults(items, outcome) {
    const rows = items.filter(item => item.title || item.text).map(item => h('div', {class: `results-item${item.result < 0 ? ' neg' : ''}`},
      h('div', null, h('div', {class: 'ri-label'}, item.title), item.text ? h('div', {class: 'ri-calc'}, item.text) : null),
      h('div', {class: 'ri-val'}, item.result > 0 ? `+${fmt(item.result)}` : item.result < 0 ? `−${fmt(-item.result)}` : '0')));
    const body = [];
    if (rows.length) body.push(h('div', {class: 'results-list'}, rows));
    body.push(h('div', {class: 'results-total'}, h('span', {class: 'muted'}, i18n.t('Total', 'Итого')), h('b', {class: 'num'}, fmt(this.score))));
    if (outcome.note) body.push(h('p', {class: 'muted small'}, outcome.note));
    for (const event of outcome.events || []) body.push(h('div', {class: `event ${event.kind}`}, icon(event.icon || 'info'), h('div', null, h('b', null, event.title), event.text ? h('p', {class: 'small muted'}, event.text) : null)));
    const done = () => { s.close(); this.destroy(); this.host.onDone?.(outcome); };
    const actions = [h('button', {class: 'btn btn-primary btn-block btn-lg', onclick: done, autofocus: true}, outcome.continueLabel || i18n.t('Continue', 'Продолжить'))];
    if (this.mode === 'free') actions.push(h('button', {class: 'btn btn-block', onclick: () => { s.close(); this.restart(); }}, icon('restart'), i18n.t('Play again', 'Играть ещё')));
    const s = this.openSheet({title: this.score > 0 ? i18n.t('Result', 'Результат') : i18n.t('Too bad!', 'Неудачно!'), body, actions, dismissible: false});
  }

  destroy() {
    this.destroyed = true; this.generation++;
    this.timers.forEach(t => { clearInterval(t); clearTimeout(t); }); this.timers.clear();
    for (const s of [...this.sheets]) s.close('destroy');
  }
}
