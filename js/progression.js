// Brain Training and Brain Marking rules (port of CMiniGames_ManagerWnd / CBrainTrain2MenuWnd /
// CBrainMarkMenuWnd) with the v2 fixes listed in docs/decisions.md.
import { storage } from './storage.js';
import { loadOriginalConfig, DIFFICULTIES } from './original.js';
import { APP_VERSION } from './version.js';

export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// progression.js v1 ids: native ID -> web id
export const GAME_IDS = {101: 'guess_who', 102: 'memorics', 103: 'arithmetics', 105: 'encyclopedia', 106: 'matches',
  107: 'minesweeper', 108: 'numbers', 109: 'roadblocks', 110: 'sudoku', 111: 'quadronica', 112: 'pairs', 114: 'geometry'};
export const NATIVE_IDS = Object.fromEntries(Object.entries(GAME_IDS).map(([k, v]) => [v, Number(k)]));
// The training list and the unlock order ([mini_games] game=).
export const TRAINING_ORDER = ['arithmetics', 'quadronica', 'memorics', 'sudoku', 'pairs', 'numbers', 'roadblocks',
  'guess_who', 'minesweeper', 'geometry', 'encyclopedia', 'matches'];

const numbers = text => String(text ?? '').trim().split(/\s+/).filter(Boolean).map(Number);

// ---------------------------------------------------------------- Brain Marking
export function interpolateMark(score, table) {
  const n = numbers(table), count = n.shift();
  const points = Array.from({length: count}, (_, i) => ({score: n[i * 2], mark: n[i * 2 + 1]}));
  if (score <= points[0].score) return points[0].mark;
  for (let i = 1; i < points.length; i++) if (score <= points[i].score) {
    const a = points[i - 1], b = points[i];
    return Math.round(a.mark + (b.mark - a.mark) * (score - a.score) / (b.score - a.score));
  }
  return points.at(-1).mark;
}
export const rankThresholds = section => Array.from({length: 7}, (_, i) => numbers(section[`status${i + 1}_param`])[0]);
export function markRank(percent, section) {
  const t = rankThresholds(section);
  for (let rank = 7; rank >= 1; rank--) if (percent >= t[rank - 1]) return rank;
  return 1;
}
export function miniGameRoute(mgId) {
  return {gameId: GAME_IDS[Math.floor(mgId / 10)], difficulty: DIFFICULTIES[mgId % 10]};
}
// The level a test task is shown as and counted under in the records and the achievements (rules.test.shown_level):
// the test plays its own conditions, and by content two of its tasks are Medium although their original ids say Hard.
// The task itself keeps its id and its `difficulty` (the games pick the test level and the prices by it).
export const testLevel = (config, gameId, difficulty) => config?.rules?.test?.shown_level?.[gameId] || difficulty;
// The five games of the test with their difficulty (shell.b_mark_lists: every list is an order of these).
export function testGames(config) {
  const first = numbers(config.shell.b_mark_lists['1_list']).slice(2);
  return first;
}
// 5×5 Latin square: row r puts game (r + k) % 5 at position k.
export function testOrder(config, row) {
  const games = testGames(config);
  return games.map((_, k) => games[(row + k) % games.length]);
}

export async function startMarking() {
  const config = await loadOriginalConfig();
  const profile = storage.getProfile();
  const order = testOrder(config, profile.testOrder || 0);
  profile.testOrder = ((profile.testOrder || 0) + 1) % order.length;
  profile.marking = {id: `t_${Date.now().toString(36)}`, startedAt: Date.now(), order, index: 0, items: [], restarts: 0};
  storage.save();
  return profile.marking;
}
export function currentTestItem(profile = storage.getProfile()) {
  const s = profile.marking;
  if (!s || s.index >= s.order.length) return null;
  return {...miniGameRoute(s.order[s.index]), mgId: s.order[s.index], index: s.index, total: s.order.length};
}
// The current item was started again (resume after leaving or reloading).
export function noteTestRestart() {
  storage.updateProfile(p => { if (p.marking) { p.marking.restarts = (p.marking.restarts || 0) + 1; p.marking.itemRestarts = {...p.marking.itemRestarts, [p.marking.index]: ((p.marking.itemRestarts || {})[p.marking.index] || 0) + 1}; } });
}
export function abandonMarking() { storage.updateProfile(p => { p.marking = null; }); }

// How a game went (mistakes, seconds, time per item…): only the numbers are kept, rounded to 0.01. They go into the
// test items and into the log of games for checking the balance on real players; nothing reads them in the app.
export const playFacts = play => Object.fromEntries(Object.entries(play || {})
  .filter(([, v]) => typeof v === 'number' && Number.isFinite(v)).map(([k, v]) => [k, Math.round(v * 100) / 100]));

// Records one test game. Rejects a game or difficulty other than the expected item.
// `play` — how the game went, see playFacts() (docs/analytics/test-index.md § 7).
export async function recordMarking(gameId, difficulty, raw, play = null) {
  const profile = storage.getProfile(), s = profile.marking;
  const expected = currentTestItem(profile);
  if (!s || !expected || expected.gameId !== gameId || expected.difficulty !== difficulty || !Number.isFinite(raw)) return {rejected: true};
  const config = await loadOriginalConfig();
  const mark = interpolateMark(raw, config.shell.b_mark_pnt_tables[Math.floor(expected.mgId / 10)]);
  const facts = playFacts(play);
  s.items.push({game: gameId, mgId: expected.mgId, diff: difficulty, raw: Math.round(raw), mark, restarts: (s.itemRestarts || {})[s.index] || 0,
    ...(Object.keys(facts).length ? {play: facts} : {})});
  s.index++;
  if (s.index < s.order.length) { storage.save(); return {next: currentTestItem(profile)}; }
  const bm = Math.round(s.items.reduce((sum, item) => sum + item.mark, 0) / s.items.length) / 100;
  const test = {id: s.id, at: Date.now(), date: localDate(), version: 2, v: APP_VERSION, items: s.items, bm, restarts: s.restarts || 0};
  profile.tests.push(test);
  profile.marking = null;
  if (testIndex(profile, config).rank === 7 && !profile.awards.includes('nobel')) profile.awards.push('nobel');
  storage.save();
  return {done: true, test};
}

// Brain Mark of the profile (3.5): one number and one rank made from all the tests (docs/analytics/test-index.md).
//   The number — the mean of the first N tests (rules.test.index_tests, 3); after that every new test moves it 1/N
//     of the way to its result. So a test above the number always raises it and a test below lowers it. The mean of
//     the last three tests (3.2–3.4) compared the new test with the test that left the window, not with the number:
//     after 16 % of the tests the number went the other way, and «+1 to the next rank» could stay after a good test.
//   ± — the 90 % band: 1.645 · spread · √Σw², w — the weights of the tests in the number. The spread of one test
//     comes from the differences between consecutive tests (the last 10), so steady growth is not counted as noise;
//     it is pooled with the default spread (default_sd at the weight prior_weight).
//   The rank — from the whole number the player sees. It goes up at the threshold and goes down only when the number
//     is more than rules.test.rank_shield points under it: an unlucky test near a threshold does not take the rank.
// indexHistory(): the state after every test (the chart, the best rank); testIndex(): the state now, with
//   nextTest   — the result the next test needs for the next rank; null when one test cannot do it: the result
//                would have to be more than two default spreads above the number (about 2 % of the tests);
//   change     — the last test against the number before it (a single unusual test);
//   trend      — the number against the number N tests ago (needs 2N tests);
//   sinceStart — the number against the number after the first N tests (needs 2N tests): steady growth.
// A change is real beyond its margin (two-sided 90 %); the margins are exact for the weights of the tests.
const exact = v => Math.round(v * 1e4) / 1e4;
export function indexWeights(count, n) {
  let w = [];
  for (let k = 1; k <= count; k++) { const a = Math.max(1 / k, 1 / n); w = w.map(v => v * (1 - a)); w.push(a); }
  return w;
}
export function indexHistory(tests, config) {
  const rules = config.rules?.test || {}, n = rules.index_tests || 3, shield = rules.rank_shield ?? 0;
  const section = config.shell.b_mark_wnd, s0 = rules.default_sd || 7, k0 = rules.prior_weight ?? 2;
  let value = 0, sumSq = 0, rank = 0;
  return (tests || []).map((test, i) => {
    const a = Math.max(1 / (i + 1), 1 / n);
    value = exact(value + (test.bm - value) * a);
    sumSq = sumSq * (1 - a) ** 2 + a * a;
    let ss = 0, df = 0;
    for (let j = Math.max(1, i - 8); j <= i; j++) { ss += (tests[j].bm - tests[j - 1].bm) ** 2 / 2; df++; }
    const sd = Math.max(2, Math.sqrt((k0 * s0 * s0 + ss) / (k0 + df)));
    const shown = Math.round(value), plusMinus = 1.645 * sd * Math.sqrt(sumSq);
    rank = Math.max(markRank(shown, section), Math.min(rank, markRank(shown + shield, section)));
    return {value, shown, sumSq, sd, plusMinus, low: Math.max(0, value - plusMinus), high: Math.min(100, value + plusMinus), rank};
  });
}
export function testIndex(profile, config) {
  const rules = config.rules?.test || {}, n = rules.index_tests || 3, shield = rules.rank_shield ?? 0;
  const tests = profile.tests || [], count = tests.length;
  if (!count) return {value: null, shown: null, plusMinus: null, count: 0, needed: n, tests: 0, rank: 1};
  const history = indexHistory(tests, config), now = history.at(-1), prev = history.at(-2) || null;
  const round1 = v => Math.round(v * 10) / 10;
  const th = rankThresholds(config.shell.b_mark_wnd);
  const rankLow = th[now.rank - 1], rankHigh = now.rank < 7 ? th[now.rank] : 100;
  // The number is shown rounded, so the next rank needs rankHigh − 0.5; the next test moves the number by `a`.
  const a = Math.max(1 / (count + 1), 1 / n);
  const need = now.rank < 7 ? Math.ceil(exact(now.value + (rankHigh - 0.5 - now.value) / a)) : null;
  const reach = Math.min(100, now.value + 2 * (rules.default_sd || 7));
  // The number after k tests against the number after j tests: the spread of the difference of two weighted means.
  const compare = (k, j) => {
    const wk = indexWeights(k, n), wj = indexWeights(j, n);
    const spread = Math.sqrt(wk.reduce((s, w, i) => s + (w - (wj[i] || 0)) ** 2, 0));
    return {delta: round1(history[k - 1].value - history[j - 1].value), margin: round1(1.645 * now.sd * spread)};
  };
  return {value: Math.round(now.value * 100) / 100, shown: now.shown, plusMinus: round1(now.plusMinus), low: now.low, high: now.high, sd: round1(now.sd),
    count: Math.min(count, n), needed: n, tests: count,
    rank: now.rank, rankLow, rankHigh, share: Math.max(0, Math.min(1, (now.shown - rankLow) / Math.max(1, rankHigh - rankLow))),
    toNext: now.rank < 7 ? rankHigh - now.shown : 0, nextTest: need !== null && need <= reach ? need : null,
    // The shield is at work: the number is under the threshold of the rank; the rank stays while it is not below `keepFrom`.
    shielded: now.shown < rankLow, keepFrom: rankLow - shield,
    moved: prev ? {from: prev.shown, to: now.shown, rankFrom: prev.rank} : null,
    change: prev ? {delta: round1(tests.at(-1).bm - prev.value), margin: round1(1.645 * now.sd * Math.sqrt(1 + prev.sumSq))} : null,
    trend: count >= 2 * n ? compare(count, count - n) : null,
    sinceStart: count >= 2 * n ? compare(count, n) : null};
}

// ---------------------------------------------------------------- Brain Training
export function gameSection(config, gameId, diff) {
  const id = NATIVE_IDS[gameId];
  return Object.values(config.games).find(v => v && Number(v.ID) === id && Number(v.diff) === diff && v.mg_id) || null;
}
// "down up required unlock"; in_app_ver_level_up_param wins (FUN_4a0214d4). v2: down = share of up.
export function levelParams(section, config = null) {
  const [down0 = -1, up = -1, required = 0, unlock = -1] = numbers(section?.in_app_ver_level_up_param ?? section?.level_up_param ?? '');
  const share = config?.rules?.level_down?.share_of_up;
  const down = Number(section?.diff) > 0 && share && up > 1 ? Math.round(up * share) : down0;
  return {down, up, required, unlock};
}
export function defaultOpenGames(config) {
  return numbers(config.games.mini_games?.def_in_app_opened_gmid_arr).slice(1).map(mg => GAME_IDS[Math.floor(mg / 10)]).filter(Boolean);
}
export const trainItemsCount = open => Math.min(5, Math.max(2, Math.ceil(open / 2)));
export const maxDifficulty = (config, gameId) => { let d = 0; while (gameSection(config, gameId, d + 1)) d++; return d; };

function gameState(profile, gameId) {
  const state = profile.progress[gameId] ||= {difficulty: 0};
  state.stats ||= {};
  state.difficulty = Number(state.difficulty) || 0;
  state.maxDifficulty = Math.max(Number(state.maxDifficulty) || 0, state.difficulty);
  return state;
}
export function trainingInfo(profile, config, gameId) {
  const state = profile.progress[gameId] || {difficulty: 0}, diff = Number(state.difficulty) || 0;
  const params = levelParams(gameSection(config, gameId, diff), config);
  const progress = Math.max(0, state.stats?.[diff]?.progress || 0);
  return {diff, difficulty: DIFFICULTIES[diff], params, progress, open: profile.unlockedGames.includes(gameId),
    champion: profile.awards.includes(`best_${gameId}`), maxDiff: maxDifficulty(config, gameId),
    unlock: levelParams(gameSection(config, gameId, 0), config).unlock};
}

// What Brain Power is made of. Every open game gives points for its level (perDiff for each level), for the steps
// of its bar (up to perProgress) and, when it was played in this training, for the result against the threshold
// (played_factor at the threshold, at most played_factor × played_cap). brainPower() is the sum.
export function brainPowerParts(profile, session, config) {
  const [perDiff, perProgress] = numbers(config.shell.b_train2_wnd?.brain_power_param ?? '20 20 15 -5');
  const bp = config.rules?.brain_power || {played_factor: 15, played_cap: 2};
  const games = profile.unlockedGames.map(gameId => {
    const {diff, params, progress} = trainingInfo(profile, config, gameId);
    const share = params.required > 0 ? Math.min(100, Math.trunc(progress * 100 / params.required)) : 0;
    const score = session?.results?.[gameId];
    return {gameId, diff, level: diff * perDiff + perDiff, bar: Math.trunc(perProgress * share / 100),
      played: score > 0 ? Math.round(bp.played_factor * Math.min(score / (params.up >= 2 ? params.up : 7000), bp.played_cap)) : 0,
      inTraining: session?.results ? Object.hasOwn(session.results, gameId) : false};
  });
  return {games, total: games.reduce((sum, g) => sum + g.level + g.bar + g.played, 0),
    rules: {level: perDiff, bar: perProgress, played: bp.played_factor * bp.played_cap, atUp: bp.played_factor}};
}
export const brainPower = (profile, session, config) => brainPowerParts(profile, session, config).total;

// Free play (owner): only open games, up to the highest difficulty reached in training.
export function openGames(profile, config) {
  return profile.unlockedGames.length ? profile.unlockedGames : defaultOpenGames(config);
}
export function freePlayAccess(profile, config, gameId) {
  const open = openGames(profile, config).includes(gameId);
  const state = profile.progress[gameId] || {};
  const reached = Math.max(Number(state.maxDifficulty) || 0, Number(state.difficulty) || 0);
  const unlock = levelParams(gameSection(config, gameId, 0)).unlock;
  return {open, maxDiff: open ? Math.min(reached, maxDifficulty(config, gameId)) : -1, unlock,
    left: Math.max(1, unlock - (profile.promotions || 0))};
}

export async function ensureOpenGames(profile) {
  if (profile.unlockedGames.length) return;
  profile.unlockedGames = defaultOpenGames(await loadOriginalConfig());
}

// The game to suggest: the open game with the least progress (hints_for_games texts).
export function trainingHint(profile, config) {
  const session = profile.training;
  const candidates = profile.unlockedGames.filter(id => !session?.results || !Object.hasOwn(session.results, id));
  if (!candidates.length) return null;
  const score = id => { const i = trainingInfo(profile, config, id); return i.diff * 100 + (i.params.required ? i.progress / i.params.required * 100 : 0); };
  const gameId = candidates.sort((a, b) => score(a) - score(b))[0];
  const hints = config.games.hints_for_games || {};
  const row = (hints.id || []).map(numbers).find(([native]) => GAME_IDS[native] === gameId);
  const info = trainingInfo(profile, config, gameId);
  return {gameId, text: row ? hints[`${row[1]}_text`] : null, progress: info.progress, required: info.params.required};
}

export async function startTraining(force = false) {
  const config = await loadOriginalConfig(), profile = storage.getProfile();
  await ensureOpenGames(profile);
  if (!force && profile.training?.date === localDate() && profile.training.required) { storage.save(); return profile.training; }
  profile.training = {date: localDate(), required: trainItemsCount(profile.unlockedGames.length), results: {}, complete: false};
  storage.save();
  return profile.training;
}

const leadingBelow = (list, limit) => { let k = 0; while (k < list.length && list[k] < limit) k++; return k; };

// The facts a profile has opened: indices 0…k−1 of data/facts.json (the list may get shorter between versions).
export const openedFacts = (profile, total = Infinity) => [...new Set(profile.unlockedFacts || [])].filter(i => Number.isInteger(i) && i >= 0 && i < total).sort((a, b) => a - b);
// Jokes (data/jokes.json) open together with the facts, one for one (3.9, owner): a profile has as many jokes as
// facts, up to the end of the jokes list. Nothing more is stored: the opened jokes are the first k of the list.
export const openedJokes = (profile, factsTotal = Infinity, jokesTotal = Infinity) =>
  Array.from({length: Math.min(openedFacts(profile, factsTotal).length, jokesTotal)}, (_, i) => i);
// How many more facts today's trainings can open (for the texts of the screens).
export function factsLeftToday(profile, config, date = localDate()) {
  const perDay = config.rules?.facts?.per_day ?? 1;
  return Math.max(0, perDay - (profile.history || []).filter(item => item.date === date).length);
}
// A change of a game's training level, kept for the balance (how long a level takes): storage.js header.
function logLevel(profile, game, to, kind) {
  (profile.levelLog ||= []).push({at: Date.now(), game, to: DIFFICULTIES[to], kind, v: APP_VERSION});
}

// One training result. Counts once per session, only at the game's current difficulty.
export async function recordTraining(gameId, difficulty, score) {
  const profile = storage.getProfile(), session = profile.training;
  const config = await loadOriginalConfig();
  const events = {levelUp: [], levelDown: [], regained: [], opened: [], champion: [], fact: null, joke: null};
  const reason = !session ? 'none' : session.complete ? 'complete' : Object.hasOwn(session.results, gameId) ? 'played' : !profile.unlockedGames.includes(gameId) ? 'locked' : null;
  if (reason) return {noEffect: true, reason, ...events};
  const state = gameState(profile, gameId), diff = state.difficulty;
  if (DIFFICULTIES[diff] !== difficulty || !Number.isFinite(score)) return {noEffect: true, reason: 'difficulty', current: DIFFICULTIES[diff], ...events};
  session.results[gameId] = score;
  const params = levelParams(gameSection(config, gameId, diff), config);
  // v3.2.1 (owner): a weak game no longer takes a step back unless rules.step_loss; the level drops only when the
  // player fails systematically — `streak` weak games (under `down`) in a row with no step on this level yet.
  const rules = config.rules?.level_down || {streak: 5, return_gap: 2};
  const stat = state.stats[diff] ||= {lres: [], progress: 0};
  stat.lres = [score, ...(stat.lres || [])].slice(0, Math.max(3, rules.streak || 3));
  const bad = params.down >= 0 && score < params.down;
  const before = stat.progress || 0;
  if (params.up >= 0 && score >= params.up) stat.progress = Math.min((stat.progress || 0) + 1, params.required);
  else if (bad && rules.step_loss && stat.progress > 0) stat.progress--;
  else if (bad && diff > 0 && !(stat.progress > 0) && stat.lres.length >= rules.streak && stat.lres.slice(0, rules.streak).every(v => v < params.down)) {
    state.difficulty = diff - 1;
    logLevel(profile, gameId, diff - 1, 'down');
    const lower = state.stats[diff - 1] ||= {lres: [], progress: 0};
    const lowerParams = levelParams(gameSection(config, gameId, diff - 1), config);
    lower.progress = Math.max(0, lowerParams.required - (rules.return_gap ?? 2));
    lower.lres = [];
    stat.lres = []; stat.progress = 0;
    events.levelDown.push(gameId);
  }
  // What this game did to the bar, for the results sheet.
  events.step = {kind: params.up >= 0 && score >= params.up ? 'up' : bad ? 'down' : 'none', before, after: stat.progress || 0,
    required: params.required, up: params.up, down: params.down, difficulty: DIFFICULTIES[diff], next: gameSection(config, gameId, diff + 1) ? DIFFICULTIES[diff + 1] : null,
    weakStreak: bad ? leadingBelow(stat.lres, params.down) : 0, streak: rules.streak, canDrop: diff > 0 && !(stat.progress > 0),
    // the top level with a full bar and the Champion award: closed, nothing more can change on it (3.10)
    closed: profile.awards.includes(`best_${gameId}`)};
  if (state.difficulty === diff && params.required > 0 && stat.progress >= params.required) {
    if (gameSection(config, gameId, diff + 1)) {
      state.difficulty = diff + 1;
      state.stats[diff + 1] = {lres: [], progress: 0};
      stat.progress = 0; stat.lres = [];
      if (state.difficulty > state.maxDifficulty) {
        state.maxDifficulty = state.difficulty;
        profile.promotions = (profile.promotions || 0) + 1;
        events.levelUp.push(gameId);
        logLevel(profile, gameId, diff + 1, 'up');
        for (const id of Object.values(GAME_IDS)) {
          const unlock = levelParams(gameSection(config, id, 0)).unlock;
          if (unlock > 0 && unlock <= profile.promotions && !profile.unlockedGames.includes(id)) { profile.unlockedGames.push(id); events.opened.push(id); }
        }
      } else { events.regained.push(gameId); logLevel(profile, gameId, diff + 1, 'back'); }
    } else if (!profile.awards.includes(`best_${gameId}`)) {
      profile.awards.push(`best_${gameId}`);
      events.champion.push(gameId);
      logLevel(profile, gameId, diff, 'champion');
      if (Object.values(GAME_IDS).every(id => profile.awards.includes(`best_${id}`)) && !profile.awards.includes('training_complete')) profile.awards.push('training_complete');
    }
  }
  if (Object.keys(session.results).length >= session.required) {
    session.complete = true;
    // parts: what the number was made of, per game [level, bar, game] (3.8, for the Brain Power sheet).
    const made = brainPowerParts(profile, session, config);
    const power = session.brainPower = made.total;
    profile.history.push({date: session.date, score: power, results: {...session.results}, at: Date.now(), v: APP_VERSION,
      parts: Object.fromEntries(made.games.map(g => [g.gameId, [g.level, g.bar, g.played]]))});
    profile.brainScore = power;
    profile.trainingDays = new Set(profile.history.map(item => item.date)).size;
    // A finished training opens the next fact, up to rules.facts.per_day a day: two since 3.10, when the lists grew
    // to 180 (3.8-3.9 opened one a day out of 110, 3.7 three). No training in a day - nothing opens.
    const perDay = config.rules?.facts?.per_day ?? 1, total = config.factsTotal ?? Infinity;
    const today = profile.history.filter(item => item.date === session.date).length;
    const next = openedFacts(profile, total).length;
    if (today <= perDay && next < total) {
      profile.unlockedFacts = [...openedFacts(profile, total), next];
      events.fact = next;
      if (next < (config.jokesTotal ?? 0)) events.joke = next;   // the joke with the same number opens with the fact
    }
    events.complete = power;
  }
  storage.save();
  return events;
}
