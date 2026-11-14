// Visual rules for the games whose text rules are hard to follow (owner's feedback, v3.1): step-by-step rules
// and an animated example of one move on a small sample field. The example plays when the player presses
// "Show me how"; it is shown in the in-game rules, the test intro and the game card. The sample field is fixed,
// so the example is fair in the test too (it never reveals the player's own field).
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { i18n } from '../i18n.js';
import { storage } from '../storage.js';
import { noteFlag } from '../achievements.js';

const t = (en, ru) => i18n.t(en, ru);
const STEP_MS = 1500;

// ---------------------------------------------------------------- rules text
const RULES = {
  quadronica: () => [
    t('1. Find four cells of one colour that sit in the corners of a rectangle.', '1. Найдите четыре клетки одного цвета, которые стоят в углах прямоугольника.'),
    t('2. Tap one corner, then the opposite one (across the diagonal).', '2. Нажмите один угол, затем противоположный (по диагонали).'),
    t('3. The rectangle disappears and new cells take its place. The bigger the rectangle, the more points.', '3. Прямоугольник исчезает, на его месте появляются новые клетки. Чем больше прямоугольник, тем больше очков.'),
    t('A wrong tap costs points. Find as many rectangles as you can before the time runs out.', 'Неверное нажатие снимает очки. Найдите как можно больше прямоугольников, пока не закончилось время.'),
  ].join('\n'),
  numbers: () => [
    t('1. At the top is the number to place.', '1. Вверху — число, которое нужно поставить.'),
    t('2. Move it to an empty cell where the digits around it (in the 3×3 frame) add up to this number.', '2. Переместите его в пустую клетку, где цифры вокруг (в рамке 3×3) в сумме дают это число.'),
    t('3. If the sum is more than 9, its last digit counts: 14 fits 4.', '3. Если сумма больше 9, считается её последняя цифра: 14 подходит для 4.'),
    t('4. Press «Accept move»: the digits around disappear. Clear the whole field.', '4. Нажмите «Принять ход»: цифры вокруг исчезнут. Очистите всё поле.'),
  ].join('\n'),
};
export const rulesText = id => RULES[id]?.() || '';
export const hasDemo = id => Boolean(DEMOS[id]);

// ---------------------------------------------------------------- player
// Runs the steps of a demo one after another; stops when the stage leaves the page or a replay starts.
function player(stage, caption, steps, done) {
  let run = 0;
  return () => {
    const id = ++run;
    let i = 0;
    const next = () => {
      if (id !== run || !stage.isConnected) return;
      if (i >= steps.length) { done(); return; }
      const step = steps[i++];
      caption.textContent = step.text || '';
      caption.className = `demo-caption${step.tone ? ` ${step.tone}` : ''}`;
      step.run?.();
      setTimeout(next, step.ms || STEP_MS);
    };
    next();
  };
}

// ---------------------------------------------------------------- quadronica
// 5 × 4 sample field with exactly one rectangle: green corners at rows 1 and 3, columns 2 and 5.
const QUAD_GRID = [
  [0, 2, 1, 3, 2],
  [3, 1, 0, 1, 0],
  [1, 2, 3, 0, 2],
  [0, 3, 1, 2, 3]];
const QUAD_RECT = {r1: 0, c1: 1, r2: 2, c2: 4};
const QUAD_NEW = [[3, 0, 1, 3], [2, 3, 0, 1], [0, 1, 2, 0]];

function quadronicaDemo() {
  const cols = 5, rows = 4, cells = [];
  const board = h('div', {class: 'quad-board', style: `--cols:${cols};--rows:${rows}`, 'aria-hidden': 'true'});
  QUAD_GRID.forEach(row => row.forEach(k => {
    const tile = h('span', {class: 'quad-tile'}); tile.dataset.color = k;
    const cell = h('span', {class: 'quad-cell'}, tile);
    cells.push(cell); board.append(cell);
  }));
  const at = (r, c) => cells[r * cols + c];
  const {r1, c1, r2, c2} = QUAD_RECT;
  const corners = [at(r1, c1), at(r1, c2), at(r2, c1), at(r2, c2)];
  const area = `${r1 + 1} / ${c1 + 1} / ${r2 + 2} / ${c2 + 2}`;
  const frame = h('span', {class: 'quad-hint', style: {gridArea: area}});
  const reset = () => {
    QUAD_GRID.forEach((row, r) => row.forEach((k, c) => { at(r, c).firstElementChild.dataset.color = k; }));
    cells.forEach(el => el.classList.remove('is-marked', 'is-hint', 'is-tap', 'is-new'));
    board.querySelectorAll('.quad-hint, .quad-hit, .quad-badge').forEach(el => el.remove());
  };
  const tap = el => { el.classList.remove('is-tap'); void el.offsetWidth; el.classList.add('is-tap', 'is-marked'); };
  const steps = [
    {text: t('Look for four cells of one colour in the corners of a rectangle', 'Ищите четыре клетки одного цвета в углах прямоугольника'), ms: 2200,
      run: () => { reset(); corners.forEach(el => el.classList.add('is-hint')); board.append(frame); }},
    {text: t('Tap one corner…', 'Нажмите один угол…'), run: () => { frame.remove(); corners.forEach(el => el.classList.remove('is-hint')); tap(corners[0]); }},
    {text: t('…and the opposite one, across the diagonal', '…и противоположный, по диагонали'), run: () => tap(corners[3])},
    {text: t('Got it! The rectangle disappears and new cells appear. Bigger rectangle — more points.', 'Есть! Прямоугольник исчезает, появляются новые клетки. Больше прямоугольник — больше очков.'),
      tone: 'good', ms: 3200, run: () => {
        cells.forEach(el => el.classList.remove('is-marked', 'is-tap'));
        board.append(h('span', {class: 'quad-hit', style: {gridArea: area}}), h('span', {class: 'quad-badge good', style: {gridArea: area}}, '+320'));
        for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
          const el = at(r, c); el.firstElementChild.dataset.color = QUAD_NEW[r - r1][c - c1];
          el.classList.remove('is-new'); void el.offsetWidth; el.classList.add('is-new');
        }
      }},
  ];
  return {stage: h('div', {class: 'quad-demo'}, board), steps, reset};
}

// ---------------------------------------------------------------- numbers
// 5 × 3 sample field; the number to place is 7. Wrong cell first (5 + 6 = 11), then the right one (2 + 5 = 7).
const NUM_GRID = [
  [null, null, null, null, null],
  [null, 2, 5, 6, null],
  [null, null, null, null, null]];
const NUM_DIGIT = 7;

function numbersDemo() {
  const cols = 5, rows = 3, cells = [];
  const grid = h('div', {class: 'num-grid', style: `--cols:${cols};--rows:${rows}`, 'aria-hidden': 'true'});
  NUM_GRID.forEach((row, r) => row.forEach((v, c) => {
    const el = h('div', {class: 'num-cell', style: {gridArea: `${r + 1}/${c + 1}`}});
    cells.push(el); grid.append(el);
  }));
  const win = h('div', {class: 'num-window'});
  grid.append(win);
  const task = h('div', {class: 'num-task'}, h('span', {class: 'num-task-label'}, t('Place the number', 'Поставьте число')),
    h('span', {class: 'num-task-values'}, h('b', null, String(NUM_DIGIT))));
  let field = NUM_GRID.map(row => row.slice());
  const paint = (cursor = null) => {
    field.forEach((row, r) => row.forEach((v, c) => {
      const el = cells[r * cols + c], here = cursor && cursor[0] === r && cursor[1] === c;
      const near = cursor && !here && Math.abs(cursor[0] - r) <= 1 && Math.abs(cursor[1] - c) <= 1;
      el.className = `num-cell${v !== null ? ' is-digit' : ' is-empty'}${here ? ' is-cursor' : ''}${near && v !== null ? ' in-window' : ''}`;
      el.textContent = here ? String(NUM_DIGIT) : v !== null ? String(v) : '';
    }));
    win.hidden = !cursor;
    if (cursor) {
      const [r, c] = cursor;
      win.style.gridArea = `${Math.max(0, r - 1) + 1}/${Math.max(0, c - 1) + 1}/${Math.min(rows - 1, r + 1) + 2}/${Math.min(cols - 1, c + 1) + 2}`;
    }
    win.classList.remove('is-wrong');
  };
  const reset = () => { field = NUM_GRID.map(row => row.slice()); paint(); };
  const steps = [
    {text: t('This number has to go into an empty cell', 'Это число нужно поставить в пустую клетку'), run: () => reset()},
    {text: t('Here the digits around make 5 + 6 = 11: the last digit is 1, not 7', 'Здесь вокруг 5 + 6 = 11: последняя цифра 1, а не 7'), tone: 'bad', ms: 2600,
      run: () => { paint([0, 3]); win.classList.add('is-wrong'); }},
    {text: t('Here 2 + 5 = 7 — it fits!', 'А здесь 2 + 5 = 7 — подходит!'), tone: 'good', ms: 2200, run: () => paint([0, 1])},
    {text: t('The digits around disappear. Clear the whole field this way.', 'Цифры вокруг исчезают. Так очистите всё поле.'), tone: 'good', ms: 2800,
      run: () => {
        for (const [r, c] of [[0, 1], [1, 1], [1, 2]]) cells[r * cols + c].classList.add('is-gone');
        setTimeout(() => { field[1][1] = null; field[1][2] = null; paint(); }, 300);
      }},
  ];
  return {stage: h('div', {class: 'num-demo board'}, task, grid), steps, reset};
}

const DEMOS = {quadronica: quadronicaDemo, numbers: numbersDemo};

// A "Show me how" button; the example appears under it and plays; the button then offers to replay it.
export function demoBlock(id) {
  const make = DEMOS[id];
  if (!make) return null;
  const {stage, steps, reset} = make();
  const caption = h('p', {class: 'demo-caption', 'aria-live': 'polite'});
  const box = h('div', {class: 'demo-stage', hidden: true}, stage, caption);
  const button = h('button', {class: 'btn btn-block demo-btn'}, icon('bulb'), t('Show me how', 'Показать, как играть'));
  const play = player(stage, caption, steps, () => { button.disabled = false; button.lastChild.textContent = t('Show again', 'Показать ещё раз'); });
  button.onclick = () => {
    box.hidden = false; button.disabled = true; reset(); play();
    storage.updateProfile(p => noteFlag(p, 'demo'));
    window.app?.achievementsNow?.();
    requestAnimationFrame(() => box.scrollIntoView?.({block: 'nearest', behavior: 'smooth'}));
  };
  return h('div', {class: 'demo'}, button, box);
}
