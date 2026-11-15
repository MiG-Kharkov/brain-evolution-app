import { h, fmt } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { ring, steps, gameIcon } from '../ui/components.js';
import { confirmDialog, sheet, toast } from '../ui/overlay.js';
import { storage } from '../storage.js';
import { startTraining, trainingInfo, trainingHint, TRAINING_ORDER } from '../progression.js';
import { i18n } from '../i18n.js';
import { powerChange } from './home.js';
import { brainPowerSheet, powerChart } from './progress.js';

export async function renderTraining(app, main) {
  const t = app.t;
  app.setTop({title: t('Brain Training', 'Тренировка'), back: 'home'});
  main.replaceChildren(h('div', {class: 'empty'}, t('Loading…', 'Загрузка…')));
  const session = await startTraining();
  if (app.route !== 'training') return;
  const profile = storage.getProfile(), config = app.config;
  const done = Object.keys(session.results).length;

  const history = profile.history;
  const power = history.length ? h('button', {class: 'power-head bp-open', 'aria-label': t('What Brain Power is made of', 'Из чего складывается Brain Power'), onclick: () => brainPowerSheet(app)},
    h('span', {class: 'card-kicker'}, 'Brain Power', icon('info', 14)),
    h('span', {class: 'big-number num'}, fmt(profile.brainScore), powerChange(profile))) : '';
  // A finished training shows what it brought (3.8.1, owner): Brain Power, then every game with its result. The
  // level, the threshold of that moment and whether the game gave a step come from the log of games (app.js
  // recordResult); a game the log no longer has shows the score alone.
  const logged = (id, score) => profile.scoreHistory.findLast(e => e.gameId === id && e.mode === 'training' && e.res && e.res !== 'skip' && e.score === Math.round(score));
  const results = session.complete ? h('div', {class: 'results-list train-results'}, Object.entries(session.results).map(([id, score]) => {
    const e = logged(id, score);
    return h('div', {class: 'results-item'},
      h('span', {class: 'ri-label'}, h('b', null, app.gameTitle(id)),
        e ? h('span', {class: 'ri-calc num'}, [app.diffLabel(e.diff), e.up > 1 ? t('from @N', 'от @N').replace('@N', fmt(e.up)) : null].filter(Boolean).join(' · ')) : null),
      h('span', {class: 'ri-val'}, e?.res === 'up' ? h('span', {class: 'pill ok'}, t('+1 step', '+1 деление')) : null, fmt(score)));
  })) : null;
  const summary = h('section', {class: 'card'},
    h('div', {class: 'row'},
      ring(done, session.required),
      h('div', {class: 'stack', style: {gap: '4px', flex: 1}},
        h('h2', {style: {fontSize: 'var(--fs-l)'}}, session.complete ? t('Training complete', 'Тренировка завершена') : `${t('Done', 'Сыграно')} ${done} ${t('of', 'из')} ${session.required}`),
        h('p', {class: 'small muted'}, session.complete ? t('Further games will not change the progress. You can start a new training.', 'Новые партии не изменят прогресс. Можно начать новую тренировку.')
          : t('Play any games from the list. Each counts once per training.', 'Играйте в любые игры из списка. Каждая засчитывается один раз за тренировку.')))),
    session.complete ? [power, results, h('div', {class: 'stack', style: {gap: '6px'}},
      h('button', {class: 'btn btn-primary btn-block btn-lg', onclick: () => newTraining()}, icon('restart'), t('Start a new training', 'Начать новую тренировку')),
      h('p', {class: 'tiny faint'}, t('Each game counts once per training. A new training can start right away, even today.', 'Каждая игра засчитывается один раз за тренировку. Новую тренировку можно начать сразу, хоть сегодня.')))]
      : [done ? h('button', {class: 'btn btn-ghost btn-sm', style: {alignSelf: 'flex-start'}, onclick: () => restart()}, icon('restart'), t('Start over', 'Начать заново')) : '', power],
    history.length ? powerChart(profile, 12, 120) : '');   // Brain Power by day, the last 12 days with a training

  // The suggested game: the original advice texts name the games in English, so the title is localised here.
  const hint = !session.complete ? trainingHint(profile, config) : null;
  const quoted = id => ['ru', 'uk'].includes(i18n.getLang()) ? `«${app.gameTitle(id)}»` : app.gameTitle(id);
  const hintText = hint && (hint.text ? i18n.t(hint.text).trim().replace(new RegExp(`\\b(${[...new Set([...app.games.map(g => g.title?.en), 'Balltracker', 'Roadblocks'])].filter(Boolean).join('|')})\\b`, 'g'), quoted(hint.gameId)).replace(/([^.!?])$/, '$1.')
    : t('Suggested next: @G, the open game with the least progress.', 'Советуем сыграть в @G: у этой игры меньше всего прогресса.').replace('@G', quoted(hint.gameId)));
  const hintCard = hint ? h('button', {class: 'hint-card', onclick: () => open(hint.gameId, trainingInfo(profile, config, hint.gameId), false)},
    icon('bulb'), h('span', {style: {flex: 1}}, hintText), icon('chevron')) : null;

  const row = id => {
    const info = trainingInfo(profile, config, id);
    const played = Object.hasOwn(session.results, id);
    const sub = info.open
      ? info.champion
        // the top level is passed: a closed bar and the word instead of the count and the threshold (3.10)
        ? h('span', {class: 'lr-meta'}, h('span', {class: 'pill accent'}, app.diffLabel(info.difficulty)), steps(info.params.required, info.params.required, 'done'),
            h('span', {class: 'tiny train-champ'}, icon('trophy', 12), t('Champion', 'Чемпион')))
        : h('span', {class: 'lr-meta'}, h('span', {class: 'pill accent'}, app.diffLabel(info.difficulty)), steps(info.progress, info.params.required),
          h('span', {class: 'tiny faint num'}, `${info.progress}/${info.params.required}`),
          info.params.up > 1 ? h('span', {class: 'tiny faint num train-up'}, t('from @N', 'от @N').replace('@N', fmt(info.params.up))) : null)
      : h('span', {class: 'lr-sub'}, `${t('Level-ups left', 'Осталось повышений')}: ${Math.max(1, info.unlock - (profile.promotions || 0))}`);
    return h('button', {class: `list-row train-row ${info.open ? '' : 'locked'}`, onclick: () => open(id, info, played)},
      gameIcon(id, 'sm'),
      h('span', {class: 'lr-main'}, h('span', {class: 'lr-title'}, app.gameTitle(id)), sub),
      !info.open ? icon('lock') : played ? h('span', {class: 'done-mark', 'aria-label': t('Played in this training', 'Сыграно в этой тренировке')}, icon('check')) : icon('chevron'));
  };
  const openIds = TRAINING_ORDER.filter(id => profile.unlockedGames.includes(id));
  const lockedIds = TRAINING_ORDER.filter(id => !profile.unlockedGames.includes(id))
    .sort((a, b) => trainingInfo(profile, config, a).unlock - trainingInfo(profile, config, b).unlock);

  async function open(id, info, played) {
    if (!info.open) {
      sheet({title: app.gameTitle(id), body: [h('p', {class: 'muted'}, t('To unlock this game, raise the difficulty in the open games. Level-ups needed: ', 'Чтобы открыть игру, повышайте сложность в открытых играх. Нужно повышений: ') + Math.max(1, info.unlock - (profile.promotions || 0)))]});
      return;
    }
    const launch = () => app.launch({gameId: id, difficulty: info.difficulty, mode: 'training'});
    if (session.complete) {
      const s = sheet({title: app.gameTitle(id), body: [h('p', {class: 'muted'}, t('This training is complete. Start a new one and the game counts again.', 'Эта тренировка завершена. Начните новую — и партия снова пойдёт в зачёт.'))],
        actions: [
          h('button', {class: 'btn btn-primary btn-block btn-lg', onclick: async () => { s.close(); await startTraining(true); launch(); }}, icon('play'), t('New training and play', 'Новая тренировка и играть')),
          h('button', {class: 'btn btn-block', onclick: () => { s.close(); launch(); }}, t('Play without counting', 'Играть без зачёта')),
          h('button', {class: 'btn btn-ghost btn-block', onclick: () => s.close()}, t('Cancel', 'Отмена'))]});
      return;
    }
    if (played) {
      const s = sheet({title: app.gameTitle(id), body: [h('p', {class: 'muted'}, t('This game is already played in the current training, a new result will not change the progress. Play the other games to finish the training.',
        'Эта игра уже сыграна в текущей тренировке, новый результат не изменит прогресс. Сыграйте другие игры, чтобы завершить тренировку.'))],
        actions: [h('button', {class: 'btn btn-block', onclick: () => { s.close(); launch(); }}, t('Play without counting', 'Играть без зачёта')),
          h('button', {class: 'btn btn-ghost btn-block', onclick: () => s.close()}, t('Cancel', 'Отмена'))]});
      return;
    }
    launch();
  }

  async function newTraining() {
    await startTraining(true);
    toast(t('New training started', 'Начата новая тренировка'));
    app.render();
  }

  // "How games and levels open": the player's own thresholds and the next unlocks.
  function rules() {
    const open = TRAINING_ORDER.filter(id => profile.unlockedGames.includes(id));
    const next = TRAINING_ORDER.filter(id => !profile.unlockedGames.includes(id)).slice(0, 4);
    sheet({title: t('How games and levels open', 'Как открываются игры и уровни'), body: [
      h('ol', {class: 'small', style: {margin: 0, paddingLeft: '1.2em', display: 'grid', gap: '6px'}},
        h('li', null, t('Each game counts once per training. You can start a new training any time.', 'Каждая игра засчитывается один раз за тренировку. Новую тренировку можно начать в любой момент.')),
        h('li', null, t('A result not below the threshold adds one step. A full bar moves the game to the next difficulty: that is a level-up.', 'Результат не ниже порога добавляет одно деление. Шкала заполнилась — игра переходит на следующую сложность: это повышение.')),
        h('li', null, t('Steps are never lost. The difficulty goes down only on systematic failure: five very weak results in a row (under 40 % of the threshold) while the bar of this level is still empty.',
          'Деления не снимаются. Сложность понижается только при систематическом провале: пять совсем слабых партий подряд (меньше 40 % порога), пока на шкале этого уровня нет ни одного деления.')),
        h('li', null, t('New games open by the total number of level-ups in any games.', 'Новые игры открываются по общему числу повышений в любых играх.')),
        h('li', null, t('On the top difficulty a full bar gives the Champion award and closes the level. The game stays in training: its results go to Brain Power and the records.',
          'На высшей сложности заполненная шкала даёт награду «Чемпион» и закрывает уровень. Игра остаётся в тренировке: её результаты идут в Brain Power и в рекорды.'))),
      h('div', {class: 'card flat'}, h('b', null, `${t('Your level-ups', 'Ваши повышения')}: ${profile.promotions || 0}`),
        h('div', {class: 'results-list'}, open.map(id => { const i = trainingInfo(profile, config, id);
          return h('div', {class: 'results-item'}, h('span', {class: 'ri-label'}, `${app.gameTitle(id)} · ${app.diffLabel(i.difficulty)}`),
            h('span', {class: 'ri-val'}, `${fmt(i.params.up)} ${t('pts', 'очк.')} · ${i.champion ? t('Champion', 'Чемпион') : `${i.progress}/${i.params.required}`}`)); }))),
      next.length ? h('div', {class: 'card flat'}, h('b', null, t('Next games', 'Следующие игры')),
        h('div', {class: 'results-list'}, next.map(id => { const i = trainingInfo(profile, config, id);
          return h('div', {class: 'results-item'}, h('span', {class: 'ri-label'}, app.gameTitle(id)),
            h('span', {class: 'ri-val'}, `${t('at', 'при')} ${i.unlock} · ${t('left', 'осталось')} ${Math.max(1, i.unlock - (profile.promotions || 0))}`)); }))) : null]});
  }

  const restart = async () => {
    if (!session.complete && done) {
      const ok = await confirmDialog({title: t('Start a new training?', 'Начать новую тренировку?'), text: t('The current one will stay unfinished.', 'Текущая останется незавершённой.'), ok: t('Start', 'Начать')});
      if (!ok) return;
    }
    newTraining();
  };

  main.replaceChildren(summary, hintCard || '',
    h('div', {class: 'row wrap'}, h('h2', {class: 'section-title', style: {flex: 1}}, t('Games', 'Игры')),
      h('button', {class: 'chip chip-wrap', onclick: rules}, icon('info', 14), t('How games and levels open', 'Как открываются игры и уровни'))),
    h('div', {class: 'list'}, openIds.map(row)),
    lockedIds.length ? h('h2', {class: 'section-title'}, `${t('Open later', 'Откроются позже')} · ${lockedIds.length}`) : '',
    lockedIds.length ? h('div', {class: 'list'}, lockedIds.map(row)) : '');
}
