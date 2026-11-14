import { h, fmt } from '../core/dom.js';
import { icon, logo } from '../core/icons.js';
import { sheet, confirmDialog, promptDialog, toast } from '../ui/overlay.js';
import { storage, PROFILE_COLORS } from '../storage.js';
import { i18n, ENDONYMS } from '../i18n.js';
import { audio } from '../audio.js';
import { APP_VERSION } from '../version.js';

const CREDIT_URL = 'https://chushkin.github.io/brain-evolution/v1/';
const AUTHOR_URL = 'https://github.com/chushkin';
// The developer of this version (v2).
const DEV_URL = 'https://github.com/MiG-Kharkov';

// A save did not get into the browser (storage.js save): the toast of app.js and the note of the Data block.
export const saveFailedText = () => i18n.t('Progress is not being saved: the browser storage is full or unavailable. Keep a copy: Profile → Export progress.',
  'Прогресс не сохраняется: в памяти браузера нет места или она недоступна. Сохраните копию: Профиль → «Экспорт прогресса».');

export function renderProfile(app, main) {
  const t = app.t, profile = storage.getProfile(), settings = storage.getSettings();
  app.setTop({title: t('Profile', 'Профиль')});
  const index = app.testIndex();

  const current = h('section', {class: 'card'},
    h('div', {class: 'row'}, h('span', {class: 'avatar lg', style: {background: profile.color}}, profile.name.slice(0, 1).toUpperCase()),
      h('div', {class: 'stack', style: {gap: '2px', flex: 1, minWidth: 0}}, h('h2', {style: {fontSize: 'var(--fs-xl)', overflowWrap: 'anywhere'}}, profile.name),
        h('span', {class: 'small muted'}, index.value === null ? t('No test yet', 'Тестов пока нет') : app.rankName(index.rank))),
      h('button', {class: 'icon-btn', 'aria-label': t('Edit profile', 'Изменить профиль'), onclick: () => editProfile(app, profile)}, icon('edit'))),
    h('div', {class: 'grid-3'},
      h('div', {class: 'stat'}, h('span', {class: 'stat-value num'}, fmt(profile.brainScore)), h('span', {class: 'stat-label'}, 'Brain Power')),
      h('div', {class: 'stat'}, h('span', {class: 'stat-value num'}, index.value === null ? '—' : fmt(index.shown)), h('span', {class: 'stat-label'}, 'Brain Mark')),
      h('div', {class: 'stat'}, h('span', {class: 'stat-value num'}, fmt(profile.trainingDays)), h('span', {class: 'stat-label'}, t('Training days', 'Дней тренировок')))));

  const others = storage.listProfiles();
  const profiles = h('section', {class: 'stack'}, h('h2', {class: 'section-title'}, t('Profiles', 'Профили')),
    h('div', {class: 'list'}, others.map(p => h('div', {class: 'list-row'},
      h('span', {class: 'avatar', style: {background: p.color}}, p.name.slice(0, 1).toUpperCase()),
      h('span', {class: 'lr-main'}, h('span', {class: 'lr-title'}, p.name), h('span', {class: 'lr-sub'}, `Brain Power ${p.brainScore} · ${t('Days', 'Дней')} ${p.trainingDays}`)),
      p.id === profile.id ? h('span', {class: 'pill accent'}, t('Active', 'Активный'))
        : h('button', {class: 'btn btn-outline', style: {minHeight: '36px'}, onclick: () => { storage.selectProfile(p.id); toast(t('Profile: ', 'Профиль: ') + p.name); app.render(); }}, t('Switch', 'Выбрать')),
      others.length > 1 ? h('button', {class: 'icon-btn', 'aria-label': `${t('Delete', 'Удалить')} ${p.name}`, onclick: async () => {
        if (await confirmDialog({title: `${t('Delete', 'Удалить')} «${p.name}»?`, text: t('All progress of this profile will be lost. Export a backup first if you need it.', 'Весь прогресс этого профиля будет удалён. При необходимости сначала сохраните резервную копию.'), ok: t('Delete', 'Удалить'), danger: true})) {
          storage.deleteProfile(p.id); app.render();
        }
      }}, icon('trash')) : null)),
    h('button', {class: 'list-row', onclick: () => addProfile(app)}, h('span', {class: 'avatar', style: {background: 'var(--surface-2)', color: 'var(--ink)'}}, icon('plus')),
      h('span', {class: 'lr-main'}, h('span', {class: 'lr-title'}, t('Add profile', 'Добавить профиль'))))));

  const theme = settings.theme || 'system';
  const settingsCard = h('section', {class: 'stack'}, h('h2', {class: 'section-title'}, t('Settings', 'Настройки')),
    h('div', {class: 'list'},
      h('button', {class: 'list-row', onclick: () => app.languageSheet()}, icon('globe'), h('span', {class: 'lr-main'}, h('span', {class: 'lr-title'}, t('Language', 'Язык')), h('span', {class: 'lr-sub'}, ENDONYMS[i18n.getLang()])), icon('chevron')),
      h('div', {class: 'list-row'}, icon('palette'), h('span', {class: 'lr-main'}, h('span', {class: 'lr-title'}, t('Theme', 'Тема')),
        h('div', {class: 'segmented', style: {marginTop: '6px'}}, [['system', 'Auto', 'Авто'], ['light', 'Light', 'Светлая'], ['dark', 'Dark', 'Тёмная']].map(([k, en, ru]) =>
          h('button', {'aria-pressed': theme === k, onclick: () => { storage.updateSettings(s => { s.theme = k; }); app.applyTheme(); app.render(); }}, t(en, ru)))))),
      h('label', {class: 'list-row', for: 'set-sound'}, icon(settings.sound ? 'sound' : 'mute'), h('span', {class: 'lr-main'}, h('span', {class: 'lr-title'}, t('Sound', 'Звук'))),
        h('span', {class: 'switch'}, h('input', {type: 'checkbox', id: 'set-sound', checked: settings.sound, onchange: e => { storage.updateSettings(s => { s.sound = e.target.checked; }); audio.play('click'); app.render(); }}), h('span'))),
      h('div', {class: 'list-row'}, h('span', {class: 'lr-main'}, h('label', {class: 'lr-title', for: 'set-volume'}, t('Volume', 'Громкость')),
        h('input', {type: 'range', id: 'set-volume', min: 0, max: 1, step: 0.1, value: settings.volume ?? 0.8, disabled: !settings.sound,
          onchange: e => { storage.updateSettings(s => { s.volume = Number(e.target.value); }); audio.play('click'); }})))));

  const fileInput = h('input', {type: 'file', accept: 'application/json,.json', hidden: true, onchange: e => importFile(app, e.target.files?.[0])});
  const data = h('section', {class: 'stack'}, h('h2', {class: 'section-title'}, t('Data', 'Данные')),
    storage.failed ? h('p', {class: 'small save-failed', role: 'alert'}, saveFailedText()) : null,
    h('div', {class: 'list'},
      h('button', {class: 'list-row', onclick: () => exportFile(app)}, icon('download'), h('span', {class: 'lr-main'}, h('span', {class: 'lr-title'}, t('Export progress', 'Экспорт прогресса')),
        h('span', {class: 'lr-sub'}, t('Save all profiles to a file', 'Сохранить все профили в файл')))),
      h('button', {class: 'list-row', onclick: () => fileInput.click()}, icon('upload'), h('span', {class: 'lr-main'}, h('span', {class: 'lr-title'}, t('Import progress', 'Импорт прогресса')),
        h('span', {class: 'lr-sub'}, t('Load profiles from a backup file', 'Загрузить профили из резервной копии'))))),
    h('p', {class: 'tiny faint'}, t('Progress is kept in this browser only. Export it to move to another device or to keep a backup.', 'Прогресс хранится только в этом браузере. Экспорт поможет перенести его на другое устройство или сохранить копию.')),
    h('p', {class: 'tiny faint'}, t('The file holds the profiles with all their results, the version of the app, the screen size and the browser of the device.', 'В файле — профили со всеми результатами, версия приложения, размер экрана и браузер устройства.')),
    fileInput);

  // About: the app and who made it — the developer of this version and the web version it is based on.
  const about = h('section', {class: 'stack'}, h('h2', {class: 'section-title'}, t('About', 'О программе')),
    h('div', {class: 'list'},
      h('button', {class: 'list-row', onclick: () => app.go('about')}, h('span', {style: {display: 'flex'}}, logo(36)),
        h('span', {class: 'lr-main'}, h('span', {class: 'lr-title'}, 'Brain Evolution'), h('span', {class: 'lr-sub'}, `${t('Version', 'Версия')} ${APP_VERSION} · ${t('authors and links', 'авторы и ссылки')}`)), icon('chevron')),
      h('a', {class: 'list-row plain', href: DEV_URL, target: '_blank', rel: 'noopener'}, icon('user'),
        h('span', {class: 'lr-main'}, h('span', {class: 'lr-title'}, t('Igor Manzhos', 'Игорь Манжос')),
          h('span', {class: 'lr-sub'}, t('This version: redesign, rebalancing, new features', 'Эта версия: переработка, балансировка, новые возможности'))), icon('chevron')),
      h('a', {class: 'list-row plain', href: CREDIT_URL, target: '_blank', rel: 'noopener'}, icon('globe'),
        h('span', {class: 'lr-main'}, h('span', {class: 'lr-title'}, t('Yevhen Chushkin', 'Евгений Чушкин')),
          h('span', {class: 'lr-sub'}, t('The web version Amaze Brain Evolution, the basis of this version', 'Веб-версия Amaze Brain Evolution — основа этой версии'))), icon('chevron'))));

  main.replaceChildren(current, profiles, settingsCard, data, about);
}

// Name and colour of a profile in one sheet.
export function editProfile(app, profile) {
  const t = app.t;
  let color = profile.color;
  const input = h('input', {class: 'input', id: 'profile-name', value: profile.name, maxlength: 40, autocomplete: 'off'});
  const swatches = h('div', {class: 'swatches', role: 'radiogroup', 'aria-label': t('Colour', 'Цвет')});
  const draw = () => swatches.replaceChildren(...PROFILE_COLORS.map((c, i) => h('button', {class: 'swatch', role: 'radio', 'aria-checked': c === color, 'aria-label': `${t('Colour', 'Цвет')} ${i + 1}`,
    style: {background: c}, onclick: () => { color = c; draw(); }})));
  draw();
  const save = () => {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    if (name !== profile.name) storage.renameProfile(profile.id, name);
    if (color !== profile.color) storage.setProfileColor(profile.id, color);
    s.close(); app.render();
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
  const s = sheet({title: t('Edit profile', 'Изменить профиль'), body: [
    h('div', {class: 'field'}, h('label', {for: 'profile-name'}, t('Name', 'Имя')), input),
    h('div', {class: 'field'}, h('label', null, t('Colour', 'Цвет')), swatches)],
  actions: [h('button', {class: 'btn btn-primary btn-block', onclick: save}, t('Save', 'Сохранить'))]});
  requestAnimationFrame(() => input.focus());
}

export async function addProfile(app) {
  const t = app.t;
  const name = await promptDialog({title: t('New profile', 'Новый профиль'), label: t('Name', 'Имя'), ok: t('Create', 'Создать')});
  if (!name) return;
  storage.createProfile(name);
  toast(`${t('Profile created and selected', 'Профиль создан и выбран')}: ${name}`);
  app.render();
}

function exportFile(app) {
  const t = app.t;
  const blob = new Blob([storage.exportJSON()], {type: 'application/json'});
  const a = h('a', {href: URL.createObjectURL(blob), download: `brain-evolution-${new Date().toISOString().slice(0, 10)}.json`});
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(t('Backup saved', 'Резервная копия сохранена'));
}

async function importFile(app, file) {
  const t = app.t;
  if (!file) return;
  let text;
  try { text = await file.text(); JSON.parse(text); } catch { toast(t('This file is not a backup.', 'Этот файл не резервная копия.')); return; }
  const s = sheet({title: t('Import progress', 'Импорт прогресса'), body: [h('p', {class: 'muted'}, t('Add the profiles from the file to the current ones, or replace all data with the file?', 'Добавить профили из файла к текущим или заменить все данные файлом?'))],
    actions: [
      h('button', {class: 'btn btn-primary btn-block', onclick: () => run('merge')}, t('Add profiles', 'Добавить профили')),
      h('button', {class: 'btn btn-danger btn-block', onclick: () => run('replace')}, t('Replace everything', 'Заменить всё')),
      h('button', {class: 'btn btn-ghost btn-block', onclick: () => s.close()}, t('Cancel', 'Отмена'))]});
  function run(mode) {
    s.close();
    try { const n = storage.importJSON(text, mode); toast(`${t('Profiles imported', 'Импортировано профилей')}: ${n}`); app.applyTheme(); app.render(); }
    catch (error) { toast(`${t('Import failed', 'Импорт не удался')}: ${error.message}`); }
  }
}

export function renderAbout(app, main) {
  const t = app.t;
  app.setTop({title: t('About', 'О программе'), back: 'profile'});
  const link = (href, ic, title, sub) => h('a', {class: 'list-row', href, target: '_blank', rel: 'noopener'}, icon(ic),
    h('span', {class: 'lr-main'}, h('span', {class: 'lr-title'}, title), h('span', {class: 'lr-sub'}, sub)));
  const person = (name, role, text, links) => h('section', {class: 'card'},
    h('div', {class: 'stack', style: {gap: '2px'}}, h('span', {class: 'card-kicker'}, role), h('h3', null, name)),
    h('p', {class: 'small'}, text),
    h('div', {class: 'list', style: {boxShadow: 'none', border: '1px solid var(--line)'}}, links));
  main.replaceChildren(h('section', {class: 'card', style: {alignItems: 'center', textAlign: 'center'}},
    logo(72), h('h2', {style: {fontSize: 'var(--fs-xxl)'}}, 'Brain Evolution'), h('span', {class: 'pill'}, `${t('Version', 'Версия')} ${APP_VERSION}`),
    h('p', {class: 'muted'}, t('Twelve brain-training games, a daily training programme and a five-game test of your Brain Mark.', 'Двенадцать развивающих игр, ежедневная программа тренировок и тест Brain Mark из пяти игр.')),
    h('p', {class: 'small'}, t('Developed by Igor Manzhos, based on the web version by Yevhen Chushkin.', 'Разработка — Игорь Манжос, на основе веб-версии Евгения Чушкина.'))),
  person(t('Igor Manzhos', 'Игорь Манжос'), t('This version', 'Эта версия'),
    t('Author of this version: redesign, rebalancing and extended functionality.', 'Автор этой версии: переработка, балансировка и расширение функциональности.'),
    [link(DEV_URL, 'user', t('Igor Manzhos on GitHub', 'Игорь Манжос на GitHub'), DEV_URL.replace(/^https:\/\//, ''))]),
  person(t('Yevhen Chushkin', 'Евгений Чушкин'), t('The basis', 'Основа'),
    t('Restored the original game and released its web version, Amaze Brain Evolution. This version is based on it and made with the author’s agreement.',
      'Восстановил оригинальную игру и выпустил её веб-версию Amaze Brain Evolution. Эта версия основана на ней и создана с согласия автора.'),
    [link(CREDIT_URL, 'globe', t('Original web version', 'Исходная веб-версия'), CREDIT_URL.replace(/^https:\/\//, '')),
      link(AUTHOR_URL, 'user', t('Yevhen Chushkin on GitHub', 'Евгений Чушкин на GitHub'), AUTHOR_URL.replace(/^https:\/\//, ''))]),
  // The original: SPB Brain Evolution by SPB Software (St. Petersburg); the team is the game's own credits (shell.about_text).
  h('section', {class: 'card'}, h('div', {class: 'stack', style: {gap: '2px'}}, h('span', {class: 'card-kicker'}, t('The original game', 'Исходная игра')), h('h3', null, 'SPB Brain Evolution')),
    h('p', {class: 'small'}, t('The original game by SPB Software: released in 2008 for Windows Mobile, followed by Brain Evolution 2 for Symbian, iPhone, Android and Windows Phone. Its support ended long ago, so it was restored as a web version.',
      'Оригинальная игра SPB Software: вышла в 2008 году для Windows Mobile, затем Brain Evolution 2 — для Symbian, iPhone, Android и Windows Phone. Поддержка игры давно прекращена, поэтому её восстановили в виде веб-версии.'))));
}
