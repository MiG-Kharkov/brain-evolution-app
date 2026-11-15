// Inline SVG icons (24×24, stroke = currentColor). Drawn for this project.
import { svg } from './dom.js';

const P = d => ['path', {d}];
const C = (cx, cy, r, extra = {}) => ['circle', {cx, cy, r, ...extra}];
const R = (x, y, width, height, rx = 2, extra = {}) => ['rect', {x, y, width, height, rx, ...extra}];

const ICONS = {
  home: [P('M3 10.5 12 3l9 7.5'), P('M5 9.5V20h5v-6h4v6h5V9.5')],
  games: [R(3, 3, 7.5, 7.5, 2), R(13.5, 3, 7.5, 7.5, 2), R(3, 13.5, 7.5, 7.5, 2), R(13.5, 13.5, 7.5, 7.5, 2)],
  progress: [P('M4 20V10'), P('M10 20V4'), P('M16 20v-7'), P('M22 20H2')],
  user: [C(12, 8, 4), P('M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7')],
  back: [P('M15 5l-7 7 7 7')],
  close: [P('M6 6l12 12'), P('M18 6 6 18')],
  chevron: [P('M9 5l7 7-7 7')],
  pause: [R(6, 5, 4, 14, 1.5), R(14, 5, 4, 14, 1.5)],
  play: [P('M7 4.5v15l12-7.5z')],
  help: [C(12, 12, 9.5), P('M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.4-2.7 4'), C(12, 17.4, .6, {fill: 'currentColor'})],
  restart: [P('M4 12a8 8 0 1 0 2.4-5.7'), P('M4 4v5h5')],
  trophy: [P('M7 4h10v5a5 5 0 0 1-10 0z'), P('M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11'), P('M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5'), P('M12 14v4'), P('M8 21h8'), P('M9 18h6')],
  medal: [C(12, 14.5, 5.5), P('M8.5 3h7l-2 6h-3z'), P('M12 12v5'), P('M10.2 13.6 12 12l1.8 1.6')],
  bulb: [P('M9 18h6'), P('M10 21h4'), P('M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.4 1.1 2.2h5c0-.8.3-1.6 1.1-2.2A6 6 0 0 0 12 3z')],
  calendar: [R(3.5, 5, 17, 15.5, 3), P('M3.5 10h17'), P('M8 3v4'), P('M16 3v4')],
  list: [P('M8 6h12'), P('M8 12h12'), P('M8 18h12'), C(4, 6, .8, {fill: 'currentColor'}), C(4, 12, .8, {fill: 'currentColor'}), C(4, 18, .8, {fill: 'currentColor'})],
  download: [P('M12 4v11'), P('M7 10.5 12 15.5l5-5'), P('M5 20h14')],
  upload: [P('M12 16V5'), P('M7 9.5 12 4.5l5 5'), P('M5 20h14')],
  trash: [P('M4 7h16'), P('M10 11v6'), P('M14 11v6'), P('M6 7l1 13h10l1-13'), P('M9 7V4h6v3')],
  edit: [P('M4 20h4L19 9l-4-4L4 16z'), P('M13.5 6.5l4 4')],
  check: [P('M5 12.5 10 17.5 19 7')],
  plus: [P('M12 5v14'), P('M5 12h14')],
  sound: [P('M4 9.5h3.5L12 6v12l-4.5-3.5H4z'), P('M15.5 9a4.5 4.5 0 0 1 0 6'), P('M18 6.5a8 8 0 0 1 0 11')],
  mute: [P('M4 9.5h3.5L12 6v12l-4.5-3.5H4z'), P('M16 9.5l5 5'), P('M21 9.5l-5 5')],
  globe: [C(12, 12, 9), P('M3 12h18'), P('M12 3c2.6 2.5 3.8 5.5 3.8 9s-1.2 6.5-3.8 9c-2.6-2.5-3.8-5.5-3.8-9S9.4 5.5 12 3z')],
  moon: [P('M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z')],
  sun: [C(12, 12, 4), P('M12 2v2'), P('M12 20v2'), P('M4.9 4.9l1.4 1.4'), P('M17.7 17.7l1.4 1.4'), P('M2 12h2'), P('M20 12h2'), P('M4.9 19.1l1.4-1.4'), P('M17.7 6.3l1.4-1.4')],
  smile: [C(12, 12, 9.5), P('M8 14a4.6 4.6 0 0 0 8 0'), C(9, 9.7, .7, {fill: 'currentColor'}), C(15, 9.7, .7, {fill: 'currentColor'})],
  lock: [R(5, 10.5, 14, 10, 2.5), P('M8 10.5V8a4 4 0 0 1 8 0v2.5')],
  star: [P('M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z')],
  flame: [P('M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.9 3.4-5.9 3.9-9.9 2.2 1.4 3.4 3.6 3.4 5.6 1-.6 1.7-1.7 1.8-3 1.9 1.5 3.9 4.1 3.9 7.3 0 3.5-2.6 6.1-6.5 6.1z')],
  timer: [C(12, 13.5, 7.5), P('M12 9.5v4l2.5 1.5'), P('M9.5 2.5h5')],
  target: [C(12, 12, 9), C(12, 12, 5), C(12, 12, 1.2, {fill: 'currentColor'})],
  info: [C(12, 12, 9.5), P('M12 11v6'), C(12, 7.6, .6, {fill: 'currentColor'})],
  brain: [P('M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 1.5 4.6A3 3 0 0 0 9 20h0V4.5z'), P('M15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-1.5 4.6A3 3 0 0 1 15 20V4.5z'), P('M9 4.5a3 3 0 0 1 6 0')],
  swap: [P('M7 4 3 8l4 4'), P('M3 8h14'), P('M17 20l4-4-4-4'), P('M21 16H7')],
  palette: [P('M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.4-1.2-1.6-1.2-3 0-1.1.9-2 2-2H17a4 4 0 0 0 4-4c0-4-4-7-9-7z'), C(7.5, 11, 1.2, {fill: 'currentColor'}), C(10, 7, 1.2, {fill: 'currentColor'}), C(14.5, 7, 1.2, {fill: 'currentColor'})],
  up: [P('M12 19V5'), P('M6 11l6-6 6 6')],
  down: [P('M12 5v14'), P('M6 13l6 6 6-6')],
  spark: [P('M12 3v4'), P('M12 17v4'), P('M3 12h4'), P('M17 12h4'), P('M6 6l2.5 2.5'), P('M15.5 15.5 18 18'), P('M6 18l2.5-2.5'), P('M15.5 8.5 18 6')],
  certificate: [R(3, 4, 18, 13, 2), P('M7 9h10'), P('M7 12.5h6'), C(16, 17, 2.5), P('M14.8 19.2 14 22l2-1 2 1-.8-2.8')],
};

// Rank stages: 1 Child … 7 Nobel Prize-winner.
const RANKS = {
  1: [C(12, 9, 4.5), P('M7.5 21c0-3.5 2-5.5 4.5-5.5s4.5 2 4.5 5.5'), P('M10.5 8.5h.01'), P('M13.5 8.5h.01')],
  2: [R(6, 7, 12, 14, 3), P('M9 7V5.5a3 3 0 0 1 6 0V7'), P('M6 12h12')],
  3: [P('M2 9.5 12 5l10 4.5-10 4.5z'), P('M6 11.5V16c2 1.8 10 1.8 12 0v-4.5'), P('M21 10v5')],
  4: [P('M9 3h6'), P('M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3'), P('M7.5 15h9')],
  5: [P('M6 3h9l4 4v14H6z'), P('M15 3v4h4'), P('M9 12h7'), P('M9 16h5')],
  6: [R(3, 4, 18, 12, 2), P('M7 20l2-4'), P('M17 20l-2-4'), P('M7 9h6'), P('M7 12h4')],
  7: [C(12, 9, 6), P('M8.5 14 7 22l5-3 5 3-1.5-8'), P('M12 6.5l.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3z')],
};

// Game glyphs drawn on a 24-unit grid; some shapes are filled.
const F = {fill: 'currentColor', stroke: 'none'};
const GAMES = {
  arithmetics: [P('M7 5v6'), P('M4 8h6'), P('M14 8h6'), P('M5 16l4 4'), P('M9 16l-4 4'), C(17, 15.3, .9, F), C(17, 20.7, .9, F), P('M14 18h6')],
  quadronica: [R(3, 3, 7, 7, 2, F), R(14, 3, 7, 7, 2, {...F, opacity: .55}), R(3, 14, 7, 7, 2, {...F, opacity: .55}), R(14, 14, 7, 7, 2, F)],
  memorics: [C(7.5, 7.5, 4), R(13, 3.5, 8, 8, 1.5), P('M7.5 13.5l4.5 7.5H3z'), C(17, 17, 4, F)],
  sudoku: [R(3, 3, 18, 18, 2.5), P('M9 3v18'), P('M15 3v18'), P('M3 9h18'), P('M3 15h18'), C(6, 6, 1.2, F), C(12, 12, 1.2, F), C(18, 18, 1.2, F)],
  pairs: [R(3, 5, 9, 13, 2, {transform: 'rotate(-8 7.5 11.5)'}), R(12, 5, 9, 13, 2, {...F, transform: 'rotate(8 16.5 11.5)'})],
  numbers: [R(3, 3, 8, 8, 2), R(13, 3, 8, 8, 2, F), R(3, 13, 8, 8, 2, F), R(13, 13, 8, 8, 2)],
  roadblocks: [R(3, 3, 18, 18, 3), C(8, 8, 2.2, F), P('M8 13v4h8'), P('M13 14l3 3-3 3'), R(13, 6, 4, 4, 1, {...F, opacity: .55})],
  guess_who: [C(12, 13, 6), P('M9 7.5 6 3'), P('M15 7.5 18 3'), C(9.8, 12.5, 1, F), C(14.2, 12.5, 1, F), P('M10 16.2c1.2.9 2.8.9 4 0')],
  minesweeper: [C(12, 13, 6, F), P('M12 4v3'), P('M12 19v3'), P('M3 13h3'), P('M18 13h3'), P('M5.6 6.6l2 2'), P('M16.4 17.4l2 2'), P('M18.4 6.6l-2 2'), P('M7.6 17.4l-2 2')],
  geometry: [P('M12 3 21 9.5 17.5 20h-11L3 9.5z'), C(12, 3, 1.6, F), C(21, 9.5, 1.6, F), C(17.5, 20, 1.6, F), C(6.5, 20, 1.6, F), C(3, 9.5, 1.6, F)],
  encyclopedia: [P('M4 4.5h6a2 2 0 0 1 2 2V20a2 2 0 0 0-2-2H4z'), P('M20 4.5h-6a2 2 0 0 0-2 2V20a2 2 0 0 1 2-2h6z'), P('M6.5 8.5h3'), P('M14.5 8.5h3')],
  matches: [P('M5 6h14'), P('M5 18h14'), P('M5 6v12'), P('M19 6v12'), C(5, 6, 1.6, F), C(19, 6, 1.6, F), C(5, 18, 1.6, F), C(19, 18, 1.6, F)],
};

function draw(shapes, size) {
  const el = svg('svg', {viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
    'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false'});
  for (const [tag, attrs] of shapes) el.append(svg(tag, attrs));
  return el;
}

export const icon = (name, size = 24) => draw(ICONS[name] || ICONS.info, size);
export const rankIcon = (rank, size = 32) => draw(RANKS[rank] || RANKS[1], size);
export const gameGlyph = (id, size = 28) => draw(GAMES[id] || ICONS.games, size);

// Category colour per game (CSS custom property used by .game-icon).
export const GAME_COLOR = {
  arithmetics: 'var(--cat-calc)', numbers: 'var(--cat-speed)', quadronica: 'var(--cat-pattern)', guess_who: 'var(--cat-pattern)',
  memorics: 'var(--cat-memory)', pairs: 'var(--cat-memory)', geometry: 'var(--cat-memory)', encyclopedia: 'var(--cat-memory)',
  sudoku: 'var(--cat-logic)', minesweeper: 'var(--cat-logic)', matches: 'var(--cat-spatial)', roadblocks: 'var(--cat-spatial)',
};

export function logo(size = 28) {
  const el = svg('svg', {viewBox: '0 0 32 32', width: size, height: size, 'aria-hidden': 'true'});
  el.append(svg('rect', {x: 1, y: 1, width: 30, height: 30, rx: 9, fill: 'var(--accent)'}));
  for (const [tag, attrs] of ICONS.brain) el.append(svg(tag, {...attrs, transform: 'translate(4 4)', fill: 'none', stroke: '#fff', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'}));
  return el;
}
