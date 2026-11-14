// Small DOM builder: every text goes through textContent, so data never becomes markup.
//   h('button', {class: 'btn', onclick: fn, 'aria-label': 'x'}, 'Text', childNode, [more])
const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, props = null, ...children) {
  const el = tag.startsWith('svg:') ? document.createElementNS(SVG_NS, tag.slice(4)) : document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith('aria-') && typeof value === 'boolean') { el.setAttribute(key, String(value)); continue; }
      if (value === false || value === null || value === undefined) continue;
      if (key === 'class') el.setAttribute('class', value);
      else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
      else if (key === 'html') throw new Error('h(): raw html is not allowed');
      else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(el) { el.replaceChildren(); return el; }

export function mount(el, ...children) { el.replaceChildren(); return append(el, children); }

export const svg = (tag, attrs = {}, ...children) => h(`svg:${tag}`, attrs, ...children);

// Locale-aware number formatting.
export function fmt(value, digits = 0, locale = document.documentElement.lang || 'ru') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString(locale, {minimumFractionDigits: digits, maximumFractionDigits: digits});
}

export function fmtTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
