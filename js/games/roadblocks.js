// Roadblocks / Balltracker: roll the ball to an exit. Rules — roadblocks-model.js; v2 view (SVG field).
// Fields come from a not-done pool per difficulty (profile.notDone.roadblocks), so they do not repeat
// until every field of the difficulty has been solved. The first round goes from the simpler fields to the
// harder ones (the order of data/roadblocks_levels.json), the next rounds are shuffled.
import { RestoredGame, tr, escapeHTML } from './restored-game.js';
import { shuffle } from '../original.js';
import { APP_VERSION } from '../version.js';
import { audio } from '../audio.js';
import { i18n } from '../i18n.js';
import { storage } from '../storage.js';
import { icon } from '../core/icons.js';
import { fmt } from '../core/dom.js';
import * as M from './roadblocks-model.js';

const DIFF_KEY = ['easy', 'medium', 'hard'];
// The set of fields the saved pools belong to: 3.9 re-sorted the pools, so the pools of the older set start again.
const POOL_SET = 2;
const STEP_MS = 45;            // one cell of rolling
const SWIPE_PX = 18;
const ARROW_TURN = {'^': 0, '>': 90, 'v': 180, '<': 270};
const KEYS = {ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1]};
// Arrow glyph pointing up inside a 1×1 cell; rotated for the other directions.
const ARROW_PATH = 'M.5 .2 .79 .5H.6V.8H.4V.5H.21Z';
const PAD = [['up', -1, 0], ['left', 0, -1], ['down', 1, 0], ['right', 0, 1]];

export class RoadblocksGame extends RestoredGame {
  id = 'roadblocks';
  get title() { return tr('Препятствия', 'Balltracker'); }
  // Stats of the finished game for the achievements (js/achievements.js).
  // `shortest`: fields passed in the fewest possible rolls without losing the ball (the «Shortest way» achievement).
  // For the log of games (the balance of the fields): `rolls` and `par` — the rolls made and the fewest possible
  // over the game; per field f1…f3 — its `uid` in the data file, s1…s3 — seconds, r1…r3 — rolls.
  feats() {
    const log = this.fieldLog || [];
    return {perfect: this.lost === 0, mistakes: this.lost, shortest: this.shortest || 0,
      rolls: log.reduce((n, f) => n + f.rolls, 0), par: log.reduce((n, f) => n + f.par, 0),
      ...Object.fromEntries(log.flatMap((f, i) => [[`f${i + 1}`, f.uid], [`s${i + 1}`, f.sec], [`r${i + 1}`, f.rolls]]))};
  }

  helpText() {
    return [super.helpText(),
      tr('Выход открывается только по направлению стрелки: подкатите шар так, чтобы он въехал в стрелку по ходу. С других сторон стрелка — стена.',
        'An exit opens only in the direction of its arrow: the ball must roll into it the way the arrow points. From other sides the arrow is a wall.'),
      tr('Если шар укатится за край поля, он вернётся на старт, а очки уменьшатся.', 'If the ball rolls off the field, it returns to the start and you lose points.'),
    ].filter(Boolean).join('\n\n');
  }

  async init(difficulty = 'easy') {
    if (!await this.begin(difficulty)) return;
    const generation = this.generation;
    let levels;
    try {
      const response = await fetch(`data/roadblocks_levels.json?v=${APP_VERSION}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      levels = await response.json();
    } catch (error) {
      if (generation === this.generation && !this.destroyed) this.container.innerHTML = `<p class="empty" role="alert">${escapeHTML(tr('Не удалось загрузить игровые данные.', 'Unable to load game data.'))}</p>`;
      throw error;
    }
    if (this.destroyed || generation !== this.generation) return;
    const d = Math.min(this.diff, 2);
    this.poolKey = DIFF_KEY[d];
    this.lostCost = Number(this.original.rb_game_wnd[`g_nRB${['Easy', 'Med', 'Hard'][d]}WrongCfx`]);
    const all = levels[this.poolKey], count = Number(String(this.original[`rb_lev_${d}`].m_nFieldsCount).trim()) || 1;
    const dealt = M.dealFields(this.savedPool(), all.map(level => level.level), count, shuffle);
    this.savePool(() => dealt.pool);
    this.levels = dealt.fields.map(id => all.find(level => level.level === id));
    this.levelIndex = 0; this.lost = 0; this.summary = 0; this.shortest = 0; this.fieldLog = [];
    this.render();
    this.loadLevel();
    this.tick(() => { if (this.phase === 'play') { this.elapsed++; this.setClock(); } });
    this.keyHandler = event => {
      if (!this.playable || event.ctrlKey || event.metaKey || event.altKey) return;
      const direction = KEYS[event.key];
      if (direction) { event.preventDefault(); this.moveBall(...direction); return; }
      if (this.phase === 'solved' && (event.key === 'Enter' || event.key === ' ') && !event.target.closest?.('button')) { event.preventDefault(); this.nextField(); }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  savedPool() {
    try { const pools = storage.getProfile()?.notDone?.roadblocks; return pools?.set === POOL_SET ? pools[this.poolKey] : null; } catch { return null; }
  }

  savePool(update) {
    try {
      if (!storage.getProfile()) return;
      storage.updateProfile(profile => {
        profile.notDone ||= {};
        const pools = profile.notDone.roadblocks ||= {};
        if (pools.set !== POOL_SET) { for (const key of DIFF_KEY) delete pools[key]; pools.set = POOL_SET; }
        pools[this.poolKey] = update(pools[this.poolKey] || []);
      });
    } catch (error) { console.warn('Roadblocks pool was not saved:', error); }
  }

  render() {
    const pad = PAD.map(([name, dr, dc]) => `<button class="rb-key rb-key-${name}" data-roll="${dr},${dc}"
      aria-label="${escapeHTML({up: tr('Вверх', 'Up'), down: tr('Вниз', 'Down'), left: tr('Влево', 'Left'), right: tr('Вправо', 'Right')}[name])}">
      <svg viewBox="0 0 1 1" aria-hidden="true"><path d="${ARROW_PATH}" transform="rotate(${{up: 0, right: 90, down: 180, left: 270}[name]} .5 .5)"/></svg></button>`).join('');
    this.frame(this.title, `
      <div class="board rb-board">
        <p class="board-note rb-note" data-note aria-live="polite"></p>
        <div class="rb-field" data-field>
          <svg class="rb-svg" viewBox="0 0 18 22" role="img" aria-label="${escapeHTML(tr('Поле: блоки, выходы со стрелками и шар', 'Field: blocks, exits with arrows and the ball'))}" data-svg></svg>
          <div class="rb-done" data-done hidden>
            <div class="rb-done-card" role="status">
              <span class="rb-done-icon">${icon('check').outerHTML}</span>
              <b>${escapeHTML(tr('Выход найден!', 'Exit reached!'))}</b>
              <span class="muted small" data-done-text></span>
              <button class="btn btn-primary btn-block" data-next>${escapeHTML(i18n.t('Next', 'Далее'))}${icon('chevron').outerHTML}</button>
            </div>
          </div>
        </div>
      </div>`,
      `<div class="rb-pad" data-pad>${pad}</div>`);
    this.svg = this.container.querySelector('[data-svg]');
    this.fieldEl = this.container.querySelector('[data-field]');
    this.container.querySelectorAll('[data-roll]').forEach(button => {
      button.onclick = () => this.moveBall(...button.dataset.roll.split(',').map(Number));
    });
    this.container.querySelector('[data-next]').onclick = () => this.nextField();
    let start = null;
    this.svg.addEventListener('pointerdown', event => {
      start = {x: event.clientX, y: event.clientY};
      this.svg.setPointerCapture?.(event.pointerId);
    });
    this.svg.addEventListener('pointercancel', () => { start = null; });
    this.svg.addEventListener('pointerup', event => {
      if (!start) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      start = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE_PX) { this.rollToward(dx, dy); return; }
      // A tap rolls the ball towards the tapped point (along the longer axis).
      const box = this.svg.getBoundingClientRect();
      const c = (event.clientX - box.left) / box.width * this.cols - (this.ball.c + 0.5);
      const r = (event.clientY - box.top) / box.height * this.rows - (this.ball.r + 0.5);
      if (Math.max(Math.abs(c), Math.abs(r)) >= 0.6) this.rollToward(c, r);
    });
  }

  rollToward(dx, dy) { this.moveBall(...(Math.abs(dx) > Math.abs(dy) ? [0, Math.sign(dx)] : [Math.sign(dy), 0])); }

  loadLevel() {
    this.currentLevel = this.levels[this.levelIndex];
    this.board = this.currentLevel.rows;
    this.rows = this.board.length; this.cols = this.board[0].length;
    // Fields differ in size (easy: 9 × 11, the original ones: 18 × 22); the frame keeps the cell grid square.
    this.svg.setAttribute('viewBox', `0 0 ${this.cols} ${this.rows}`);
    this.fieldEl.style.setProperty('--rb-cols', this.cols);
    this.fieldEl.style.setProperty('--rb-rows', this.rows);
    this.start = M.findStart(this.board);
    this.ball = {...this.start};
    this.fieldRolls = 0; this.fieldLost = 0; this.minRolls = M.solveRoadblocks(this.board)?.length || 0; this.fieldFrom = this.elapsed || 0;
    this.phase = 'play'; this.isMoving = false;
    this.container.querySelector('[data-done]').hidden = true;
    this.setPad(true);
    this.drawField();
    this.note(tr('Катите шар в выход по направлению стрелки', 'Roll the ball into an exit the way its arrow points'));
    this.updateStatus();
    this.setClock();
  }

  drawField() {
    const {rows, cols} = this, parts = [];
    parts.push(`<rect class="rb-floor" x="0" y="0" width="${cols}" height="${rows}" rx=".35"/>`);
    let grid = '';
    for (let c = 1; c < cols; c++) grid += `M${c} 0V${rows}`;
    for (let r = 1; r < rows; r++) grid += `M0 ${r}H${cols}`;
    parts.push(`<path class="rb-grid" d="${grid}" vector-effect="non-scaling-stroke"/>`);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cell = this.board[r][c];
      if (cell === '+') parts.push(`<rect class="rb-block" data-cell="${r},${c}" x="${c + 0.07}" y="${r + 0.07}" width=".86" height=".86" rx=".2"/>`);
      else if (cell in ARROW_TURN) parts.push(`<g class="rb-exit" data-cell="${r},${c}" transform="translate(${c} ${r})">
          <rect x=".05" y=".05" width=".9" height=".9" rx=".24"/><path d="${ARROW_PATH}" transform="rotate(${ARROW_TURN[cell]} .5 .5)"/></g>`);
    }
    parts.push(`<circle class="rb-start" cx="${this.start.c + 0.5}" cy="${this.start.r + 0.5}" r=".3" vector-effect="non-scaling-stroke"/>`);
    parts.push(`<g class="rb-ball" data-ball><circle cx=".5" cy=".5" r=".38"/><circle class="rb-ball-shine" cx=".38" cy=".36" r=".12"/></g>`);
    this.svg.innerHTML = parts.join('');
    this.ballEl = this.svg.querySelector('[data-ball]');
    this.placeBall();
  }

  placeBall(opacity = 1) {
    this.ballEl?.setAttribute('transform', `translate(${this.ball.c} ${this.ball.r})`);
    this.ballEl?.setAttribute('opacity', String(opacity));
  }

  note(text) { const el = this.container.querySelector('[data-note]'); if (el) el.textContent = text; }

  setPad(enabled) { this.container.querySelectorAll('[data-roll]').forEach(b => { b.disabled = !enabled; }); }

  updateStatus() {
    this.setStatus(`${tr('Поле', 'Field')} ${this.levelIndex + 1}/${this.levels.length}${this.lost ? ` · ${tr('потери', 'lost')} ${this.lost}` : ''}`);
    this.updateScore();
  }

  // Briefly marks the cell the ball stopped at (a block, or an exit approached from the side).
  flashCell(at) {
    if (!at) return;
    const el = this.svg.querySelector(`[data-cell="${at.r},${at.c}"]`);
    if (!el) return;
    el.classList.remove('rb-hit'); void el.getBoundingClientRect(); el.classList.add('rb-hit');
  }

  flashField(name) {
    this.fieldEl.classList.remove(name); void this.fieldEl.offsetWidth; this.fieldEl.classList.add(name);
  }

  moveBall(dr, dc) {
    if (!this.playable || this.isMoving || this.phase !== 'play') return;
    const result = M.rollBall(this.board, this.ball, dr, dc);
    if (!result.path.length && !result.lost) {
      audio.play('hitWall'); this.flashCell(result.blockedBy);
      if (result.blockedBy && this.board[result.blockedBy.r][result.blockedBy.c] in ARROW_TURN) this.note(tr('С этой стороны стрелка — стена', 'From this side the arrow is a wall'));
      return;
    }
    this.isMoving = true;
    this.fieldRolls++;
    const origin = {...this.ball};
    // A lost ball rolls one more cell past the edge and fades out.
    const path = result.lost ? [...result.path, {r: (result.path.at(-1) || origin).r + dr, c: (result.path.at(-1) || origin).c + dc}] : result.path;
    const generation = this.generation;
    let progress = 0, last = null;
    const step = timestamp => {
      if (generation !== this.generation || this.destroyed) return;
      const dt = last === null ? 0 : Math.min(50, timestamp - last);
      last = timestamp;
      if (this.playable && !document.hidden) progress += dt / STEP_MS;
      const at = Math.min(path.length, progress), full = Math.floor(at), fraction = at - full;
      const from = full === 0 ? origin : path[full - 1], to = path[full] || from;
      this.ball = {r: from.r + (to.r - from.r) * fraction, c: from.c + (to.c - from.c) * fraction};
      this.placeBall(result.lost && at > path.length - 1 ? Math.max(0, path.length - at) : 1);
      if (progress < path.length) { this.animation = requestAnimationFrame(step); return; }
      this.isMoving = false;
      this.landed(result);
    };
    this.animation = requestAnimationFrame(step);
  }

  landed(result) {
    if (result.lost) {
      this.lost++; this.fieldLost++;
      this.score += this.lostCost;
      this.ball = {...this.start}; this.placeBall();
      audio.play('wrong');
      this.flashField('rb-lost');
      this.note(tr('Шар укатился за край (%s) и вернулся на старт', 'The ball rolled off the field (%s) and is back at the start')
        .replace('%s', `${this.lostCost < 0 ? '−' : '+'}${fmt(Math.abs(this.lostCost))}`));
      this.updateStatus();
      return;
    }
    if (result.goal) {
      const points = Number(this.currentLevel.max_score);
      this.score += points; this.summary += points;
      if (!this.fieldLost && this.minRolls && this.fieldRolls <= this.minRolls) this.shortest++;
      this.fieldLog.push({uid: Number(this.currentLevel.uid) || 0, sec: (this.elapsed || 0) - this.fieldFrom, rolls: this.fieldRolls, par: this.minRolls});
      this.flashCell(result.path.at(-1));
      const id = this.currentLevel.level;
      this.savePool(pool => pool.filter(level => level !== id));
      audio.play('good');
      this.updateStatus();
      if (this.levelIndex >= this.levels.length - 1) {
        this.phase = 'complete'; this.setPad(false);
        this.finish(this.score, {section: this.original.rb_show_results, values: {DIST: this.summary, P1: this.lost, TOTAL: Math.round(this.score)}});
        return;
      }
      this.phase = 'solved'; this.setPad(false);
      const done = this.container.querySelector('[data-done]');
      done.querySelector('[data-done-text]').textContent = `${tr('Поле пройдено', 'Field completed')}: ${this.levelIndex + 1} / ${this.levels.length}`;
      done.hidden = false;
      done.querySelector('[data-next]').focus({preventScroll: true});
      this.note('');
      return;
    }
    audio.play('hitWall');
    this.flashCell(result.blockedBy);
    if (result.blockedBy && this.board[result.blockedBy.r][result.blockedBy.c] in ARROW_TURN) this.note(tr('С этой стороны стрелка — стена', 'From this side the arrow is a wall'));
  }

  nextField() {
    if (!this.playable || this.phase !== 'solved') return;
    audio.play('click');
    this.levelIndex++;
    this.loadLevel();
  }

  destroy() {
    super.destroy();
    cancelAnimationFrame(this.animation);
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
  }
}
