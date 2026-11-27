// Shared view pieces: progress ring, steps, bar, game icon, rank track, history chart.
import { h, svg, fmt } from '../core/dom.js';
import { gameGlyph, GAME_COLOR } from '../core/icons.js';

export function ring(done, total, label = '', sub = '') {
  const r = 32, c = 2 * Math.PI * r, share = total ? Math.min(1, done / total) : 0;
  return h('div', {class: 'ring', role: 'img', 'aria-label': `${done} / ${total}`},
    svg('svg', {viewBox: '0 0 76 76'},
      svg('circle', {class: 'ring-track', cx: 38, cy: 38, r, fill: 'none', 'stroke-width': 7}),
      svg('circle', {class: 'ring-fill', cx: 38, cy: 38, r, fill: 'none', 'stroke-width': 7, 'stroke-dasharray': c, 'stroke-dashoffset': c * (1 - share)})),
    h('div', {class: 'ring-label'}, label || `${done}/${total}`, sub ? h('small', null, sub) : null));
}

export const steps = (on, total, cls = '') => h('div', {class: `steps ${cls}`.trim(), role: 'img', 'aria-label': `${on} / ${total}`},
  Array.from({length: Math.max(1, total)}, (_, i) => h('i', {class: i < on ? 'on' : ''})));

export const bar = (share, cls = '') => h('div', {class: `bar ${cls}`}, h('i', {style: {width: `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%`}}));

export const gameIcon = (id, size = '') => h('span', {class: `game-icon ${size}`, style: {'--c': GAME_COLOR[id] || 'var(--accent)'}}, gameGlyph(id));

export function evoTrack(rank) {
  const parts = [];
  for (let r = 1; r <= 7; r++) {
    if (r > 1) parts.push(h('i', {class: r <= rank ? 'on' : ''}));
    parts.push(h('b', {class: r < rank ? 'on' : r === rank ? 'cur' : ''}));
  }
  return h('div', {class: 'evo', role: 'img', 'aria-label': `${rank} / 7`}, parts);
}

// History line chart on a fixed scale. points: [{label, value}]; bands: [{from, to}] shaded alternately.
// range: optional [{value, low, high}] per point — the rolling index with its ± band, drawn under the points;
// dotsOnly: the points are not joined (the index line carries the trend); area: false — no fill under the line
// (a scale that does not start at zero). The left margin follows the widest label of the scale («1 150»).
export function lineChart(points, {min = 0, max = null, bands = [], height = 150, ticks = null, format = v => fmt(v), range = null, dotsOnly = false, area = true} = {}) {
  const values = points.map(p => p.value);
  const hi = max ?? Math.max(10, ...values) * 1.1;
  const marks = ticks || [min, (min + hi) / 2, hi];
  const W = 340, H = height, m = {l: Math.max(34, 10 + Math.ceil(6.3 * Math.max(...marks.map(v => format(v).length)))), r: 10, t: 10, b: 22};
  const x = i => m.l + (points.length < 2 ? (W - m.l - m.r) / 2 : i * (W - m.l - m.r) / (points.length - 1));
  const y = v => H - m.b - (v - min) / (hi - min) * (H - m.t - m.b);
  const el = svg('svg', {viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': points.map(p => `${p.label}: ${format(p.value)}`).join(', ')});
  bands.forEach((b, i) => { if (i % 2 && b.to > min && b.from < hi) el.append(svg('rect', {class: 'band', x: m.l, width: W - m.l - m.r, y: y(Math.min(hi, b.to)), height: Math.max(0, y(Math.max(min, b.from)) - y(Math.min(hi, b.to)))})); });
  for (const v of marks) {
    el.append(svg('line', {class: 'grid-line', x1: m.l, x2: W - m.r, y1: y(v), y2: y(v)}));
    el.append(svg('text', {x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end'}, format(v)));
  }
  if (range && range.length === points.length && points.length > 1) {
    const up = range.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(Math.min(hi, r.high)).toFixed(1)}`).join(' ');
    const down = range.map((r, i) => `L${x(i).toFixed(1)},${y(Math.max(min, r.low)).toFixed(1)}`).reverse().join(' ');
    el.append(svg('path', {class: 'range', d: `${up} ${down} Z`}));
    el.append(svg('path', {class: 'index-line', d: range.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r.value).toFixed(1)}`).join(' ')}));
  }
  if (points.length) {
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    if (!dotsOnly) {
      if (area) el.append(svg('path', {class: 'area', d: `${d} L${x(points.length - 1).toFixed(1)},${y(min)} L${x(0).toFixed(1)},${y(min)} Z`}));
      el.append(svg('path', {class: 'line', d}));
    }
    points.forEach((p, i) => el.append(svg('circle', {class: 'dot', cx: x(i), cy: y(p.value), r: i === points.length - 1 ? 5 : 3.5}, svg('title', null, `${p.label}: ${format(p.value)}`))));
    const first = points[0], last = points[points.length - 1];
    el.append(svg('text', {x: x(0), y: H - 4, 'text-anchor': points.length < 2 ? 'middle' : 'start'}, first.label));
    if (points.length > 1) el.append(svg('text', {x: x(points.length - 1), y: H - 4, 'text-anchor': 'end'}, last.label));
  }
  return h('div', {class: 'chart'}, el);
}

// A small trend line without axes (values on a fixed scale), the last point marked.
export function sparkline(values, {min = 0, max = 100, width = 96, height = 28} = {}) {
  const el = svg('svg', {class: 'spark', viewBox: `0 0 ${width} ${height}`, width, height, 'aria-hidden': 'true'});
  if (!values.length) return el;
  const x = i => (values.length < 2 ? width / 2 : 3 + i * (width - 6) / (values.length - 1));
  const y = v => height - 3 - (Math.max(min, Math.min(max, v)) - min) / (max - min || 1) * (height - 6);
  if (values.length > 1) el.append(svg('path', {d: values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}));
  el.append(svg('circle', {cx: x(values.length - 1), cy: y(values.at(-1)), r: 3}));
  return el;
}

// Where the Brain Mark lies on 0–100: the ± band and the value.
export function rangeBar(value, low, high) {
  const pct = v => `${Math.max(0, Math.min(100, v))}%`;
  return h('div', {class: 'bm-range', role: 'img', 'aria-label': `${Math.round(low)}–${Math.round(high)}`},
    h('span', {class: 'bm-band', style: {left: pct(low), width: pct(high - low)}}),
    h('span', {class: 'bm-dot', style: {left: pct(value)}}));
}
