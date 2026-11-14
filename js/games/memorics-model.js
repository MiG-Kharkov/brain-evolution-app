// Memorics (ColorRects, CCR_*) — port of the original game logic (see re/README.md) with the v2 fixes:
//   createRound   FUN_4a0feb88   figures, field placement and question for one round
//   matches       FUN_4a0f5034   which figures answer the question
//   tap           FUN_4a0f5034 / FUN_4a0f4ebc / FUN_4a0f4d30   one tap = one try, right or wrong
//   totalScore    CCRGameWnd::v28   level cost split over all taps, wrong taps cost a percentage
// v2: the figure count range is inclusive [MIN, MAX] (BUG-MEM-04); the score is a share of the level
// cost, so a session without mistakes always earns the full cost (BUG-MEM-03); a round never asks a
// question that every figure on the field answers (see createRound).
export const COLS = 6, ROWS = 5, SLOTS = COLS * ROWS;
// Question types: 0 form, 1 colour, 2 state, 3 form+colour, 4 form+state, 5 state+colour.
export const QUESTION_TYPES = 6;
// Forms 1..4 (square, line, triangle, star), colours 1..4 (blue, green, red, yellow),
// states 1..3 (static, pulsing, rotating) — the cr_figure_N / cr_colN / cr_stateN keys of the config.
export const FORMS = [1, 2, 3, 4], COLORS = [1, 2, 3, 4], STATES = [1, 2, 3];

const rnd = (rand, n) => (rand() % 0x7fff) % n;
const int = value => Number(String(value ?? '').trim().split(/\s+/)[0]);

function pickDistinct(rand, pool, count) {
  const left = pool.slice(), picked = [];
  for (let i = 0; i < count && left.length; i++) picked.push(left.splice(rnd(rand, left.length), 1)[0]);
  return picked;
}

// Level section cr_lev_N -> numbers.
export function levelParams(level) {
  return {min: int(level.MIN_OBJ_COUNT), max: int(level.MAX_OBJ_COUNT), forms: int(level.m_nTotalForms),
    colors: int(level.m_nTotalColors), states: int(level.m_nTotalStates), randomStart: int(level.m_nEnableAnimRandom) > 0,
    rounds: int(level.m_nShowCount) + int(level.m_nHowmuchCount), demoTime: int(level.m_nDemoTime),
    showCount: int(level.m_nShowCount), howmuchCount: int(level.m_nHowmuchCount)};
}

// The show questions the original generates: types 0..4 (type 5 exists in the checker only).
const SHOW_TYPES = [0, 1, 2, 3, 4];
const answersAll = (question, figures) => figures.every(f => matches(question, f));

// One round. Each figure: {slot, form, color, state, phase}; phase 0..1 is the animation start
// (random when m_nEnableAnimRandom = 1, as the original started from a random frame).
// v2: a question about an attribute that every figure on the field shares («show all static figures»
// when nothing moves, «show all squares» when every figure is a square) is «show every figure»: it
// asks only for the places. The original asked it in a fifth of the Easy and Medium rounds. Such a
// question is drawn again among the show questions that leave some figures out; a field where every
// question would take all figures is dealt again.
export function createRound(level, rand) {
  const L = level.min === undefined ? levelParams(level) : level;
  let round;
  for (let attempt = 0; attempt < 20; attempt++) {
    round = drawRound(L, rand);
    const {figures, question} = round;
    if (question.type > 4 || !answersAll(question, figures)) break;
    const fair = SHOW_TYPES.filter(type => !answersAll({...question, type}, figures));
    if (fair.length) { question.type = fair[rnd(rand, fair.length)]; break; }
  }
  return {...round, tries: round.figures.filter(f => matches(round.question, f)).length};
}

function drawRound(L, rand) {
  const count = L.min + (L.max > L.min ? rnd(rand, L.max - L.min + 1) : 0);
  const forms = pickDistinct(rand, FORMS, L.forms);
  const colors = pickDistinct(rand, COLORS, L.colors);
  const states = pickDistinct(rand, STATES, L.states);
  const combos = [];
  for (const form of forms) for (const color of colors) for (const state of states) combos.push({form, color, state});
  // Show-only levels ask types 0..4; type 5 exists in the checker but is never generated.
  const type = L.howmuchCount < 1 ? rnd(rand, 5) : L.showCount < 1 ? 6 + rnd(rand, 5) : rnd(rand, 11);
  let pick = Math.floor(combos.length / 2);
  const question = {type, ...combos[pick]};
  const slots = Array.from({length: SLOTS}, (_, i) => i), figures = [];
  for (let i = 0; i < count; i++) {
    const slot = slots.splice(rnd(rand, slots.length), 1)[0];
    figures.push({slot, ...combos[pick], phase: L.randomStart ? rnd(rand, 1000) / 1000 : 0});
    pick = count < combos.length ? rnd(rand, combos.length) : (pick + 1) % combos.length;
  }
  return {figures, question};
}

export function matches(q, f) {
  switch (q.type) {
    case 0: return q.form === f.form;
    case 1: return q.color === f.color;
    case 2: return q.state === f.state;
    case 3: return q.form === f.form && q.color === f.color;
    case 4: return q.form === f.form && q.state === f.state;
    case 5: return q.state === f.state && q.color === f.color;
    default: return false;
  }
}

// One tap on a cell. Each new cell costs one try; repeated taps on a found or crossed cell are ignored.
export function tap(round, state, slot) {
  if (state.tries <= 0 || state.found.has(slot) || state.crossed.has(slot)) return null;
  const figure = round.figures.find(f => f.slot === slot);
  const right = Boolean(figure && matches(round.question, figure));
  if (right) state.found.add(slot); else state.crossed.add(slot);
  state.tries--;
  right ? state.right++ : state.wrong++;
  return right;
}

// Which attributes the question names.
export function questionParts(q) {
  switch (q.type) {
    case 0: return {color: null, state: null, form: q.form};
    case 1: return {color: q.color, state: null, form: null};
    case 2: return {color: null, state: q.state, form: null};
    case 3: return {color: q.color, state: null, form: q.form};
    case 4: return {color: null, state: q.state, form: q.form};
    default: return {color: q.color, state: q.state, form: null};
  }
}

// Score of a session: answers = right + wrong = every try of every round. The level cost is shared
// by all tries: rightPoints = cost · right / answers; a wrong try costs pct % of one try's share.
// Without mistakes the score is exactly the level cost (v1 rounded the share down to tens, so the
// maximum depended on the number of tries).
export function totalScore(right, wrong, levelCost, wrongPercent) {
  const answers = right + wrong;
  if (!answers) return {perRight: 0, perWrong: 0, rightPoints: 0, wrongPoints: 0, answers: 0, total: 0};
  const share = levelCost / answers;
  const perRight = Math.round(share), perWrong = -Math.round(share * wrongPercent / 100);
  const rightPoints = Math.round(levelCost * right / answers), wrongPoints = wrong * perWrong;
  return {perRight, perWrong, rightPoints, wrongPoints, answers, total: Math.max(0, rightPoints + wrongPoints)};
}
