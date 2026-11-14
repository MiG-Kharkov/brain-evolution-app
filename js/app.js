// Brain Evolution v2 — app shell: routing, top bar, tab bar, profile and language switchers, game
// sessions for free play, training and the test. Based on the web version by Yevhen Chushkin.
import { audio } from './audio.js';
import { storage } from './storage.js';
import { i18n, t, ENDONYMS } from './i18n.js';
import { loadOriginalConfig } from './original.js';
import { h, svg, mount, fmt } from './core/dom.js';
import { icon, logo, rankIcon } from './core/icons.js';
import { sheet, closeAllSheets, toast } from './ui/overlay.js';
import { gameIcon } from './ui/components.js';
import { recordTraining, recordMarking, currentTestItem, noteTestRestart, startMarking, startTraining, testIndex, freePlayAccess, testLevel, playFacts } from './progression.js';
import { HELP_KEYS, DIFF_LABEL } from './games/restored-game.js';
import { rulesText, demoBlock } from './ui/demos.js';
import { ensureStats, noteGame, noteTraining, noteLeft, checkAchievements, earnedCount, currentStreak } from './achievements.js';
import { celebrate, achTitle, achDesc } from './ui/achievements-ui.js';
import { noteRecords } from './records.js';
import { recordTitle, recordLine } from './ui/records-ui.js';
import { SCREENS } from './screens/index.js';
import { addProfile, saveFailedText } from './screens/profile.js';
import { factText, brainPowerSheet } from './screens/progress.js';

import { SudokuGame } from './games/sudoku.js';
import { MatchesGame } from './games/matches.js';
import { PairsGame } from './games/pairs.js';
import { QuadronicaGame } from './games/quadronica.js';
import { NumbersGame } from './games/numbers.js';
import { ArithmeticsGame } from './games/arithmetics.js';
import { MinesweeperGame } from './games/minesweeper.js';
import { RoadblocksGame } from './games/roadblocks.js';
import { GuessWhoGame } from './games/guess_who.js';
import { MemoricsGame } from './games/memorics.js';
import { GeometryGame } from './games/geometry.js';
import { EncyclopediaGame } from './games/encyclopedia.js';

const GAME_CLASSES = {sudoku: SudokuGame, matches: MatchesGame, pairs: PairsGame, quadronica: QuadronicaGame, numbers: NumbersGame,
  arithmetics: ArithmeticsGame, minesweeper: MinesweeperGame, roadblocks: RoadblocksGame, guess_who: GuessWhoGame,
  memorics: MemoricsGame, geometry: GeometryGame, encyclopedia: EncyclopediaGame};
const TABS = [['home', 'home', 'Home', 'Главная'], ['games', 'games', 'Games', 'Игры'], ['progress', 'progress', 'Progress', 'Прогресс'], ['profile', 'user', 'Profile', 'Профиль']];
export const RANK_NAMES = {1: ['Child', 'Ребёнок'], 2: ['Schoolboy', 'Школьник'], 3: ['Student', 'Студент'], 4: ['Intern', 'Аспирант'],
  5: ['PhD', 'Кандидат наук'], 6: ['Professor', 'Профессор'], 7: ['Nobel Prize-winner', 'Нобелевский лауреат']};

class App {
  constructor() {
    this.games = [];
    this.facts = [];
    this.jokes = [];
    this.session = null;
    this.game = null;
    this.route = '';
  }

  async init() {
    this.applyTheme();
    const firstRun = Boolean(storage.data.fresh);   // i18n.init() saves the settings, which clears the flag
    await i18n.init();
    if (firstRun && storage.getProfile().name === 'Player 1') storage.updateProfile(p => { p.name = `${t('Player', 'Игрок')} 1`; });
    const [config, games, facts, jokes] = await Promise.all([loadOriginalConfig(),
      fetch('data/minigames.json').then(r => r.json()), fetch('data/facts.json').then(r => r.json()).catch(() => []),
      fetch('data/jokes.json').then(r => r.json()).catch(() => [])]);
    this.config = config; this.games = games; this.facts = facts; this.jokes = jokes;
    config.factsTotal = facts.length;   // progression.js opens facts up to the end of the list
    config.jokesTotal = jokes.length;   // and a joke with every fact, up to the end of the jokes
    this.root = document.getElementById('app');
    this.top = h('header', {class: 'topbar'});
    this.main = h('main', {class: 'main', id: 'main', tabindex: '-1'});
    this.tabs = h('nav', {class: 'tabbar', 'aria-label': t('Sections', 'Разделы')});
    mount(this.root, this.top, this.main, this.tabs);
    window.addEventListener('hashchange', () => this.render());
    window.addEventListener('scroll', () => this.top.classList.toggle('scrolled', window.scrollY > 4), {passive: true});
    // The tab bar is fixed to the bottom of the screen. On a phone it could stay in the middle of the screen after
    // the page under it changed its size (owner, 3.6: «the bottom menu floats to the middle after some events»; not
    // reproduced in Chrome). The browser places a fixed bar again when the bar is put back into the page, so that is
    // done after every screen and whenever the size of the screen changes: the phone was turned and turned back,
    // the app came back from the background. A two-finger zoom (two thumbs tapping at once) is switched off as well:
    // on a zoomed page fixed bars stay where the unzoomed page has them.
    for (const type of ['resize', 'orientationchange', 'pageshow']) window.addEventListener(type, () => this.pinTabs(true));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.pinTabs(true); });
    for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, event => event.preventDefault());
    audio.init(); // starts suspended; the first tap wakes it (audio.js)
    storage.onChange(source => {
      if (source === 'external' && !this.game) this.render();
      // A save did not get into the browser (storage.js save): said once per start, the Profile keeps the note.
      if (source === 'failed' && !this.saveWarned) { this.saveWarned = true; toast(saveFailedText(), 9000); }
    });
    for (const type of ['resize', 'orientationchange']) window.addEventListener(type, () => this.fitRank());
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => this.applyTheme());
    document.getElementById('splash')?.remove();
    this.rotateLock();
    this.render();
  }

  // Portrait only (see .rotate-lock in app.css): the cover asks to turn the phone; a running game pauses.
  rotateLock() {
    const text = () => t('Turn your phone upright', 'Поверните телефон вертикально');
    if (!this.rotateEl) {
      const phone = svg('svg', {viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'aria-hidden': 'true'},
        svg('rect', {x: 7, y: 2.5, width: 10, height: 19, rx: 2.5}), svg('path', {d: 'M11 18.5h2'}));
      this.rotateEl = h('div', {class: 'rotate-lock', role: 'alert'}, phone, h('p', null, text()));
      document.body.append(this.rotateEl);
      const sideways = matchMedia('(orientation: landscape) and (max-height: 540px) and (pointer: coarse)');
      sideways.addEventListener?.('change', () => { if (sideways.matches && this.game?.playable) this.game.menu(); });
      try { screen.orientation?.lock?.('portrait').catch(() => {}); } catch (e) { /* not supported */ }
    }
    this.rotateEl.querySelector('p').textContent = text();
  }

  // Puts the tab bar back into the page so that the browser places it at the bottom again (see init()).
  pinTabs(later = false) {
    const pin = () => { if (!this.tabs.hidden && !this.tabs.contains(document.activeElement)) this.root.append(this.tabs); };
    pin();
    if (later) { clearTimeout(this.pinTimer); this.pinTimer = setTimeout(pin, 350); }
  }

  // ---------- helpers used by screens ----------
  t(en, ru) { return t(en, ru); }
  meta(id) { return this.games.find(g => g.id === id) || {id, title: {en: id, ru: id}, desc: {}, category: {}}; }
  gameTitle(id) { const m = this.meta(id); return i18n.getLang() === 'ru' ? m.title.ru : i18n.t(m.title.en); }
  gameCategory(id) { const m = this.meta(id); return i18n.getLang() === 'ru' ? m.category?.ru : i18n.t(m.category?.en || ''); }
  gameDesc(id) {
    const own = rulesText(id);
    if (own) return own;
    const help = this.config.games[HELP_KEYS[id]];
    const text = help?.['2_value'] ? i18n.t(help['2_value']).replace(/\\n/g, '\n').replace(/@\w+/g, '').trim() : '';
    if (text) return text;
    return this.gameShortDesc(id);
  }
  gameShortDesc(id) {
    const m = this.meta(id), lang = i18n.getLang();
    return m.desc?.[lang] || (m.desc?.en ? (lang === 'en' ? m.desc.en : i18n.t(m.desc.en)) : '');
  }
  diffLabel(d) { return DIFF_LABEL()[d] || d; }
  rankName(rank) { const [en, ru] = RANK_NAMES[rank] || RANK_NAMES[1]; return t(en, ru); }
  testIndex() { return testIndex(storage.getProfile(), this.config); }
  go(path) { const target = `#/${path}`; if (location.hash === target) this.render(); else location.hash = target; }
  back(fallback = 'home') { if (history.length > 1 && this.lastRoute) history.back(); else this.go(fallback); }

  applyTheme() {
    const theme = storage.getSettings().theme || 'system';
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = theme;
  }

  // ---------- routing ----------
  render() {
    const path = location.hash.replace(/^#\/?/, '') || 'home';
    const [name, ...rest] = path.split('/');
    // The system "back" (or any link) during play does not drop the game: it opens the pause menu, which has Exit.
    // Pressed again while the menu is open, it leaves the game.
    if (this.game && name !== 'session' && !this.game.finished && !this.game.destroyed && !this.game.isPaused) {
      history.pushState(null, '', '#/session');
      this.game.menu();
      return;
    }
    closeAllSheets();
    clearInterval(this.homeTimer);                                  // Home changes its fact and joke on a timer
    if (this.fresh?.shown && name !== 'home') this.fresh = null;    // the pair a training opened was shown on Home
    if (this.game && name !== 'session') this.leaveGame();
    this.lastRoute = this.route; this.route = path;
    if (name === 'session') return this.renderSession();
    if (name === 'play') return this.freePlay(rest[0], rest[1] || 'easy');
    this.syncAchievements();
    this.achievementsNow();
    const screen = SCREENS[name] || SCREENS.home;
    this.top.hidden = false; this.tabs.hidden = false;
    this.main.className = 'main';
    this.renderTabs(screen.tab || name);
    window.scrollTo(0, 0);
    screen.render(this, this.main, rest);
    this.pinTabs(true);
    const after = this.after; this.after = null;
    after?.();
  }

  // The top bar. Home (status): the level (rank) on the left, the streak and the achievements as icons, the profile.
  // Other screens: back + title + profile. The language lives in Profile (it is set once).
  setTop({title = '', back = null, status = false} = {}) {
    const profile = storage.getProfile();
    const avatar = h('button', {class: 'avatar-btn', 'aria-label': `${t('Profile', 'Профиль')}: ${profile.name}`, onclick: () => this.profileSheet()},
      h('span', {class: 'avatar', style: {background: profile.color}}, (profile.name || '?').trim().slice(0, 1).toUpperCase()));
    if (status) {
      const index = this.testIndex(), streak = currentStreak(profile), earned = earnedCount(profile);
      const rank = index.value === null ? null : index.rank;
      mount(this.top,
        h('button', {class: 'status-rank', 'aria-label': t('Level', 'Уровень'), onclick: () => this.go(rank ? 'progress/trends' : 'test')},
          h('span', {class: 'rank-badge sm'}, rankIcon(rank || 1, 22)),
          h('span', {class: 'sr-text'}, h('b', null, rank ? this.rankName(rank) : t('New player', 'Новый игрок')),
            h('span', null, rank ? t('Rank @R of 7', 'Ранг @R из 7').replace('@R', rank) : t('Take the test', 'Пройдите тест')))),
        h('button', {class: `status-chip streak${streak.today ? ' on' : streak.days ? ' alive' : ''}`, onclick: () => this.go('progress/calendar'),
          'aria-label': `${t('Days in a row', 'Дней подряд')}: ${streak.days}`, title: t('Days in a row', 'Дней подряд')}, icon('flame', 18), h('b', null, String(streak.days))),
        h('button', {class: 'status-chip', onclick: () => this.go('progress/awards'),
          'aria-label': `${t('Achievements', 'Достижения')}: ${earned}`, title: t('Achievements', 'Достижения')}, icon('medal', 18), h('b', null, String(earned))),
        avatar);
      this.fitRank();
      return;
    }
    mount(this.top,
      back ? h('button', {class: 'icon-btn', 'aria-label': t('Back', 'Назад'), onclick: () => (typeof back === 'string' ? this.go(back) : this.back())}, icon('back')) : null,
      h('h1', {class: 'topbar-title'}, title),
      avatar);
  }

  // The rank name of the top bar is never cut (3.11.3). The chips next to it grow with the streak and the
  // achievements (146 of them, a streak of 365), and «Nobel Prize-winner» is long in every language, so the room is
  // measured, step by step: a smaller type on one line; the chips and the badge made tighter; two lines in place of
  // «Rank N of 7»; at the very end a break inside a word.
  fitRank() {
    const b = this.top.querySelector('.status-rank .sr-text b');
    this.top.classList.remove('tight');
    if (!b) return;
    const box = b.parentNode, fits = () => b.scrollWidth <= b.clientWidth + 0.5 && b.scrollHeight <= b.clientHeight + 1;
    box.classList.remove('two'); b.style.fontSize = ''; b.style.overflowWrap = ''; b.style.hyphens = '';
    const base = Math.round(parseFloat(getComputedStyle(b).fontSize)) || 18;
    const shrink = (from, to) => { for (let size = from; size >= to; size--) { b.style.fontSize = `${size}px`; if (fits()) return true; } return false; };
    if (fits() || shrink(base - 1, 16)) return;
    this.top.classList.add('tight'); b.style.fontSize = '';
    if (fits() || shrink(base - 1, 15)) return;
    box.classList.add('two');
    if (shrink(Math.min(base, 16), 11)) return;
    b.style.hyphens = 'auto'; b.style.overflowWrap = 'anywhere';   // one word wider than the room: «Nobelpreis-gewinner»
    shrink(14, 11);
  }

  renderTabs(current) {
    mount(this.tabs, TABS.map(([route, ic, en, ru]) => h('button', {class: 'tab', 'aria-current': current === route ? 'page' : null,
      onclick: () => this.go(route)}, icon(ic), t(en, ru))));
  }

  // ---------- switchers ----------
  languageSheet() {
    const current = i18n.getLang();
    const s = sheet({title: t('Language', 'Язык'), body: [h('div', {class: 'list'}, Object.entries(ENDONYMS).map(([code, name]) =>
      h('button', {class: 'list-row', 'aria-pressed': code === current, onclick: async () => {
        s.close(); await i18n.setLang(code); this.rotateLock(); this.render();
      }}, h('span', {class: 'lr-main'}, h('span', {class: 'lr-title'}, name), h('span', {class: 'lr-sub'}, code.toUpperCase())),
      code === current ? icon('check') : null)))]});
  }

  profileSheet() {
    const active = storage.getProfile();
    const rows = storage.listProfiles().map(p => h('button', {class: 'list-row', onclick: () => {
      s.close(); storage.selectProfile(p.id); toast(t('Profile: ', 'Профиль: ') + p.name); this.render();
    }}, h('span', {class: 'avatar', style: {background: p.color}}, p.name.slice(0, 1).toUpperCase()),
    h('span', {class: 'lr-main'}, h('span', {class: 'lr-title'}, p.name), h('span', {class: 'lr-sub'}, `${t('Brain Power', 'Brain Power')} ${p.brainScore} · ${t('Days', 'Дней')} ${p.trainingDays}`)),
    p.id === active.id ? icon('check') : null));
    const s = sheet({title: t('Profiles', 'Профили'), body: [h('div', {class: 'list'}, rows,
      h('button', {class: 'list-row', onclick: () => { s.close(); addProfile(this); }}, h('span', {class: 'avatar', style: {background: 'var(--surface-2)', color: 'var(--ink)'}}, icon('plus')),
        h('span', {class: 'lr-main'}, h('span', {class: 'lr-title'}, t('Add profile', 'Добавить профиль')))))], actions: [
      h('button', {class: 'btn btn-block', onclick: () => { s.close(); this.go('profile'); }}, icon('edit'), t('Manage profiles', 'Управление профилями'))]});
  }

  // ---------- games ----------
  freePlay(gameId, difficulty) {
    if (!GAME_CLASSES[gameId]) return this.go('games');
    difficulty = {med: 'medium', normal: 'medium'}[difficulty] || (['easy', 'medium', 'hard', 'ultra'].includes(difficulty) ? difficulty : 'easy');
    const access = freePlayAccess(storage.getProfile(), this.config, gameId);
    const level = ['easy', 'medium', 'hard', 'ultra'].indexOf(difficulty);
    if (!access.open || level > access.maxDiff) {
      toast(access.open ? t('This difficulty opens in training.', 'Эта сложность откроется в тренировке.') : t('This game opens in training.', 'Эта игра откроется в тренировке.'));
      history.replaceState(null, '', '#/games');
      return this.render();
    }
    this.session = {gameId, difficulty, mode: 'free', back: 'games'};
    history.replaceState(null, '', '#/session');
    this.renderSession();
  }

  launch(session) {
    this.session = {...session};
    if (location.hash === '#/session') this.renderSession(); else location.hash = '#/session';
  }

  renderSession() {
    const s = this.session;
    if (!s) return this.go('home');
    if (this.game) this.leaveGame();
    this.top.hidden = true; this.tabs.hidden = true;
    this.main.className = 'main no-tabs';
    this.main.style.padding = '0';
    mount(this.main);
    const container = h('div', {class: 'game-host'});
    this.main.append(container);
    const Game = GAME_CLASSES[s.gameId];
    const ctx = {mode: s.mode, difficulty: s.difficulty, level: s.level || s.difficulty, testStep: s.testStep || null, description: this.gameDesc(s.gameId),
      onResult: (score, details) => this.recordResult(s, score, details),
      onDone: outcome => this.afterGame(s, outcome),
      onExit: () => this.afterExit(s),
      onRestart: finished => { if (!finished) this.noteLeft(s, 'restart'); this.renderSession(); }};
    const game = new Game(container, ctx);
    game.mode = s.mode;
    this.game = game;
    Promise.resolve(game.init(s.difficulty)).then(() => this.firstRules(s, game)).catch(error => console.error('Game initialisation failed:', error));
  }

  // The first launch of a game on this device opens its rules (the test shows them in its intro).
  firstRules(s, game) {
    const seen = storage.getSettings().rulesSeen || [];
    if (s.mode === 'test' || seen.includes(s.gameId) || this.game !== game || !game.playable) return;
    storage.updateSettings(st => { st.rulesSeen = [...new Set([...(st.rulesSeen || []), s.gameId])]; });
    game.help();
  }

  leaveGame() {
    const game = this.game;
    this.game = null;
    this.main.style.padding = '';
    try { game?.destroy?.(); } catch (error) { console.warn(error); }
  }

  // Called when a game ends: records the result before the results sheet appears.
  // Achievements reached by now are marked without a pop-up: on the first run of v3.2 and for another profile.
  syncAchievements() {
    const profile = storage.getProfile();
    if (!profile || this.achProfile === profile.id) return;
    this.achProfile = profile.id;
    const first = !profile.stats?.v;
    ensureStats(profile);
    const earned = checkAchievements(profile, this.config);
    storage.save();
    if (first && earned.length) celebrate(this, [{summary: earnedCount(profile)}], 900);
  }

  // New achievements after a game, a training step or a test: listed in the results and shown as a pop-up.
  achievementsAfter(outcome) {
    for (const step of this.achievementsNow(700)) outcome.events.push({kind: 'ach', icon: 'medal', title: `${t('Achievement', 'Достижение')}: ${achTitle(step.a)}`, text: achDesc(this, step.a, step.goal)});
  }

  // Checks the achievements right now and celebrates the new ones (also called when the player does something outside
  // a game result: watches a rules example, opens a help sheet, comes to a screen). Returns the steps shown.
  achievementsNow(delay = 300) {
    const profile = storage.getProfile();
    if (!profile || !this.config || this.achProfile !== profile.id) return [];
    const earned = checkAchievements(profile, this.config);
    if (!earned.length) return [];
    storage.save();
    // Several steps of one achievement at once (hard flawless also gives easy and medium): only the highest is shown.
    const shown = Object.values(Object.fromEntries(earned.map(step => [step.a.id, step])));
    celebrate(this, shown, delay);
    return shown;
  }

  async recordResult(s, score, details) {
    // A test task is shown under the level it equals by content (progression.js testLevel), but it has its own length
    // and prices: it goes to the log of games and to the counters of games and points, and never to the records of a
    // level, the feats or the personal bests. Training and free play share the levels, so they share the records.
    const level = s.level || s.difficulty, test = s.mode === 'test';
    const before = test ? 0 : storage.getHighScore(s.gameId, null, level);
    const entry = storage.recordGameScore(s.gameId, score, level,
      {mode: s.mode, ...(Number.isFinite(details?.seconds) ? {sec: details.seconds} : {}), ...(Object.keys(playFacts(details?.feats)).length ? {play: playFacts(details.feats)} : {})});
    noteGame(storage.getProfile(), {gameId: s.gameId, difficulty: level, score, before, feats: test ? null : details?.feats});
    // The record book (js/records.js): every record this game has beaten is a line of the results, the first of
    // them (the main record of the game comes first) is also shown as a pop-up. A first result beats nothing.
    const beaten = test ? [] : noteRecords(storage.getProfile(), {gameId: s.gameId, level, score, before, feats: details?.feats, clock: details?.clock}).filter(r => r.prev !== null);
    const outcome = {newBest: beaten.some(r => r.def.score), events: beaten.map(r => ({kind: 'record', icon: 'trophy',
      title: `${t('New record', 'Новый рекорд')}: ${recordTitle(r.def)}`, text: recordLine(this, r)}))};
    if (beaten.length) celebrate(this, [{record: {game: s.gameId, title: `${this.gameTitle(s.gameId)}: ${recordTitle(beaten[0].def)}`, text: recordLine(this, beaten[0])}}], 600);
    if (s.mode === 'training') {
      const ev = await recordTraining(s.gameId, s.difficulty, score);
      s.events = ev;
      // The fact and the joke this training has just opened: Home shows them first (screens/home.js).
      if (ev.fact !== null && ev.fact !== undefined) this.fresh = {fact: ev.fact, joke: ev.joke};
      // What the game did in training, for the log: the threshold of that moment and the result.
      if (entry) { Object.assign(entry, ev.step?.up > 1 ? {up: ev.step.up} : {}, {res: ev.noEffect ? 'skip' : ev.step?.kind === 'up' ? 'up' : ev.step?.kind === 'down' ? 'weak' : 'none'}); storage.save(); }
      noteTraining(storage.getProfile(), ev, score);
      if (ev.noEffect) outcome.note = ev.reason === 'complete' ? t('This training is already complete, so the game did not count. Start a new training to count it.', 'Тренировка уже завершена, поэтому партия не пошла в зачёт. Начните новую тренировку.')
        : ev.reason === 'played' ? t('This game is already played in the current training, so it did not count.', 'Эта игра уже сыграна в текущей тренировке, поэтому партия не пошла в зачёт.')
        : ev.reason === 'difficulty' ? `${t('Only the current difficulty counts in training', 'В тренировке засчитывается только текущая сложность')}: ${this.diffLabel(ev.current)}.`
        : t('This result does not change the training progress.', 'Этот результат не влияет на прогресс тренировки.');
      const names = ids => ids.map(id => this.gameTitle(id)).join(', ');
      const step = ev.step;
      if (step?.closed) outcome.events.push({kind: 'champ', icon: 'trophy', title: t('Level closed', 'Уровень закрыт'),
        text: t('You are the Champion of this game: the bar is full and stays full. The game still counts for Brain Power and the records.',
          'Вы чемпион этой игры: шкала заполнена и больше не меняется. Партия по-прежнему идёт в Brain Power и в рекорды.')});
      else if (step && !ev.levelUp.length && !ev.regained.length && !ev.levelDown.length && !ev.champion.length) {
        const fill = (text, values) => Object.entries(values).reduce((out, [k, v]) => out.replaceAll(`@${k}`, v), text);
        const goal = step.next ? fill(t('the level @D', 'уровня «@D»'), {D: this.diffLabel(step.next)}) : t('the Champion award', 'награды «Чемпион»');
        const bar = ` · ${step.after}/${step.required}`;
        if (step.kind === 'up' && step.after > step.before) outcome.events.push({kind: 'up', icon: 'up', title: t('+1 step', '+1 деление') + bar,
          text: fill(t('Threshold @U reached. Good games left to @G: @L.', 'Порог @U пройден. До @G осталось удачных партий: @L.'), {U: fmt(step.up), G: goal, L: Math.max(0, step.required - step.after)})});
        else if (step.kind === 'none') outcome.events.push({kind: 'step', icon: 'info', title: t('The bar is unchanged', 'Шкала без изменений') + bar,
          text: fill(t('A step needs a score of at least @U.', 'Для деления нужен результат не меньше @U.'), {U: fmt(step.up)})});
        else if (step.kind === 'down' && step.after < step.before) outcome.events.push({kind: 'down', icon: 'down', title: t('Weak game: −1 step', 'Слабая партия: −1 деление') + bar,
          text: fill(t('A score under @D takes a step back.', 'Результат меньше @D снимает деление.'), {D: fmt(step.down)})});
        // A weak game is only a warning when the level could really drop soon (systematic failure); otherwise neutral.
        else if (step.kind === 'down' && step.canDrop && step.weakStreak >= Math.max(2, step.streak - 2)) outcome.events.push({kind: 'down', icon: 'down', title: t('Weak game', 'Слабая партия') + bar,
          text: fill(t('Weak games in a row: @K of @S. At @S in a row the difficulty goes down.', 'Слабых партий подряд: @K из @S. При @S подряд сложность понизится.'), {K: step.weakStreak, S: step.streak})});
        else if (step.kind === 'down') outcome.events.push({kind: 'step', icon: 'info', title: t('The bar is unchanged', 'Шкала без изменений') + bar,
          text: fill(t('A step needs a score of at least @U.', 'Для деления нужен результат не меньше @U.'), {U: fmt(step.up)})});
      }
      const newDiff = ['easy', 'medium', 'hard', 'ultra'][storage.getProfile().progress[s.gameId]?.difficulty || 0];
      if (ev.levelUp.length) outcome.events.push({kind: 'up', icon: 'up', title: t('Difficulty up!', 'Сложность повышена!'), text: `${names(ev.levelUp)}: ${this.diffLabel(newDiff)}`});
      if (ev.regained.length) outcome.events.push({kind: 'up', icon: 'up', title: t('Level regained', 'Уровень возвращён'), text: names(ev.regained)});
      if (ev.levelDown.length) outcome.events.push({kind: 'down', icon: 'down', title: t('Difficulty lowered', 'Сложность понижена'),
        text: t('@S very weak results in a row. Two good games bring the level back.', '@S совсем слабых партий подряд. Две удачные партии вернут уровень.').replace('@S', String(ev.step?.streak || 5))});
      if (ev.opened.length) outcome.events.push({kind: 'open', icon: 'spark', title: t('New game unlocked', 'Открыта новая игра'), text: names(ev.opened)});
      if (ev.champion.length) outcome.events.push({kind: 'champ', icon: 'trophy', title: t('Champion!', 'Чемпион!'),
        text: `${names(ev.champion)}. ${t('The top difficulty is passed, the level is closed.', 'Высшая сложность пройдена, уровень закрыт.')}`});
      if (ev.complete !== undefined) outcome.continueLabel = t('Finish training', 'Завершить тренировку');
    } else if (s.mode === 'test') {
      const res = await recordMarking(s.gameId, s.difficulty, score, {...details?.feats, seconds: details?.seconds});
      s.testResult = res;
      if (res.rejected) outcome.note = t('This game is not the current test task, so it is not counted.', 'Эта игра не текущее задание теста, она не засчитана.');
      else if (res.next) outcome.continueLabel = t('Next task', 'Следующее задание');
      else if (res.done) outcome.continueLabel = t('Test results', 'Результаты теста');
    }
    this.achievementsAfter(outcome);
    return outcome;
  }

  afterGame(s) {
    this.leaveGame();
    if (s.mode === 'training') {
      const ev = s.events;
      if (ev?.complete !== undefined) this.after = () => this.trainingCompleteSheet(ev);
      this.go('training');
    } else if (s.mode === 'test') {
      const res = s.testResult;
      if (res?.next) { this.after = () => this.testIntro(res.next); this.go('test'); }
      else if (res?.done) this.go(`test/result/${res.test.id}`);
      else this.go('test');
    } else this.go(s.back || 'games');
  }

  // A game left unfinished or started again from the pause menu: a counter for the balance (which levels are dropped).
  noteLeft(s, kind) {
    const ran = this.game?.startedAt ? Date.now() - this.game.startedAt : 0;
    if (ran < 10000) return;   // opened and closed: not an attempt
    noteLeft(storage.getProfile(), {...s, difficulty: s.level || s.difficulty}, kind);
    storage.save();
  }

  afterExit(s) {
    this.noteLeft(s, 'exit');
    this.leaveGame();
    this.go(s.mode === 'training' ? 'training' : s.mode === 'test' ? 'test' : s.back || 'games');
  }

  trainingCompleteSheet(ev) {
    audio.play('diffDone');
    const last = storage.getProfile().history.at(-1);
    const body = [h('p', {class: 'muted'}, t('Good job! In the next training every game counts again.', 'Отличная работа! В следующей тренировке все игры снова пойдут в зачёт.')),
      h('div', {class: 'result-hero'}, h('div', {class: 'card-kicker'}, t('Brain Power', 'Brain Power')), h('div', {class: 'big-number'}, String(ev.complete)),
        h('button', {class: 'btn btn-ghost btn-sm', onclick: () => brainPowerSheet(this)}, icon('info', 16), t('What Brain Power is made of', 'Из чего складывается Brain Power')))];
    if (last?.results) body.push(h('div', {class: 'results-list'}, Object.entries(last.results).map(([id, score]) =>
      h('div', {class: 'results-item'}, h('span', {class: 'ri-label'}, this.gameTitle(id)), h('span', {class: 'ri-val'}, fmt(score))))));
    if (ev.fact !== null && ev.fact !== undefined && this.facts[ev.fact]) {
      body.push(h('div', {class: 'event fact'}, icon('bulb'), h('div', null, h('b', null, t("It's interesting!", 'Это интересно!')),
        h('p', null, factText(this.facts[ev.fact])))));
    }
    if (ev.joke !== null && ev.joke !== undefined && this.jokes[ev.joke]) {
      body.push(h('div', {class: 'event fact'}, icon('smile'), h('div', null, h('b', null, t('Brainy humor', 'Умный юмор')),
        h('p', null, factText(this.jokes[ev.joke])))));
    }
    const s = sheet({title: t('Training complete!', 'Тренировка завершена!'), body,
      actions: [h('button', {class: 'btn btn-primary btn-block btn-lg', onclick: () => s.close()}, t('Great', 'Отлично')),
        h('button', {class: 'btn btn-block', onclick: async () => { s.close(); await startTraining(true); toast(t('New training started', 'Начата новая тренировка')); this.render(); }},
          icon('restart'), t('One more training', 'Ещё одна тренировка'))]});
  }

  // ---------- test ----------
  async startTest() {
    const profile = storage.getProfile();
    if (!profile.marking) await startMarking();
    this.testIntro(currentTestItem());
  }

  testIntro(item) {
    if (!item) return this.go('test');
    const s = sheet({title: `${t('Task', 'Задание')} ${item.index + 1} / ${item.total}`, body: [
      h('div', {class: 'row'}, gameIcon(item.gameId, 'lg'), h('div', {class: 'stack', style: {gap: '4px'}}, h('h3', {style: {fontSize: 'var(--fs-xl)'}}, this.gameTitle(item.gameId)),
        h('span', {class: 'pill accent'}, this.diffLabel(testLevel(this.config, item.gameId, item.difficulty))))),
      h('p', {class: 'help-text'}, this.gameDesc(item.gameId)),
      demoBlock(item.gameId),
      h('p', {class: 'small faint'}, t('The clock starts when you press Start.', 'Время пойдёт, когда вы нажмёте «Начать».'))],
    actions: [h('button', {class: 'btn btn-primary btn-block btn-lg', autofocus: true, onclick: () => {
      s.close();
      const m = storage.getProfile().marking;
      if (m && m.launched === m.index) noteTestRestart();
      storage.updateProfile(p => { if (p.marking) p.marking.launched = p.marking.index; });
      this.launch({gameId: item.gameId, difficulty: item.difficulty, level: testLevel(this.config, item.gameId, item.difficulty), mode: 'test', testStep: {index: item.index, total: item.total}});
    }}, icon('play'), t('Start', 'Начать'))],
    onClose: reason => { if (reason !== 'close' && location.hash !== '#/test') this.go('test'); }});
  }
}

const app = new App();
window.app = app;
app.init().catch(error => {
  console.error(error);
  document.getElementById('app').replaceChildren(h('p', {class: 'empty', role: 'alert'}, 'Brain Evolution could not start. ' + error.message));
});
export { app, GAME_CLASSES };
