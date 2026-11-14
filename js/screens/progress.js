import { h, fmt } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { gameIcon, lineChart, sparkline } from '../ui/components.js';
import { sheet } from '../ui/overlay.js';
import { storage } from '../storage.js';
import { TRAINING_ORDER, localDate, openedFacts, openedJokes, factsLeftToday, brainPowerParts } from '../progression.js';
import { DIFFICULTIES } from '../original.js';
import { i18n } from '../i18n.js';
import { renderAchievements } from '../ui/achievements-ui.js';
import { recordBook, recordSheet, recordTitle, recordValue } from '../ui/records-ui.js';
import { headline } from '../records.js';
import { indexCard, brainMarkChart, skillName } from './test.js';
import { testGames, miniGameRoute } from '../progression.js';

const TABS = [['trends', 'Trends', 'Динамика'], ['records', 'Records', 'Рекорды'], ['awards', 'Achievements', 'Достижения'], ['facts', 'Facts', 'Факты'], ['humor', 'Humor', 'Юмор'], ['calendar', 'Calendar', 'Календарь']];
let recordsWindow = 'all';
let calendarMonth = null;

// What Brain Power is made of (3.8, owner: «при нажатии на Brain Power — из чего он сформирован»): the games with the
// points for the level, for the bar and for the game of the training. `item` — a finished training of the calendar;
// without it — the last finished training. A training of 3.8 and later keeps its own parts; for an older one the
// parts are counted again from the levels of today and may not add up to the number shown then.
export function brainPowerSheet(app, item = null) {
  const t = app.t, profile = storage.getProfile();
  const last = item || profile.history.at(-1) || null;
  const live = brainPowerParts(profile, last ? {results: last.results || {}} : null, app.config), rules = live.rules;
  const games = (last?.parts
    ? Object.entries(last.parts).map(([gameId, [level, bar, played]]) => ({gameId, level, bar, played, diff: Math.round(level / rules.level) - 1, inTraining: Object.hasOwn(last.results || {}, gameId)}))
    : live.games).sort((a, b) => TRAINING_ORDER.indexOf(a.gameId) - TRAINING_ORDER.indexOf(b.gameId));
  const sum = key => games.reduce((n, g) => n + g[key], 0), total = sum('level') + sum('bar') + sum('played');
  const shown = item ? item.score : profile.brainScore;
  const num = (v, cls = 'bp-num') => h('span', {class: cls}, v === null ? '—' : fmt(v));
  const table = h('div', {class: 'bp-table'},
    h('span', {class: 'bp-head bp-left'}, t('Games', 'Игры')), h('span', {class: 'bp-head'}, t('Level', 'Уровень')), h('span', {class: 'bp-head'}, t('Bar', 'Шкала')),
    h('span', {class: 'bp-head'}, t('Game', 'Партия')), h('span', {class: 'bp-head'}, 'Σ'),
    games.flatMap(g => [
      h('span', {class: 'bp-game'}, h('b', null, app.gameTitle(g.gameId)), h('span', {class: 'tiny muted'}, app.diffLabel(DIFFICULTIES[g.diff] || 'easy'))),
      num(g.level), num(g.bar), num(g.inTraining ? g.played : null), num(g.level + g.bar + g.played, 'bp-num bp-sum')]),
    h('span', {class: 'bp-total bp-left'}, t('Total', 'Итого')), num(sum('level'), 'bp-num bp-total'), num(sum('bar'), 'bp-num bp-total'),
    num(sum('played'), 'bp-num bp-total'), num(total, 'bp-num bp-sum bp-total'));
  const fill = (text, values) => Object.entries(values).reduce((out, [k, v]) => out.replaceAll(`@${k}`, v), text);
  sheet({title: t('What Brain Power is made of', 'Из чего складывается Brain Power'), body: [
    h('div', {class: 'result-hero'}, h('div', {class: 'card-kicker'}, last ? dayLabel(last.date) : 'Brain Power'), h('div', {class: 'big-number num'}, fmt(shown))),
    h('p', {class: 'small muted'}, t('Brain Power is counted when a training is finished: the sum over the open games.', 'Brain Power считается, когда тренировка завершена: это сумма по открытым играм.')),
    h('ul', {class: 'small bp-rules'},
      h('li', null, fill(t('Level: @N points for every level of a game.', 'Уровень: @N очков за каждый уровень игры.'), {N: rules.level})),
      h('li', null, fill(t('Bar: up to @N points for the filled steps of the level.', 'Шкала: до @N очков за заполненные деления уровня.'), {N: rules.bar})),
      h('li', null, fill(t('Game: up to @N points for a game of this training; a result at the threshold gives @M.', 'Партия: до @N очков за партию этой тренировки; результат на пороге даёт @M.'), {N: rules.played, M: rules.atUp}))),
    games.length ? table : null,
    total !== shown && games.length ? h('p', {class: 'small muted'}, t('Levels and bars have changed since the last finished training. Brain Power is counted again when the next training is finished.',
      'После последней завершённой тренировки уровни и шкалы изменились. Brain Power пересчитается, когда будет завершена следующая тренировка.')) : null]});
}

// Brain Power by day (3.11.3): the last training of each of the last `days` days with a training. A point for every
// training gave a player who trains ten times a day a chart of his last three days. The scale follows the values
// in steps of 50, so a change stays visible when the number is in the high hundreds; from zero it keeps the fill.
export function powerChart(profile, days, height) {
  const byDay = {};
  for (const item of profile.history) if (item.date && Number.isFinite(item.score)) byDay[item.date] = item.score;   // the later training of a day wins
  const points = Object.keys(byDay).sort().slice(-days).map(date => ({label: date.slice(5).split('-').reverse().join('.'), value: byDay[date]}));
  if (!points.length) return '';
  const values = points.map(p => p.value), low = Math.min(...values), high = Math.max(...values), pad = Math.max(25, (high - low) * 0.2);
  const min = Math.max(0, Math.floor((low - pad) / 50) * 50), max = Math.ceil((high + pad) / 50) * 50;
  return lineChart(points, {min, max, ticks: [min, (min + max) / 2, max], height, area: min === 0});
}

export function renderProgress(app, main, [tab = 'trends']) {
  const t = app.t;
  app.setTop({title: t('Progress', 'Прогресс')});
  const seg = h('div', {class: 'segmented scroll', role: 'tablist'}, TABS.map(([key, en, ru]) =>
    h('button', {role: 'tab', 'aria-pressed': key === tab, 'aria-selected': key === tab, onclick: () => app.go(`progress/${key}`)}, t(en, ru))));
  const edges = () => { seg.classList.toggle('more-left', seg.scrollLeft > 4); seg.classList.toggle('more-right', seg.scrollLeft + seg.clientWidth < seg.scrollWidth - 4); };
  seg.addEventListener('scroll', edges, {passive: true});
  requestAnimationFrame(() => { seg.querySelector('[aria-pressed="true"]')?.scrollIntoView({inline: 'center', block: 'nearest'}); edges(); });
  const panel = h('div', {class: 'stack'});
  ({trends, records, awards, facts, humor, calendar}[tab] || trends)(app, panel);
  main.replaceChildren(seg, panel);
}

// Trends: Brain Mark over the tests, every test skill, Brain Power over the trainings, trainings per week.
function trends(app, panel) {
  const t = app.t, profile = storage.getProfile();
  const tests = profile.tests;
  panel.append(indexCard(app, profile));
  if (tests.length) panel.append(h('section', {class: 'card'}, h('div', {class: 'card-head'}, h('h3', null, 'Brain Mark'),
    h('button', {class: 'btn btn-ghost btn-sm', onclick: () => app.go('test')}, icon('target'), t('Take the test', 'Пройти тест'))), brainMarkChart(app, profile)));
  else panel.append(h('button', {class: 'btn btn-primary btn-block', onclick: () => app.go('test')}, icon('target'), t('Take the test', 'Пройти тест')));
  // Skills: the mark of every test game across the tests with per-game marks.
  const detailed = tests.filter(test => test.version >= 2 && test.items?.length);
  if (detailed.length) {
    const rows = testGames(app.config).map(miniGameRoute).map(({gameId}) => {
      // the last 12 tests, as the chart above: a hundred tests in 64 px are a scribble, not a trend
      const marks = detailed.slice(-12).map(test => test.items.find(item => item.game === gameId)?.mark).filter(v => Number.isFinite(v)).map(v => v / 100);
      if (!marks.length) return null;
      const last = marks.at(-1), delta = marks.length > 1 ? Math.round(last - marks.at(-2)) : null;
      return h('div', {class: 'trend-row'}, gameIcon(gameId, 'sm'),
        h('span', {class: 'lr-main'}, h('b', {class: 'small'}, skillName(app, gameId)), h('span', {class: 'tiny muted'}, app.gameTitle(gameId))),
        sparkline(marks, {width: 64}),
        h('span', {class: 'tr-val'}, h('b', null, fmt(Math.round(last))),
          delta !== null ? h('span', {class: `tiny bm-change ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`}, `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${Math.abs(delta)}`) : h('span', {class: 'tiny muted'}, '—')));
    }).filter(Boolean);
    panel.append(h('section', {class: 'card'}, h('h3', null, t('Skills', 'Навыки')),
      h('p', {class: 'tiny muted'}, t('The mark of each test game, test by test; the change is to the previous test.', 'Оценка каждой игры теста от теста к тесту; изменение — к прошлому тесту.')), h('div', null, rows)));
  }
  // Brain Power by day, the last 30 days with a training.
  if (profile.history.length) panel.append(h('section', {class: 'card'},
    h('button', {class: 'card-head bp-open', onclick: () => brainPowerSheet(app)}, h('h3', null, 'Brain Power', icon('info', 16)), h('b', {class: 'num'}, fmt(profile.brainScore))),
    h('p', {class: 'tiny muted'}, t('Grows with the difficulty and the progress of the open games.', 'Растёт вместе со сложностью и прогрессом открытых игр.')),
    powerChart(profile, 30, 130)));
  // Trainings per week, the last 8 weeks.
  const monday = date => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return localDate(d); };
  const weeks = [];
  for (let i = 7; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i * 7); weeks.push(monday(localDate(d))); }
  const perWeek = Object.fromEntries(weeks.map(w => [w, 0]));
  for (const item of profile.history) { const w = monday(item.date); if (w in perWeek) perWeek[w]++; }
  // The bar takes a share of the room between the number above it and the date under it, so any count fits.
  const top = Math.max(1, ...Object.values(perWeek));
  panel.append(h('section', {class: 'card'}, h('div', {class: 'card-head'}, h('h3', null, t('Trainings per week', 'Тренировок в неделю')),
    h('span', {class: 'pill'}, `${t('In total', 'Всего')}: ${profile.history.length}`)),
  h('div', {class: 'week-bars'}, weeks.map(w => h('span', {class: perWeek[w] ? '' : 'wb-none', title: w},
    h('b', {class: 'tiny'}, perWeek[w] ? String(perWeek[w]) : ''), h('span', {class: 'wb-track'}, h('i', {style: {height: `${Math.round(perWeek[w] / top * 100)}%`}})),
    h('span', {class: 'wb-date'}, w.slice(8, 10) + '.' + w.slice(5, 7)))))));
}

function records(app, panel) {
  const t = app.t, profile = storage.getProfile();
  const days = recordsWindow === '7' ? 7 : null;
  const cutoff = Date.now() - 7 * 86400000;
  const inWindow = date => !days || Date.parse(`${date}T23:59:59`) >= cutoff;
  const bp = Math.max(0, ...profile.history.filter(item => inWindow(item.date)).map(item => item.score));
  const bm = Math.max(0, ...profile.tests.filter(test => inWindow(test.date)).map(test => test.bm));
  const seg = h('div', {class: 'segmented'}, [['all', 'All time', 'За всё время'], ['7', 'Last 7 days', 'За 7 дней']].map(([key, en, ru]) =>
    h('button', {'aria-pressed': recordsWindow === key, onclick: () => { recordsWindow = key; panel.replaceChildren(); records(app, panel); }}, t(en, ru))));
  const head = h('section', {class: 'grid-2'},
    h('div', {class: 'card'}, h('span', {class: 'stat-label'}, 'Brain Power'), h('span', {class: 'stat-value num'}, fmt(bp))),
    h('div', {class: 'card'}, h('span', {class: 'stat-label'}, t('Best test', 'Лучший тест')), h('span', {class: 'stat-value num'}, bm ? fmt(Math.round(bm)) : '—')));
  const rows = TRAINING_ORDER.map(id => {
    const by = profile.bestByDiff[id] || {};
    const best = storage.getHighScore(id, days);
    // The main record of the game when it is not its points (a time, a run): the record book (js/records.js).
    const top = headline(profile, id), other = top && !top.def.score ? `${recordTitle(top.def)}: ${recordValue(top.def, top.entry.v)}${top.level ? ` · ${app.diffLabel(top.level)}` : ''}` : '';
    return h('button', {class: 'list-row', onclick: () => recordSheet(app, id, profile)}, gameIcon(id, 'sm'),
      h('span', {class: 'lr-main'}, h('span', {class: 'lr-title'}, app.gameTitle(id)),
        h('span', {class: 'lr-sub num'}, ['easy', 'medium', 'hard', 'ultra'].filter(d => by[d] > 0).map(d => `${app.diffLabel(d)} ${fmt(by[d])}`).join(' · ') || (best || other ? '' : t('Not played yet', 'Ещё не сыграно'))),
        other ? h('span', {class: 'lr-sub num'}, other) : null),
      h('b', {class: 'num'}, best ? fmt(best) : '—'), icon('chevron'));
  });
  panel.append(seg, head, h('div', {class: 'list'}, rows));
}

// data/facts.json: {en, ru, key}. A fact of the original keeps `key` — its English text as the locale tables of
// the original have it (with the line breaks of the config written as \n); a fact reworded in 3.7 is its own key.
// data/jokes.json: {en, ru}, the English text is the key of the other languages; the same function gives its text.
// A slot of the jokes may hold different jokes in different languages (3.10), and a verse has real line breaks,
// which stay (the texts are shown with white-space: pre-line).
export function factText(f) {
  const lang = i18n.getLang();
  if (lang === 'ru') return f.ru;
  if (lang === 'en') return f.en;
  return String(i18n.t(f.key || f.en)).replace(/\\n/g, ' ').replace(/[^\S\n]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
}

function facts(app, panel) {
  const t = app.t, profile = storage.getProfile(), total = app.facts.length;
  const opened = openedFacts(profile, total), perDay = app.config.rules?.facts?.per_day ?? 1, left = factsLeftToday(profile, app.config);
  panel.append(h('section', {class: 'card'}, h('div', {class: 'row'},
    h('div', {class: 'stack', style: {gap: '2px', flex: 1}}, h('b', null, `${t('Opened', 'Открыто')} ${opened.length} ${t('of', 'из')} ${total}`),
      h('span', {class: 'small muted'}, perDay === 1
        ? t('Each new day with a finished training opens one more fact.', 'Каждый новый день с завершённой тренировкой открывает ещё один факт.')
        : t('Every finished training opens one more fact, up to @N a day.', 'Каждая завершённая тренировка открывает ещё один факт, до @N в день.').replace('@N', perDay))),
    h('span', {class: 'rank-badge'}, icon('bulb')))));
  if (!opened.length) { panel.append(h('p', {class: 'empty'}, t('Finish your first training to open the first fact.', 'Завершите первую тренировку, чтобы открыть первый факт.'))); return; }
  panel.append(h('div', {class: 'stack'}, [...opened].reverse().map(i => h('article', {class: 'card fact'}, h('span', {class: 'fact-n'}, String(i + 1)), h('p', null, factText(app.facts[i])))),
    opened.length < total ? h('div', {class: 'card flat fact-locked'}, icon('lock'), h('span', {class: 'small'}, perDay === 1
      ? t('The next fact opens after the next training day.', 'Следующий факт откроется после следующего дня тренировки.')
      : left ? t('The next fact opens after the next training.', 'Следующий факт откроется после следующей тренировки.')
      : t('All the facts of today are open. The next one opens tomorrow.', 'Сегодняшние факты открыты. Следующий откроется завтра.'))) : null));
}

// Jokes open together with the facts, one for one (progression.js openedJokes).
function humor(app, panel) {
  const t = app.t, profile = storage.getProfile(), total = app.jokes.length;
  const opened = openedJokes(profile, app.facts.length, total);
  panel.append(h('section', {class: 'card'}, h('div', {class: 'row'},
    h('div', {class: 'stack', style: {gap: '2px', flex: 1}}, h('b', null, `${t('Opened', 'Открыто')} ${opened.length} ${t('of', 'из')} ${total}`),
      h('span', {class: 'small muted'}, t('A joke opens together with every new fact.', 'Шутка открывается вместе с каждым новым фактом.'))),
    h('span', {class: 'rank-badge'}, icon('smile')))));
  if (!opened.length) { panel.append(h('p', {class: 'empty'}, t('Finish your first training to open the first joke.', 'Завершите первую тренировку, чтобы открыть первую шутку.'))); return; }
  panel.append(h('div', {class: 'stack'}, [...opened].reverse().map(i => h('article', {class: 'card fact'}, h('span', {class: 'fact-n'}, String(i + 1)), h('p', null, factText(app.jokes[i])))),
    opened.length < total ? h('div', {class: 'card flat fact-locked'}, icon('lock'), h('span', {class: 'small'},
      t('The next joke opens with the next fact.', 'Следующая шутка откроется вместе со следующим фактом.'))) : null));
}

// Achievements first; then the two diplomas. Game levels live on the training screen, champions in the «Champion» achievement.
function awards(app, panel) {
  const t = app.t, profile = storage.getProfile();
  renderAchievements(app, panel, profile, {bests: p => recordBook(app, p, profile)});
  const diploma = (key, ic, title, condition) => {
    const earned = profile.awards.includes(key);
    return h('div', {class: `diploma ${earned ? '' : 'locked'}`}, icon(ic), h('span', {class: 'card-kicker'}, t('Diploma', 'Диплом')), h('h3', null, title),
      earned ? h('span', {class: 'dp-name'}, profile.name) : null, h('p', {class: 'small muted'}, condition));
  };
  panel.append(
    h('h2', {class: 'section-title'}, t('Diplomas', 'Дипломы')),
    diploma('training_complete', 'certificate', t('Training Program Complete', 'Тренировка пройдена'), t('Become a champion in all 12 games.', 'Станьте чемпионом во всех 12 играх.')),
    diploma('nobel', 'medal', t('Nobel Prize-winner', 'Нобелевский лауреат'), t('Reach a Brain Mark index of 90.', 'Получите индекс Brain Mark 90.')));
}

const dayLabel = date => { const s = new Date(`${date}T12:00:00`).toLocaleDateString(document.documentElement.lang, {day: 'numeric', month: 'long', weekday: 'short'}); return s.charAt(0).toUpperCase() + s.slice(1); };

// Calendar of trainings and tests: a training day is filled, a test day carries a badge, today is outlined.
function calendar(app, panel) {
  const t = app.t, profile = storage.getProfile(), lang = i18n.getLang();
  const now = new Date();
  const view = calendarMonth || {year: now.getFullYear(), month: now.getMonth()};
  const mondayFirst = lang !== 'en';
  const first = new Date(view.year, view.month, 1).getDay();
  const offset = mondayFirst ? (first + 6) % 7 : first;
  const days = new Date(view.year, view.month + 1, 0).getDate();
  const trainings = {}, tests = {};
  for (const item of profile.history) trainings[item.date] = (trainings[item.date] || 0) + 1;
  for (const test of profile.tests) if (test.date) tests[test.date] = (tests[test.date] || 0) + 1;
  const monthName = `${new Date(view.year, view.month, 1).toLocaleDateString(document.documentElement.lang, {month: 'long'})} ${view.year}`;
  const weekdays = Array.from({length: 7}, (_, i) => new Date(2024, 0, (mondayFirst ? 1 : 7) + i).toLocaleDateString(document.documentElement.lang, {weekday: 'short'}));
  const shift = d => { const n = new Date(view.year, view.month + d, 1); calendarMonth = {year: n.getFullYear(), month: n.getMonth()}; panel.replaceChildren(); calendar(app, panel); };
  const today = localDate();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(h('span', {class: 'cal-blank'}));
  for (let d = 1; d <= days; d++) {
    const date = `${view.year}-${String(view.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const n = trainings[date] || 0, k = tests[date] || 0;
    const label = [String(d), n ? `${t('trainings', 'тренировок')}: ${n}` : '', k ? `${t('tests', 'тестов')}: ${k}` : '', date === today ? t('today', 'сегодня') : ''].filter(Boolean).join(' · ');
    cells.push(h('button', {class: `cal-day${n ? ' trained' : ''}${k ? ' tested' : ''}${date === today ? ' today' : ''}`, disabled: !n && !k, 'aria-label': label,
      onclick: () => daySheet(app, date)}, h('span', null, String(d)),
      n ? h('span', {class: 'cal-mark'}, n > 1 ? `×${n}` : icon('check', 12)) : null,
      k ? h('span', {class: 'cal-test', 'aria-hidden': 'true'}, k > 1 ? String(k) : '') : null));
  }
  // The list under the month: one row per day (3.11.3). A row per training gave a player who trains ten times a day
  // a hundred rows a fortnight; now a month is 31 rows at most, and the day opens its sheet with every training.
  const prefix = `${view.year}-${String(view.month + 1).padStart(2, '0')}-`;
  const byDay = {};
  for (const item of profile.history) if (item.date?.startsWith(prefix)) (byDay[item.date] ||= {trainings: [], tests: []}).trainings.push(item);
  for (const test of profile.tests) if (test.date?.startsWith(prefix)) (byDay[test.date] ||= {trainings: [], tests: []}).tests.push(test);
  const dayRows = Object.keys(byDay).sort().reverse().map(date => ({date, ...byDay[date]}));
  const monthTrainings = dayRows.reduce((n, d) => n + d.trainings.length, 0), monthTests = dayRows.reduce((n, d) => n + d.tests.length, 0);
  const testMarks = test => (test.version >= 2 ? test.items.map(item => `${app.gameTitle(item.game)} ${fmt(item.mark / 100, 0)}`).join(' · ') : t('no details', 'без разбивки'));
  const dayRow = ({date, trainings: tr, tests: ts}) => {
    const last = tr.at(-1), test = ts.at(-1), single = tr.length + ts.length === 1;
    const about = single && last ? [t('Training', 'Тренировка'), Object.keys(last.results || {}).map(id => app.gameTitle(id)).join(', ')].filter(Boolean).join(' · ')
      : single ? `${t('Test', 'Тест')} · ${testMarks(test)}`
      : [tr.length > 1 ? `${t('trainings', 'тренировок')}: ${tr.length}` : tr.length ? t('Training', 'Тренировка') : '',
          ts.length > 1 ? `${t('tests', 'тестов')}: ${ts.length}` : ts.length ? `${t('Test', 'Тест')} ${fmt(Math.round(test.bm))}` : ''].filter(Boolean).join(' · ');
    const toTest = single && test && test.version >= 2;
    return h('button', {class: 'list-row', onclick: () => (toTest ? app.go(`test/result/${test.id}`) : daySheet(app, date))},
      h('span', {class: `cal-key ${last ? 'trained' : 'tested'}`, style: {flex: 'none'}}),
      h('span', {class: 'lr-main'}, h('span', {class: 'lr-title'}, dayLabel(date)), h('span', {class: 'lr-sub'}, about.charAt(0).toUpperCase() + about.slice(1))),
      last ? h('span', {class: 'pill accent'}, `Brain Power ${fmt(last.score)}`) : h('span', {class: 'pill reward'}, `${t('Result', 'Результат')} ${fmt(Math.round(test.bm))}`));
  };
  const pendingTraining = profile.training?.date === today && !profile.training.complete && Object.keys(profile.training.results).length;
  const pendingTest = profile.marking && profile.marking.index > 0;
  const hint = (text, route) => h('button', {class: 'hint-card', style: {border: 0, textAlign: 'left', width: '100%'}, onclick: () => app.go(route)}, icon('info'), h('span', null, text));

  panel.append(h('section', {class: 'card'},
    h('div', {class: 'row'}, h('button', {class: 'icon-btn', 'aria-label': t('Previous month', 'Предыдущий месяц'), onclick: () => shift(-1)}, icon('back')),
      h('h3', {style: {flex: 1, textAlign: 'center', textTransform: 'capitalize'}}, monthName),
      h('button', {class: 'icon-btn', 'aria-label': t('Next month', 'Следующий месяц'), onclick: () => shift(1)}, icon('chevron'))),
    h('div', {class: 'cal'}, weekdays.map(w => h('span', {class: 'cal-wd'}, w)), cells),
    h('div', {class: 'cal-legend'},
      h('span', null, h('i', {class: 'cal-key trained'}), t('training', 'тренировка')),
      h('span', null, h('i', {class: 'cal-key tested'}), t('test', 'тест')),
      h('span', null, h('i', {class: 'cal-key today'}), t('today', 'сегодня')))),
  pendingTraining ? hint(`${t('Training in progress today', 'Сегодня идёт тренировка')}: ${Object.keys(profile.training.results).length} ${t('of', 'из')} ${profile.training.required}. ${t('The day is marked when all its games are played.', 'День отметится, когда будут сыграны все её игры.')}`, 'training') : '',
  pendingTest ? hint(`${t('The test is not finished', 'Тест не завершён')}: ${t('task', 'задание')} ${profile.marking.index + 1} ${t('of', 'из')} ${profile.marking.order.length}. ${t('It appears in the calendar when all five tasks are done.', 'Он появится в календаре, когда будут пройдены все пять заданий.')}`, 'test') : '',
  h('section', {class: 'stack'},
    h('h2', {class: 'section-title'}, `${t('This month', 'За месяц')} · ${t('trainings', 'тренировок')} ${monthTrainings} · ${t('tests', 'тестов')} ${monthTests}`),
    dayRows.length
      ? h('div', {class: 'list'}, dayRows.map(dayRow))
      : h('p', {class: 'empty'}, t('No trainings or tests this month yet. A training counts when all its games are played, a test when all five tasks are done.', 'В этом месяце пока нет тренировок и тестов. Тренировка засчитывается, когда сыграны все её игры, тест — когда пройдены все пять заданий.'))));
}

// A day of the calendar. Up to three trainings and tests are shown in full; a busier day (3.11.3: ten trainings were
// six screens of scrolling) shows every training as its number and one line of results.
function daySheet(app, date) {
  const t = app.t, profile = storage.getProfile();
  const list = profile.history.filter(item => item.date === date);
  const tests = profile.tests.filter(test => test.date === date);
  const compact = list.length + tests.length > 3, cls = `card flat${compact ? ' day-compact' : ''}`;
  // a game and its number stay on one line, the dot stays with the number before it
  const line = pairs => h('p', {class: 'small muted day-line'}, pairs.map(([name, value]) => `${name} ${value}`.replace(/ /g, '\u00a0')).join('\u00a0· '));
  let s;
  const body = [
    ...list.map((item, i) => h('div', {class: cls},
      h('div', {class: 'row'}, h('b', {style: {flex: 1}}, `${t('Training', 'Тренировка')}${list.length > 1 ? ` ${i + 1}` : ''}`),
        item.parts ? h('button', {class: 'pill accent bp-open', onclick: () => brainPowerSheet(app, item)}, `Brain Power ${fmt(item.score)}`, icon('info', 12))
          : h('span', {class: 'pill accent'}, `Brain Power ${fmt(item.score)}`)),
      compact ? line(Object.entries(item.results || {}).map(([id, score]) => [app.gameTitle(id), fmt(score)]))
        : h('div', {class: 'results-list'}, Object.entries(item.results || {}).map(([id, score]) => h('div', {class: 'results-item'}, h('span', {class: 'ri-label'}, app.gameTitle(id)), h('span', {class: 'ri-val'}, fmt(score))))))),
    ...tests.map((test, i) => h('div', {class: cls},
      h('div', {class: 'row'}, h('b', {style: {flex: 1}}, `${t('Test', 'Тест')}${tests.length > 1 ? ` ${i + 1}` : ''}`), h('span', {class: 'pill reward'}, `${t('Result', 'Результат')} ${fmt(Math.round(test.bm))}`)),
      test.version < 2 ? null : compact ? line(test.items.map(item => [app.gameTitle(item.game), fmt(item.mark / 100, 1)]))
        : h('div', {class: 'results-list'}, test.items.map(item => h('div', {class: 'results-item'}, h('span', {class: 'ri-label'}, app.gameTitle(item.game)), h('span', {class: 'ri-val'}, fmt(item.mark / 100, 1))))),
      test.version >= 2 ? h('button', {class: `btn btn-outline${compact ? ' btn-sm' : ''}`, onclick: () => { s.close(); app.go(`test/result/${test.id}`); }}, t('Test results', 'Результаты теста')) : null)),
  ];
  s = sheet({title: dayLabel(date), body});
}
