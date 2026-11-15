// Sheets (bottom sheet on phones, centred dialog on wide screens), confirm/prompt and toasts.
// Focus stays inside an open sheet, Esc closes it, focus returns to the opener.
// A sheet that can be closed has a grip at the top: on a phone the sheet follows a finger dragged down from the grip
// or the title and closes when it is let go far or fast enough — the same as the cross. A sheet that cannot be
// closed (a game result) has neither the cross nor the grip (3.9, owner: the grip looked draggable and was not).
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { i18n } from '../i18n.js';

const t = (en, ru) => i18n.t(en, ru);
const stack = [];

export function sheet({title = '', body = [], actions = [], dismissible = true, onClose = null, className = ''} = {}) {
  const opener = document.activeElement;
  const closeBtn = dismissible ? h('button', {class: 'icon-btn', 'aria-label': t('Close', 'Закрыть'), onclick: () => close()}, icon('close')) : null;
  const grip = dismissible ? h('div', {class: 'sheet-grip', 'aria-hidden': 'true'}, h('i')) : null;
  const head = title || closeBtn ? h('div', {class: 'sheet-head'}, h('h2', null, title), closeBtn) : null;
  const panel = h('div', {class: `sheet ${dismissible ? '' : 'sheet-fixed'} ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || t('Dialog', 'Окно')},
    grip, head,
    body,
    actions.length ? h('div', {class: 'sheet-actions'}, actions) : null);
  const scrim = h('div', {class: 'scrim', onclick: e => { if (e.target === scrim && dismissible) close(); }}, panel);
  let closed = false;
  function close(reason = 'close') {
    if (closed) return;
    closed = true;
    scrim.remove();
    stack.splice(stack.indexOf(api), 1);
    if (opener && document.contains(opener)) opener.focus?.({preventScroll: true});
    onClose?.(reason);
  }
  if (grip) dragToClose(panel, [grip, head].filter(Boolean), grip, () => close());
  const api = {close, panel, scrim, dismissible};
  stack.push(api);
  document.body.append(scrim);
  requestAnimationFrame(() => (panel.querySelector('[autofocus]') || panel.querySelector('button, input, select, [tabindex]'))?.focus({preventScroll: true}));
  return api;
}

// Dragging a sheet down by its grip or title. Only where the grip is shown (a phone: on a wide screen the sheet is
// a dialog in the middle). The sheet moves with the finger; past a third of its height or 120 px, or with a quick
// flick, it slides away and closes, otherwise it springs back.
function dragToClose(panel, zones, grip, close) {
  let drag = null;
  const end = event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dy = Math.max(0, event.clientY - drag.y), speed = dy / Math.max(1, event.timeStamp - drag.t);
    const far = dy > Math.min(120, panel.offsetHeight / 3) || (dy > 30 && speed > 0.6);
    drag = null;
    panel.classList.remove('dragging');
    if (event.type === 'pointerup' && far) { panel.style.transform = 'translateY(105%)'; setTimeout(close, 170); }
    else panel.style.transform = '';
  };
  for (const zone of zones) {
    zone.addEventListener('pointerdown', event => {
      if (event.button || drag || event.target.closest('button, a, input') || getComputedStyle(grip).display === 'none') return;
      drag = {id: event.pointerId, y: event.clientY, t: event.timeStamp};
      zone.setPointerCapture?.(event.pointerId);
      panel.classList.add('dragging');
    });
    zone.addEventListener('pointermove', event => {
      if (drag && event.pointerId === drag.id) panel.style.transform = `translateY(${Math.max(0, event.clientY - drag.y)}px)`;
    });
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }
}

export function closeAllSheets() { while (stack.length) stack[stack.length - 1].close('route'); }
export const hasSheet = () => stack.length > 0;

document.addEventListener('keydown', event => {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (event.key === 'Escape' && top.dismissible) { event.preventDefault(); top.close('escape'); }
  if (event.key === 'Tab') {
    const items = [...top.panel.querySelectorAll('button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

export function confirmDialog({title, text, ok = t('OK', 'ОК'), cancel = t('Cancel', 'Отмена'), danger = false}) {
  return new Promise(resolve => {
    let answered = false;
    const s = sheet({title, body: text ? [h('p', {class: 'muted'}, text)] : [],
      actions: [
        h('button', {class: `btn btn-block ${danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => { answered = true; s.close(); resolve(true); }}, ok),
        h('button', {class: 'btn btn-block btn-ghost', onclick: () => { answered = true; s.close(); resolve(false); }}, cancel)],
      onClose: () => { if (!answered) resolve(false); }});
  });
}

export function promptDialog({title, label = '', value = '', ok = t('Save', 'Сохранить'), maxLength = 40}) {
  return new Promise(resolve => {
    let answered = false;
    const input = h('input', {class: 'input', id: 'prompt-input', value, maxlength: maxLength, autofocus: true, autocomplete: 'off'});
    const submit = () => { const v = input.value.trim(); if (!v) { input.focus(); return; } answered = true; s.close(); resolve(v); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    const s = sheet({title, body: [h('div', {class: 'field'}, label ? h('label', {for: 'prompt-input'}, label) : null, input)],
      actions: [h('button', {class: 'btn btn-primary btn-block', onclick: submit}, ok)],
      onClose: () => { if (!answered) resolve(null); }});
    requestAnimationFrame(() => { input.focus(); input.select(); });
  });
}

let toastHost;
export function toast(message, ms = 2600) {
  if (!toastHost) { toastHost = h('div', {class: 'toast-host', role: 'status', 'aria-live': 'polite'}); document.body.append(toastHost); }
  const el = h('div', {class: 'toast'}, message);
  toastHost.append(el);
  setTimeout(() => el.remove(), ms);
}
