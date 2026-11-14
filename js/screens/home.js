// Home (v3.2.1). The top bar carries the status (level, streak, achievements, profile); below: today's training with
// Brain Power as its number, Brain Mark, a fact and a joke. 3.7 (owner): Brain Power is the big number of the training
// block, the line of game names with ticks is gone (the training screen lists the games). 3.9 (owner): the nearest
// goals are gone (the achievements of the top bar have «Almost there»), a joke stands under the fact, both in a
// larger type; after a training they are the ones it has just opened, then random opened ones that change in turn.
import { h, fmt } from '../core/dom.js';
import { icon, rankIcon } from '../core/icons.js';
import { ring, evoTrack, sparkline } from '../ui/components.js';
import { storage } from '../storage.js';
import { localDate, startTraining, openedFacts, openedJokes } from '../progression.js';
import { toast, hasSheet } from '../ui/overlay.js';
import { factText, brainPowerSheet } from './progress.js';
import { nextRankLine } from './test.js';

export function renderHome(app, main) {
  const t = app.t, profile = storage.getProfile();
  app.setTop({status: true});
  const session = profile.training?.date === localDate() ? profile.training : null;
  const done = session ? Object.keys(session.results).length : 0;
  const required = session?.required || Math.min(5, Math.max(2, Math.ceil((profile.unlockedGames.length || 3) / 2)));
  const index = app.testIndex();
  const isNew = !profile.history.length && !profile.tests.length;

  const welcome = isNew ? h('section', {class: 'card'},
    h('h2', {style: {fontSize: 'var(--fs-l)'}}, t('Two modes: training and test', 'Два режима: тренировка и тест')),
    h('p', {class: 'small muted'}, t('The test measures your Brain Mark in five short games. Daily training raises difficulty and unlocks new games.',
      'Тест за пять коротких игр определит ваш Brain Mark. Ежедневная тренировка повышает сложность и открывает новые игры.'))) : null;

  // Today's training: Brain Power is the number of the block (with what the last training added), the ring is the
  // count of today's games. The ring opens the training as it is (3.8.1, owner): an unfinished one to go on with,
  // a finished one with its results; the button under it is the short way and starts a new training after a
  // finished one.
  const state = session?.complete ? t('Training complete', 'Тренировка завершена')
    : `${t('Training', 'Тренировка')} · ${t('Done', 'Сыграно').toLowerCase()} ${done} ${t('of', 'из')} ${required}`;
  const training = h('section', {class: 'hero hero-compact'},
    h('div', {class: 'row'},
      profile.brainScore ? h('div', {class: 'stack hero-power', style: {gap: '4px', flex: 1, minWidth: 0}},
        h('button', {class: 'bp-open', 'aria-label': t('What Brain Power is made of', 'Из чего складывается Brain Power'), onclick: () => brainPowerSheet(app)},
          h('span', {class: 'card-kicker'}, 'Brain Power', icon('info', 14)),
          h('span', {class: `big-number num${profile.brainScore >= 1000 ? ' wide' : ''}`}, fmt(profile.brainScore), powerChange(profile))),
        h('span', {class: 'small hero-state'}, state))
        : h('div', {class: 'stack', style: {gap: '2px', flex: 1, minWidth: 0}},
          h('h2', null, t('Training', 'Тренировка')),
          h('span', {class: 'small hero-state'}, t('Play @N games', 'Сыграйте @N игры').replace('@N', required))),
      h('button', {class: 'ring-open', 'aria-label': `${t('Training', 'Тренировка')}: ${done} / ${required}`, onclick: () => app.go('training')},
        ring(done, required, `${done}/${required}`), icon('chevron', 18))),
    h('button', {class: 'btn btn-primary btn-block btn-lg', onclick: async () => {
      if (session?.complete) { await startTraining(true); toast(t('New training started', 'Начата новая тренировка')); }
      app.go('training');
    }}, session?.complete ? t('One more training', 'Ещё одна тренировка') : done ? t('Continue training', 'Продолжить тренировку') : t('Start training', 'Начать тренировку')));

  // Brain Mark: the number with its range, the way to the next rank, the trend; the rank name is in the top bar.
  const pending = profile.marking;
  const values = profile.tests.slice(-8).map(test => test.bm);
  const test = h('section', {class: 'card bm-home'},
    h('div', {class: 'row'},
      h('div', {class: 'stack', style: {gap: '2px', flex: 1, minWidth: 0}},
        h('div', {class: 'card-kicker'}, 'Brain Mark'),
        index.value === null ? h('p', {class: 'small muted'}, t('Take the test to get your level', 'Пройдите тест, чтобы узнать свой уровень'))
          : h('div', {class: 'big-number num'}, fmt(index.shown), h('small', null, ` ${fmt(Math.round(index.low))}–${fmt(Math.round(index.high))}`)),
        index.value !== null && index.rank < 7 ? h('span', {class: 'small muted'}, nextRankLine(app, index)) : null),
      values.length > 1 ? sparkline(values, {width: 96, height: 40, min: Math.max(0, Math.min(...values) - 8), max: Math.min(100, Math.max(...values) + 8)}) : null),
    index.value !== null ? evoTrack(index.rank) : null,
    h('div', {class: 'bm-card-actions'},
      h('button', {class: 'btn', onclick: () => app.go('test')}, icon('target'),
        pending ? `${t('Continue the test', 'Продолжить тест')} · ${pending.index + 1}/${pending.order.length}` : t('Take the test', 'Пройти тест')),
      profile.tests.length ? h('button', {class: 'btn btn-ghost', onclick: () => app.go('progress/trends')}, icon('progress'), t('Trends', 'Динамика')) : null));

  main.replaceChildren(...[welcome, training, test, ...feed(app, profile)].filter(Boolean));
}

// What the last finished training added to Brain Power (against the training before it).
export function powerChange(profile) {
  const last = profile.history.at(-1), prev = profile.history.at(-2);
  if (!last || !prev) return null;
  const d = Math.round(last.score - prev.score);
  return h('span', {class: `power-change ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`}, `${d > 0 ? '+' : d < 0 ? '−' : '±'}${fmt(Math.abs(d))}`);
}

// A fact and a joke of the opened ones (3.9, owner). On the first visit after a training — the pair it has just
// opened (app.fresh, marked «New»); on any other visit — random ones, not the ones shown last. While Home stays open
// each card changes every ROTATE_MS, the joke half a period before the fact (not under an open sheet or in a hidden
// tab). Until 3.11.4 the two took turns: the fact changed at 25 s and the joke only at 50 s, and the count started
// again at every visit to Home, so the joke looked fixed (owner: «факты меняются, анекдоты нет»). The text opens
// the list of Progress; the round arrow shows another one at once. A joke is never cut; a long fact shows its first
// lines.
const ROTATE_MS = 25000;
function feed(app, profile) {
  const t = app.t, shown = app.feed ||= {}, cards = [], swaps = [];
  const kinds = [
    {kind: 'fact', items: app.facts, opened: openedFacts(profile, app.facts.length), title: t("It's interesting!", 'Это интересно!'), ic: 'bulb',
      count: t('Facts opened', 'Открыто фактов'), go: 'progress/facts', more: t('Another fact', 'Другой факт')},
    {kind: 'joke', items: app.jokes, opened: openedJokes(profile, app.facts.length, app.jokes.length), title: t('Brainy humor', 'Умный юмор'), ic: 'smile',
      count: t('Jokes opened', 'Открыто шуток'), go: 'progress/humor', more: t('Another joke', 'Другая шутка')}];
  for (const {kind, items, opened, title, ic, count, go, more} of kinds) {
    if (!opened.length) continue;
    const fresh = app.fresh?.[kind], isNew = Number.isInteger(fresh) && opened.includes(fresh);
    const pick = () => { const pool = opened.length > 1 ? opened.filter(i => i !== shown[kind]) : opened; return pool[Math.floor(Math.random() * pool.length)]; };
    shown[kind] = isNew ? fresh : pick();
    const text = h('p', {class: 'feed-text'}, factText(items[shown[kind]]));
    const badge = isNew ? h('span', {class: 'pill reward'}, t('New', 'Новое')) : null;
    const swap = () => {
      shown[kind] = pick(); badge?.remove();
      text.classList.remove('feed-in'); void text.offsetWidth;
      text.textContent = factText(items[shown[kind]]); text.classList.add('feed-in');
    };
    swap.kind = kind;
    if (opened.length > 1) swaps.push(swap);
    cards.push(h('section', {class: `card feed-card feed-${kind}`},
      h('div', {class: 'row feed-head'}, h('span', {class: 'card-kicker'}, icon(ic, 14), title), badge,
        opened.length > 1 ? h('button', {class: 'icon-btn feed-more', 'aria-label': more, onclick: swap}, icon('restart', 18)) : null),
      h('button', {class: 'feed-open', onclick: () => app.go(go)}, text,
        h('span', {class: 'tiny muted'}, `${count}: ${opened.length} / ${items.length}`))));
  }
  if (app.fresh) app.fresh.shown = true;   // app.js drops the pair when Home is left
  if (swaps.length) {
    // A tick every half period: the joke at 12.5 s, the fact at 25 s, the joke at 37.5 s… — each one every 25 s.
    const order = [...swaps].sort((a, b) => (b.kind === 'joke') - (a.kind === 'joke'));
    let turn = 0;
    app.homeTimer = setInterval(() => {
      if (document.hidden || hasSheet() || app.route !== 'home') return;
      const swap = order.length > 1 ? order[turn++ % order.length] : (turn++ % 2 ? null : order[0]);
      swap?.();
    }, ROTATE_MS / 2);
  }
  return cards;
}
