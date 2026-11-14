// Local profiles (localStorage). v3 adds profile ids and colours, per-difficulty records, the test
// history with per-game marks, export/import and a sync between open tabs. Older saves (v1/v2 and the
// pre-rename key) are migrated without losing earned records.
// v3.7 adds fields only (the format version stays 3, an export of any 3.x version imports into any other):
//   scoreHistory items   mode ('free' | 'training' | 'test'), v (app version), sec (seconds from start to finish),
//                        play (how the game went, numbers only), and in training up (the threshold then) and
//                        res ('up' — a step, 'none', 'weak' — under 40 % of the threshold, 'skip' — not counted)
//   history items        at (time the training ended), v
//   tests items          v
//   levelLog             changes of the training level: {at, game, to, kind: 'up' | 'down' | 'back' | 'champion', v}
//   fixes                one-time repairs already made to this profile
// A test task has its own length and prices, so it is kept in the log of games but never in the records of a level.
import { APP_VERSION } from './version.js';

const STORAGE_KEY = 'amaze_brain_evo_data';
const LEGACY_KEY = String.fromCharCode(115, 112, 98) + '_brain_evo_data';
const VERSION = 3;
const SCORE_HISTORY_DAYS = 400, SCORE_HISTORY_MAX = 3000;   // about 0.6 of the 5 million characters a browser gives
export const PROFILE_COLORS = ['#0f8b7d', '#3b7ddd', '#7c5cff', '#d6458a', '#e8782a', '#3a9d50', '#b4881b', '#5b6b82'];

const newId = () => `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export function createProfile(name = 'Player 1', color = PROFILE_COLORS[0]) {
  return {
    id: newId(), name, color, created: Date.now(),
    brainScore: 0, trainingDays: 0,
    history: [],          // finished trainings: {date, score, results, at, v}
    tests: [],            // finished tests: {id, at, date, version, v, items:[{game, mgId, raw, mark, restarts, play}], bm}
    scoreHistory: [],     // every finished game: {gameId, diff, score, date, mode, v, sec, play, up, res}
    highScores: {},       // best per game, any difficulty (training and free play)
    bestByDiff: {},       // {gameId: {easy: n, medium: n, ...}} (training and free play)
    levelLog: [],         // changes of the training level: {at, game, to, kind, v}
    awards: [], unlockedGames: [], progress: {}, promotions: 0,
    achievements: {},     // earned achievement steps: {"<id>" | "<id>:<tier>": timestamp} (js/achievements.js)
    stats: {},            // lifetime counters for the achievements
    training: null, marking: null, unlockedFacts: [], testOrder: 0, notDone: {},
    fixes: {testRecords: 1, geoScale: 1},   // one-time repairs of older data that a new profile does not need
  };
}

const defaultSettings = () => ({sound: true, volume: 0.8, locale: null, theme: 'system'});

function migrateProfile(id, raw) {
  const base = createProfile();
  const p = {...base, ...raw};
  p.id = typeof raw.id === 'string' ? raw.id : id;
  p.fixes = raw.fixes && typeof raw.fixes === 'object' && !Array.isArray(raw.fixes) ? {...raw.fixes} : {};   // not the new profile's
  for (const key of ['history', 'tests', 'scoreHistory', 'awards', 'unlockedGames', 'unlockedFacts', 'levelLog']) if (!Array.isArray(p[key])) p[key] = [];
  for (const key of ['highScores', 'bestByDiff', 'progress', 'notDone', 'achievements', 'stats']) if (!p[key] || typeof p[key] !== 'object' || Array.isArray(p[key])) p[key] = {};
  if (!p.color) p.color = PROFILE_COLORS[Math.abs([...String(p.name)].reduce((a, c) => a + c.charCodeAt(0), 0)) % PROFILE_COLORS.length];
  // v2 kept one best test per day without per-game marks.
  if (Array.isArray(raw.markingHistory) && raw.markingHistory.length && !p.tests.length) {
    p.tests = raw.markingHistory.map((m, i) => ({id: `legacy_${i}`, date: m.date, at: Date.parse(m.date) || 0, version: 1, items: [], bm: Number(m.score) / 100}));
  }
  // v1 Matches pool -> v3 per-mode pools
  if (raw.matchesNotDone && !p.notDone.matches) p.notDone.matches = {free: raw.matchesNotDone};
  delete p.markingHistory; delete p.matchesNotDone; delete p.brainMark; delete p.brainRank; delete p.lastTrainingDate; delete p.openGamesChecked;
  if (p.training && typeof p.training !== 'object') p.training = null;
  repairTestRecords(p);
  repairGeometryScale(p);
  return p;
}

// Before 3.7 the games of a test were written into the records of the training levels, although a test task has its
// own length and prices (a Numbers task of the test can score more than the maximum of training Medium). One-time
// repair, also for imported files: the games of the kept tests are marked in the log (same game and score, finished
// within the test), and a record that equals a test result is taken again from the other games of the log. A record
// that did not come from a test is not touched.
function repairTestRecords(p) {
  if (p.fixes.testRecords) return;
  p.fixes.testRecords = 1;
  const raws = {};
  for (const test of p.tests) {
    for (const item of test.items || []) {
      if (!Number.isFinite(item?.raw)) continue;
      (raws[item.game] ||= new Set()).add(item.raw);
      const entry = p.scoreHistory.find(s => s && !s.mode && s.gameId === item.game && s.score === item.raw
        && Date.parse(s.date) <= (test.at || 0) + 60000 && Date.parse(s.date) >= (test.at || 0) - 3600000);
      if (entry) entry.mode = 'test';
    }
  }
  for (const [gameId, set] of Object.entries(raws)) {
    const by = p.bestByDiff[gameId];
    if (!by || typeof by !== 'object') continue;
    let touched = false;
    for (const diff of Object.keys(by)) {
      if (!set.has(by[diff])) continue;
      const best = Math.max(0, ...p.scoreHistory.filter(s => s && s.gameId === gameId && s.diff === diff && s.mode !== 'test').map(s => Number(s.score) || 0));
      if (best > 0) by[diff] = best; else delete by[diff];
      touched = true;
    }
    if (touched || set.has(p.highScores[gameId])) {
      const top = Math.max(0, ...Object.values(by).map(Number).filter(Number.isFinite));
      if (top > 0) p.highScores[gameId] = top; else delete p.highScores[gameId];
    }
  }
}

// A save that does not fit (3.11.3). A browser gives a site about 5 million characters (Chrome: 5.24 million,
// measured); a profile played daily for two years takes about 1.2 million, so several profiles on one device can fill
// it. Before 3.11.3 such a save failed silently, and everything played after it was gone at the next start. Now the
// data are made smaller step by step and saved again. Only what the app keeps for the balance and for the detail of
// old days goes, in every profile; levels, records, achievements, the days and the numbers of the calendar stay:
//   1  how a game went (play, sec, v) in the log of games older than 30 days, what Brain Power was made of (parts)
//      in trainings older than 90 days, how a game went in all the tests but the last 20;
//   2  the log of games down to its last 1000, the results of the games of trainings older than 400 days;
//   3  the log of games down to its last 200;   4  down to its last 20.
// The steps are tried on a copy and made in the data only when the copy got into the browser: if nothing fits, the
// data in memory stay whole, and the copy the player is asked to export has everything.
const SHRINK_STEPS = 4;
function shrink(data, step, now) {
  const older = (time, days) => now - (Number(time) || 0) > days * 86400000;
  for (const p of Object.values(data.profiles)) {
    const when = item => item.at || Date.parse(`${item.date}T12:00:00`);
    if (step === 1) {
      for (const e of p.scoreHistory) if (e && older(Date.parse(e.date), 30)) { delete e.play; delete e.sec; delete e.v; }
      for (const item of p.history) if (item && older(when(item), 90)) delete item.parts;
      for (const test of p.tests.slice(0, -20)) for (const item of test?.items || []) if (item) delete item.play;
    } else {
      p.scoreHistory = p.scoreHistory.slice(-[1000, 200, 20][step - 2]);
      if (step === 2) for (const item of p.history) if (item && older(when(item), 400)) { delete item.results; delete item.parts; delete item.v; }
    }
  }
}
const noRoom = error => error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error?.code === 22 || error?.code === 1014;

// 3.12.3: the accuracy of Geometry is on one scale for every level (games/geometry-model.js figureMatch). The values
// kept before were the share of the tolerance of the level that was left (60 / 30 / 20 % of the angle sum on Easy /
// Medium / Hard), so the same drawing on the new scale is 100 − (100 − a) · tolerance / 100. One-time repair, also
// for imported files: the records of the record book (the level is in the key), the games of the log (play.
// minAccuracy) and the best weakest figure of the achievement — from the games of the log, or as an Easy value when
// the log has none. A file exported by 3.12.3 or later is in the new scale throughout.
const OLD_GEO_TOLERANCE = {easy: 60, medium: 30, hard: 20};
const geoScale = (a, level) => Math.max(0, Math.min(100, Math.floor(100 - (100 - a) * (OLD_GEO_TOLERANCE[level] ?? 60) / 100 + 1e-9)));
function repairGeometryScale(p) {
  if (p.fixes.geoScale) return;
  p.fixes.geoScale = 1;
  const s = p.stats;
  for (const [key, rec] of Object.entries(s.rec && typeof s.rec === 'object' ? s.rec : {})) {
    const m = /^geometry_accuracy:(\w+)$/.exec(key);
    if (!m || !rec || typeof rec !== 'object') continue;
    if (Number.isFinite(rec.v)) rec.v = geoScale(rec.v, m[1]);
    if (Number.isFinite(rec.p)) rec.p = geoScale(rec.p, m[1]);
  }
  const games = [];
  for (const e of p.scoreHistory) {
    if (!e || e.gameId !== 'geometry' || !Number.isFinite(e.play?.minAccuracy)) continue;
    e.play.minAccuracy = geoScale(e.play.minAccuracy, e.diff);
    if (e.mode !== 'test') games.push(e.play.minAccuracy);
  }
  if (s.best && typeof s.best === 'object' && Number.isFinite(s.best.geoMin)) s.best.geoMin = games.length ? Math.max(...games) : geoScale(s.best.geoMin, 'easy');
}

export class StorageManager {
  constructor() {
    this.listeners = new Set();
    this.data = this.load();
    window.addEventListener('storage', event => {
      if (event.key !== STORAGE_KEY || event.newValue === null) return;
      try { this.data = this.parse(JSON.parse(event.newValue)); this.listeners.forEach(fn => fn('external')); } catch { /* ignore a broken write */ }
    });
  }

  load() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        raw = localStorage.getItem(LEGACY_KEY);
        if (raw !== null) { localStorage.setItem(STORAGE_KEY, raw); localStorage.removeItem(LEGACY_KEY); }
      }
      if (raw === null) return this.fresh();
      return this.parse(JSON.parse(raw));
    } catch (error) {
      console.warn('Storage read error:', error);
      return this.fresh();
    }
  }

  fresh() {
    const p = createProfile();
    return {version: VERSION, rev: 0, activeProfile: p.id, profiles: {[p.id]: p}, settings: defaultSettings(), fresh: true};
  }

  parse(parsed) {
    if (!parsed || typeof parsed.profiles !== 'object' || parsed.profiles === null) return this.fresh();
    const profiles = {};
    for (const [key, raw] of Object.entries(parsed.profiles)) {
      if (!raw || typeof raw !== 'object') continue;
      const p = migrateProfile(key, raw);
      Object.defineProperty(profiles, p.id, {value: p, enumerable: true, writable: true, configurable: true});
    }
    if (!Object.keys(profiles).length) return this.fresh();
    let active = parsed.activeProfile;
    if (!Object.hasOwn(profiles, active)) {
      const byOldKey = Object.values(profiles).find(p => p.id === active || p.name === active);
      active = byOldKey ? byOldKey.id : Object.keys(profiles)[0];
    }
    const settings = {...defaultSettings(), ...(parsed.settings || {})};
    if (parsed.version < 3 && settings.locale === 'ru') settings.locale = 'ru';
    delete settings.difficulty;
    return {version: VERSION, rev: Number(parsed.rev) || 0, activeProfile: active, profiles, settings};
  }

  // Writes the data. `failed` is set while the last save did not get into the browser (no room even after shrink(),
  // or the storage is closed); the listeners then get 'failed' and the app tells the player to export a copy.
  save() {
    let saved = false;
    try {
      this.data.rev = (this.data.rev || 0) + 1;
      delete this.data.fresh;
      const profile = this.getProfile();
      const cutoff = Date.now() - SCORE_HISTORY_DAYS * 86400000;
      if (profile.scoreHistory.length > SCORE_HISTORY_MAX) profile.scoreHistory = profile.scoreHistory.filter(s => Date.parse(s.date) >= cutoff).slice(-SCORE_HISTORY_MAX);
      const now = Date.now();
      let copy = null;
      for (let step = 0; step <= SHRINK_STEPS && !saved; step++) {
        if (step) shrink(copy ||= JSON.parse(JSON.stringify(this.data)), step, now);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(copy || this.data)); saved = true; }
        catch (error) { if (!noRoom(error) || step === SHRINK_STEPS) throw error; }
        if (saved && step) {
          for (let k = 1; k <= step; k++) shrink(this.data, k, now);
          console.warn(`Storage: no room, the data were made smaller (step ${step})`);
        }
      }
    } catch (error) {
      console.error('Storage write error:', error);
    }
    this.failed = !saved;
    this.listeners.forEach(fn => fn(saved ? 'local' : 'failed'));
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  getProfile() { return this.data.profiles[this.data.activeProfile]; }
  updateProfile(updater) { updater(this.getProfile()); this.save(); }
  getSettings() { return this.data.settings; }
  updateSettings(updater) { updater(this.data.settings); this.save(); }
  listProfiles() { return Object.values(this.data.profiles).sort((a, b) => a.created - b.created); }

  createProfile(name) {
    name = String(name).trim().slice(0, 40);
    if (!name) return null;
    const used = new Set(this.listProfiles().map(p => p.color));
    const p = createProfile(name, PROFILE_COLORS.find(c => !used.has(c)) || PROFILE_COLORS[this.listProfiles().length % PROFILE_COLORS.length]);
    this.data.profiles[p.id] = p;
    this.data.activeProfile = p.id;
    this.save();
    return p.id;
  }
  renameProfile(id, name) {
    name = String(name).trim().slice(0, 40);
    if (!name || !Object.hasOwn(this.data.profiles, id)) return false;
    this.data.profiles[id].name = name; this.save(); return true;
  }
  setProfileColor(id, color) { if (Object.hasOwn(this.data.profiles, id)) { this.data.profiles[id].color = color; this.save(); } }
  deleteProfile(id) {
    if (!Object.hasOwn(this.data.profiles, id) || this.listProfiles().length < 2) return false;
    delete this.data.profiles[id];
    if (this.data.activeProfile === id) this.data.activeProfile = this.listProfiles()[0].id;
    this.save(); return true;
  }
  selectProfile(id) {
    if (!Object.hasOwn(this.data.profiles, id)) return false;
    this.data.activeProfile = id; this.save(); return true;
  }

  // One finished game: a line in the log of games and, outside the test, the records. `diff` is 'easy' | 'medium' |
  // 'hard' | 'ultra'; `info` — {mode, sec, play} (see the header). Returns the log item: training adds up and res to it.
  recordGameScore(gameId, score, diff = null, info = {}) {
    if (!Number.isFinite(score) || score < 0) return null;
    const profile = this.getProfile();
    score = Math.round(score);
    if (info.mode !== 'test') {
      profile.highScores[gameId] = Math.max(profile.highScores[gameId] || 0, score);
      if (diff) {
        const byDiff = profile.bestByDiff[gameId] ||= {};
        byDiff[diff] = Math.max(byDiff[diff] || 0, score);
      }
    }
    const entry = {gameId, diff, score, date: new Date().toISOString(), v: APP_VERSION, ...info};
    profile.scoreHistory.push(entry);
    this.save();
    return entry;
  }
  // The record of a level (or of the game); with `days` — the best game of the last days. Test tasks do not count.
  getHighScore(gameId, days = null, diff = null) {
    const profile = this.getProfile();
    if (!days) return diff ? profile.bestByDiff[gameId]?.[diff] || 0 : profile.highScores[gameId] || 0;
    const cutoff = Date.now() - days * 86400000;
    return Math.max(0, ...profile.scoreHistory.filter(s => s.gameId === gameId && s.mode !== 'test' && (!diff || s.diff === diff) && Date.parse(s.date) >= cutoff).map(s => s.score));
  }

  // ---- backup ----
  // The file is the stored data as is, so it imports back without loss. appVersion and device are for reading the
  // file (which balance the last games were played with, how big the screen is); the import ignores them.
  exportJSON(profileId = null) {
    const profiles = profileId ? {[profileId]: this.data.profiles[profileId]} : this.data.profiles;
    return JSON.stringify({app: 'brain-evolution', kind: 'backup', version: VERSION, appVersion: APP_VERSION, exported: new Date().toISOString(),
      device: deviceInfo(), activeProfile: profileId || this.data.activeProfile, profiles, settings: profileId ? undefined : this.data.settings}, null, 1);
  }
  // mode 'merge' adds the imported profiles (a profile with the same id is replaced); 'replace' drops everything else.
  importJSON(text, mode = 'merge') {
    const parsed = JSON.parse(text);
    if (!parsed || parsed.app !== 'brain-evolution' && !parsed.profiles) throw new Error('not a Brain Evolution backup');
    const incoming = this.parse(parsed);
    if (incoming.fresh) throw new Error('the file has no profiles');
    const before = this.data;
    if (mode === 'replace') {
      this.data = {...incoming, settings: parsed.settings ? incoming.settings : this.data.settings};
    } else {
      this.data = {...before, profiles: {...before.profiles, ...incoming.profiles}, activeProfile: incoming.activeProfile};
    }
    this.save();
    // An import that does not fit is not kept in memory either: the next start would show the old data anyway.
    if (this.failed) { this.data = before; this.save(); throw new Error('no room in the browser storage'); }
    return Object.keys(incoming.profiles).length;
  }
}

// What the game runs on: the size of the screen decides how big the cells and the keys are.
function deviceInfo() {
  try {
    return {screen: `${window.innerWidth}x${window.innerHeight}`, dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
      standalone: Boolean(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone),
      touch: navigator.maxTouchPoints > 0, lang: navigator.language || '', agent: navigator.userAgent || ''};
  } catch { return {}; }
}

export const storage = new StorageManager();
