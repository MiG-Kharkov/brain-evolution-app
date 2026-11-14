// Encyclopedia (INTERESTING_VALUES): remember 8 numeric facts on 4 pages, then answer 3 / 4 / 5 questions
// with 4 options each. Facts and options — encyclopedia-model.js; v2 view. The shell's 222 interesting
// facts are a separate resource.
import { RestoredGame, tr, escapeHTML } from './restored-game.js';
import { arrayValue, shuffle } from '../original.js';
import { i18n } from '../i18n.js';
import { audio } from '../audio.js';
import { icon } from '../core/icons.js';
import { fmt } from '../core/dom.js';
import * as M from './encyclopedia-model.js';

const NBSP = '\u00a0';
// Numbers keep their digit groups on one line; the unit stays next to the number. The values of the original are
// written with a decimal point; 3.12.2 shows the separator of the language («1,4» in Russian, German, French…).
const decimalMark = () => { try { return new Intl.NumberFormat(document.documentElement.lang || 'en').format(1.5).replace(/\d/g, '') || '.'; } catch { return '.'; } };
const numberHTML = text => escapeHTML(String(text).replace(/(\d)\.(\d)/g, `$1${decimalMark()}$2`).replace(/ /g, NBSP));

export class EncyclopediaGame extends RestoredGame {
  id = 'encyclopedia';
  get title() { return tr('Энциклопедия', 'Encyclopedia'); }
  // Stats of the finished game for the achievements (js/achievements.js).
  feats() { return {perfect: this.wrong === 0 && this.right > 0, mistakes: this.wrong, right: this.right, units: this.units}; }

  async init(difficulty = 'easy') {
    if (!await this.begin(difficulty)) return;
    const level = this.original[`iv_lev_${Math.min(this.diff, 2)}`];
    this.pages = Number(level.m_nPages); this.perPage = Number(level.m_nValuesCount);
    this.pageTime = Number(level.m_nTimePerOneScreen); this.targetsCount = Number(level.m_nTargetsCount);
    const results = this.original.iv_show_results;
    this.rightPoints = arrayValue(results.i1_points_arr, Math.min(this.diff, 2));
    this.wrongPoints = arrayValue(results.i2_points_arr, Math.min(this.diff, 2));
    // rules.encyclopedia.excluded (3.7): facts of the original that did not pass a check against sources — a false
    // premise, a record that no longer holds, a number nobody can confirm (docs/facts-review.md).
    const out = new Set((this.config.rules?.encyclopedia?.excluded || []).map(n => `iv_value_${n}`));
    this.values = Object.entries(this.original).filter(([key]) => /^iv_value_\d+$/.test(key) && !out.has(key)).map(([, value]) => value);
    this.page = 0; this.question = 0; this.units = null; this.phase = 'units'; this.right = 0; this.wrong = 0;
    this.render();
    // Keys 1–4 answer the question (the option buttons also take Tab and Enter).
    this.keyHandler = event => {
      if (!this.playable || this.phase !== 'answer' || event.ctrlKey || event.metaKey || event.altKey) return;
      const index = '1234'.indexOf(event.key);
      if (index >= 0 && index < this.options.length) { event.preventDefault(); this.answer(index); }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  q(selector) { return this.container.querySelector(selector); }
  value(item) { return M.factValue(item, this.units); }
  unit(item) { const key = M.factUnit(item, this.units); return key ? i18n.t(key) : M.splitUnit(i18n.t(item.name), item).unit; }
  label(item) { return M.splitUnit(i18n.t(item.name), item).label; }
  // The value with the unit of the asked fact: the options show the unit too.
  amountHTML(value, unit) {
    return `<span class="enc-num">${numberHTML(value)}</span>${unit ? `${NBSP}<span class="enc-unit">${escapeHTML(unit)}</span>` : ''}`;
  }
  // The question is the fact's sentence with the number left out: "Shakespeare was born in …".
  questionText(item) { return `${this.label(item).trim()} …`; }

  plan() {
    const n = this.targetsCount;
    return tr('{facts} фактов на {pages} страницах, по {time} с на страницу, затем {questions}', '{facts} facts on {pages} pages, {time} s per page, then {questions}')
      .replace('{facts}', this.pages * this.perPage).replace('{pages}', this.pages).replace('{time}', this.pageTime)
      .replace('{questions}', `${n} ${n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? tr('вопроса', 'questions') : tr('вопросов', 'questions')}`);
  }

  study(units) {
    if (!this.playable || this.phase !== 'units') return;
    audio.play('click');
    this.units = units;
    this.studied = shuffle(this.values).slice(0, this.pages * this.perPage);
    this.sorted = M.sortFacts(this.values, units);
    this.phase = 'remember';
    this.startPage();
  }

  // Every page gets its full time: the second timer restarts with the page.
  startPage() {
    this.remaining = this.pageTime;
    if (this.countdown) { clearInterval(this.countdown); this.timers.delete(this.countdown); }
    this.countdown = this.tick(() => {
      if (this.phase !== 'remember') return;
      if (--this.remaining <= 0) this.nextPage(); else this.updateTimer();
    });
    this.render();
  }

  nextPage() {
    if (!this.playable || this.phase !== 'remember') return;
    if (++this.page >= this.pages) {
      clearInterval(this.countdown); this.timers.delete(this.countdown);
      this.targets = shuffle(this.studied).slice(0, this.targetsCount);
      this.makeQuestion();
    } else this.startPage();
  }

  makeQuestion() {
    this.phase = 'answer';
    this.current = this.targets[this.question];
    this.options = shuffle(M.optionFacts(this.sorted, this.current, this.units));
    this.picked = -1;
    this.render();
  }

  render() {
    let body = '', footer = '';
    if (this.phase === 'units') {
      // BUG-ENC-01: the prompt is translated (the short English key had no Russian text); "Choose Units" is the
      // original title of the units dialog (iv_msg_box_head), translated into every language.
      body = `<div class="board enc-board">
        <p class="card-kicker">${escapeHTML(tr('Перед началом', 'Before you start'))}</p>
        <h2 class="enc-title">${escapeHTML(tr('Выберите единицы измерения', 'Choose Units'))}</h2>
        <div class="enc-units">
          <button type="button" class="enc-unit-btn" data-units="eu"><b>${escapeHTML(tr('Метрические', 'Metric'))}</b><span>${escapeHTML(tr('метры, километры, килограммы, °C', 'meters, kilometers, kilograms, °C'))}</span></button>
          <button type="button" class="enc-unit-btn" data-units="us"><b>${escapeHTML(tr('Американские', 'US'))}</b><span>${escapeHTML(tr('футы, мили, фунты, °F', 'feet, miles, pounds, °F'))}</span></button>
        </div>
        <p class="enc-plan">${escapeHTML(this.plan())}</p>
      </div>`;
    } else if (this.phase === 'remember') {
      const facts = this.studied.slice(this.page * this.perPage, (this.page + 1) * this.perPage);
      body = `<div class="board enc-board">
        <div class="enc-head"><p class="board-note">${escapeHTML(i18n.t('Please remember these values'))}</p>
          <span class="steps enc-steps" aria-hidden="true">${Array.from({length: this.pages}, (_, i) => `<i class="${i <= this.page ? 'on' : ''}"></i>`).join('')}</span></div>
        <div class="enc-facts">${facts.map(item => `<article class="enc-fact"><p>${escapeHTML(this.label(item))}</p>
          <strong>${this.amountHTML(this.value(item), this.unit(item))}</strong></article>`).join('')}</div>
        <div class="enc-timer-row"><div class="bar enc-timer" aria-hidden="true"><i data-timer-bar></i></div><span class="enc-time" data-time></span></div>
      </div>`;
      footer = `<button type="button" class="btn btn-primary btn-lg btn-block" data-next-page>${escapeHTML(this.page + 1 >= this.pages ? tr('К вопросам', 'To the questions') : tr('Далее', 'Next'))}</button>`;
    } else {
      const unit = this.unit(this.current), answered = this.phase === 'feedback', truth = this.value(this.current);
      body = `<div class="board enc-board">
        <p class="enc-question">${escapeHTML(this.questionText(this.current))}</p>
        <div class="enc-options" role="group" aria-label="${escapeHTML(tr('Варианты ответа', 'Answer options'))}">
          ${this.options.map((item, i) => {
            const value = this.value(item), right = value === truth;
            const state = !answered ? '' : right ? ' is-right' : i === this.picked ? ' is-wrong' : ' is-dim';
            return `<button type="button" class="enc-option${state}" data-answer="${i}" ${answered ? 'disabled' : ''}>
              <span class="enc-key" aria-hidden="true">${i + 1}</span><span class="enc-amount">${this.amountHTML(value, unit)}</span>
              ${answered && (right || i === this.picked) ? icon(right ? 'check' : 'close').outerHTML : ''}</button>`;
          }).join('')}
        </div>
        ${answered ? `<p class="enc-feedback ${this.wasCorrect ? 'is-right' : 'is-wrong'}" aria-live="polite">${this.wasCorrect
          ? `${escapeHTML(tr('Верно!', 'Correct!'))} +${fmt(this.rightPoints)}`
          : `${escapeHTML(tr('Неверно', 'Wrong'))}${this.wrongPoints ? `, −${fmt(Math.abs(this.wrongPoints))}` : ''}. ${escapeHTML(tr('Правильный ответ:', 'Correct answer:'))} ${this.amountHTML(truth, unit)}`}</p>` : ''}
      </div>`;
      if (answered) footer = `<button type="button" class="btn btn-primary btn-lg btn-block" data-next-question>${escapeHTML(this.question + 1 >= this.targets.length ? tr('Итог', 'Results') : tr('Далее', 'Next'))}</button>`;
    }
    this.frame(this.title, body, footer);
    this.updateScore();
    this.container.querySelectorAll('[data-units]').forEach(button => { button.onclick = () => this.study(button.dataset.units); });
    this.q('[data-next-page]')?.addEventListener('click', () => this.nextPage());
    this.container.querySelectorAll('[data-answer]').forEach(button => { button.onclick = () => this.answer(Number(button.dataset.answer)); });
    const next = this.q('[data-next-question]');
    next?.addEventListener('click', () => {
      if (!this.playable || this.phase !== 'feedback') return;
      if (++this.question >= this.targets.length) this.finishGame(); else this.makeQuestion();
    });
    if (next) next.focus({preventScroll: true});
    this.updateStatus();
    this.updateTimer();
  }

  answer(index) {
    if (!this.playable || this.phase !== 'answer') return;
    this.picked = index;
    this.wasCorrect = this.value(this.options[index]) === this.value(this.current);
    if (this.wasCorrect) this.right++; else this.wrong++;
    this.score += this.wasCorrect ? this.rightPoints : this.wrongPoints;
    audio.play(this.wasCorrect ? 'good' : 'wrong');
    this.phase = 'feedback';
    this.render();
  }

  finishGame() {
    // iv_show_results: right answers x points, wrong answers x points; the total is never below 0.
    this.finish(this.score, {section: this.original.iv_show_results, values: {P1: this.right, P2: this.wrong, TOTAL: Math.round(this.score)}});
  }

  updateStatus() {
    if (this.phase === 'remember') this.setStatus(`${tr('Страница', 'Page')} ${this.page + 1} / ${this.pages}`);
    else if (this.targets) this.setStatus(`${tr('Вопрос', 'Question')} ${this.question + 1} / ${this.targets.length}`);
    else this.setStatus('');
  }

  updateTimer() {
    const bar = this.q('[data-timer-bar]'), time = this.q('[data-time]');
    if (bar) bar.style.width = `${Math.max(0, this.remaining / this.pageTime * 100)}%`;
    if (time) time.textContent = `${this.remaining} ${tr('с', 's')}`;
  }

  destroy() {
    super.destroy();
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
  }
}
