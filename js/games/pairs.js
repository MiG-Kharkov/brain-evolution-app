// Pairs: open two cards at a time and find every pair; a session is 3 / 2 / 1 fields (easy / med / hard).
// Rules and scoring — pairs-model.js (port of CPairs_GameWnd); v2 view: DOM cards with vector pictures.
import { RestoredGame, tr, escapeHTML } from './restored-game.js';
import { audio } from '../audio.js';
import { fmt } from '../core/dom.js';
import * as M from './pairs-model.js';

// Twelve pictures (24 x 24): each has its own shape and its own colour (--pairs-<n> in pairs.css).
const PICTURES = [null,
  {ru: 'Сердце', en: 'Heart', svg: '<path d="M12 20.4s-7.4-4.4-9.2-9.4C1.6 7.3 4 3.8 7.6 3.8c1.9 0 3.4 1 4.4 2.5 1-1.5 2.5-2.5 4.4-2.5 3.6 0 6 3.5 4.8 7.2-1.8 5-9.2 9.4-9.2 9.4z"/>'},
  {ru: 'Молния', en: 'Lightning', svg: '<path d="M13.6 2.4 5 13.4h6l-1.1 8.2 9.1-11.2h-6.1z"/>'},
  {ru: 'Звезда', en: 'Star', svg: '<path d="m12 3 2.8 5.8 6.4.8-4.7 4.4 1.2 6.3L12 17.2l-5.7 3.1 1.2-6.3-4.7-4.4 6.4-.8z"/>'},
  {ru: 'Плюс', en: 'Plus', svg: '<path d="M9.4 3.8h5.2v5.6h5.6v5.2h-5.6v5.6H9.4v-5.6H3.8V9.4h5.6z"/>'},
  {ru: 'Трилистник', en: 'Clover', svg: '<circle cx="12" cy="7.5" r="3.9"/><circle cx="7.4" cy="13.4" r="3.9"/><circle cx="16.6" cy="13.4" r="3.9"/><path d="M11 13.5h2l1.3 7.3H9.7z"/>'},
  {ru: 'Ромб', en: 'Diamond', svg: '<path d="M12 2.8 20.2 12 12 21.2 3.8 12z"/>'},
  {ru: 'Капля', en: 'Drop', svg: '<path d="M12 3c-2.9 4.2-6.4 7.8-6.4 11.6a6.4 6.4 0 0 0 12.8 0C18.4 10.8 14.9 7.2 12 3z"/>'},
  {ru: 'Квадрат', en: 'Square', svg: '<rect x="4.5" y="4.5" width="15" height="15" rx="2.6"/>'},
  {ru: 'Луна', en: 'Moon', svg: '<path d="M19.6 15.3A8 8 0 1 1 8.7 4.4a6.4 6.4 0 0 0 10.9 10.9z"/>'},
  {ru: 'Шестиугольник', en: 'Hexagon', svg: '<path d="M12 3.2 19.6 7.6v8.8L12 20.8l-7.6-4.4V7.6z"/>'},
  {ru: 'Цветок', en: 'Flower', svg: '<circle cx="12" cy="7" r="3.7"/><circle cx="17" cy="12" r="3.7"/><circle cx="12" cy="17" r="3.7"/><circle cx="7" cy="12" r="3.7"/><circle class="pairs-pic-core" cx="12" cy="12" r="2.2"/>'},
  {ru: 'Треугольник', en: 'Triangle', svg: '<path d="M12 3.8 20.8 19.4H3.2z"/>'},
];
const pictureSVG = type => `<svg class="pairs-pic pairs-pic-${type}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PICTURES[type].svg}</svg>`;
const MOVES = {ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1]};

export class PairsGame extends RestoredGame {
  id = 'pairs';
  get title() { return tr('Пары', 'Pairs'); }
  // Stats of the finished game for the achievements (js/achievements.js).
  feats() { return {perfect: this.wrong === 0, mistakes: this.wrong}; }

  async init(difficulty = 'easy') {
    if (!await this.begin(difficulty)) return;
    this.params = M.levelParams(this.original, this.diff);
    // A random template of the difficulty for every field, no repeats in the session (BUG-PAIR-01, -02).
    this.shapes = M.pickTemplates(M.templates(this.original, this.diff), this.params.fields);
    this.fieldIndex = -1; this.wrong = 0; this.closeToken = 0; this.noteToken = 0; this.flashToken = 0;
    // The score chip shows what the session is worth now: all fields minus the wrong pairs.
    this.score = M.sessionScore(this.params, 0).total;
    this.frame(this.title, `<div class="board pairs-board" data-board>
        <p class="board-note pairs-note" data-note aria-live="polite"></p>
        <div class="pairs-grid" data-grid role="group" aria-label="${escapeHTML(tr('Поле с картами', 'Card field'))}"></div>
      </div>`);
    const grid = this.container.querySelector('[data-grid]');
    grid.addEventListener('click', event => {
      const card = event.target.closest('[data-card]');
      if (card) this.open(Number(card.dataset.card));
    });
    // Arrows move the focus between cards; Enter and Space press the focused card button (BUG-PAIR-05).
    grid.addEventListener('keydown', event => this.onKey(event));
    this.updateScore();
    this.nextField();
  }

  nextField() {
    this.fieldIndex++;
    const shape = this.shapes[this.fieldIndex];
    const deck = M.deal(shape.cells.length, this.params.types);
    this.cards = shape.cells.map((cell, i) => ({cell, type: deck[i], looks: 0, open: false, done: false}));
    this.opened = []; this.found = 0; this.fieldDone = false; this.cursor = 0;
    const grid = this.container.querySelector('[data-grid]'), hadFocus = grid.contains(document.activeElement);
    grid.innerHTML = this.cards.map((card, i) => `<button type="button" class="pairs-card" data-card="${i}" tabindex="${i ? -1 : 0}"
      style="grid-row:${Math.floor(card.cell / M.COLS) + 1};grid-column:${card.cell % M.COLS + 1};--i:${i}" aria-label="${escapeHTML(this.cardLabel(i))}">
      <span class="pairs-card-inner"><span class="pairs-back" aria-hidden="true"></span><span class="pairs-face" aria-hidden="true"></span></span></button>`).join('');
    grid.classList.remove('is-dealt'); void grid.offsetWidth; grid.classList.add('is-dealt');
    if (hadFocus) this.focusCard(0);
    this.setStatus(`${tr('Поле', 'Field')} ${this.fieldIndex + 1} / ${this.params.fields}`);
    this.note();
  }

  cardEl(i) { return this.container.querySelector(`[data-card="${i}"]`); }

  cardLabel(i) {
    const card = this.cards[i];
    if (!card.open && !card.done) return `${tr('Карта', 'Card')} ${i + 1}`;
    const name = tr(PICTURES[card.type].ru, PICTURES[card.type].en);
    return card.done ? `${name}, ${tr('пара найдена', 'pair found')}` : name;
  }

  open(i) {
    const card = this.cards?.[i];
    if (!this.playable || this.fieldDone || !card || card.open || card.done) return;
    this.focusCard(i, false);
    // A third card closes the mismatched pair at once, as in the original.
    if (this.opened.length === 2) this.closePair();
    card.open = true; card.looks++;
    this.opened.push(i);
    this.paint(i);
    audio.play('click');
    if (this.opened.length === 2) this.compare();
  }

  compare() {
    const pair = this.opened, [a, b] = pair.map(i => this.cards[i]);
    if (a.type === b.type) {
      this.opened = [];
      for (const i of pair) { this.cards[i].open = false; this.cards[i].done = true; this.paint(i, 'is-hit'); }
      this.found++;
      audio.play('good');
      if (this.found * 2 >= this.cards.length) this.fieldSolved(); else this.note();
      return;
    }
    if (M.isWrongPair(a.looks, b.looks, this.params.freeLooks)) {
      this.wrong++; a.looks = b.looks = 1;
      this.score = M.sessionScore(this.params, this.wrong).total;
      this.updateScore();
      audio.play('wrong');
      for (const i of pair) this.paint(i, 'is-wrong');
      const board = this.container.querySelector('[data-board]');
      board.classList.remove('is-wrong'); void board.offsetWidth; board.classList.add('is-wrong');
      const flash = ++this.flashToken;
      this.defer(() => { if (flash === this.flashToken) board.classList.remove('is-wrong'); }, 700);
      this.note(`−${fmt(Math.abs(this.params.wrongCost))} · ${tr('обе карты уже видели', 'both cards seen before')}`, 2200);
    }
    // The pair closes after m_nPairsClosingDelay; a token instead of clearTimeout, because defer()
    // re-arms its timer while the game is paused (BUG-PAIR-12).
    const token = ++this.closeToken;
    this.defer(() => { if (token === this.closeToken) this.closePair(); }, this.params.closeDelay);
  }

  closePair() {
    this.closeToken++;
    const pair = this.opened;
    this.opened = [];
    for (const i of pair) { this.cards[i].open = false; this.paint(i); }
  }

  paint(i, effect = '') {
    const el = this.cardEl(i), card = this.cards[i];
    if (!el) return;
    // The picture enters the DOM only when the card is first opened (BUG-PAIR-10).
    if ((card.open || card.done) && !el.dataset.shown) {
      el.querySelector('.pairs-face').innerHTML = pictureSVG(card.type);
      el.dataset.shown = '1';
    }
    el.classList.toggle('is-open', card.open);
    el.classList.toggle('is-done', card.done);
    if (card.done) el.setAttribute('aria-disabled', 'true');
    el.setAttribute('aria-label', this.cardLabel(i));
    if (effect) {
      el.classList.remove(effect); void el.offsetWidth; el.classList.add(effect);
      this.defer(() => el.classList.remove(effect), 650);
    }
  }

  fieldSolved() {
    this.fieldDone = true;
    this.note();
    if (this.fieldIndex + 1 < this.params.fields) {
      this.note(tr('Поле пройдено!', 'Field cleared!'));
      this.defer(() => this.nextField(), 900);
    } else this.defer(() => this.finishGame(), 550);
  }

  finishGame() {
    const {levelSum, total} = M.sessionScore(this.params, this.wrong);
    // pairs_show_results: Level Scores (@DIST) and Wrong Answers (@P2 x @P7); 0 is recorded (BUG-PAIR-03).
    this.finish(total, {section: this.original.pairs_show_results,
      values: {DIST: levelSum, P2: this.wrong, P7: this.params.wrongCost, TOTAL: total}});
  }

  // Shows text in the note above the field; a timed text returns to the pair count.
  note(text = '', duration = 0) {
    const el = this.container.querySelector('[data-note]');
    if (!el) return;
    const token = ++this.noteToken;
    el.classList.toggle('is-alert', Boolean(text && duration));
    el.textContent = text || `${tr('Найдено пар', 'Pairs found')}: ${this.found} / ${this.cards.length / 2}`;
    if (text && duration) this.defer(() => { if (token === this.noteToken) this.note(); }, duration);
  }

  focusCard(i, focus = true) {
    const old = this.cardEl(this.cursor);
    if (old) old.tabIndex = -1;
    this.cursor = i;
    const el = this.cardEl(i);
    if (!el) return;
    el.tabIndex = 0;
    if (focus) el.focus();
  }

  // Arrow keys: the nearest card in that direction; empty cells are skipped (BUG-PAIR-11).
  onKey(event) {
    const move = MOVES[event.key];
    if (!move || !this.cards || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const from = this.cards[this.cursor].cell, r0 = Math.floor(from / M.COLS), c0 = from % M.COLS;
    let best = -1, bestCost = Infinity;
    this.cards.forEach((card, i) => {
      const dr = Math.floor(card.cell / M.COLS) - r0, dc = card.cell % M.COLS - c0;
      const ahead = dr * move[0] + dc * move[1], aside = Math.abs(move[0] ? dc : dr);
      if (ahead <= 0) return;
      const cost = ahead + aside * 2;
      if (cost < bestCost) { bestCost = cost; best = i; }
    });
    if (best >= 0) this.focusCard(best);
  }
}
