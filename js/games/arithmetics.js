// Arithmetics (Connected Calc): a chain of examples; each starts from the previous result.
// Logic and scoring — arithmetics-model.js (port of the original chain generator); v2 view.
import { RestoredGame, tr, escapeHTML } from './restored-game.js';
import { arrayValue, createRandom } from '../original.js';
import { audio } from '../audio.js';
import { i18n } from '../i18n.js';
import { icon } from '../core/icons.js';
import * as M from './arithmetics-model.js';

const SIGN = ['+', '−', '×', '÷'];

export class ArithmeticsGame extends RestoredGame {
  id = 'arithmetics';
  get title() { return tr('Арифметика', 'Arithmetics'); }
  // Stats of the finished game for the achievements (js/achievements.js).
  feats() { return {perfect: this.wrong === 0 && this.right > 0, mistakes: this.wrong, perItem: Math.max(1, this.elapsed) / Math.max(1, this.right)}; }

  async init(difficulty = 'easy') {
    if (!await this.begin(difficulty)) return;
    const g = this.original;
    this.level = M.levelParams(g[`cc_lev_${this.diff + (this.inTest ? 3 : 0)}`]);
    this.rand = createRandom(Date.now());
    this.right = 0; this.wrong = 0; this.input = '';
    this.left = this.level.steps;
    this.step = M.nextStep(M.firstValue(this.level, this.rand), undefined, this.level, this.diff, this.rand);
    this.render();
    this.tick(() => { this.elapsed++; this.setClock(); this.liveScore(); });
    this.keyHandler = event => {
      if (!this.playable || event.ctrlKey || event.metaKey || event.altKey) return;
      if (/^\d$/.test(event.key)) this.press(event.key);
      else if (event.key === 'Backspace') { event.preventDefault(); this.backspace(); }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  render() {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => `<button class="key" data-digit="${d}">${d}</button>`).join('')
      + `<button class="key muted" data-back aria-label="${escapeHTML(tr('Стереть цифру', 'Backspace'))}">${icon('back').outerHTML}</button>`
      + '<button class="key wide" data-digit="0">0</button>';
    this.frame(this.title, `
      <div class="board">
        <p class="board-note" data-left></p>
        <div class="expr" data-expr aria-live="polite"></div>
      </div>
      <div class="keypad" style="margin-top:14px">${keys}</div>`);
    this.container.querySelectorAll('[data-digit]').forEach(b => { b.onclick = () => this.press(b.dataset.digit); });
    this.container.querySelector('[data-back]').onclick = () => this.backspace();
    this.setClock(0);
    this.update();
  }

  get expected() { return String(this.step.result); }

  update(state = '') {
    const s = this.step;
    const expr = this.container.querySelector('[data-expr]');
    if (expr) {
      expr.className = `expr ${state}`;
      expr.innerHTML = `${s.a} ${SIGN[s.op]} ${s.b} = ${this.input ? `<span class="answer">${escapeHTML(this.input)}</span>` : '<span class="placeholder">?</span>'}`;
    }
    const left = this.container.querySelector('[data-left]');
    if (left) left.textContent = i18n.t(this.original.cc_operations_txt.text).replace('%d', this.left);
    this.setStatus(`${this.right} / ${this.level.steps}`);
  }

  press(digit) {
    if (!this.playable) return;
    audio.play('click');
    this.input += digit;
    // The answer is checked as soon as it has as many digits as the right result (as in the original).
    if (this.input.length >= this.expected.length) this.check(); else this.update();
  }

  backspace() {
    if (!this.playable || !this.input) return;
    this.input = this.input.slice(0, -1); this.update();
  }

  check() {
    if (this.input !== this.expected) {
      this.wrong++; this.input = '';
      audio.play('wrong');
      this.update('wrong');
      this.liveScore(1);
      return;
    }
    this.right++; this.left--;
    audio.play('good');
    this.input = '';
    if (this.left <= 0) { this.update('right'); this.finishGame(); return; }
    const previous = this.step.a;
    this.step = M.nextStep(this.step.result, previous, this.level, this.diff, this.rand);
    this.update('right');
    this.liveScore(0);
  }

  // The test has its own prices (cc_sp_show_results, v3.2): training and the test share cc_show_results no more.
  get results() { return this.original[this.inTest && this.original.cc_sp_show_results ? 'cc_sp_show_results' : 'cc_show_results']; }
  get prices() { const r = this.results; return [r.i1_points_arr, r.i2_points_arr, r.i3_points_arr].map(v => arrayValue(v, this.diff)); }
  // The score so far (right, wrong and time), so a right answer shows what it brought.
  liveScore(move = null) {
    if (move !== null) this.gain(this.prices[move]);
    this.score = Math.max(0, M.totalScore(this.right, this.wrong, this.elapsed, ...this.prices));
    this.updateScore();
  }

  finishGame() {
    const r = this.results, points = this.prices;
    const seconds = Math.max(1, this.elapsed);
    const total = M.totalScore(this.right, this.wrong, seconds, ...points);
    this.finish(total, {section: r, values: {P1: this.right, P2: this.wrong, TIME: seconds, TOTAL: total}});
  }

  destroy() {
    super.destroy();
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
  }
}
