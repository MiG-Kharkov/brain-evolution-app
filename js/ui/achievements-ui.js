// Achievements on screen: the medal, the "new achievement" pop-up with confetti, the details sheet and the
// achievements tab of Progress. Data and rules — js/achievements.js.
import { h, fmt } from '../core/dom.js';
import { icon, gameGlyph } from '../core/icons.js';
import { i18n } from '../i18n.js';
import { audio } from '../audio.js';
import { sheet } from './overlay.js';
import { bar } from './components.js';
import { ACHIEVEMENTS, GROUPS, STEPS, TIERS, TIER_KINDS, context, progressOf, earnedCount } from '../achievements.js';
import { DIFFICULTIES } from '../original.js';

const t = (en, ru) => i18n.t(en, ru);
const tx = pair => t(pair[0], pair[1]);
const groupOf = a => GROUPS.find(g => g.id === a.group) || GROUPS[0];

export const achTitle = a => tx(a.title);
export function achDesc(app, a, goal = a.goal) {
  const text = tx(a.desc);
  if (a.levelGoal) return `${text} ${t('Level: @L', 'Уровень: @L').replace('@L', app.diffLabel(DIFFICULTIES[goal - 1]))}`;
  return a.rankGoal ? text.replace('%s', app.rankName(goal)) : text.replace('%d', fmt(goal));
}
const tierName = tier => (tier === null || tier === undefined ? '' : tx(TIERS[tier]));
// The goal of a tier in words: a rank, a difficulty or a number.
const goalText = (app, a, goal) => (a.rankGoal ? app.rankName(goal) : a.levelGoal ? app.diffLabel(DIFFICULTIES[goal - 1]) : fmt(goal));

// The medal: metal of the tier (or the colour of the group), the icon inside, a progress ring when not earned.
export function medal(a, {tier = null, earned = true, share = 0, size = 64, secret = false} = {}) {
  const kind = tier === null ? 'single' : TIER_KINDS[tier];
  const inner = secret && !earned ? icon('lock') : a.game && a.icon === a.game ? gameGlyph(a.game) : icon(a.icon);
  const badge = h('span', {class: `ach-medal ${kind}${earned ? '' : ' locked'}`, style: `--size:${size}px;--grp:${groupOf(a).color}`, 'aria-hidden': 'true'}, inner);
  if (earned) return badge;
  return h('span', {class: 'ach-ring', style: `--size:${size}px;--p:${Math.max(0, Math.min(1, share))}`, 'aria-hidden': 'true'}, badge);
}

// ---------------------------------------------------------------- the pop-up
const queue = [];
let showing = false;
const CONFETTI = ['#f1b92b', '#e8782a', '#d6458a', '#7c5cff', '#3b7ddd', '#3a9d50', '#0f8b7d'];

// steps: [{a, tier, goal}] from checkAchievements, or [{summary: n}] for the first run of the new system.
export function celebrate(app, steps, delay = 500) {
  if (!steps?.length) return;
  queue.push(...steps);
  if (!showing) setTimeout(() => next(app), delay);
}

function next(app) {
  const step = queue.shift();
  if (!step) { showing = false; return; }
  showing = true;
  // step.record — a record of the record book beaten just now: {game, title, text}.
  const gold = Boolean(step.record) || (step.tier !== null && step.tier !== undefined && step.tier >= 2);
  const title = step.summary ? t('Achievements are here', 'Появились достижения') : step.record ? step.record.title : achTitle(step.a);
  const text = step.summary
    ? t('You already have: @N. See them all in Progress.', 'У вас уже есть: @N. Все — в разделе «Прогресс».').replace('@N', String(step.summary))
    : step.record ? step.record.text : achDesc(app, step.a, step.goal);
  const badge = step.summary ? medal({icon: 'trophy', group: 'mastery'}, {tier: 2, size: 64})
    : step.record ? medal({game: step.record.game, icon: step.record.game, group: 'bests'}, {tier: 2, size: 64}) : medal(step.a, {tier: step.tier, size: 64});
  const burst = h('span', {class: 'ach-burst', 'aria-hidden': 'true'}, Array.from({length: 22}, (_, i) => {
    const angle = (i / 22) * Math.PI * 2 + Math.random() * .3, dist = 46 + Math.random() * 46;
    return h('i', {style: `--dx:${Math.cos(angle) * dist}px;--dy:${Math.sin(angle) * dist}px;--rot:${Math.round(Math.random() * 540 - 270)}deg;--c:${CONFETTI[i % CONFETTI.length]};--d:${(Math.random() * .15).toFixed(2)}s`});
  }));
  const pop = h('div', {class: `ach-pop${gold ? ' gold' : ''}`, role: 'status', 'aria-live': 'polite'},
    h('button', {class: 'ach-pop-card', onclick: () => { close(); app.go('progress/awards'); }},
      h('span', {class: 'ach-pop-badge'}, burst, badge),
      h('span', {class: 'ach-pop-text'},
        h('span', {class: 'ach-pop-kicker'}, step.summary ? t('Progress', 'Прогресс') : step.record ? t('New record', 'Новый рекорд') : `${t('New achievement', 'Новое достижение')}${step.tier !== null && step.tier !== undefined ? ` · ${tierName(step.tier)}` : ''}`),
        h('b', null, title), h('span', {class: 'ach-pop-desc'}, text))));
  document.body.append(pop);
  setTimeout(() => audio.play(gold ? 'diffDone' : 'diffUp'), 120);
  let closed = false;
  const timer = setTimeout(() => close(), queue.length ? 2400 : 4200);   // a queue moves faster
  function close() {
    if (closed) return;
    closed = true; clearTimeout(timer);
    pop.classList.add('out');
    setTimeout(() => { pop.remove(); next(app); }, 320);
  }
}

// ---------------------------------------------------------------- details
export function achievementSheet(app, a, profile, c) {
  const p = progressOf(a, c, profile);
  const secret = a.secret && !p.earnedTiers;
  const at = key => profile.achievements[key] ? new Date(profile.achievements[key]).toLocaleDateString(document.documentElement.lang, {day: 'numeric', month: 'long', year: 'numeric'}) : null;
  const body = [h('div', {class: 'ach-detail'}, medal(a, {tier: p.earnedTiers ? (a.tiers ? p.earnedTiers - 1 : null) : (a.tiers ? 0 : null), earned: p.earnedTiers > 0, share: p.share, size: 96, secret}),
    h('h3', null, secret ? t('Secret achievement', 'Секретное достижение') : achTitle(a)),
    h('p', {class: 'muted'}, secret ? t('Keep playing: it opens by itself.', 'Продолжайте играть — оно откроется само.') : a.tiers ? achDesc(app, a, p.goal) : achDesc(app, a)))];
  if (a.tiers && !secret) body.push(h('div', {class: 'ach-tiers'}, a.tiers.map((goal, tier) => {
    const key = `${a.id}:${tier}`, done = Boolean(profile.achievements[key]);
    return h('div', {class: `ach-tier${done ? ' done' : ''}`}, medal(a, {tier, earned: done, share: Math.min(1, p.value / goal), size: 40}),
      h('span', {class: 'lr-main'}, h('b', null, tierName(tier)), h('span', {class: 'small muted'}, goalText(app, a, goal))),
      h('span', {class: 'small'}, done ? at(key) : `${fmt(Math.min(p.value, goal))} / ${fmt(goal)}`));
  })));
  else if (!secret) body.push(h('p', {class: 'small muted', style: {textAlign: 'center'}}, p.done ? `${t('Achieved', 'Получено')}: ${at(a.id)}` : `${fmt(Math.min(p.value, p.goal))} / ${fmt(p.goal)}`));
  if (a.group === 'bests' && a.tiers && !secret && p.value > 0) body.push(h('p', {class: 'small', style: {textAlign: 'center'}}, `${t('Your best', 'Ваш результат')}: `, h('b', {class: 'num'}, fmt(p.value))));
  const s = sheet({title: tx(groupOf(a).title), body, actions: [h('button', {class: 'btn btn-primary btn-block', onclick: () => s.close()}, t('Got it', 'Понятно'))]});
}

// ---------------------------------------------------------------- the tab
function tile(app, a, profile, c) {
  const p = progressOf(a, c, profile);
  const secret = a.secret && !p.earnedTiers;
  const shownTier = a.tiers ? (p.earnedTiers ? p.earnedTiers - 1 : 0) : null;
  // A personal best keeps growing after its last step, so the tile shows the value next to the metal (3.11).
  const sub = secret ? '???' : p.done ? (a.tiers ? `${tierName(a.tiers.length - 1)}${a.group === 'bests' ? ` · ${fmt(p.value)}` : ''}` : t('Achieved', 'Получено'))
    : a.rankGoal || a.levelGoal ? goalText(app, a, p.goal) : `${fmt(Math.min(p.value, p.goal))} / ${fmt(p.goal)}`;
  return h('button', {class: `ach-tile${p.earnedTiers ? ' earned' : ''}`, onclick: () => achievementSheet(app, a, profile, c)},
    medal(a, {tier: shownTier, earned: p.earnedTiers > 0, share: p.share, size: 58, secret}),
    a.tiers ? h('span', {class: 'ach-pips', 'aria-hidden': 'true'}, a.tiers.map((_, tier) => h('i', {class: tier < p.earnedTiers ? TIER_KINDS[tier] : ''}))) : null,
    h('b', null, secret ? t('Secret', 'Секрет') : achTitle(a)),
    h('span', {class: 'tiny muted'}, sub));
}

// after: {<group id>: panel => …} — what to put after a group (the record book follows the personal bests).
export function renderAchievements(app, panel, profile, after = {}) {
  const c = context(profile, app.config);
  const earned = earnedCount(profile), total = STEPS.length;
  // The closest goals: not done, not secret, the biggest share first.
  const closest = ACHIEVEMENTS.map(a => ({a, p: progressOf(a, c, profile)}))
    .filter(x => !x.p.done && !(x.a.secret && !x.p.earnedTiers) && x.p.share > 0).sort((x, y) => y.p.share - x.p.share).slice(0, 3);
  const recent = STEPS.filter(step => profile.achievements[step.key]).sort((x, y) => profile.achievements[y.key] - profile.achievements[x.key]).slice(0, 6);
  panel.append(h('section', {class: 'card ach-summary'},
    h('div', {class: 'row'}, h('div', {class: 'stack', style: {gap: '2px', flex: 1}},
      h('span', {class: 'card-kicker'}, t('Achievements', 'Достижения')),
      h('div', {class: 'big-number num'}, String(earned), h('small', null, ` / ${total}`))),
    h('span', {class: 'ach-summary-medals'}, recent.map(step => medal(step.a, {tier: step.tier, size: 34})))),
    bar(earned / total, 'reward'),
    closest.length ? h('div', {class: 'stack', style: {gap: '8px'}}, h('span', {class: 'small muted'}, t('Almost there', 'Почти получено')),
      closest.map(({a, p}) => {
        // «9 876 543/10 000 000» at the side leaves the name a column of one word: a long count goes under the text
        const count = a.rankGoal || a.levelGoal ? '' : `${fmt(Math.min(p.value, p.goal))}/${fmt(p.goal)}`, long = count.length > 9;
        return h('button', {class: 'ach-near', onclick: () => achievementSheet(app, a, profile, c)},
          medal(a, {tier: p.tier, earned: false, share: p.share, size: 36}),
          h('span', {class: 'lr-main'}, h('b', null, achTitle(a)), h('span', {class: 'tiny muted'}, a.tiers ? achDesc(app, a, p.goal) : achDesc(app, a)),
            long ? h('span', {class: 'small num'}, count) : null),
          long ? null : h('span', {class: 'small num'}, count));
      })) : null));
  for (const g of GROUPS) {
    const list = ACHIEVEMENTS.filter(a => a.group === g.id);
    const steps = STEPS.filter(step => step.a.group === g.id);
    panel.append(h('h2', {class: 'section-title ach-group-title'}, h('span', {class: 'ach-group-icon', style: `--grp:${g.color}`}, icon(g.icon)),
      tx(g.title), h('span', {class: 'pill'}, `${steps.filter(step => profile.achievements[step.key]).length} / ${steps.length}`)),
    h('div', {class: 'ach-grid'}, list.map(a => tile(app, a, profile, c))));
    after[g.id]?.(panel);
  }
}
