// Encyclopedia (INTERESTING_VALUES) — the facts and the answer options. No DOM: the view is
// encyclopedia.js, the analytics scripts import this file as is.
//   A fact is {name, value} or {name, eu_value, eu_text, us_value, us_text} (games.iv_value_<n>).
//   Options (FUN_4a0d18c0): the facts are sorted by value; the distractors are the neighbours at
//   distance 1, 2 and 3 of the asked fact, each on whichever side is closer in value.
// v2 (BUG-ENC-03, -05): neighbours are taken among facts of the same kind (years with years,
// quantities with quantities), and the first fact of the sorted list may be a distractor too.

export const factValue = (item, units) => String(item?.[`${units}_value`] ?? item?.value ?? '');
export const factUnit = (item, units) => String(item?.[`${units}_text`] ?? '');
export const numeric = text => Math.trunc(parseFloat(String(text).replace(/\s/g, '').replace(',', '.'))) || 0;

// Years: facts without units whose name ends with "in" / "in the year" ("Shakespeare was born in").
export const isYear = item => item?.value !== undefined && /\bin( the year)?\s*$/i.test(String(item.name || ''));

// Exchange sort on the integer value, in database order, exactly like the original.
export function sortFacts(facts, units) {
  const list = facts.slice();
  for (let i = 0; i < list.length - 1; i++) for (let j = i + 1; j < list.length; j++)
    if (numeric(factValue(list[i], units)) > numeric(factValue(list[j], units))) [list[i], list[j]] = [list[j], list[i]];
  return list;
}

// The asked fact and three distractors (facts), not shuffled.
export function optionFacts(sorted, target, units, {sameKind = true, firstToo = true} = {}) {
  const db = sameKind ? sorted.filter(item => isYear(item) === isYear(target)) : sorted;
  const t = db.indexOf(target), v = numeric(factValue(target, units)), picks = [], min = firstToo ? 0 : 1;
  const negative = item => parseFloat(factValue(item, units).replace(/\s/g, '')) < 0;
  for (let d = 1; d <= 3; d++) {
    const l = t - d >= min ? db[t - d] : null, r = t + d < db.length ? db[t + d] : null;
    let item;
    // v2: when only one side has the sign of the asked value, that side wins (no lone negative answer).
    if (sameKind && l && r && negative(l) !== negative(r)) item = negative(l) === negative(target) ? l : r;
    else if (l && r) item = Math.abs(v - numeric(factValue(r, units))) < Math.abs(v - numeric(factValue(l, units))) ? r : l;
    else item = l || r;
    if (item) picks.push(item);
  }
  return [target, ...picks];
}

// A visible hint that singles out the right answer among the options: the only negative number, the only
// one with a decimal point, the only one with (or without) a digit group space.
export function formatCue(values) {
  const features = [v => v.trim().startsWith('-'), v => /[.,]/.test(v), v => /\d\s\d/.test(v)];
  const [answer, ...others] = values;
  return features.some(f => others.every(o => f(o) !== f(answer)));
}

// A fact without units keeps its unit in the sentence after a comma, as the original wrote it: "The population of
// China is, billion" → the question read "The population of China is, billion …" and the number stood alone.
// 3.12.2: the last short part after a comma is the unit and is shown next to the number ("1.4 billion"). Not for the
// facts with metric and US units and not for years (their commas are part of the sentence).
// Only the facts whose English sentence has that unit (a translation may have a comma of its own: "…, bedraagt"), and
// a tail with brackets stays in the sentence ("ist (Gramm pro Kubikzentimeter)").
const UNIT_TAIL = /^(.*\S),\s+([^,()]{1,40})$/;
const tail = text => { const m = UNIT_TAIL.exec(String(text).trim()); return m && m[2].trim().split(/\s+/).length <= 5 ? m : null; };
export function splitUnit(text, item) {
  const whole = {label: String(text).trim(), unit: ''};
  if (item?.eu_text !== undefined || isYear(item) || !tail(item?.name || '')) return whole;
  const m = tail(text);
  return m ? {label: m[1], unit: m[2].trim()} : whole;
}
