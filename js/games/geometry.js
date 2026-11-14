// Geometry: remember a figure, then draw a copy with the same number of vertices; only the angles count.
// Comparison and bands — geometry-model.js (port of CGeometry_GameField); v2 view: SVG field in tokens.
import { RestoredGame, tr, escapeHTML } from './restored-game.js';
import { arrayValue, shuffle } from '../original.js';
import { i18n } from '../i18n.js';
import { audio } from '../audio.js';
import { icon } from '../core/icons.js';
import { fmt } from '../core/dom.js';
import { figureMatch, toFieldPixels, roundBand, FIELD_PIXELS, dealFigures } from './geometry-model.js';
import { storage } from '../storage.js';

const MESSAGES = {remember: 'Please remember the original figure', draw: 'Please draw the copy of the figure',
  edit: 'Now you can change your shape if needed', compare: 'Compare the copy with the original figure'};
const TIP = "Tip: The size and position of the figure you draw don't matter, only the angles!";
const GRID = Array.from({length: 9}, (_, i) => `M${(i + 1) * 10} 0V100M0 ${(i + 1) * 10}H100`).join('');
const MOVES = {ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0]};
const clamp = v => Math.max(2, Math.min(98, v));
// The pools of figures (3.12.1). POOL_SET changes when the figures of the pools change, and the pools start over.
const POOL_KEYS = ['easy', 'medium', 'hard'], POOL_SET = 1;
// A vertex of the copy is marked in the comparison when its angle differs from the original by more than this.
const OFF_DEGREES = 10;
const xy = p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;

export class GeometryGame extends RestoredGame {
  id = 'geometry';
  get title() { return tr('Геометрия', 'Geometry'); }
  // Stats of the finished game for the achievements (js/achievements.js).
  // A flawless game: every figure Very Good (band 4) or Perfect. Until 3.11.1 — every figure at 90 % or more, which the
  // narrow tolerance of Medium and Hard put out of reach.
  feats() { const r = this.rounds || []; return {perfect: r.length > 0 && r.every(x => x.band >= 4), minAccuracy: Math.min(...r.map(x => x.accuracy))}; }

  // The rules: what the accuracy is and what the marks of the comparison mean (3.12.3).
  helpText() {
    return [super.helpText(), i18n.t(TIP),
      tr('Точность показывает, насколько углы копии близки к углам оригинала: 100 % — все углы совпали. Шкала одна на всех уровнях, но чем выше уровень, тем большая точность нужна для той же оценки.',
        'The accuracy shows how close the angles of your copy are to the angles of the original: 100 % means every angle matches. The scale is the same on every level, but a higher level asks for more accuracy for the same grade.'),
      tr('При сравнении красным отмечены вершины, где угол отличается больше чем на 10°.', 'In the comparison the vertices whose angle is more than 10° off are marked in red.'),
    ].filter(Boolean).join('\n\n');
  }

  async init(difficulty = 'easy') {
    if (!await this.begin(difficulty)) return;
    const g = this.original, field = g.geometry_game_field;
    this.d = Math.min(this.diff, 2);
    // A figure with an empty value is out of the pool (data/balance/geometry.json drops figures that way).
    const pool = Object.fromEntries(Object.entries(g[`geometry_fig_d${this.d}`]).filter(([key, value]) => key.endsWith('_fig') && String(value).trim()));
    this.poolKey = POOL_KEYS[this.d];
    const dealt = dealFigures(this.savedPool(), Object.keys(pool), arrayValue(field.questions_count, this.d), shuffle);
    this.savePool(dealt.state);
    this.figures = dealt.figures.map(key => {
      const n = String(pool[key]).trim().split(/\s+/).map(Number);
      return Array.from({length: n[0]}, (_, i) => ({x: n[1 + i * 2], y: n[2 + i * 2]}));
    });
    this.memoTime = arrayValue(field.diff_max_time, this.d);
    // Keyboard cursor step (cursor_step) and the radius that takes a placed vertex (edit_item_press_radius),
    // both in field pixels of 443.
    this.step = (Number(String(field.cursor_step).trim().split(/\s+/)[0]) || 6) * 100 / FIELD_PIXELS;
    this.pressRadius = (Number(field.edit_item_press_radius) || 20) * 100 / FIELD_PIXELS;
    this.rounds = []; this.round = 0;
    this.drags = new Map(); this.cursor = {x: 50, y: 50}; this.held = -1; this.keyboard = false;
    this.render();
    this.nextFigure();
  }

  // The figures shown in this round of the pool (3.12.1): profile.notDone.geometry = {set, easy: {shown, last}, …}.
  savedPool() {
    try { const pools = storage.getProfile()?.notDone?.geometry; return pools?.set === POOL_SET ? pools[this.poolKey] : null; } catch { return null; }
  }
  savePool(state) {
    try {
      if (!storage.getProfile()) return;
      storage.updateProfile(profile => {
        profile.notDone ||= {};
        const pools = profile.notDone.geometry ||= {};
        if (pools.set !== POOL_SET) { for (const key of POOL_KEYS) delete pools[key]; pools.set = POOL_SET; }
        pools[this.poolKey] = state;
      });
    } catch (error) { console.warn('Geometry pool was not saved:', error); }
  }

  // Band n of this level: its name and the accuracy it starts from (the limit of the band below plus one).
  bandFrom(n) {
    const results = this.original.geometry_results_data, count = Number(results?.res_count) || 5;
    if (n < 2 || n > count) return null;
    return {name: results[`res_${n}_name`] || '', from: arrayValue(results[`res_${n - 1}_percents`], this.d) + 1};
  }

  q(selector) { return this.container.querySelector(selector); }
  get drawing() { return this.phase === 'draw' || this.phase === 'edit'; }

  render() {
    this.frame(this.title, `
      <div class="board geo-board">
        <p class="board-note geo-note" data-note aria-live="polite"></p>
        <svg class="geo-field" data-field viewBox="0 0 100 100" tabindex="0" role="application"
          aria-label="${escapeHTML(tr('Поле для рисования: нажмите, чтобы поставить вершину, и перетащите её, чтобы поправить. С клавиатуры: стрелки и Enter.',
            'Drawing board: tap to place a vertex, drag it to adjust. Keyboard: arrows and Enter.'))}"></svg>
        <div class="geo-meta">
          <span class="pill accent geo-count" data-count></span>
          <span class="geo-info" data-info></span>
        </div>
        <div class="bar geo-timer" data-timer aria-hidden="true"><i></i></div>
        <div class="geo-verdict" data-verdict hidden><b data-verdict-title></b><span data-verdict-text></span></div>
      </div>
      <p class="geo-tip" data-tip>${escapeHTML(i18n.t(TIP))}</p>`,
    `<div class="geo-actions">
        <button type="button" class="btn btn-primary btn-lg geo-wide" data-skip>${escapeHTML(tr('Пропустить', 'Skip'))}</button>
        <button type="button" class="btn btn-lg" data-undo aria-label="${escapeHTML(tr('Отменить последнюю точку', 'Undo the last point'))}">${icon('restart').outerHTML}${escapeHTML(tr('Отменить', 'Undo'))}</button>
        <button type="button" class="btn btn-primary btn-lg" data-check>${icon('check').outerHTML}${escapeHTML(tr('Готово', 'Done'))}</button>
        <button type="button" class="btn btn-primary btn-lg geo-wide" data-next></button>
      </div>`);
    this.q('[data-skip]').onclick = () => this.startDrawing();
    this.q('[data-undo]').onclick = () => this.undo();
    this.q('[data-check]').onclick = () => this.check();
    this.q('[data-next]').onclick = () => this.next();
    const field = this.q('[data-field]');
    field.addEventListener('pointerdown', event => this.pointerDown(event));
    field.addEventListener('pointermove', event => this.pointerMove(event));
    const release = event => { if (this.drags.delete(event.pointerId)) this.draw(); };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) field.addEventListener(type, release);
    field.addEventListener('keydown', event => this.onKey(event));
    field.addEventListener('focus', () => { this.keyboard = field.matches(':focus-visible'); this.draw(); });
    field.addEventListener('blur', () => { this.keyboard = false; this.held = -1; this.draw(); });
  }

  nextFigure() {
    this.target = this.figures[this.round];
    this.points = []; this.drags.clear(); this.held = -1;
    this.phase = 'remember'; this.remaining = this.memoTime;
    // A new second timer for every figure, so that each one gets the full time (BUG-GEO-07).
    if (this.countdown) { clearInterval(this.countdown); this.timers.delete(this.countdown); }
    this.countdown = this.tick(() => {
      if (this.phase !== 'remember') return;
      if (--this.remaining <= 0) this.startDrawing(); else this.updateMeta();
    });
    this.update();
  }

  // "Skip" (geometry_skip_btn) or the end of the time: the original is hidden, drawing starts.
  startDrawing() {
    if (!this.playable || this.phase !== 'remember') return;
    this.phase = 'draw';
    this.update();
  }

  update() {
    const n = this.target.length, k = this.points.length, last = this.round + 1 >= this.figures.length;
    this.q('[data-note]').textContent = i18n.t(MESSAGES[this.phase]);
    this.setStatus(`${tr('Фигура', 'Figure')} ${this.round + 1} / ${this.figures.length}`);
    this.q('[data-skip]').hidden = this.phase !== 'remember';
    this.q('[data-undo]').hidden = this.q('[data-check]').hidden = !this.drawing;
    this.q('[data-next]').hidden = this.phase !== 'compare';
    this.q('[data-tip]').hidden = this.phase === 'compare';
    // "Done" works once all n vertices are placed.
    this.q('[data-check]').disabled = k !== n;
    this.q('[data-undo]').disabled = !k;
    this.q('[data-next]').textContent = last ? tr('Итог', 'Results') : i18n.t('Next');
    this.q('[data-field]').classList.toggle('is-compare', this.phase === 'compare');
    this.updateMeta();
    this.draw();
  }

  updateMeta() {
    const n = this.target.length, k = this.points.length, info = this.q('[data-info]'), timer = this.q('[data-timer]');
    this.q('[data-count]').textContent = `${tr('Вершин', 'Vertices')}: ${n}`;
    this.q('[data-count]').hidden = this.phase === 'compare';   // the legend needs the row
    timer.hidden = this.phase !== 'remember';
    timer.firstElementChild.style.width = `${Math.max(0, this.remaining / this.memoTime * 100)}%`;
    if (this.phase === 'remember') info.innerHTML = `${icon('timer').outerHTML}<span>${this.remaining} ${escapeHTML(tr('с', 's'))}</span>`;
    else if (this.drawing) info.innerHTML = `<span class="geo-dots" aria-hidden="true">${Array.from({length: n}, (_, i) => `<i class="${i < k ? 'on' : ''}"></i>`).join('')}</span><span>${k} / ${n}</span>`;
    else info.innerHTML = `<span class="geo-legend"><i class="geo-key-orig"></i>${escapeHTML(tr('оригинал', 'original'))}<i class="geo-key-copy"></i>${escapeHTML(tr('копия', 'copy'))}`
      + ((this.rounds[this.round]?.diffs || []).some(d => d > OFF_DEGREES) ? `<i class="geo-key-off"></i>${escapeHTML(tr('не тот угол', 'angle off'))}` : '') + '</span>';
    const verdict = this.q('[data-verdict]'), round = this.rounds[this.round];
    verdict.hidden = this.phase !== 'compare' || !round;
    if (!verdict.hidden) {
      // The band name and its points, e.g. "Perfect, +2 500" (res_n_name, geometry_results_bot_txt).
      verdict.className = `geo-verdict ${round.band <= 1 ? 'is-bad' : round.band <= 3 ? 'is-mid' : ''}`;
      this.q('[data-verdict-title]').textContent = `${i18n.t(round.name)}, +${fmt(round.points)}`;
      // What the next band needs, so that the number has a scale: «Accuracy: 91 % · Perfect: from 97 %».
      const next = this.bandFrom(round.band + 1);
      this.q('[data-verdict-text]').textContent = `${tr('Точность', 'Accuracy')}: ${round.accuracy} %`
        + (next ? ` · ${tr('@B — от @N %', '@B: from @N %').replace('@B', i18n.t(next.name).replace(/[!.\s]+$/, '')).replace('@N', next.from)}` : '');
    }
  }

  draw() {
    const field = this.q('[data-field]');
    if (!field || !this.target) return;
    // While the game is paused the figure to remember is hidden (BUG-GEO-02).
    const hidden = this.phase === 'remember' && this.isPaused;
    const showTarget = this.phase === 'compare' || (this.phase === 'remember' && !hidden);
    const full = this.points.length === this.target.length;
    const active = new Set([...this.drags.values(), this.held]);
    // In the comparison the vertices whose angle is more than OFF_DEGREES away are marked: they are what the
    // accuracy was lost on.
    const off = this.phase === 'compare' ? (this.rounds[this.round]?.diffs || []).map(d => d > OFF_DEGREES) : [];
    let html = `<path class="geo-grid" d="${GRID}"/>`;
    if (hidden) html += `<text class="geo-hidden" x="50" y="52">${escapeHTML(i18n.t('Paused', 'Пауза'))}</text>`;
    if (showTarget) html += `<polygon class="geo-orig" points="${this.target.map(xy).join(' ')}"/>`
      + this.target.map(p => `<circle class="geo-orig-dot" cx="${p.x}" cy="${p.y}" r="1.5"/>`).join('');
    if (this.phase !== 'remember' && this.points.length) {
      html += `<${full ? 'polygon' : 'polyline'} class="geo-copy" points="${this.points.map(xy).join(' ')}"/>`
        + this.points.map((p, i) => `<circle class="geo-copy-dot${active.has(i) ? ' is-active' : ''}${off[i] ? ' is-off' : ''}" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${active.has(i) ? 2.4 : off[i] ? 2.3 : 1.7}"/>`).join('');
    }
    if (this.keyboard && this.drawing) {
      const {x, y} = this.cursor;
      html += `<g class="geo-cursor"><circle cx="${x}" cy="${y}" r="3"/><path d="M${x - 5} ${y}h2.4M${x + 2.6} ${y}h2.4M${x} ${y - 5}v2.4M${x} ${y + 2.6}v2.4"/></g>`;
    }
    field.innerHTML = html;
  }

  locate(event) {
    const rect = this.q('[data-field]').getBoundingClientRect();
    return {x: clamp((event.clientX - rect.left) / rect.width * 100), y: clamp((event.clientY - rect.top) / rect.height * 100)};
  }

  nearest(point, radius) {
    let best = -1, distance = radius;
    this.points.forEach((p, i) => {
      const d = Math.hypot(p.x - point.x, p.y - point.y);
      if (d <= distance) { distance = d; best = i; }
    });
    return best;
  }

  pointerDown(event) {
    if (!this.playable || !this.drawing || event.button > 0) return;
    event.preventDefault();
    this.keyboard = false;
    const field = this.q('[data-field]'), unit = 100 / field.getBoundingClientRect().width, point = this.locate(event);
    // While drawing, a press takes a vertex only right on its marker, so that a new vertex may stand
    // close to another one (BUG-GEO-04); with all vertices placed the radius is touch-friendly.
    const radius = this.points.length < this.target.length ? 11 * unit : Math.max(this.pressRadius, 24 * unit);
    let index = this.nearest(point, radius);
    if (index < 0 && this.points.length < this.target.length) {
      this.points.push(point);
      index = this.points.length - 1;
      audio.play('pencil');
    }
    if (index < 0) return;
    // One vertex per pointer: a second finger does not take over the first one's vertex (BUG-GEO-05).
    if ([...this.drags.values()].includes(index)) return;
    this.drags.set(event.pointerId, index);
    try { field.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
    this.changed();
  }

  pointerMove(event) {
    const index = this.drags.get(event.pointerId);
    if (index === undefined || !this.playable) return;
    this.points[index] = this.locate(event);
    this.draw();
  }

  // Keyboard (geometry_help1): arrows move the cursor (Shift — 4 steps), Enter or Space places a vertex
  // or takes and drops the one under the cursor, Backspace removes the last vertex (BUG-GEO-06).
  onKey(event) {
    if (!this.playable || !this.drawing || event.altKey || event.ctrlKey || event.metaKey) return;
    const move = MOVES[event.key];
    if (move) {
      event.preventDefault();
      this.keyboard = true;
      const s = this.step * (event.shiftKey ? 4 : 1);
      this.cursor = {x: clamp(this.cursor.x + move[0] * s), y: clamp(this.cursor.y + move[1] * s)};
      if (this.held >= 0) this.points[this.held] = {...this.cursor};
      this.draw();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.keyboard = true;
      if (this.held >= 0) this.held = -1;
      else {
        const index = this.nearest(this.cursor, this.pressRadius);
        if (index >= 0) { this.held = index; this.cursor = {...this.points[index]}; }
        else if (this.points.length < this.target.length) { this.points.push({...this.cursor}); audio.play('pencil'); }
      }
      this.changed();
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      this.undo();
    }
  }

  changed() {
    const full = this.points.length === this.target.length;
    if (this.phase === 'draw' && full) this.phase = 'edit';
    else if (this.phase === 'edit' && !full) this.phase = 'draw';
    this.update();
  }

  undo() {
    if (!this.playable || !this.drawing || !this.points.length) return;
    this.points.pop(); this.drags.clear(); this.held = -1;
    this.changed();
  }

  check() {
    if (!this.playable || this.phase !== 'edit' || this.points.length !== this.target.length) return;
    this.drags.clear(); this.held = -1;
    // Compared in field pixels; the accuracy is the same scale on every level, the bands of the level are stricter.
    const {accuracy, diffs} = figureMatch(toFieldPixels(this.target), toFieldPixels(this.points));
    const band = roundBand(this.original.geometry_results_data, this.d, accuracy);
    this.rounds[this.round] = {accuracy, diffs, ...band};
    this.score += band.points;
    this.updateScore();
    audio.play(band.points ? 'good' : 'wrong');
    this.phase = 'compare';
    // "Next" appears where "Done" was: a double click must not skip the comparison (BUG-GEO-03).
    this.comparedAt = performance.now();
    this.update();
  }

  next() {
    if (!this.playable || this.phase !== 'compare' || performance.now() - this.comparedAt < 450) return;
    if (++this.round >= this.figures.length) this.finishGame(); else this.nextFigure();
  }

  finishGame() {
    // geometry_show_results has no items; the rounds are listed with their band names.
    const items = this.rounds.map((r, i) => ({title: `${tr('Фигура', 'Figure')} ${i + 1} · ${i18n.t(r.name)}`,
      text: `${tr('Точность', 'Accuracy')}: ${r.accuracy} %`, result: r.points}));
    this.finish(this.score, {section: this.original.geometry_show_results, values: {DIST: this.score, TOTAL: this.score}}, {items});
  }

  // The figure is hidden while the pause sheet or the rules are open.
  menu() { super.menu(); this.draw(); }
  help(fromMenu = false) { super.help(fromMenu); this.draw(); }
  onResume() { this.draw(); }
}
