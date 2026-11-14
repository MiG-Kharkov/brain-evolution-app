// Mini-game results window — port of CMGResultsWnd (FUN_4a01a3ac builds it, v19 4a019db0
// shows it) driven by each game's [*_show_results] section. Per item i:
//   i<i>_param       "delay idx limit -": the item is left out when idx is 1..8 and P<idx> > limit;
//                    delay = ticks before it appears (default [mg_results_wnd] items_show_delay)
//   i<i>_title       translated title
//   i<i>_text        @DIST -> no text, result = level points
//                    @TIME -> "%d sec. x %ls" (seconds, points), result = seconds * points
//                    @Pn   -> "%d x %ls" (Pn, points), result = Pn * points
//                             (@P8 is a percentage: "%d %% x %ls", result = P8 * points / 100)
//                    other -> shown as is, result 0
//   i<i>_points_arr  "@Pk" (that value) or a per-difficulty array
// Results read "= %ls" with "%d points", the total "Total\n%ls" (total_subzero_title below 1).
// Items appear one after another: each waits its own delay after the previous one.
import { i18n } from '../i18n.js';
import { arrayValue } from '../original.js';

const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const TICK_MS = 66;
const DEFAULT_DELAY = 10; // [mg_results_wnd] items_show_delay

function format(pattern, ...args) {
  let i = 0;
  return pattern.replace(/%%|%d|%ls/g, token => (token === '%%' ? '%' : String(args[i++])));
}

const params = text => String(text ?? '').trim().split(/\s+/).filter(Boolean).map(Number);
const macroIndex = text => {
  const m = /^@P([1-9])/.exec(String(text ?? '').trim());
  return m ? Number(m[1]) : 0;
};
// "%d %ls" with the translated unit (FUN_4a0ad078 with units, FUN_4a0ac9a0(1) -> "points").
export const pointsText = value => format('%d %ls', value, i18n.t('points'));

// values: {DIST, TIME, P1..P8, TOTAL?}; like the original the game passes its own TOTAL, else the
// sum of the item results (DIST when there are no items).
export function buildResults(section, values, diff) {
  const items = [];
  let sum = 0, delay = 0;
  for (let i = 1; i <= Number(section?.items_count || 0); i++) {
    const [ownDelay = DEFAULT_DELAY, idx = 0, limit = 0] = params(section[`i${i}_param`]);
    if (idx >= 1 && idx <= 8 && Number(values[`P${idx}`] || 0) > limit) continue;
    const textKey = String(section[`i${i}_text`] ?? '');
    const pointsKey = String(section[`i${i}_points_arr`] ?? '').trim();
    const ref = macroIndex(pointsKey);
    const points = ref ? Number(values[`P${ref}`] || 0) : (pointsKey ? arrayValue(pointsKey, diff) || 0 : 0);
    const n = macroIndex(textKey), trimmed = textKey.trim().toUpperCase();
    let text, result;
    if (n) {
      const count = Number(values[`P${n}`] || 0);
      if (n === 8) { text = format('%d %% x %ls', count, points); result = Math.trunc(count * points / 100); }
      else { text = format('%d x %ls', count, points); result = count * points; }
    } else if (trimmed === '@TIME') {
      const seconds = Number(values.TIME || 0);
      text = format(i18n.t('%d sec. x %ls'), seconds, points);
      result = seconds * points;
    } else if (trimmed === '@DIST') {
      text = ''; result = Number(values.DIST || 0);
    } else {
      text = textKey; result = 0;
    }
    delay += ownDelay;
    items.push({title: i18n.t(section[`i${i}_title`] || ''), text, result, delay: delay * TICK_MS});
    sum += result;
  }
  const total = values.TOTAL ?? (items.length ? sum : Number(values.DIST || 0));
  delay += params(section?.total_param)[0] ?? DEFAULT_DELAY;
  return {items, total, totalDelay: delay * TICK_MS};
}

