// Guess Who (CAntHead_GameField): find the one object that has every feature shown in the clue
// strip (antenna type, shape, pattern, colour). Round generation — guess-who-model.js (port of the
// original). v2 view: vector objects drawn with the app tokens, a jittered-grid layout with the target
// at a random place and in a random DOM position, a wrong object is switched off after the click,
// the next round starts by itself after a short animation while the clock stands.
import { RestoredGame, tr, escapeHTML } from './restored-game.js';
import { arrayValue, createRandom } from '../original.js';
import * as G from './guess-who-model.js';
import { audio } from '../audio.js';
import { i18n } from '../i18n.js';

const NEXT_DELAY = 750;   // ms of the correct-answer animation before the next round (the clock stands)
const NOTE_DELAY = 1400;  // ms a feedback message stays in the note line
const nums = text => String(text ?? '').trim().split(/\s+/).map(Number);
const FEATURES = ['antenna', 'shape', 'texture', 'color'];
const FEATURE_LABEL = () => ({antenna: tr('Усик', 'Antenna'), shape: tr('Форма', 'Shape'), texture: tr('Узор', 'Pattern'), color: tr('Цвет', 'Colour')});
const ARROWS = {ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0]};

// ---------------------------------------------------------------- vector objects (100 × 100 box)
// Bodies: triangle, circle, diamond, square, pentagon (the order of the original sprite sheet).
const SHAPES = [
  '<path d="M50 25 L74 66 H26 Z"/>',
  '<circle cx="50" cy="50" r="22"/>',
  '<path d="M50 25 L75 50 L50 75 L25 50 Z"/>',
  '<rect x="29" y="29" width="42" height="42" rx="5"/>',
  '<path d="M50 26 L73 43 L64 70 H36 L27 43 Z"/>'];
// Antenna ends, drawn for the top side (pointing up): [end of the stalk, glyph].
const ANTENNAS = [
  [13, '<path d="M41 5 V13 H59 V5"/>'],                                       // bracket
  [15, '<path d="M50 15 L41 5 M50 15 L59 5"/>'],                              // fork
  [4, '<path d="M40 14 A10 10 0 0 1 60 14"/>'],                               // dome
  [16, '<path d="M40 6 A10 10 0 0 0 60 6"/>'],                                // cup
  [12, '<circle cx="50" cy="8.5" r="5.5" class="gw-fill"/>'],                 // ball
  [13, '<circle cx="44.5" cy="8.5" r="4.3"/><circle cx="55.5" cy="8.5" r="4.3"/>'], // double ring
  [9, '<path d="M50 17 L42 9 M50 17 L58 9 M50 9 L42 1 M50 9 L58 1"/>']];     // double fork
const SIDE_ANGLE = [270, 0, 90, 180]; // antenna slots in the original order: left, top, right, bottom

const antenna = (type, angle = 0, from = 38) => {
  const [end, glyph] = ANTENNAS[type];
  return `<g class="gw-ant"${angle ? ` transform="rotate(${angle} 50 50)"` : ''}><path d="M50 ${from} V${end}"/>${glyph}</g>`;
};
const body = (o) => `<g class="gw-c${o.color}">${SHAPES[o.shape]}</g><g fill="url(#gw-tex-${o.texture})">${SHAPES[o.shape]}</g><g class="gw-outline">${SHAPES[o.shape]}</g>`;
export const objectSVG = o => `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">${o.antennas.map((t, side) => antenna(t, SIDE_ANGLE[side])).join('')}${body(o)}</svg>`;

function clueSVG(key, value) {
  if (key === 'antenna') return `<svg viewBox="28 -3 44 44" aria-hidden="true" focusable="false">${antenna(value, 0, 41)}</svg>`;
  if (key === 'shape') return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><g class="gw-shape-clue">${SHAPES[value]}</g></svg>`;
  if (key === 'texture') {
    const r = '<rect x="22" y="22" width="56" height="56" rx="12"/>';
    return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><g class="gw-tex-base">${r}</g><g fill="url(#gw-tex-${value})">${r}</g><g class="gw-outline">${r}</g></svg>`;
  }
  const c = '<circle cx="50" cy="50" r="26"/>';
  return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><g class="gw-c${value}">${c}</g><g class="gw-outline">${c}</g></svg>`;
}

// Patterns of the four textures (v3.4.4: coarse and unlike each other, readable on a small figure; rings against dots
// and fine checks could not be told apart on a phone): plain, horizontal stripes, vertical stripes, big dots.
const DEFS = `<svg class="gw-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
  <pattern id="gw-tex-0" width="10" height="10" patternUnits="userSpaceOnUse"></pattern>
  <pattern id="gw-tex-1" width="10" height="10" patternUnits="userSpaceOnUse"><rect y="3" width="10" height="4.4" class="gw-tex-ink"/></pattern>
  <pattern id="gw-tex-2" width="10" height="10" patternUnits="userSpaceOnUse"><rect x="3" width="4.4" height="10" class="gw-tex-ink"/></pattern>
  <pattern id="gw-tex-3" width="11" height="11" patternUnits="userSpaceOnUse" x="0" y="0"><circle cx="5.5" cy="5.5" r="3.3" class="gw-tex-ink"/></pattern>
</defs></svg>`;

export class GuessWhoGame extends RestoredGame {
  id = 'guess_who';
  get title() { return tr('Кто это?', 'Guess Who'); }
  // Stats of the finished game for the achievements (js/achievements.js).
  feats() { return {perfect: this.wrong === 0 && this.correct > 0, mistakes: this.wrong, perItem: this.correct ? this.elapsed / this.correct : 0}; }

  async init(difficulty = 'easy') {
    if (!await this.begin(difficulty)) return;
    const cfg = this.original.ant_head_game_field, wnd = this.original.ant_head_wnd;
    const d = Math.min(this.diff, 2), prefix = ['easy', 'med', 'hard'][d], sp = this.inTest ? 'sp_' : '';
    // Test: bm_*_gen_var rounds and sp_* points (ant_head_sp_show_results), as in the original.
    this.genVar = nums(cfg[`${this.inTest ? 'bm_' : ''}${prefix}_gen_var`]);
    this.qa = nums(cfg[`${prefix}_qa_gen_var`]);
    this.points = {good: arrayValue(wnd[`${sp}points_good_move_arr`], d), wrong: arrayValue(wnd[`${sp}points_wrong_move_arr`], d), time: arrayValue(wnd[`${sp}time_penalty_arr`], d)};
    Object.assign(this, {rounds: this.genVar[3], round: 0, correct: 0, wrong: 0, phase: 'answer'});
    this.rand = createRandom(Date.now()); this.pools = G.createPools();
    this.render();
    this.nextRound();
    this.tick(() => {
      if (this.phase !== 'answer') return; // the clock stands during the correct-answer animation
      this.elapsed++; this.setClock(); this.calculateScore();
    });
    this.keyHandler = event => this.onKey(event);
    window.addEventListener('keydown', this.keyHandler);
  }

  render() {
    const info = this.original.ant_head_info_txt?.text;
    this.instruction = info ? i18n.t(info).replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim() : tr('Найдите фигуру с указанными ниже признаками', 'Choose the figure with the features below');
    this.frame(this.title, `${DEFS}
      <div class="gw-wrap">
        <p class="board-note gw-note" data-note aria-live="polite">${escapeHTML(this.instruction)}</p>
        <div class="gw-field" data-field role="group" aria-label="${escapeHTML(tr('Поле', 'Field'))}"><div class="gw-layer" data-layer></div></div>
        <div class="gw-clues" data-clues role="list" aria-label="${escapeHTML(tr('Признаки', 'Features'))}"></div>
      </div>`);
    this.field = this.container.querySelector('[data-field]');
    this.layer = this.container.querySelector('[data-layer]');
    this.field.addEventListener('click', event => {
      const button = event.target.closest('.gw-obj');
      if (button && this.field.contains(button)) this.answer(button);
    });
    this.setClock(0);
    this.updateScore();
  }

  nextRound() {
    this.phase = 'answer';
    const round = G.createRound(this.genVar, this.qa, this.pools, this.rand);
    this.questionCode = round.question;
    this.question = G.decodeQuestion(round.question);
    const place = G.layout(round.objects.length, this.rand);
    // DOM order follows the reading order of the cells, so the target's position in it is random too.
    this.items = round.objects.map((object, i) => ({object, ...place.items[i]})).sort((a, b) => a.row - b.row || a.col - b.col);
    const {cols, rows, size} = place;
    this.field.style.setProperty('--gw-cols', cols);
    this.field.style.setProperty('--gw-rows', rows);
    this.field.classList.remove('is-solved');
    this.layer.innerHTML = this.items.map((item, i) => `<button class="gw-obj" data-i="${i}" style="left:${(item.x - size / 2) / cols * 100}%;top:${(item.y - size / 2) / rows * 100}%;width:${size / cols * 100}%;height:${size / rows * 100}%;animation-delay:${Math.round(i * 12)}ms" aria-label="${escapeHTML(tr('Объект', 'Object'))} ${i + 1}">${objectSVG(item.object)}</button>`).join('');
    const labels = FEATURE_LABEL();
    this.container.querySelector('[data-clues]').innerHTML = FEATURES.filter(key => this.question[key] >= 0)
      .map(key => `<div class="gw-clue" role="listitem">${clueSVG(key, this.question[key])}<span>${escapeHTML(labels[key])}</span></div>`).join('');
    this.note(this.instruction);
    this.setStatus(`${this.round + 1} / ${this.rounds}`);
  }

  note(text, kind = '') {
    const el = this.container.querySelector('[data-note]');
    if (!el) return;
    el.textContent = text;
    el.className = `board-note gw-note ${kind}`;
    clearTimeout(this.noteTimer);
    if (kind) this.noteTimer = setTimeout(() => { if (!this.destroyed && this.phase === 'answer') this.note(this.instruction); }, NOTE_DELAY);
  }

  answer(button) {
    if (!this.playable || this.phase !== 'answer' || button.disabled) return;
    const item = this.items[Number(button.dataset.i)];
    if (!G.satisfies(item.object, this.questionCode)) {
      // A wrong object is switched off: a second tap on it is not another mistake.
      this.wrong++;
      button.disabled = true;
      button.classList.add('is-wrong');
      audio.play('wrong');
      this.note(tr('Признаки не совпадают', 'The features do not match'), 'bad');
      this.gain(this.points.wrong);
      this.calculateScore();
      return;
    }
    this.correct++;
    this.phase = 'feedback';
    button.classList.add('is-right');
    this.field.classList.add('is-solved');
    this.field.querySelectorAll('.gw-obj').forEach(b => { b.disabled = true; });
    audio.play('good');
    this.note(tr('Верно!', 'Correct!'), 'good');
    this.gain(this.points.good);
    this.calculateScore();
    this.defer(() => {
      this.round++;
      if (this.round >= this.rounds) this.end(); else this.nextRound();
    }, NEXT_DELAY);
  }

  calculateScore() {
    this.score = this.correct * this.points.good + this.wrong * this.points.wrong + this.elapsed * this.points.time;
    this.updateScore();
  }

  // Arrow keys move the focus to the nearest object in that direction.
  onKey(event) {
    const step = ARROWS[event.key];
    if (!step || !this.playable || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target : document.body;
    if (target !== document.body && !target.closest('[data-field]')) return;
    const buttons = [...this.field.querySelectorAll('.gw-obj:not(:disabled)')];
    if (!buttons.length) return;
    event.preventDefault();
    const current = target.closest('.gw-obj');
    if (!current) { buttons[0].focus(); return; }
    const at = this.items[Number(current.dataset.i)];
    let best = null, bestCost = Infinity;
    for (const b of buttons) {
      const it = this.items[Number(b.dataset.i)], dx = it.x - at.x, dy = it.y - at.y;
      const along = dx * step[0] + dy * step[1], across = Math.abs(dx * step[1] - dy * step[0]);
      if (along <= 0.2) continue;
      const cost = along + across * 2;
      if (cost < bestCost) { bestCost = cost; best = b; }
    }
    best?.focus();
  }

  end() {
    const section = this.original[this.inTest ? 'ant_head_sp_show_results' : 'ant_head_show_results'];
    this.calculateScore();
    this.finish(this.score, {section, values: {P1: this.correct, P2: this.wrong, TIME: this.elapsed, TOTAL: Math.round(this.score)}});
  }

  destroy() {
    super.destroy();
    clearTimeout(this.noteTimer);
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
  }
}
