// Amaze Brain Evolution - Authentic Audio Engine

import { storage } from './storage.js';

class AudioManager {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.initialized = false;
    this.soundList = {
      click: 'assets/sounds/BTN_PRESSED_WAV.wav',
      good: 'assets/sounds/MOVE_GOOD_WAV.wav',
      wrong: 'assets/sounds/MOVE_WRONG_WAV.wav',
      levelUp: 'assets/sounds/LEVEL_UP_WAV.wav',
      diploma: 'assets/sounds/SHOW_DIPLOMA_WAV.wav',
      rotate: 'assets/sounds/MATCHES_ROTATE_BTN_WAV.wav',
      reset: 'assets/sounds/MATCHES_RESET_BTN_WAV.wav',
      plusMatch: 'assets/sounds/MATCHES_PLUS_MATCH_BTN_WAV.wav',
      minusMatch: 'assets/sounds/MATCHES_MINUS_BTN_WAV.wav',
      pencil: 'assets/sounds/SUDOKU_PUT_PENCILMARK_WAV.wav',
      hitWall: 'assets/sounds/ROADBLOCKS_BALL_HIT_WALL_WAV.wav',
      tick: 'assets/sounds/DAY_TICK_ANIM_SOUND_WAV.wav',
      diffUp: 'assets/sounds/DIFFICULTY_UP_WAV.wav',
      diffDown: 'assets/sounds/DIFFICULTY_DOWN_WAV.wav',
      diffDone: 'assets/sounds/DIFFICULTY_ALL_DONE_WAV.wav',
      znaxMark: 'assets/sounds/ZNAX_SET_MARK_WAV.wav',
      mineOpen: 'assets/sounds/MINESWEEPER_ITEM_OPEN_WAV.wav',
      openTrainer: 'assets/sounds/TRAINER_OPEN_WAV.wav',
      closeTrainer: 'assets/sounds/TRAINER_CLOSE_WAV.wav'
    };
  }

  // Phones start an AudioContext "suspended": it runs only after resume() inside a real gesture (touchend,
  // click, keydown — not pointerdown). iOS also moves it to "interrupted" when the app goes to the background
  // or the screen locks. So the unlock listeners stay armed whenever the context is not running, and every
  // gesture resumes it and plays one silent sample (older iOS needs a sound started inside the gesture).
  init() {
    if (this.initialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.initialized = true;
      this.ctx.addEventListener?.('statechange', () => { if (this.ctx.state !== 'running') this.armUnlock(); });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.wake(); });
      if (this.ctx.state === 'running') this.preloadAll(); else this.armUnlock();
    } catch (e) {
      console.warn('Web Audio not supported:', e);
    }
  }

  armUnlock() {
    if (this.unlocking) return;
    this.unlocking = () => this.wake(true);
    for (const type of ['touchend', 'click', 'keydown']) window.addEventListener(type, this.unlocking, {capture: true, passive: true});
  }

  wake(fromGesture = false) {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') { this.disarm(); return; }
    ctx.resume?.().then(() => { if (ctx.state === 'running') { this.disarm(); this.preloadAll(); } }).catch(() => {});
    if (fromGesture) {
      try {
        const source = ctx.createBufferSource();
        source.buffer = ctx.createBuffer(1, 1, 22050);
        source.connect(ctx.destination);
        source.start(0);
      } catch (e) { /* ignore */ }
    }
  }

  disarm() {
    if (!this.unlocking || this.ctx?.state !== 'running') return;
    for (const type of ['touchend', 'click', 'keydown']) window.removeEventListener(type, this.unlocking, {capture: true});
    this.unlocking = null;
  }

  async loadSound(name, url) {
    if (!this.ctx) this.init();
    if (!this.ctx) return null;
    if (this.buffers[name]) return this.buffers[name];

    try {
      const resp = await fetch(url);
      const arrayBuf = await resp.arrayBuffer();
      const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
      this.buffers[name] = audioBuf;
      return audioBuf;
    } catch (e) {
      console.warn(`Failed to load sound ${name} from ${url}:`, e);
      return null;
    }
  }

  async preloadAll() {
    if (this.preloaded) return;
    this.preloaded = true;
    for (const [name, url] of Object.entries(this.soundList)) {
      this.loadSound(name, url).catch(() => {});
    }
  }

  async play(name) {
    const settings = storage.getSettings();
    if (!settings.sound) return;

    if (!this.ctx) {
      this.init();
    }
    if (this.ctx && this.ctx.state !== 'running') {
      // A resume outside a gesture may never settle: wait a moment, and skip this sound if the context still sleeps
      // (otherwise the queued sounds would all burst out at the next tap).
      this.wake();
      await Promise.race([this.ctx.resume?.().catch(() => {}), new Promise(r => setTimeout(r, 250))]);
      if (this.ctx.state !== 'running') return;
    }

    let buf = this.buffers[name];
    if (!buf && this.soundList[name]) {
      buf = await this.loadSound(name, this.soundList[name]);
    }
    if (!buf || !this.ctx) return;

    try {
      const source = this.ctx.createBufferSource();
      source.buffer = buf;
      const gain = this.ctx.createGain();
      gain.gain.value = settings.volume !== undefined ? settings.volume : 0.8;
      source.connect(gain);
      gain.connect(this.ctx.destination);
      source.start(0);
    } catch (e) {
      console.warn(`Failed to play sound ${name}:`, e);
    }
  }
}

export const audio = new AudioManager();
