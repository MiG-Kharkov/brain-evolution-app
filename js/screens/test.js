import { h, fmt } from '../core/dom.js';
import { icon, rankIcon } from '../core/icons.js';
import { evoTrack, gameIcon, bar, lineChart, rangeBar } from '../ui/components.js';
import { confirmDialog, sheet } from '../ui/overlay.js';
import { storage } from '../storage.js';
import { testGames, miniGameRoute, rankThresholds, abandonMarking, testIndex, indexHistory, testLevel } from '../progression.js';
import { i18n } from '../i18n.js';
import { noteFlag } from '../achievements.js';

const SKILLS = {guess_who: ['Pattern finding', 'Поиск закономерностей'], memorics: ['Short-term memory', 'Кратковременная память'],
  arithmetics: ['Calculation', 'Счёт'], numbers: ['Attention and speed', 'Внимание и скорость'], quadronica: ['Visual thinking', 'Образное мышление']};
export const skillName = (app, id) => app.t(...(SKILLS[id] || [id, id]));

function rankText(app, rank) {
  const text = app.config.shell.b_mark_wnd?.[`status${rank}_text`];
  return text ? i18n.t(text) : '';
}
function bands(app) {
  const th = rankThresholds(app.config.shell.b_mark_wnd);
  return th.map((from, i) => ({from, to: th[i + 1] ?? 100}));
}

const whole = v => fmt(Math.round(v));

// Brain Mark after each test (for the chart): {value, low, high, rank}.
export const indexSeries = (app, profile) => indexHistory(profile.tests, app.config);

// Is the change real? The strongest comparison that is available: since the first tests (steady growth, needs
// 6 tests), then Brain Mark against Brain Mark three tests ago, then the last test against Brain Mark before it.
export function changeLine(app, index) {
  const t = app.t;
  const kind = index?.sinceStart ? 'sinceStart' : index?.trend ? 'trend' : index?.change ? 'change' : null;
  if (!kind) return null;
  const c = index[kind], d = Math.round(c.delta), real = Math.abs(c.delta) > c.margin;
  const D = `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)}`;
  const TEXT = {
    sinceStart: [t('Since your first tests the index rose by @D: more than the usual spread, a real rise.', 'С первых тестов индекс вырос на @D — это больше обычного разброса, рост заметный.'),
      t('Since your first tests the index fell by @D: more than the usual spread.', 'С первых тестов индекс снизился на @D — это больше обычного разброса.'),
      t('Since your first tests: @D — within the usual spread.', 'С первых тестов: @D — в пределах обычного разброса.')],
    trend: [t('Over the last tests the index rose by @D: more than the usual spread, a real rise.', 'За последние тесты индекс вырос на @D — это больше обычного разброса, рост заметный.'),
      t('Over the last tests the index fell by @D: more than the usual spread.', 'За последние тесты индекс снизился на @D — это больше обычного разброса.'),
      t('Over the last tests: @D — within the usual spread.', 'За последние тесты: @D — в пределах обычного разброса.')],
    change: [t('The last test is @D above your average: more than the usual spread, a real rise.', 'Последний тест на @D выше вашего среднего — это больше обычного разброса, рост заметный.'),
      t('The last test is @D below your average: more than the usual spread.', 'Последний тест на @D ниже вашего среднего — это больше обычного разброса.'),
      t('The last test: @D to your average — within the usual spread.', 'Последний тест: @D к вашему среднему — в пределах обычного разброса.')],
  }[kind];
  const text = !real ? TEXT[2] : d > 0 ? TEXT[0] : TEXT[1];
  return h('p', {class: `small bm-change ${real ? (d > 0 ? 'up' : 'down') : ''}`}, text.replace('@D', real ? D.replace(/^[+−]/, '') : D));
}

// The next rank in one line: how far it is and, when one test can do it, the result that test needs.
export function nextRankLine(app, index) {
  const t = app.t;
  if (!index || index.value === null || index.rank >= 7) return '';
  const line = t('To the rank «@R»: +@N', 'До ранга «@R»: +@N').replace('@R', app.rankName(index.rank + 1)).replace('@N', fmt(index.toNext));
  return index.nextTest === null ? line : `${line} · ${t('next test: @X or more', 'следующий тест — от @X').replace('@X', fmt(index.nextTest))}`;
}

export function brainMarkHelp(app) {
  const t = app.t, shield = app.config.rules?.test?.rank_shield ?? 0;
  storage.updateProfile(p => noteFlag(p, 'bm_help'));
  app.achievementsNow?.();
  const th = rankThresholds(app.config.shell.b_mark_wnd);
  const s = sheet({title: t('How to read Brain Mark', 'Как читать Brain Mark'), body: [h('div', {class: 'stack'},
    h('p', null, t('Every test gives a result from 0 to 100: the mean of the marks of its five games. 50 is the level of an average player.', 'Каждый тест даёт результат от 0 до 100 — среднее оценок пяти игр. 50 — уровень среднего игрока.')),
    h('p', null, t('Brain Mark is your level by all your tests. The first three tests are averaged; after that every new test moves Brain Mark a third of the way to its result. So one test, lucky or not, changes it only a little, and a result above your Brain Mark always raises it.', 'Brain Mark — ваш уровень по всем тестам. Первые три теста усредняются, дальше каждый новый тест сдвигает Brain Mark на треть пути к своему результату. Поэтому один тест, удачный или нет, меняет его немного, а результат выше вашего Brain Mark всегда его повышает.')),
    h('p', null, t('One test depends on mood, attention and the luck of the layout, so the number comes with a range: your real level is inside it with a 90 % chance.', 'Один тест зависит от настроения, внимания и удачи раскладки, поэтому рядом с числом показан диапазон: ваш настоящий уровень находится в нём с вероятностью 90 %.')
      + ' ' + t('The more tests and the steadier they are, the narrower the range.', 'Чем больше тестов и чем ровнее результаты, тем уже диапазон.')),
    h('p', null, t('A change is real when a new result goes beyond the usual spread — the app says so under the number.', 'Изменение настоящее, когда новый результат выходит за обычный разброс, — об этом написано под числом.')),
    h('h3', null, t('Ranks', 'Ранги')),
    h('div', {class: 'rank-list'}, th.map((from, i) => h('div', {class: 'rank-row'}, h('span', {class: 'rank-badge sm'}, rankIcon(i + 1, 20)),
      h('b', null, app.rankName(i + 1)), h('span', {class: 'small muted num'}, t('from @N', 'от @N').replace('@N', fmt(from)))))),
    h('p', null, t('The rank follows the whole number on the screen. It goes up as soon as Brain Mark reaches the threshold and goes down only when Brain Mark is more than @N points under it: one unlucky test does not take a rank away.', 'Ранг считается по целому числу на экране. Он повышается, как только Brain Mark достигает порога, а понижается, только если Brain Mark опустится ниже порога больше чем на @N: один неудачный тест ранг не отнимает.').replace('@N', fmt(shield))))],
    actions: [h('button', {class: 'btn btn-primary btn-block', onclick: () => s.close()}, t('Got it', 'Понятно'))]});
}

const dateLabel = date => (date || '').slice(5).split('-').reverse().join('.');

// Brain Mark over the last 12 tests: a dot per test result, the line is Brain Mark, the shade its ± range.
export function brainMarkChart(app, profile, height = 170) {
  const t = app.t, tests = profile.tests.slice(-12), series = indexSeries(app, profile).slice(-12);
  const points = tests.map(test => ({label: dateLabel(test.date), value: test.bm}));
  // The scale follows the results (±5 around them and their range, in steps of 10), so a change is visible.
  const all = [...points.map(p => p.value), ...series.flatMap(i => [i.low, i.high])];
  const lo = Math.max(0, Math.floor((Math.min(...all) - 5) / 10) * 10), hi = Math.min(100, Math.ceil((Math.max(...all) + 5) / 10) * 10);
  return h('div', {class: 'stack', style: {gap: '6px'}},
    lineChart(points, {min: lo, max: hi, ticks: [lo, Math.round((lo + hi) / 2), hi], bands: bands(app), height, format: v => fmt(v, 0),
      range: series.map(i => ({value: i.value, low: i.low, high: i.high})), dotsOnly: points.length > 1}),
    points.length > 1 ? h('p', {class: 'tiny muted'}, t('Dots — tests, line — Brain Mark, shade — its range.', 'Точки — тесты, линия — Brain Mark, тень — его диапазон.')) : null);
}

export function indexCard(app, profile) {
  const t = app.t, index = testIndex(profile, app.config);
  if (index.value === null) return h('section', {class: 'card'},
    h('div', {class: 'row'}, h('span', {class: 'rank-badge'}, rankIcon(1)), h('div', {class: 'stack', style: {gap: '4px'}},
      h('h2', {style: {fontSize: 'var(--fs-l)'}}, t('No test yet', 'Тестов пока нет')),
      h('p', {class: 'small muted'}, t('Five short games set your Brain Mark: a number from 0 to 100 and one of seven ranks.', 'Пять коротких игр определят ваш Brain Mark: число от 0 до 100 и один из семи рангов.')))));
  const dots = h('span', {class: 'bm-dots', 'aria-hidden': 'true'}, Array.from({length: index.needed}, (_, i) => h('i', {class: i < index.count ? 'on' : ''})));
  return h('section', {class: 'card'},
    h('div', {class: 'row'},
      h('span', {class: 'rank-badge'}, rankIcon(index.rank)),
      h('div', {class: 'stack', style: {gap: '2px', flex: 1}},
        h('div', {class: 'card-kicker'}, 'Brain Mark'),
        h('div', {class: 'big-number num'}, whole(index.shown)),
        h('b', null, app.rankName(index.rank))),
      h('button', {class: 'icon-btn', 'aria-label': t('How to read Brain Mark', 'Как читать Brain Mark'), onclick: () => brainMarkHelp(app)}, icon('help'))),
    h('div', null, rangeBar(index.value, index.low, index.high), h('div', {class: 'bm-scale'}, h('span', null, '0'), h('span', null, '50'), h('span', null, '100'))),
    h('p', {class: 'small'}, t('Most likely your level is between @L and @H.', 'Скорее всего, ваш уровень — от @L до @H.').replace('@L', whole(index.low)).replace('@H', whole(index.high))),
    h('p', {class: 'small muted'}, dots, index.count < index.needed
      ? `${t('Tests in the index', 'Тестов в индексе')}: ${index.count}/${index.needed}. ${t('Each new test narrows the range.', 'Каждый новый тест сужает диапазон.')}`
      : t('Every new test moves Brain Mark a third of the way to its result.', 'Каждый новый тест сдвигает Brain Mark на треть пути к своему результату.')),
    changeLine(app, index),
    evoTrack(index.rank),
    index.rank < 7 ? h('div', {class: 'stack', style: {gap: '6px'}}, bar(index.share, 'reward'), h('span', {class: 'small muted'}, nextRankLine(app, index))) : null,
    index.shielded ? h('p', {class: 'small'}, t('The rank is kept: one weak test does not take it away. It goes down if Brain Mark falls below @N.', 'Ранг сохранён: один слабый тест его не отнимает. Он понизится, если Brain Mark опустится ниже @N.').replace('@N', fmt(index.keepFrom))) : null,
    h('p', {class: 'small muted'}, rankText(app, index.rank)));
}

export function renderTest(app, main) {
  const t = app.t, profile = storage.getProfile();
  app.setTop({title: t('Brain Marking', 'Тестирование'), back: 'home'});
  const pending = profile.marking;
  const games = testGames(app.config).map(miniGameRoute);

  const start = h('section', {class: 'card'},
    h('div', {class: 'card-kicker'}, t('The test', 'Тест')),
    h('p', {class: 'muted'}, t('Five games at a fixed difficulty. Each game gets a mark from 0 to 100; the test result is their average.', 'Пять игр на фиксированной сложности. Каждая игра получает оценку от 0 до 100, итог теста — их среднее.')),
    h('div', {class: 'list', style: {boxShadow: 'none', border: '1px solid var(--line)'}}, games.map((g, i) => h('div', {class: 'list-row'}, gameIcon(g.gameId, 'sm'),
      h('span', {class: 'lr-main'}, h('span', {class: 'lr-title'}, app.gameTitle(g.gameId)), h('span', {class: 'lr-sub'}, `${skillName(app, g.gameId)} · ${app.diffLabel(testLevel(app.config, g.gameId, g.difficulty))}`)),
      pending && i < pending.index ? h('span', {class: 'done-mark', style: {color: 'var(--ok)'}}, icon('check')) : null))),
    pending
      ? h('div', {class: 'stack'},
          h('button', {class: 'btn btn-primary btn-block btn-lg', onclick: () => app.startTest()}, icon('play'), `${t('Continue', 'Продолжить')} · ${t('task', 'задание')} ${pending.index + 1}/${pending.order.length}`),
          h('button', {class: 'btn btn-ghost btn-block', onclick: async () => {
            if (await confirmDialog({title: t('Start over?', 'Начать заново?'), text: t('The results of this test will be lost.', 'Результаты этого теста будут потеряны.'), ok: t('Start over', 'Начать заново'), danger: true})) { abandonMarking(); app.render(); }
          }}, t('Start over', 'Начать заново')))
      : h('button', {class: 'btn btn-primary btn-block btn-lg', onclick: () => app.startTest()}, icon('target'), t('Start the test', 'Начать тест')));
  // Games of the test open in the training later; the test plays them anyway.
  const last = [...profile.tests].reverse().find(test => test.version >= 2);
  const skills = last ? h('section', {class: 'card'},
    h('div', {class: 'card-head'}, h('h3', null, t('Skills in the last test', 'Навыки в последнем тесте')), h('span', {class: 'pill'}, last.date.split('-').reverse().join('.'))),
    h('div', {class: 'skill-bars'}, last.items.map(item => h('div', {class: 'skill'},
      h('span', {class: 'sk-name'}, gameIcon(item.game, 'sm'), h('span', null, h('span', null, skillName(app, item.game)), h('br'), h('span', {class: 'tiny faint'}, app.gameTitle(item.game)))),
      h('span', {class: 'sk-val'}, whole(item.mark / 100)), bar(item.mark / 10000))))) : null;

  const history = profile.tests.length ? h('section', {class: 'card'},
    h('h3', null, t('History', 'История')),
    brainMarkChart(app, profile, 160),
    h('div', {class: 'list', style: {boxShadow: 'none'}}, [...profile.tests].reverse().slice(0, 8).map(test => h('button', {class: 'list-row', disabled: test.version < 2,
      onclick: () => app.go(`test/result/${test.id}`)},
    h('span', {class: 'lr-main'}, h('span', {class: 'lr-title num'}, whole(test.bm)), h('span', {class: 'lr-sub'}, test.date.split('-').reverse().join('.'))),
    test.version >= 2 ? icon('chevron') : h('span', {class: 'tiny faint'}, t('no details', 'без разбивки')))))) : null;

  main.replaceChildren(indexCard(app, profile), start, skills || '', history || '');
}

export function renderTestResult(app, main, [, id]) {
  const t = app.t, profile = storage.getProfile();
  app.setTop({title: t('Test results', 'Результаты теста'), back: 'test'});
  const pos = profile.tests.findIndex(test => test.id === id);
  const test = profile.tests[pos];
  if (!test) { main.replaceChildren(h('p', {class: 'empty'}, t('Test not found', 'Тест не найден'))); return; }
  const prev = profile.tests[pos - 1];
  const delta = prev ? Math.round(test.bm) - Math.round(prev.bm) : null;
  const sorted = [...test.items].sort((a, b) => b.mark - a.mark);
  // What this test did to Brain Mark and to the rank (the state right after it, also for an old test).
  const moved = testIndex({tests: profile.tests.slice(0, pos + 1)}, app.config).moved;
  const after = indexHistory(profile.tests.slice(0, pos + 1), app.config).at(-1);
  const rankEvent = !moved || after.rank === moved.rankFrom ? null
    : after.rank > moved.rankFrom ? h('div', {class: 'event up'}, rankIcon(after.rank, 26), h('div', null, h('b', null, t('New rank: @R', 'Новый ранг: @R').replace('@R', app.rankName(after.rank)))))
      : h('div', {class: 'event step'}, rankIcon(after.rank, 26), h('div', null, h('b', null, t('The rank went down: @R', 'Ранг понизился: @R').replace('@R', app.rankName(after.rank)))));
  const hero = h('section', {class: 'card'},
    h('div', {class: 'result-hero'},
      h('div', {class: 'card-kicker'}, t('Result of this test', 'Результат этого теста')),
      h('div', {class: 'big-number num'}, whole(test.bm)),
      delta !== null ? h('span', {class: `delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`}, `${delta > 0 ? '+' : ''}${fmt(delta)} ${t('since the last test', 'к прошлому тесту')}`) : h('span', {class: 'small muted'}, t('Your first test', 'Ваш первый тест')),
      moved ? h('span', {class: 'small'}, moved.from === moved.to ? t('Brain Mark is unchanged: @N', 'Brain Mark не изменился: @N').replace('@N', fmt(moved.to)) : `Brain Mark: ${fmt(moved.from)} → ${fmt(moved.to)}`) : null,
      test.restarts ? h('span', {class: 'pill'}, `${t('Restarted tasks', 'Перезапусков заданий')}: ${test.restarts}`) : null),
    rankEvent,
    h('div', {class: 'skill-bars'}, test.items.map(item => h('div', {class: 'skill'},
      h('span', {class: 'sk-name'}, gameIcon(item.game, 'sm'), h('span', null, h('span', null, skillName(app, item.game)), h('br'),
        h('span', {class: 'tiny faint'}, `${app.gameTitle(item.game)} · ${fmt(item.raw)} ${t('points', 'очков')}`))),
      h('span', {class: 'sk-val'}, whole(item.mark / 100)), bar(item.mark / 10000)))),
    sorted.length >= 2 ? h('p', {class: 'small muted'}, `${t('Strongest', 'Сильная сторона')}: ${skillName(app, sorted[0].game)}. ${t('To work on', 'Над чем поработать')}: ${skillName(app, sorted.at(-1).game)} — ${t('train', 'тренируйте')} «${app.gameTitle(sorted.at(-1).game)}».`) : null);
  main.replaceChildren(hero, indexCard(app, profile),
    h('div', {class: 'stack', style: {gap: '8px'}}, h('button', {class: 'btn btn-primary btn-block btn-lg', onclick: () => app.go('home')}, t('Done', 'Готово')),
      h('button', {class: 'btn btn-ghost btn-block', onclick: () => app.startTest()}, icon('restart'), t('Take the test again', 'Пройти тест ещё раз'))));
}
