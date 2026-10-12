// HTML interface pieces: pixel frames, dialogue box with typewriter text,
// toasts, the area banner, the hover tooltip and the tabbed menu shell.
import { frameWood, framePanel, frameSlot, frameButton, cursor, uiIcon, scaledURL } from './art-ui.js';
import { sfx } from './audio.js';

const $ = (s, r = document) => r.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Pixel styles: frames are rendered at the exact device scale, so the browser
// maps one image pixel to one device pixel and nothing gets smoothed.
// ---------------------------------------------------------------------------
const iconCache = new Map();
export function applyPixelStyles(worldScale, dpr) {
  const small = Math.min(innerWidth, innerHeight) < 600 || matchMedia('(pointer: coarse)').matches;
  const s = small ? Math.max(worldScale, Math.round(1.5 * dpr)) : worldScale;
  const px = s / dpr;
  document.documentElement.style.setProperty('--px', `${px}px`);
  const wood = scaledURL(frameWood(), s), panel = scaledURL(framePanel(), s);
  const slot = scaledURL(frameSlot(false), s), slotOn = scaledURL(frameSlot(true), s);
  const btn = scaledURL(frameButton(false), s), btnH = scaledURL(frameButton(true), s);
  const cur = scaledURL(cursor('arrow'), 2), hand = scaledURL(cursor('hand'), 2);
  let el = $('#pixelStyles');
  if (!el) { el = document.createElement('style'); el.id = 'pixelStyles'; document.head.append(el); }
  el.textContent = `
    :root { --cursor-arrow: url(${cur}) 2 2, auto; --cursor-hand: url(${hand}) 10 4, pointer; }
    .frame { border-width: ${8 * px}px; border-image: url(${wood}) ${8 * s} fill / ${8 * px}px stretch; }
    .panel { border-width: ${4 * px}px; border-image: url(${panel}) ${4 * s} fill / ${4 * px}px stretch; }
    .slot { border-width: ${5 * px}px; border-image: url(${slot}) ${5 * s} fill / ${5 * px}px stretch; }
    .slot.sel, .slot:hover { border-image-source: url(${slotOn}); }
    .wbtn, .tab, .linkbtn { border-style: solid; border-width: ${5 * px}px; border-image: url(${btn}) ${5 * s} fill / ${5 * px}px stretch; }
    .wbtn:hover, .tab:hover, .linkbtn:hover, .tab[aria-selected="true"] { border-image-source: url(${btnH}); }
  `;
  iconCache.clear();
  for (const i of document.querySelectorAll('.ico[data-i]')) setIcon(i, i.dataset.i);
}
export function iconURL(key) {
  if (!iconCache.has(key)) iconCache.set(key, scaledURL(uiIcon(key), 4));
  return iconCache.get(key);
}
export function setIcon(el, key) { el.dataset.i = key; el.style.backgroundImage = `url(${iconURL(key)})`; }

// ---------------------------------------------------------------------------
// Dialogue
// ---------------------------------------------------------------------------
const dlg = { el: null, open: false, pages: [], page: 0, shown: 0, timer: 0, choices: [], sel: 0, onClose: null };
export function dialogueOpen() { return dlg.open; }
export function openDialogue({ name = '', head = '', portrait = null, pages = [], choices = [], onClose = null }) {
  const el = $('#dialogue');
  dlg.el = el; dlg.open = true; dlg.pages = pages.length ? pages : ['...']; dlg.page = 0; dlg.choices = choices; dlg.sel = 0; dlg.onClose = onClose;
  $('.dname', el).textContent = name;
  $('.dspeaker', el).textContent = name;
  $('.dhead', el).textContent = head;
  document.body.classList.add('talking');
  const pc = $('.dport canvas', el), g = pc.getContext('2d');
  pc.width = pc.height = 128;
  g.clearRect(0, 0, 128, 128);
  if (portrait) {
    g.imageSmoothingEnabled = false;
    const sc = Math.max(1, Math.floor(128 / Math.max(portrait.width, portrait.height)));
    g.drawImage(portrait, Math.round((128 - portrait.width * sc) / 2), Math.round((128 - portrait.height * sc) / 2), portrait.width * sc, portrait.height * sc);
  }
  el.hidden = false;
  showPage();
  sfx.open();
}
function showPage() {
  const el = dlg.el, text = dlg.pages[dlg.page];
  const tEl = $('.dtext', el), cEl = $('.dchoices', el), nEl = $('.dnext', el);
  cEl.innerHTML = ''; nEl.hidden = true;
  clearInterval(dlg.timer);
  dlg.shown = reduced ? text.length : 0;
  const tick = () => {
    dlg.shown = Math.min(text.length, dlg.shown + 2);
    tEl.textContent = text.slice(0, dlg.shown);
    if (dlg.shown % 6 === 0) sfx.blip(dlg.shown);
    if (dlg.shown >= text.length) { clearInterval(dlg.timer); dlg.timer = 0; pageDone(); }
  };
  if (reduced) { tEl.textContent = text; pageDone(); } else dlg.timer = setInterval(tick, 28);
}
function pageDone() {
  const el = dlg.el, last = dlg.page === dlg.pages.length - 1;
  $('.dnext', el).hidden = last && dlg.choices.length > 0;
  if (last && dlg.choices.length) {
    const cEl = $('.dchoices', el);
    dlg.choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'choice' + (i === dlg.sel ? ' sel' : '');
      b.textContent = c.label;
      b.onclick = (e) => { e.stopPropagation(); choose(i); };
      b.onmouseenter = () => { dlg.sel = i; markSel(); };
      cEl.append(b);
    });
  }
}
function markSel() { [...$('.dchoices', dlg.el).children].forEach((b, i) => b.classList.toggle('sel', i === dlg.sel)); }
function choose(i) {
  const c = dlg.choices[i];
  sfx.select();
  if (c.keepOpen) { c.action?.(); return; }
  closeDialogue(false);
  c.action?.();
}
export function advanceDialogue() {
  if (!dlg.open) return;
  const text = dlg.pages[dlg.page];
  if (dlg.timer) { clearInterval(dlg.timer); dlg.timer = 0; dlg.shown = text.length; $('.dtext', dlg.el).textContent = text; pageDone(); return; }
  if (dlg.page < dlg.pages.length - 1) { dlg.page++; showPage(); return; }
  if (dlg.choices.length) { choose(dlg.sel); return; }
  closeDialogue();
}
export function closeDialogue(sound = true) {
  if (!dlg.open) return;
  clearInterval(dlg.timer); dlg.timer = 0;
  dlg.open = false; dlg.el.hidden = true;
  document.body.classList.remove('talking');
  if (sound) sfx.close();
  const cb = dlg.onClose; dlg.onClose = null;
  cb?.();
}
export function dialogueKey(e) {
  if (!dlg.open || e.metaKey || e.ctrlKey || e.altKey) return false;
  const k = e.code;
  const choicesVisible = dlg.page === dlg.pages.length - 1 && !dlg.timer && dlg.choices.length;
  if (choicesVisible && (k === 'ArrowUp' || k === 'KeyW' || k === 'ArrowDown' || k === 'KeyS')) {
    dlg.sel = (dlg.sel + (k === 'ArrowUp' || k === 'KeyW' ? -1 : 1) + dlg.choices.length) % dlg.choices.length;
    markSel(); sfx.select(); return true;
  }
  if (k === 'KeyE' || k === 'Space' || k === 'Enter' || k === 'KeyX' || k === 'NumpadEnter') { advanceDialogue(); return true; }
  if (k === 'Escape') { closeDialogue(); return true; }
  return false; // the game is paused while talking, so other keys do nothing anyway
}

// ---------------------------------------------------------------------------
// Toasts, banner, hint, tooltip
// ---------------------------------------------------------------------------
export function toast(title, sub = '', iconCanvas = null) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = 'toast frame';
  if (iconCanvas) { const c = document.createElement('canvas'); c.width = iconCanvas.width; c.height = iconCanvas.height; c.getContext('2d').drawImage(iconCanvas, 0, 0); t.append(c); }
  const d = document.createElement('div');
  const b = document.createElement('b'); b.textContent = title; d.append(b);
  if (sub) { const s = document.createElement('small'); s.textContent = sub; d.append(s); }
  t.append(d);
  box.append(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => t.remove(), 4200);
}
let bannerTimer = 0;
export function banner(title, sub, color) {
  const b = $('#banner');
  $('h2', b).textContent = title;
  $('h2', b).style.color = color ? shadeCss(color) : '';
  $('p', b).textContent = sub || '';
  b.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove('show'), 2600);
}
function shadeCss(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgb(${Math.round(r * 0.7)},${Math.round(g * 0.7)},${Math.round(b * 0.7)})`;
}
export function hint(html) {
  const h = $('#hint');
  if (!html) { h.classList.remove('show'); return; }
  h.innerHTML = html;
  h.classList.add('show');
}
export function tooltip(text, x, y) {
  const t = $('#tooltip');
  if (!text) { t.classList.remove('show'); return; }
  t.textContent = text;
  t.style.left = `${x + 18}px`; t.style.top = `${y + 14}px`;
  t.classList.add('show');
}

// ---------------------------------------------------------------------------
// Menu shell: tabs registered by main.js
// ---------------------------------------------------------------------------
const menu = { open: false, tab: null, tabs: [], onClose: null };
export function menuOpen() { return menu.open; }
export function setupMenu(tabs, onClose) {
  menu.tabs = tabs; menu.onClose = onClose;
  const bar = $('#menu .tabs');
  bar.innerHTML = '';
  for (const t of tabs) {
    const b = document.createElement('button');
    b.className = 'tab'; b.role = 'tab'; b.dataset.tab = t.id;
    const i = document.createElement('i'); i.className = 'ico'; setIcon(i, t.icon);
    const s = document.createElement('span'); s.textContent = t.label;
    b.append(i, s);
    b.onclick = () => { sfx.select(); showTab(t.id); };
    bar.append(b);
  }
  bar.append($('#mClose'));
  $('#mClose').onclick = () => closeMenu();
  $('#menu').addEventListener('pointerdown', (e) => { if (e.target.id === 'menu') closeMenu(); });
}
export function openMenu(tab) {
  const m = $('#menu');
  if (!menu.open) sfx.open();
  menu.open = true; m.hidden = false;
  document.body.classList.add('inmenu');
  showTab(tab || menu.tab || menu.tabs[0].id);
}
export function showTab(id) {
  menu.tab = id;
  for (const b of document.querySelectorAll('#menu .tab')) b.setAttribute('aria-selected', String(b.dataset.tab === id));
  const c = $('#menu .mcontent');
  c.innerHTML = '';
  menu.tabs.find((t) => t.id === id)?.render(c);
}
export function refreshMenu() { if (menu.open) showTab(menu.tab); }
export function closeMenu() {
  if (!menu.open) return;
  menu.open = false; $('#menu').hidden = true; sfx.close();
  document.body.classList.remove('inmenu');
  menu.onClose?.();
}
export function currentTab() { return menu.open ? menu.tab : null; }
