import { h, fmt } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { gameIcon } from '../ui/components.js';
import { sheet } from '../ui/overlay.js';
import { storage } from '../storage.js';
import { TRAINING_ORDER, maxDifficulty, freePlayAccess, trainingInfo } from '../progression.js';
import { DIFFICULTIES } from '../original.js';
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
    const level = a.open ? levelMark(app, profile, id, a) : null;
    return h('button', {class: `game-card${a.open ? '' : ' locked'}`, onclick: () => gameSheet(app, id),
      'aria-label': a.open ? `${app.gameTitle(id)} · ${level.label}` : `${app.gameTitle(id)} · ${t('locked', 'закрыта')}`}, gameIcon(id),
      h('h3', null, app.gameTitle(id)), h('span', {class: 'gc-cat'}, app.gameCategory(id)),
      level?.el,
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

// How far a game is trained (3.12.16, owner: «значок… меняет заливку в зависимости от того, насколько открыто, чтобы
// было видно, где игры уже по максимуму прокачаны», and a crown for the Maximum of Sudoku and Guess Who). One segment
// for each training level: a passed level is full, the level being trained fills by its steps (4 of 10), the
// levels above are empty — as the bar of Training shows it (a level lowered after five weak games is trained again,
// so it is not full). The Champion of the top level makes the whole bar gold. A game with a free-play Maximum
// ends the bar with a crown: faint while the Maximum is closed, gold once it is open. The line under the bar names
// the level being trained, or the Champion.
function levelMark(app, profile, id, access) {
  const t = app.t, info = trainingInfo(profile, app.config, id), top = Math.min(2, info.maxDiff);
  const share = info.params.required ? Math.min(1, info.progress / info.params.required) : 0;
  const fill = i => info.champion || i < info.diff ? 1 : i === info.diff ? share : 0;
  const segments = Array.from({length: top + 1}, (_, i) => h('i', {style: `--fill: ${Math.round(fill(i) * 100)}%`}));
  const extra = access.extra !== null;
  const crown = extra ? h('span', {class: `gc-crown${access.extraOpen ? ' on' : ''}`}, icon('crown', 16)) : null;
  const name = info.champion ? t('Champion', 'Чемпион') : app.diffLabel(info.difficulty);
  const steps = info.champion ? '' : ` ${info.progress}/${info.params.required}`;
  const max = extra ? ` · ${access.extraOpen ? t('Maximum is open', '«Максимум» открыт') : t('Maximum is locked', '«Максимум» закрыт')}` : '';
  return {label: `${name}${steps}${max}`,
    el: h('span', {class: `gc-level${info.champion ? ' done' : ''}`, 'aria-hidden': 'true'},
      h('span', {class: 'gc-bar'}, segments, crown),
      h('span', {class: 'gc-level-name'}, name, steps ? h('span', {class: 'faint num'}, steps) : null))};
}

// The free-play Maximum of a game (FREE_ONLY): [while it is closed, when it is chosen].
const EXTRA_NOTES = t => ({
  sudoku: [t('Maximum: harder grids without a time limit. It opens with the Champion of Sudoku in training.', '«Максимум» — поля труднее, без ограничения времени. Откроется с «Чемпионом» судоку в тренировке.'),
    t('Maximum: no time limit. The grid is kept, you can go on later. It does not change Brain Power.', '«Максимум»: без ограничения времени. Решение сохраняется, можно продолжить позже. На Brain Power не влияет.')],
  guess_who: [t('Maximum: a different pair of features in every round. It opens with the Champion of Guess Who in training.', '«Максимум» — в каждом раунде своя пара признаков. Откроется с «Чемпионом» «Кто это?» в тренировке.'),
    t('Maximum: 20 figures, a different pair of features in every round. It does not change Brain Power.', '«Максимум»: 20 фигур, в каждом раунде своя пара признаков. На Brain Power не влияет.')],
});

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
  // A level of free play only (Sudoku Maximum, 3.12.7) comes after the training levels, locked until their Champion.
  const top = Math.min(3, maxDifficulty(app.config, id)), extra = access.extra;
  const diffs = DIFFICULTIES.slice(0, (extra ?? top) + 1);
  let chosen = DIFFICULTIES[Math.min(profile.progress[id]?.difficulty || 0, access.maxDiff)];
  const extraNote = h('p', {class: 'tiny faint'});
  // Four levels share the row by the length of their names, so that «Максимум» is not cut on a narrow phone.
  const seg = h('div', {class: diffs.length > 3 ? 'segmented four' : 'segmented', role: 'group', 'aria-label': t('Difficulty', 'Сложность')});
  const records = h('div', {class: 'grid-3'});
  const lockNote = h('p', {class: 'tiny faint'});
  const draw = () => {
    seg.replaceChildren(...diffs.map((d, i) => h('button', {'aria-pressed': d === chosen, disabled: i > access.maxDiff,
      'aria-label': i > access.maxDiff ? `${app.diffLabel(d)} · ${t('locked', 'закрыта')}` : app.diffLabel(d),
      onclick: () => { chosen = d; draw(); }}, i > access.maxDiff ? icon('lock', 12) : null, app.diffLabel(d))));
    lockNote.textContent = access.maxDiff < top ? t('Harder levels open when you raise the difficulty of this game in training.', 'Более сложные уровни откроются, когда вы повысите сложность этой игры в тренировке.') : '';
    const notes = EXTRA_NOTES(t)[id] || ['', ''];
    extraNote.textContent = extra === null ? '' : !access.extraOpen ? notes[0] : chosen === DIFFICULTIES[extra] ? notes[1] : '';
    const shown = diffs.filter((d, i) => i <= Math.max(2, access.maxDiff)).slice(0, 4);
    records.className = shown.length > 3 ? 'grid-4' : 'grid-3';
    records.replaceChildren(...shown.map(d => h('div', {class: 'stat'}, h('span', {class: 'stat-value num'}, profile.bestByDiff[id]?.[d] > 0 ? fmt(profile.bestByDiff[id][d]) : '—'), h('span', {class: 'stat-label'}, app.diffLabel(d)))));
  };
  draw();
  const s = sheet({title: app.gameTitle(id), body: [
    h('div', {class: 'row'}, gameIcon(id, 'lg'), h('div', {class: 'stack', style: {gap: '4px'}}, h('span', {class: 'pill'}, app.gameCategory(id)),
      h('span', {class: 'small muted'}, app.gameShortDesc(id)))),
    h('div', {class: 'field'}, h('label', null, t('Difficulty', 'Сложность')), seg, lockNote, extraNote),
    h('div', {class: 'stack', style: {gap: '6px'}}, h('span', {class: 'card-kicker'}, t('Your records', 'Ваши рекорды')), records),
    h('details', null, h('summary', {class: 'small', style: {cursor: 'pointer', fontWeight: 650}}, t('Rules', 'Правила')), h('p', {class: 'help-text small', style: {marginTop: '8px'}}, app.gameDesc(id)), demoBlock(id))],
  actions: [h('button', {class: 'btn btn-primary btn-block btn-lg', onclick: () => { s.close(); app.launch({gameId: id, difficulty: chosen, mode: 'free', back: 'games'}); }}, icon('play'), t('Play', 'Играть'))]});
}
