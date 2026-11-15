// Matches: one puzzle per game — move, add or remove matches to get the figure from the task.
// The check is the original one (matches-model.js, FUN_4a0909a4); the v2 view draws the level
// lattice as a dot grid and puts every match into a lattice slot, so a match never lands turned.
import { RestoredGame, tr, escapeHTML } from './restored-game.js';
import { arrayValue } from '../original.js';
import { APP_VERSION } from '../version.js';
import { audio } from '../audio.js';
import { i18n } from '../i18n.js';
import { storage } from '../storage.js';
import { icon } from '../core/icons.js';
import { fmt } from '../core/dom.js';
import { buildResults } from './results-window.js';
import * as M from './matches-model.js';

const DIFF_KEYS = ['easy', 'medium', 'hard'];
const DRAG_PX = 6;          // pointer travel that turns a press into a drag
const HIT_MATCH = 0.6;      // hit radius around a match, cell units (a match is 2 cells long)
const HIT_SLOT = 0.9;       // hit radius around the centre of an empty slot
const HIT_DROP = 1.05;      // a dragged match snaps to an empty slot this close
const INSET = 0.24;         // gap at both ends of a match, so joints stay visible
const ICON_ATTRS = 'viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
const UNDO_ICON = `<svg ${ICON_ATTRS}><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>`;
const ROTATE_ICON = `<svg ${ICON_ATTRS}><path d="M8 17 16 7"/><path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3"/><path d="M18 3v4h-4"/><path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3"/><path d="M6 21v-4h4"/></svg>`;

let levelsPromise = null;
const loadLevels = () => (levelsPromise ||= fetch(`data/matches_levels.json?v=${APP_VERSION}`).then(r => {
  if (!r.ok) throw new Error(`matches_levels.json: HTTP ${r.status}`);
  return r.json();
}));

const n3 = value => Number(value.toFixed(3));
// tr() with %d placeholders, so the keys stay the same for the translators.
const trf = (ru, en, ...args) => { let i = 0; return tr(ru, en).replace(/%d/g, () => String(args[i++])); };
const shrink = ([x1, y1, x2, y2], by) => {
  const len = Math.hypot(x2 - x1, y2 - y1), k = by / len;
  return [x1 + (x2 - x1) * k, y1 + (y2 - y1) * k, x2 - (x2 - x1) * k, y2 - (y2 - y1) * k];
};
const distToSegment = (x, y, [x1, y1, x2, y2]) => {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - x1 - t * dx, y - y1 - t * dy);
};
// The match head: a short thick piece on the top / right end, like the original sprites.
const headPiece = ([x1, y1, x2, y2], ch) => {
  const [ex, ey, sx, sy] = ch === '|' ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
  const len = Math.hypot(sx - ex, sy - ey), ux = (sx - ex) / len, uy = (sy - ey) / len;
  return [ex + ux * 0.1, ey + uy * 0.1, ex + ux * 0.28, ey + uy * 0.28];
};

export class MatchesGame extends RestoredGame {
  id = 'matches';
  get title() { return tr('Спички', 'Matches'); }
  // Stats of the finished game for the achievements (js/achievements.js): only a solved puzzle counts.
  feats() { return {perfect: Boolean(this.solvedOk) && this.wrong === 0, solved: Boolean(this.solvedOk), mistakes: this.wrong}; }

  async init(difficulty = 'easy') {
    if (!await this.begin(difficulty)) return;
    const generation = this.generation;
    let data;
    try { data = await loadLevels(); } catch (error) {
      levelsPromise = null;
      if (generation === this.generation) this.container.innerHTML = `<p class="empty" role="alert">${escapeHTML(tr('Не удалось загрузить головоломки.', 'Unable to load game data.'))}</p>`;
      throw error;
    }
    if (generation !== this.generation || this.destroyed) return;

    const d = Math.min(this.diff, 2);
    this.key = DIFF_KEYS[d];
    this.difficulty = this.key;   // the route may say "med" (minigames.json); the subtitle needs "medium"
    // Levels marked "disabled" in the data are out of the game (see docs/games/matches.md).
    this.levels = (data[this.key] || []).filter(level => !level.disabled);
    // Unsolved-level pools: one for training and one for free play, per difficulty.
    this.poolMode = this.mode === 'training' ? 'training' : 'free';
    const pool = M.readPool(storage.getProfile().notDone?.matches?.[this.poolMode], this.key, this.levels.map(level => level.id));
    const id = M.nextLevel(pool);
    this.pool = {...pool, last: id};
    this.newRound = pool.newRound;
    this.savePool();
    this.level = this.levels.find(level => level.id === id) || this.levels[0];
    if (!this.level) {
      this.container.innerHTML = `<p class="empty" role="alert">${escapeHTML(tr('Не удалось загрузить головоломки.', 'Unable to load game data.'))}</p>`;
      return;
    }
    this.position = this.levels.indexOf(this.level) + 1;

    const wnd = this.original.matches_wnd, field = this.original.matches_game_field;
    this.prize = Number(this.level.mips || 0) * arrayValue(wnd.points_good_move_arr, d);
    this.penalty = arrayValue(wnd.points_wrong_move_arr, d);
    this.maxWrong = arrayValue(field.diff_max_moves, d) || 50;
    this.lat = M.lattice(this.level);
    this.moves = M.taskMoves(this.level);
    this.start = this.level.board.map(String);
    this.wrong = 0; this.solvedOk = false;
    this.restore({rows: this.start, hand: this.level.add || 0, removed: 0});
    this.history = [];
    this.score = this.prize;
    this.render();
    this.tick(() => { this.elapsed++; this.setClock(); });

    this.keyHandler = event => this.onKey(event);
    window.addEventListener('keydown', this.keyHandler);
  }

  // ---------------------------------------------------------------- state
  snapshot() { return {rows: this.rows.map(row => row.join('')), hand: this.hand, removed: this.removed}; }
  restore(state) {
    this.rows = state.rows.map(row => [...String(row).padEnd(M.SIZE, '.')].slice(0, M.SIZE));
    this.hand = state.hand; this.removed = state.removed;
    this.selected = null; this.drag = null; this.press = null;
  }
  remember() {
    this.history.push(this.snapshot());
    if (this.history.length > 300) this.history.shift();
  }
  boardRows() { return this.rows.map(row => row.join('')); }
  isPristine() { return this.hand === (this.level.add || 0) && this.removed === 0 && this.boardRows().every((row, i) => row === this.start[i]); }
  get removeMode() { return this.level.del > 0 ? 'remove' : this.level.add > 0 ? 'hand' : null; }

  savePool() {
    const mode = this.poolMode, key = this.key, index = Math.min(this.diff, 2), state = M.poolState(this.pool);
    storage.updateProfile(profile => {
      profile.notDone ||= {};
      const root = profile.notDone.matches = {...(profile.notDone.matches || {})};
      const pools = root[mode] = {...(root[mode] || {})};
      delete pools[index];
      pools[key] = state;
    });
  }

  // Does this game change the training progress? (once per session, at the current difficulty)
  trainingCounts() {
    const profile = storage.getProfile(), session = profile.training;
    return Boolean(session && !session.complete && !Object.hasOwn(session.results || {}, this.id)
      && (Number(profile.progress?.[this.id]?.difficulty) || 0) === this.diff && profile.unlockedGames?.includes(this.id));
  }

  taskText() {
    const level = this.level;
    return i18n.getLang() === 'ru' && level.task_ru ? level.task_ru : i18n.t(level.task || '');
  }

  // ---------------------------------------------------------------- view
  render() {
    // A tool button: icon and a short label (the full label is also the tooltip, long words get cut).
    const tool = (attr, glyph, label, extra = '') => {
      const text = escapeHTML(label);
      return `<button class="matches-tool${extra}" ${attr} title="${text}">${glyph}<span>${text}</span></button>`;
    };
    const tools = [tool('data-undo aria-keyshortcuts="Control+Z"', UNDO_ICON, tr('Отменить', 'Undo')),
      tool('data-reset', icon('restart').outerHTML, tr('Сначала', 'Reset'))];
    if (this.removeMode === 'remove') tools.push(tool('data-remove aria-keyshortcuts="Delete"', icon('trash').outerHTML, tr('Убрать', 'Remove')));
    if (this.removeMode === 'hand') tools.push(tool('data-remove aria-keyshortcuts="Delete"', icon('upload').outerHTML, tr('В руку', 'To hand')));
    if (this.lat.diagonals) tools.push(tool('data-rotate aria-keyshortcuts="R"', ROTATE_ICON, tr('Поворот', 'Rotate')));
    tools.push(tool('data-check aria-keyshortcuts="Enter"', icon('check').outerHTML, tr('Проверить', 'Check'), ' primary'));

    const view = this.viewBox();
    this.frame(this.title, `
      <div class="matches-wrap">
        <section class="board matches-task">
          <div class="matches-task-head">
            <span class="card-kicker">${escapeHTML(trf('Задача %d из %d', 'Puzzle %d of %d', this.position, this.levels.length))}</span>
            ${this.newRound ? `<span class="pill ok">${escapeHTML(tr('Новый круг', 'New round'))}</span>` : ''}
          </div>
          <p class="matches-task-text">${escapeHTML(this.taskText())}</p>
          <div class="matches-meta" data-meta></div>
        </section>
        <div class="matches-play">
          <div class="matches-field" data-field>
            <svg class="matches-svg" data-svg viewBox="${view.join(' ')}" role="img" aria-label="${escapeHTML(tr('Поле со спичками', 'Match field'))}">
              <g data-dots>${this.dotsMarkup()}</g><g data-slots></g><g data-sticks></g><g data-float></g>
            </svg>
          </div>
          <p class="board-note matches-hint" data-hint aria-live="polite"></p>
        </div>
      </div>`,
    `<div class="matches-tools" style="--matches-tools:${tools.length - 1}">${tools.join('')}</div>`);

    const q = sel => this.container.querySelector(sel);
    this.svg = q('[data-svg]');
    this.fieldEl = q('[data-field]');
    q('[data-undo]').onclick = () => this.undo();
    q('[data-reset]').onclick = () => this.reset();
    q('[data-check]').onclick = () => this.check();
    if (q('[data-remove]')) q('[data-remove]').onclick = () => this.removeSelected();
    if (q('[data-rotate]')) q('[data-rotate]').onclick = () => this.rotateSelected();
    this.bindPointer();
    this.setClock(0);
    this.updateScore();
    this.draw();
  }

  // Square view over the lattice vertices with a margin of a little less than one cell.
  viewBox() {
    const range = p => (p === 0 ? [0, M.SIZE - 1] : [1, M.SIZE - 2]);
    const [r0, r1] = range(this.lat.rp), [c0, c1] = range(this.lat.cp);
    const size = Math.max(r1 - r0, c1 - c0) + 1.7;
    return [n3((c0 + c1 - size) / 2), n3((r0 + r1 - size) / 2), n3(size), n3(size)];
  }

  dotsMarkup() {
    let out = '';
    for (let r = this.lat.rp; r < M.SIZE; r += 2) for (let c = this.lat.cp; c < M.SIZE; c += 2) out += `<circle class="matches-dot" cx="${c}" cy="${r}" r="0.09"/>`;
    return out;
  }

  stickMarkup(r, c, ch, cls = '', at = null) {
    const seg = M.segment(at ? 0 : r, at ? 0 : c, ch);
    const [x1, y1, x2, y2] = shrink(seg, INSET).map(n3);
    const [h1, k1, h2, k2] = headPiece([x1, y1, x2, y2], ch).map(n3);
    const move = at ? ` transform="translate(${n3(at.x)} ${n3(at.y)})"` : '';
    return `<g class="matches-stick ${cls}"${move}${at ? '' : ` data-r="${r}" data-c="${c}"`}>`
      + `<line class="matches-halo" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`
      + `<line class="matches-body" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`
      + `<line class="matches-head" x1="${h1}" y1="${k1}" x2="${h2}" y2="${k2}"/></g>`;
  }

  // Empty slots are drawn only while a match can go there (a match picked, in the hand or dragged).
  slotsMarkup() {
    const dragging = this.drag?.active;
    if (!this.selected && !dragging && !(this.hand > 0)) return '';
    let out = '';
    for (let r = 0; r < M.SIZE; r++) for (let c = 0; c < M.SIZE; c++) {
      const kind = M.slotKind(this.lat, r, c);
      if (!kind || this.rows[r][c] !== '.') continue;
      // A diagonal slot (centre of a unit square) is a small ring, so the grid stays calm.
      if (kind === 'd') out += `<circle class="matches-slot is-diagonal" cx="${c}" cy="${r}" r="0.12"/>`;
      else {
        const [x1, y1, x2, y2] = shrink(M.segment(r, c, kind === 'h' ? '-' : '|'), 0.42).map(n3);
        out += `<line class="matches-slot" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
      }
    }
    return out;
  }

  draw() {
    if (!this.svg) return;
    const drag = this.drag?.active ? this.drag : null;
    let sticks = '';
    for (let r = 0; r < M.SIZE; r++) for (let c = 0; c < M.SIZE; c++) {
      const ch = this.rows[r][c];
      if (ch === '.') continue;
      const lifted = drag && drag.r === r && drag.c === c;
      const selected = this.selected && this.selected.r === r && this.selected.c === c;
      sticks += this.stickMarkup(r, c, ch, lifted ? 'is-origin' : selected ? 'is-selected' : '');
    }
    this.svg.querySelector('[data-slots]').innerHTML = this.slotsMarkup();
    this.svg.querySelector('[data-sticks]').innerHTML = sticks;
    this.drawFloat();
    this.updateUI();
  }

  drawFloat() {
    const layer = this.svg?.querySelector('[data-float]');
    if (!layer) return;
    const drag = this.drag?.active ? this.drag : null;
    if (!drag) { layer.innerHTML = ''; return; }
    const ch = this.rows[drag.r][drag.c];
    let out = '';
    if (drag.target && !(drag.target.r === drag.r && drag.target.c === drag.c)) {
      out += this.stickMarkup(drag.target.r, drag.target.c, M.charFor(drag.target.kind, ch, drag.target.slant), 'is-ghost');
    }
    out += this.stickMarkup(0, 0, ch, 'is-lifted', drag.point);
    layer.innerHTML = out;
  }

  updateUI() {
    const q = sel => this.container.querySelector(sel);
    const level = this.level;
    if (this.removeMode === 'remove') this.setStatus(trf('Убрано: %d из %d', 'Removed: %d of %d', this.removed, level.del));
    else if (this.removeMode === 'hand') this.setStatus(trf('В руке: %d', 'In hand: %d', this.hand));
    else {
      const moved = M.movedCount(this.start, this.boardRows());
      this.setStatus(this.moves ? trf('Ходы: %d из %d', 'Moves: %d of %d', moved, this.moves) : trf('Ходы: %d', 'Moves: %d', moved));
    }
    const meta = q('[data-meta]');
    if (meta) {
      const pills = [];
      if (this.wrong) pills.push(`<span class="pill danger">${escapeHTML(trf('Неверных проверок: %d', 'Wrong checks: %d', this.wrong))}</span>`);
      meta.innerHTML = pills.join('');
      meta.hidden = !pills.length;
    }
    const sel = this.selected ? this.rows[this.selected.r][this.selected.c] : null;
    const set = (selector, disabled) => { const el = q(selector); if (el) el.disabled = disabled; };
    set('[data-undo]', !this.history.length);
    set('[data-reset]', this.isPristine());
    set('[data-remove]', !sel || (this.removeMode === 'remove' && this.removed >= level.del));
    set('[data-rotate]', !M.isDiagonal(sel));
    this.showHint();
  }

  showHint() {
    const el = this.container.querySelector('[data-hint]');
    if (!el || this.notice) return;
    el.classList.remove('is-alert');
    let text;
    if (this.selected) {
      const diagonal = M.isDiagonal(this.rows[this.selected.r][this.selected.c]);
      text = this.removeMode === 'remove' ? tr('Коснитесь пустого места — переложить, «Убрать» — убрать с поля', 'Tap an empty place to move it, or Remove to take it off')
        : this.removeMode === 'hand' ? tr('Коснитесь пустого места — переложить, «В руку» — вернуть в руку', 'Tap an empty place to move it, or To hand to take it back')
        : diagonal ? tr('Коснитесь пустого места — переложить, «Поворот» — сменить наклон', 'Tap an empty place to move it, or Rotate to tilt it the other way')
        : tr('Коснитесь пустого места, чтобы переложить спичку', 'Tap an empty place to move the match');
    } else if (this.hand > 0) text = tr('Коснитесь пустого места, чтобы положить спичку из руки', 'Tap an empty place to put a match from your hand');
    else if (this.removeMode === 'remove' && this.removed < this.level.del) text = tr('Выберите спичку и нажмите «Убрать»', 'Pick a match and press Remove');
    else text = tr('Коснитесь спички, затем пустого места, — или перетащите её', 'Tap a match, then an empty place — or drag it');
    el.textContent = text;
  }

  // A message instead of the hint for a while (no alert()).
  say(text, alert = false) {
    const el = this.container.querySelector('[data-hint]');
    if (!el) return;
    this.notice = true;
    el.textContent = text;
    el.classList.toggle('is-alert', alert);
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => { this.notice = false; if (!this.destroyed) this.showHint(); }, Math.max(2600, 1000 + 45 * text.length));   // a longer line stays longer
  }

  flash(cls, ms = 450) {
    const el = this.fieldEl;
    if (!el) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    if (ms) this.defer(() => el.classList.remove(cls), ms);
  }

  // ---------------------------------------------------------------- input
  toCell(event) {
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return {x: -9, y: -9};
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return {x: p.x, y: p.y};
  }

  // Nearest match (by its stick) or empty slot (by its centre) to a point in cell units.
  hitTest({x, y}, {matches = true, empty = true, origin = null, radius = HIT_SLOT} = {}) {
    let best = null;
    const r0 = Math.round(y), c0 = Math.round(x);
    for (let r = r0 - 2; r <= r0 + 2; r++) for (let c = c0 - 2; c <= c0 + 2; c++) {
      const kind = M.slotKind(this.lat, r, c);
      if (!kind) continue;
      const isOrigin = origin && origin.r === r && origin.c === c;
      const ch = this.rows[r][c], filled = ch !== '.' && !isOrigin;
      if (filled ? !matches : !empty) continue;
      const dx = x - c, dy = y - r;
      const d = filled ? distToSegment(x, y, shrink(M.segment(r, c, ch), 0.3)) : Math.hypot(dx, dy);
      if (d > (filled ? HIT_MATCH : radius)) continue;
      // An empty diagonal slot takes the slant the point is closer to.
      const slant = kind === 'd' && Math.abs(dx * dy) > 0.04 ? (dx * dy < 0 ? '/' : '\\') : '/';
      const score = filled ? d - 0.15 : d;   // a match wins a near tie with an empty slot
      if (!best || score < best.score) best = {r, c, kind, filled, slant, score};
    }
    return best;
  }

  bindPointer() {
    const svg = this.svg;
    svg.addEventListener('pointerdown', event => {
      if (!this.playable || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      const point = this.toCell(event);
      const hit = this.hitTest(point);
      this.press = {hit, x: event.clientX, y: event.clientY, id: event.pointerId};
      if (hit?.filled) try { svg.setPointerCapture(event.pointerId); } catch { /* not capturable */ }
    });
    svg.addEventListener('pointermove', event => {
      const press = this.press;
      if (!press || press.id !== event.pointerId || !press.hit?.filled) return;
      if (!this.playable) { this.cancelDrag(); return; }
      if (!this.drag && Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_PX) return;
      const point = this.toCell(event);
      if (!this.drag) {
        this.drag = {r: press.hit.r, c: press.hit.c, active: true, point, target: null};
        this.selected = null;
        this.draw();
      }
      this.drag.point = point;
      this.drag.target = this.hitTest(point, {matches: false, origin: this.drag, radius: HIT_DROP});
      this.drawFloat();
    });
    const end = event => {
      const press = this.press;
      if (!press || press.id !== event.pointerId) return;
      this.press = null;
      try { svg.releasePointerCapture(event.pointerId); } catch { /* released */ }
      if (!this.playable) { this.cancelDrag(); return; }
      if (this.drag) { this.drop(); return; }
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_PX * 3) return;
      const hit = press.hit;
      if (!hit) { if (this.selected) { this.selected = null; this.draw(); } return; }
      if (hit.filled) this.tapMatch(hit);
      else this.tapEmpty(hit);
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', () => { this.press = null; this.cancelDrag(); });
  }

  cancelDrag() {
    if (!this.drag) return;
    this.drag = null;
    this.draw();
  }

  drop() {
    const {r, c, target} = this.drag;
    this.drag = null;
    if (target && !(target.r === r && target.c === c)) this.moveMatch({r, c}, target);
    else { audio.play('click'); this.draw(); }
  }

  tapMatch(hit) {
    const same = this.selected && this.selected.r === hit.r && this.selected.c === hit.c;
    this.selected = same ? null : {r: hit.r, c: hit.c};
    audio.play('click');
    this.draw();
  }

  tapEmpty(hit) {
    if (this.selected) { this.moveMatch(this.selected, hit); return; }
    if (this.hand > 0) {
      this.remember();
      this.rows[hit.r][hit.c] = M.charFor(hit.kind, null, hit.slant);
      this.hand--;
      audio.play('plusMatch');
      this.draw();
      return;
    }
    this.say(tr('Сначала выберите спичку', 'Pick a match first'));
  }

  // The slot decides "-" or "|"; a diagonal keeps its slant, an upright match takes the slant of the tap.
  moveMatch(from, to) {
    const ch = this.rows[from.r][from.c];
    if (ch === '.' || this.rows[to.r][to.c] !== '.') return;
    this.remember();
    this.rows[from.r][from.c] = '.';
    this.rows[to.r][to.c] = M.charFor(to.kind, ch, to.slant);
    this.selected = null;
    audio.play('rotate');
    this.draw();
  }

  rotateSelected() {
    if (!this.playable || !this.selected) return;
    const {r, c} = this.selected, ch = this.rows[r][c];
    if (!M.isDiagonal(ch)) return;
    this.remember();
    this.rows[r][c] = ch === '/' ? '\\' : '/';
    audio.play('rotate');
    this.draw();
  }

  // Remove levels: the match leaves the field for good (at most `del`); add levels: back to the hand.
  removeSelected() {
    if (!this.playable || !this.selected || !this.removeMode) return;
    if (this.removeMode === 'remove' && this.removed >= this.level.del) return;
    const {r, c} = this.selected;
    if (this.rows[r][c] === '.') return;
    this.remember();
    this.rows[r][c] = '.';
    if (this.removeMode === 'remove') this.removed++; else this.hand++;
    this.selected = null;
    audio.play('minusMatch');
    this.draw();
  }

  undo() {
    if (!this.playable || !this.history.length) return;
    this.restore(this.history.pop());
    audio.play('click');
    this.draw();
  }

  // Back to the start layout of this puzzle; wrong checks stay (it is the same puzzle).
  reset() {
    if (!this.playable || this.isPristine()) return;
    this.remember();
    this.restore({rows: this.start, hand: this.level.add || 0, removed: 0});
    audio.play('reset');
    this.draw();
  }

  onKey(event) {
    if (!this.playable || event.altKey) return;
    const key = event.key, mod = event.ctrlKey || event.metaKey;
    if (mod && (key === 'z' || key === 'Z')) { event.preventDefault(); this.undo(); return; }
    if (mod) return;
    if (key === 'Escape' && this.selected) { this.selected = null; this.draw(); }
    else if (key === 'r' || key === 'R') this.rotateSelected();
    else if (key === 'Delete' || key === 'Backspace' || key === '-') { event.preventDefault(); this.removeSelected(); }
    else if (key === 'u' || key === 'U') this.undo();
    else if (key === 'Enter' && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); this.check(); }
  }

  // ---------------------------------------------------------------- check and results
  check() {
    if (!this.playable) return;
    if (this.drag) this.cancelDrag();
    // Not a check yet: matches left in the hand, or fewer removed than the task asks (no penalty).
    if (this.hand > 0) {
      audio.play('wrong');
      this.say(trf('Положите на поле все спички из руки — осталось %d', 'Put every match from your hand on the field — %d left', this.hand), true);
      return;
    }
    if (this.removeMode === 'remove' && this.removed < this.level.del) {
      audio.play('wrong');
      this.say(trf('Уберите ещё %d', 'Remove %d more', this.level.del - this.removed), true);
      return;
    }
    if (M.isSolved(this.boardRows(), this.level)) { this.solved(); return; }
    // FUN_4a08e52c: a wrong check is a wrong move; diff_max_moves of them end the game.
    this.wrong++;
    this.score = Math.max(0, this.prize + this.wrong * this.penalty);
    this.updateScore();
    audio.play('wrong');
    this.flash('is-wrong');
    this.updateUI();
    if (this.wrong >= this.maxWrong) { this.lost(); return; }
    // A task about squares says what is wrong with the board (3.11): the count of squares, a match left over.
    const why = this.faultText(M.ruleFault(this.boardRows(), this.level));
    this.say(this.score > 0
      ? (why ? `${trf('Неверно: −%d', 'Not yet: −%d', fmt(-this.penalty))}. ${why}` : trf('Неверно: −%d. Попробуйте ещё', 'Not yet: −%d. Try again', fmt(-this.penalty)))
      : tr('Неверно. Головоломку ещё можно решить, но очков уже 0', 'Not yet. You can still solve it, but the score is 0'), true);
  }

  faultText(fault) {
    if (!fault) return '';
    if (fault.kind === 'fixed') return tr('В этой задаче спички на поле двигать нельзя', 'In this task the matches on the field stay where they are');
    if (fault.kind === 'moved') return trf('Передвинуто спичек: %d, в задаче — %d', 'Matches moved: %d, the task says %d', fault.value, fault.limit);
    if (fault.kind === 'loose') return tr('Есть лишние спички: каждая должна быть стороной квадрата', 'Some matches are left over: each must be a side of a square');
    return trf('Квадратов сейчас: %d', 'Squares now: %d', fault.value);
  }

  solved() {
    this.solvedOk = true;
    const total = this.prize + this.wrong * this.penalty;
    // The level leaves the pool only when the game counts (score > 0; in training — when it changes the progress).
    if (total > 0 && (this.poolMode === 'free' || this.trainingCounts())) {
      this.pool = M.withoutLevel(this.pool, this.level.id);
      this.savePool();
    }
    this.selected = null; this.draw();
    this.fieldEl?.classList.add('is-solved');
    audio.play('good');
    const section = this.original.matches_show_results;
    const values = {DIST: this.prize, P1: this.wrong, TOTAL: total};
    const ru = i18n.getLang() === 'ru';
    const items = buildResults(section, values, Math.min(this.diff, 2)).items
      .map((item, i) => (ru ? {...item, title: ['Приз за головоломку', 'Неверные проверки'][i] || item.title} : item));
    this.finish(total, {section, values}, {items});
  }

  // diff_max_moves wrong checks: the game ends with 0, which is recorded.
  lost() {
    this.finish(0, null, {items: [{title: tr('Головоломка не решена', 'Puzzle not solved'),
      text: trf('Неверных проверок: %d', 'Wrong checks: %d', this.wrong), result: 0}]});
  }

  // Rules: the task of this puzzle, the original help (matches_help 4_value) and the v2 controls.
  helpText() {
    const rules = this.original?.matches_help?.['4_value'];
    const parts = [];
    if (this.level) parts.push(`${tr('Задача', 'Task')}: ${this.taskText()}`);
    if (rules) parts.push(i18n.t(rules).replace(/\\n/g, '\n').trim());
    parts.push(tr('Коснитесь спички, затем пустого места, — или перетащите её. Спичка ложится по линиям сетки. Неверная проверка снимает очки, а «Сначала» возвращает исходное поле.',
      'Tap a match, then an empty place — or drag it. Matches snap to the grid lines. A wrong check costs points, and Reset brings back the start layout.'));
    if (this.level?.rule) parts.push(tr('В задачах про квадраты «N квадратов» — это квадраты любого размера, а «N одинаковых квадратов» — квадраты со стороной в одну спичку. Лишних спичек остаться не должно: каждая — сторона какого-нибудь квадрата. Засчитывается любая расстановка, которая подходит под условие.',
      'In tasks about squares, “N squares” means squares of any size, and “N equal squares” means squares with one match to a side. No match may be left over: each must be a side of some square. Any layout that fits the task counts.'));
    return parts.join('\n\n');
  }

  destroy() {
    super.destroy();
    clearTimeout(this.noticeTimer);
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
  }
}

