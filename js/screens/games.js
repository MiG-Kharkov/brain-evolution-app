import { h, fmt } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { gameIcon } from '../ui/components.js';
import { sheet } from '../ui/overlay.js';
import { storage } from '../storage.js';
import { TRAINING_ORDER, maxDifficulty, freePlayAccess } from '../progression.js';
import { DIFFICULTIES } from '../original.js';
import { i18n } from '../i18n.js';
import { demoBlock } from '../ui/demos.js';

const CATEGORIES = [
  ['all', 'All', 'Все', null],
  ['memory', 'Memory', 'Память', ['memorics', 'pairs', 'geometry', 'encyclopedia']],
  ['logic', 'Logic', 'Логика', ['sudoku', 'minesweeper', 'matches']],
  ['calc', 'Calculation', 'Счёт', ['arithmetics', 'numbers']],
  ['pattern', 'Patterns', 'Закономерности', ['quadronica', 'guess_who']],
  ['spatial', 'Spatial', 'Пространство', ['roadblocks', 'matches']],
];
let filter = 'all';

export function renderGames(app, main) {
  const t = app.t, profile = storage.getProfile();
  app.setTop({title: t('Games', 'Игры')});
  const chips = h('div', {class: 'chips', role: 'toolbar', 'aria-label': t('Filter', 'Фильтр')}, CATEGORIES.map(([key, en, ru]) =>
    h('button', {class: 'chip', 'aria-pressed': filter === key, onclick: () => { filter = key; renderGames(app, main); }}, t(en, ru))));
  const ids = CATEGORIES.find(c => c[0] === filter)?.[3] || TRAINING_ORDER;
  const access = Object.fromEntries(TRAINING_ORDER.map(id => [id, freePlayAccess(profile, app.config, id)]));
  const openCount = TRAINING_ORDER.filter(id => access[id].open).length;
  const grid = h('div', {class: 'game-grid'}, TRAINING_ORDER.filter(id => ids.includes(id)).map(id => {
    const best = profile.highScores[id] || 0, a = access[id];
    return h('button', {class: `game-card${a.open ? '' : ' locked'}`, onclick: () => gameSheet(app, id),
      'aria-label': a.open ? app.gameTitle(id) : `${app.gameTitle(id)} · ${t('locked', 'закрыта')}`}, gameIcon(id),
      h('h3', null, app.gameTitle(id)), h('span', {class: 'gc-cat'}, app.gameCategory(id)),
      a.open ? h('span', {class: 'gc-best'}, icon('trophy'), best ? fmt(best) : t('no record yet', 'рекорда нет'))
        : h('span', {class: 'gc-best'}, icon('lock'), `${t('Level-ups left', 'Осталось повышений')}: ${a.left}`));
  }));
  main.replaceChildren(
    h('p', {class: 'muted small'}, t('Free play goes to records only. New games and levels open in training.',
      'Свободная игра идёт только в рекорды. Новые игры и уровни открываются в тренировке.')),
    h('div', {class: 'row wrap'}, h('span', {class: 'pill accent'}, `${t('Open', 'Открыто')} ${openCount} / ${TRAINING_ORDER.length}`),
      openCount < TRAINING_ORDER.length ? h('button', {class: 'chip', onclick: () => app.go('training')}, icon('up', 14), t('Open more in training', 'Открыть больше в тренировке')) : null),
    chips, grid);
}

export function gameSheet(app, id) {
  const t = app.t, profile = storage.getProfile();
  const access = freePlayAccess(profile, app.config, id);
  if (!access.open) {
    const s = sheet({title: app.gameTitle(id), body: [
      h('div', {class: 'row'}, gameIcon(id, 'lg'), h('div', {class: 'stack', style: {gap: '4px'}}, h('span', {class: 'pill'}, icon('lock', 12), t('Locked', 'Закрыта')),
        h('span', {class: 'small muted'}, app.gameShortDesc(id)))),
      h('p', {class: 'muted'}, `${t('The game opens after level-ups in training. Level-ups left', 'Игра откроется после повышений сложности в тренировке. Осталось повышений')}: ${access.left}. `,
        t('Any open game counts.', 'Подходит любая открытая игра.'))],
    actions: [h('button', {class: 'btn btn-primary btn-block btn-lg', onclick: () => { s.close(); app.go('training'); }}, icon('up'), t('Go to training', 'К тренировке'))]});
    return;
  }
  const top = Math.min(3, maxDifficulty(app.config, id));
  const diffs = DIFFICULTIES.slice(0, top + 1);
  let chosen = DIFFICULTIES[Math.min(profile.progress[id]?.difficulty || 0, access.maxDiff)];
  const seg = h('div', {class: 'segmented', role: 'group', 'aria-label': t('Difficulty', 'Сложность')});
  const records = h('div', {class: 'grid-3'});
  const lockNote = h('p', {class: 'tiny faint'});
  const draw = () => {
    seg.replaceChildren(...diffs.map((d, i) => h('button', {'aria-pressed': d === chosen, disabled: i > access.maxDiff,
      'aria-label': i > access.maxDiff ? `${app.diffLabel(d)} · ${t('locked', 'закрыта')}` : app.diffLabel(d),
      onclick: () => { chosen = d; draw(); }}, i > access.maxDiff ? icon('lock', 12) : null, app.diffLabel(d))));
    lockNote.textContent = access.maxDiff < top ? t('Harder levels open when you raise the difficulty of this game in training.', 'Более сложные уровни откроются, когда вы повысите сложность этой игры в тренировке.') : '';
    records.replaceChildren(...diffs.slice(0, 3).map(d => h('div', {class: 'stat'}, h('span', {class: 'stat-value num'}, profile.bestByDiff[id]?.[d] > 0 ? fmt(profile.bestByDiff[id][d]) : '—'), h('span', {class: 'stat-label'}, app.diffLabel(d)))));
  };
  draw();
  const s = sheet({title: app.gameTitle(id), body: [
    h('div', {class: 'row'}, gameIcon(id, 'lg'), h('div', {class: 'stack', style: {gap: '4px'}}, h('span', {class: 'pill'}, app.gameCategory(id)),
      h('span', {class: 'small muted'}, app.gameShortDesc(id)))),
    h('div', {class: 'field'}, h('label', null, t('Difficulty', 'Сложность')), seg, lockNote),
    h('div', {class: 'stack', style: {gap: '6px'}}, h('span', {class: 'card-kicker'}, t('Your records', 'Ваши рекорды')), records),
    h('details', null, h('summary', {class: 'small', style: {cursor: 'pointer', fontWeight: 650}}, t('Rules', 'Правила')), h('p', {class: 'help-text small', style: {marginTop: '8px'}}, app.gameDesc(id)), demoBlock(id))],
  actions: [h('button', {class: 'btn btn-primary btn-block btn-lg', onclick: () => { s.close(); app.launch({gameId: id, difficulty: chosen, mode: 'free', back: 'games'}); }}, icon('play'), t('Play', 'Играть'))]});
}
