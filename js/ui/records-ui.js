// The record book on screen (data and rules — js/records.js): the group of tiles in the achievements tab, the sheet
// of one game with every record by level, and the line of a record that has just been beaten.
import { h, fmt } from '../core/dom.js';
import { i18n } from '../i18n.js';
import { sheet } from './overlay.js';
import { medal } from './achievements-ui.js';
import { icon } from '../core/icons.js';
import { TRAINING_ORDER } from '../progression.js';
import { LEVELS, recordsOf, recordOf, headline, recordCount } from '../records.js';

const t = (en, ru) => i18n.t(en, ru);
export const recordTitle = def => t(def.title[0], def.title[1]);

export function recordValue(def, v) {
  if (def.unit === 'time') {
    const s = Math.round(v), hours = Math.floor(s / 3600), min = Math.floor(s % 3600 / 60), sec = String(s % 60).padStart(2, '0');
    return hours ? `${hours}:${String(min).padStart(2, '0')}:${sec}` : `${min}:${sec}`;
  }
  return def.unit === 'percent' ? `${fmt(v)} %` : fmt(v);
}

// A record beaten just now, {def, level, value, prev}: «Medium · 0:41 (was 0:47)».
export function recordLine(app, r) {
  const value = `${recordValue(r.def, r.value)}${r.prev !== null && r.prev !== undefined ? ` (${t('was @V', 'было @V').replace('@V', recordValue(r.def, r.prev))})` : ''}`;
  return r.level ? `${app.diffLabel(r.level)} · ${value}` : value;
}

const dateOf = at => (at ? new Date(at).toLocaleDateString(document.documentElement.lang, {day: 'numeric', month: 'short', year: 'numeric'}) : '');
const levelsOf = (profile, gameId) => LEVELS.filter(level => level !== 'ultra' || gameId === 'sudoku' || profile.bestByDiff?.[gameId]?.ultra > 0);

export function recordSheet(app, gameId, profile) {
  const row = (def, level) => {
    const entry = recordOf(profile, def, level);
    return h('div', {class: `rec-row${entry ? '' : ' none'}`},
      h('span', {class: 'small'}, level ? app.diffLabel(level) : t('All levels', 'Все уровни')),
      h('span', {class: 'tiny muted'}, entry ? dateOf(entry.at) : ''),
      h('b', {class: 'num'}, entry ? recordValue(def, entry.v) : '—'));
  };
  const blocks = recordsOf(gameId).map(def => h('div', {class: 'rec-block'}, h('b', null, recordTitle(def)),
    def.level === false ? row(def, null) : levelsOf(profile, gameId).map(level => row(def, level))));
  const s = sheet({title: app.gameTitle(gameId), body: [
    h('div', {class: 'ach-detail'}, medal({game: gameId, icon: gameId, group: 'bests'}, {tier: 2, earned: Boolean(headline(profile, gameId)), size: 80}),
      h('p', {class: 'muted small'}, t('A record is set in training and in free play, on each level separately. Test tasks set no records.',
        'Рекорд ставится в тренировке и в свободной игре, на каждом уровне отдельно. Задания теста рекордов не ставят.'))),
    ...blocks],
    actions: [h('button', {class: 'btn btn-primary btn-block', onclick: () => s.close()}, t('Got it', 'Понятно'))]});
}

// The tile of one game: the medal, the name, the value of its main record and the level it was set on.
function tile(app, gameId, profile) {
  const top = headline(profile, gameId);
  return h('button', {class: `ach-tile rec-tile${top ? ' earned' : ''}`, onclick: () => recordSheet(app, gameId, profile)},
    medal({game: gameId, icon: gameId, group: 'bests'}, {tier: 2, earned: Boolean(top), size: 58}),
    h('b', null, app.gameTitle(gameId)),
    h('span', {class: 'rec-val num'}, top ? recordValue(top.def, top.entry.v) : '—'),
    h('span', {class: 'tiny muted'}, top ? (top.level ? app.diffLabel(top.level) : top.def.short ? t(top.def.short[0], top.def.short[1]) : recordTitle(top.def)) : t('no record yet', 'рекорда нет')));
}

// Brain Power and Brain Mark: the best value of the history, with its date.
function overall(name, ic, value, date) {
  return h('div', {class: `ach-tile rec-tile${value ? ' earned' : ''}`},
    medal({icon: ic, group: 'mark'}, {tier: 2, earned: Boolean(value), size: 58}),
    h('b', null, name), h('span', {class: 'rec-val num'}, value ? fmt(Math.round(value)) : '—'),
    h('span', {class: 'tiny muted'}, value && date ? dateOf(Date.parse(`${date}T12:00:00`)) : t('no record yet', 'рекорда нет')));
}

// The group «Record book» of the achievements tab.
export function recordBook(app, panel, profile) {
  const bp = [...(profile.history || [])].sort((a, b) => b.score - a.score)[0];
  const bm = [...(profile.tests || [])].sort((a, b) => b.bm - a.bm)[0];
  panel.append(
    h('h2', {class: 'section-title ach-group-title'}, h('span', {class: 'ach-group-icon', style: '--grp:#c98a00'}, icon('trophy')),
      t('Record book', 'Книга рекордов'), h('span', {class: 'pill'}, String(recordCount(profile) + (bp ? 1 : 0) + (bm ? 1 : 0)))),
    h('p', {class: 'small muted rec-note'}, t('Your best results. A record has no last step: beat it, and the book shows the new one.',
      'Ваши лучшие результаты. У рекорда нет последней ступени: побейте его — и в книге появится новый.')),
    h('div', {class: 'ach-grid'}, overall('Brain Power', 'spark', bp?.score, bp?.date), overall('Brain Mark', 'target', bm?.bm, bm?.date),
      TRAINING_ORDER.map(id => tile(app, id, profile))));
}
