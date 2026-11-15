// Pairs (CPairs_GameWnd) — rules, field templates, dealing and scoring. No DOM: the view is pairs.js,
// the balance simulation imports this file as is.
//   Field: 6 x 8 cells; a template pairs_lev_l<d>_<n> marks the cards with '*'.
//   Session: m_nFieldsInTraining fields; every field gets a random template, no repeats in a session.
//   Deal: m_nGenPairsTypeCount random pictures of 12; pair p gets picture p % K, then the deck is shuffled.
//   Wrong pair: a mismatch counts only when both cards were looked at more than m_nFreeLooksCount
//   times (FUN_4a0c3a14); then both counters restart at 1.
//   Score: m_nLevelCost x fields + m_nWrongPairCost x wrong pairs, never below 0. Time does not count.
export const COLS = 6, ROWS = 8;
export const PICTURES = 12;
// The original ticks at about 15 per second (66 ms, as in the results window).
export const TICK_MS = 66;

const LEVEL_SECTIONS = ['pairs_easy_lev', 'pairs_med_lev', 'pairs_hard_lev'];

const num = (value, fallback) => {
  const n = Number(String(value ?? '').trim());
  return String(value ?? '').trim() !== '' && Number.isFinite(n) ? n : fallback;
};

export function levelParams(games, diff) {
  const s = games?.[LEVEL_SECTIONS[Math.max(0, Math.min(diff, 2))]] || {};
  return {
    levelCost: num(s.m_nLevelCost, 2000),
    wrongCost: num(s.m_nWrongPairCost, -500),
    freeLooks: num(s.m_nFreeLooksCount, 1),
    types: Math.max(1, Math.min(PICTURES, num(s.m_nGenPairsTypeCount, 4))),
    fields: Math.max(1, num(s.m_nFieldsInTraining, 1)),
    closeDelay: num(s.m_nPairsClosingDelay, 25) * TICK_MS,
  };
}

// Every template of the difficulty that the config has (pairs_lev_l<d>_0, _1, ...), as the indices of
// the card cells (row-major, 6 per row). Templates with an odd number of cards are left out.
export function templates(games, diff) {
  const level = Math.max(0, Math.min(diff, 2)), list = [];
  for (let n = 0; games?.[`pairs_lev_l${level}_${n}`]; n++) {
    const section = games[`pairs_lev_l${level}_${n}`], cells = [];
    for (let r = 0; r < ROWS; r++) {
      const row = String(section[`row_${r + 1}`] || '');
      for (let c = 0; c < COLS; c++) if (row[c] === '*') cells.push(r * COLS + c);
    }
    if (cells.length >= 2 && cells.length % 2 === 0) list.push({id: `pairs_lev_l${level}_${n}`, cells});
  }
  return list;
}

export function shuffle(values, random = Math.random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// count templates for one session: random order, no repeats until every template was used once.
export function pickTemplates(list, count, random = Math.random) {
  const picked = [];
  while (picked.length < count && list.length) picked.push(...shuffle(list, random).slice(0, count - picked.length));
  return picked;
}

// Picture (1..12) of every card of a field with `cards` cards.
export function deal(cards, typeCount, random = Math.random) {
  const pairs = Math.floor(cards / 2);
  const types = shuffle(Array.from({length: PICTURES}, (_, i) => i + 1), random).slice(0, Math.max(1, Math.min(typeCount, pairs)));
  const deck = [];
  for (let p = 0; p < pairs; p++) deck.push(types[p % types.length], types[p % types.length]);
  return shuffle(deck, random);
}

export const isWrongPair = (looksA, looksB, freeLooks) => looksA > freeLooks && looksB > freeLooks;

export function sessionScore(params, wrong) {
  const levelSum = params.levelCost * params.fields;
  const total = levelSum + wrong * params.wrongCost;
  return {levelSum, total, score: Math.max(0, total)};
}
