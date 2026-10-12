// Boots the valley and wires the game to the interface: save state, quests,
// every interaction's dialogue, the menu tabs, the HUD and the title screen.
import { PROFILE, GAME, HOME, DISTRICTS } from '../content.js';
import { buildWorld, T } from './world.js';
import { buildAssets, lookFrames } from './assets.js';
import { Game } from './game.js';
import * as UI from './ui.js';
import { sfx, unlockAudio, setSound } from './audio.js';
import { logo, scaledURL } from './art-ui.js';
import { petFrames } from './art-chars.js';
import { SKINS, HAIRS, SHIRTS, PANTS } from './palette.js';
import { unpack } from './art-core.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter((k) => k != null)); return e; };
// Yield so the loading bar can paint (falls back to a timer when the tab is hidden and rAF is paused).
const nextFrame = () => new Promise((r) => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 60); });
const coarse = matchMedia('(pointer: coarse)').matches;
if (coarse) document.body.classList.add('coarse');

// ---------------------------------------------------------------------------
// Save state (this browser only; the valley works fine without it)
// ---------------------------------------------------------------------------
const KEY = 'aaransValley.v1';
const fresh = () => ({ found: [], visited: [], flags: {}, done: {}, opts: { sound: true, time: 'real', season: 'auto', zoom: 1 }, look: { ...GAME.look }, pos: null, started: false });
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } }
let S = fresh();
const saved = load();
if (saved) { S = { ...S, ...saved, opts: { ...S.opts, ...saved.opts }, look: { ...S.look, ...saved.look }, flags: { ...saved.flags }, done: { ...saved.done } }; }
function save() {
  if (game && !titleUp) S.pos = { x: game.player.x, y: game.player.y, dir: game.player.dir };
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode: keep going without saving */ }
}

const autoSeason = () => {
  const d = new Date(), md = (d.getMonth() + 1) * 100 + d.getDate();
  return md >= 1221 || md < 320 ? 'winter' : md < 621 ? 'spring' : md < 922 ? 'summer' : 'fall';
};
const season = () => (S.opts.season === 'auto' ? autoSeason() : S.opts.season);
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const fill = (s) => s.replaceAll('{valley}', GAME.title).replaceAll('{pet}', GAME.petName);

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------
const world = buildWorld();
const LOTS = world.placed;
const TOTAL = LOTS.length;
const districtsHere = world.areas.filter((a) => a.kind === 'district' && a.id !== 's2');
let assets, game, titleUp = true, snapshot = null;

const iconFor = (lot) => assets.A.get(`icon:${lot.sprite}`) || assets.A.get('icon:unknown');
const propFor = (lot) => { const a = assets.A.get(`prop:${lot.sprite || 'generic'}`); return Array.isArray(a) ? a[0] : a; };
// All at least 4.5:1 against white text.
const statusColor = { 'Running': '#2e7a38', 'In progress': '#a8620c', 'Done': '#4a5a80', 'Now': '#6a3ba0', 'Open': '#c0301c' };

// ---------------------------------------------------------------------------
// Dialogue helpers (pausing the game while the box is open)
// ---------------------------------------------------------------------------
function talk(spec) {
  game.paused = true;
  game.keys.clear();
  UI.hint(null);
  const onClose = spec.onClose;
  UI.openDialogue({ ...spec, onClose: () => { game.paused = UI.menuOpen(); onClose?.(); refreshHint(); } });
}
// Break long text into dialogue pages at sentence boundaries.
function pages(text, max = 190) {
  const out = [];
  let cur = '';
  for (const s of text.match(/[^.!?]+[.!?]+["')]*\s*|[^.!?]+$/g) || [text]) {
    if ((cur + s).length > max && cur) { out.push(cur.trim()); cur = ''; }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------
const QUESTS = [
  { id: 'hello', title: `Say hi to ${GAME.petName}`, desc: 'The robot in the town square knows the place.', check: () => !!S.flags.hello },
  { id: 'districts', title: 'Visit every district', desc: 'Walk down each street from the square.', progress: () => [districtsHere.filter((a) => S.visited.includes(a.district.id)).length, districtsHere.length] },
  { id: 'projects', title: 'Find every project', desc: 'Inspect each display. They land in your toolbar.', progress: () => [S.found.filter((id) => LOTS.some((l) => l.lot.id === id)).length, TOTAL] },
  { id: 'house', title: "Knock on Aaran's door", desc: 'The house is south of the square, down either lane.', check: () => !!S.flags.house },
  { id: 'mail', title: 'Check the mailbox', desc: "It's by Aaran's front door.", check: () => !!S.flags.mail },
  { id: 'pier', title: 'Walk to the end of the pier', desc: 'Past South Lane and over the beach.', check: () => !!S.flags.pier },
];
const questDone = (q) => (q.check ? q.check() : (([a, b]) => b > 0 && a >= b)(q.progress()));
function checkQuests(quiet = false) {
  let changed = false;
  for (const q of QUESTS) {
    if (questDone(q) && !S.done[q.id]) {
      S.done[q.id] = true; changed = true;
      if (!quiet) { UI.toast('Quest complete!', q.title, assets.A.get('icon:tks')); sfx.quest(); }
    }
  }
  game.mailFlag = allFound() && !S.flags.letter;
  if (changed) { save(); UI.refreshMenu(); }
}
const allFound = () => LOTS.every((l) => S.found.includes(l.lot.id));

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------
const VERB = { lot: 'Inspect', door: 'Knock', house: 'Knock', mailbox: 'Open', bin: 'Open', board: 'Read', areaSign: 'Read', welcome: 'Read', signpost: 'Read', pet: 'Talk', chicken: 'Pet', fountain: 'Look', bench: 'Sit', campfire: 'Warm up', pier: 'Look', field: 'Look', dock: 'Look', soon: 'Read' };

function interact(it) {
  if (!it || UI.dialogueOpen() || UI.menuOpen()) return;
  unlockAudio();
  switch (it.kind) {
    case 'lot': return readLot(it);
    case 'door': return districtDoor(it.district);
    case 'areaSign': return talk({ name: it.district.name, portrait: iconFor(it.district.lots[0]), pages: [it.district.summary, summaryLine(it.district)] });
    case 'house': return houseTalk();
    case 'mailbox': return mailboxTalk();
    case 'bin': sfx.open(); return openMenu('collection');
    case 'board': sfx.open(); return openMenu('quests');
    case 'welcome': return talk({ name: 'Welcome sign', portrait: assets.A.get('icon:house'), pages: [`Welcome to ${GAME.title}!`, 'Every fenced yard is a district. Every display in a yard is one of my projects.', 'The quest board is across the square, and the signpost points the way.'] });
    case 'signpost': return talk({ name: 'Signpost', portrait: assets.A.get('icon:dashboard'), pages: directions() });
    case 'pet': return petTalk();
    case 'chicken': sfx.cluck(); game.hearts(it.ref.x, it.ref.y - 26); return;
    case 'fountain': sfx.splash(); return talk({ name: 'Fountain', pages: ['You toss a coin in. Plink!'] });
    case 'bench': return talk({ name: 'Bench', pages: [game.sky().k > 0.6 ? 'You sit and look up. The stars are out tonight.' : 'You sit for a moment. The valley is nice and quiet.'] });
    case 'campfire': return talk({ name: 'Campfire', pages: ['The fire crackles. A good spot to think about the next build.'] });
    case 'pier': S.flags.pier = true; checkQuests(); return talk({ name: 'The sea', pages: ['The sea stretches out as far as you can see.'] });
    case 'field': return talk({ name: 'Field', pages: [{ spring: 'Cauliflower, coming along nicely.', summer: 'Tomatoes, nearly ripe.', fall: 'Pumpkins! Almost harvest time.', winter: 'The field is resting under the snow.' }[season()]] });
    case 'dock': return talk({ name: 'Dock', pages: ['Little fish dart around under the lily pads.'] });
    case 'soon': return talk({ name: 'Coming soon', pages: ['This plot is reserved for my next build. Check back soon!'] });
  }
}

function summaryLine(d) {
  const here = LOTS.filter((l) => l.district === d);
  const found = here.filter((l) => S.found.includes(l.lot.id)).length;
  return `${here.length} project${here.length === 1 ? '' : 's'} on display. You've found ${found}.`;
}

function readLot(it) {
  const { lot, district: d, code } = it;
  const first = !S.found.includes(lot.id);
  if (first) { S.found.push(lot.id); save(); updateHUD(); }
  const pg = [lot.oneLiner, ...pages(lot.body)];
  if (lot.points?.length) pg.push(lot.points.map((p) => `• ${p}`).join('\n'));
  const choices = [];
  for (const l of lot.links || []) choices.push({ label: `Open ${l.label} ↗`, keepOpen: true, action: () => window.open(l.url, '_blank', 'noopener') });
  const i = LOTS.indexOf(it), next = LOTS[(i + 1) % LOTS.length];
  if (next && next !== it) choices.push({ label: `Walk me to the next one: ${next.lot.title}`, action: () => game.walkTo(next, () => interact(next)) });
  choices.push({ label: 'Done', action: () => {} });
  talk({
    name: lot.title, head: `${d.name} · ${code} · ${lot.status}${lot.year ? ' · ' + lot.year : ''}`,
    portrait: propFor(lot), pages: pg, choices,
    onClose: () => {
      if (!first) return;
      game.holdUp(iconFor(lot));
      sfx.get();
      UI.toast(`Found: ${lot.title}`, `${S.found.length} of ${TOTAL} projects`, iconFor(lot));
      buildToolbar(lot.id);
      checkQuests();
    },
  });
}

function districtDoor(d) {
  const here = LOTS.filter((l) => l.district === d);
  const list = here.map((l) => `${S.found.includes(l.lot.id) ? '✓' : '·'} ${l.lot.title}`).join('\n');
  const unseen = here.find((l) => !S.found.includes(l.lot.id));
  const choices = [];
  if (unseen) choices.push({ label: `Show me one I haven't seen: ${unseen.lot.title}`, action: () => game.walkTo(unseen, () => interact(unseen)) });
  choices.push({ label: 'Close', action: () => {} });
  talk({ name: d.name, portrait: iconFor(d.lots[0]), head: 'Nobody answers, but there is a note on the door:', pages: [d.summary, `On display here:\n${list}`], choices });
}

function houseTalk() {
  S.flags.house = true; checkQuests();
  const pg = [...HOME.house.lines, ...pages(PROFILE.about)];
  if (PROFILE.lookingFor && !PROFILE.lookingFor.startsWith('TODO')) pg.push(PROFILE.lookingFor);
  talk({
    name: HOME.house.title, portrait: assets.A.get('icon:house'), pages: pg,
    choices: [{ label: 'Open the classic website', action: () => { save(); location.href = 'classic.html'; } }, { label: 'Close', action: () => {} }],
  });
}

function contactChoices() {
  const out = PROFILE.links.map((l) => ({ label: `${l.label} ↗`, keepOpen: true, action: () => window.open(l.url, '_blank', 'noopener') }));
  if (PROFILE.email) out.push({ label: `Email: ${PROFILE.email}`, keepOpen: true, action: () => { location.href = `mailto:${PROFILE.email}`; } });
  out.push({ label: 'Close', action: () => {} });
  return out;
}
function mailboxTalk() {
  S.flags.mail = true;
  const pg = [];
  if (allFound() && !S.flags.letter) {
    S.flags.letter = true;
    pg.push("There's a letter inside!", `"You found every project in the valley. Thanks for looking around, it means a lot. Say hi any time." - ${PROFILE.name}`);
  }
  pg.push(...HOME.mailbox.lines);
  checkQuests();
  talk({ name: HOME.mailbox.title, portrait: assets.A.get('icon:mailbox'), pages: pg, choices: contactChoices() });
}

function directions() {
  const where = { n: 'North', e: 'East', s: 'South', w: 'West' };
  const lines = Object.entries(world.bySlot).map(([slot, d]) => `${where[slot]}: ${d.name}`);
  return [`Every street starts at this square.\n${lines.join('\n')}`, "Aaran's house and the beach are at the bottom of the south street. Press 1 to 4 to jump to a district."];
}

let tipIndex = 0;
function petTalk() {
  sfx.beep();
  const pet = assets.A.get('pet').down[0];
  if (!S.flags.hello) return welcome();
  const n = S.found.length;
  const tips = (coarse && GAME.tipsTouch) || GAME.tips;
  const line = n >= TOTAL ? 'You found everything! Check the mailbox at the house. I think there is a letter for you.' : `You've found ${n} of ${TOTAL} projects. ${fill(tips[tipIndex++ % tips.length])}`;
  talk({ name: GAME.petName, portrait: pet, pages: [line] });
}
function welcome() {
  const pet = assets.A.get('pet').down[0];
  talk({
    name: GAME.petName, portrait: pet, pages: ((coarse && GAME.welcomeTouch) || GAME.welcome).map(fill),
    onClose: () => { S.flags.hello = true; checkQuests(); UI.toast('New quests', coarse ? 'Check the quest board, or Menu > Quests.' : 'Check the quest board, or press J.', assets.A.get('icon:dashboard')); },
  });
}

// ---------------------------------------------------------------------------
// HUD: clock, counter, hint, toolbar
// ---------------------------------------------------------------------------
function updateHUD() {
  const m = game.minutes(), d = new Date();
  const h = Math.floor(m / 60) % 24, mm = Math.floor(m % 60);
  const day = d.toLocaleDateString('en-US', { weekday: 'short' });
  $('#clock .date').textContent = `${day}. ${d.getDate()}`;
  $('#clock .time').textContent = `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  $('#clock .sun').classList.toggle('moon', h < 6 || h >= 19);
  $('#clock .season').textContent = cap(season());
  $('#found span').textContent = `${S.found.filter((id) => LOTS.some((l) => l.lot.id === id)).length}/${TOTAL}`;
}
function refreshHint() {
  const t = game?.target;
  if (!t || UI.dialogueOpen() || UI.menuOpen() || titleUp) { UI.hint(null); $('#tAct').disabled = true; return; }
  $('#tAct').disabled = false;
  const verb = VERB[t.kind] || 'Inspect';
  const key = coarse ? 'A' : 'E';
  UI.hint(`<b class="key">${key}</b>${verb} · ${escapeHtml(t.label || '')}`);
}
function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

function buildToolbar(fresh = null) {
  const bar = $('#toolbar');
  bar.innerHTML = '';
  bar.style.setProperty('--n', LOTS.length);
  for (const it of LOTS) {
    const have = S.found.includes(it.lot.id);
    const b = el('button', { className: `slot${have ? '' : ' missing'}${fresh === it.lot.id ? ' new' : ''}`, title: have ? it.lot.title : `Not found yet (${it.district.name})` });
    const c = el('canvas', { width: 32, height: 32 });
    c.getContext('2d').drawImage(iconFor(it.lot), 0, 0);
    b.append(c);
    if (!have) b.append(el('span', { className: 'q', textContent: '?' }));
    b.onclick = () => {
      unlockAudio(); sfx.select();
      if (have) openMenu('collection', it);
      else { game.walkTo(it, () => interact(it)); UI.toast('Walking there…', `It's in ${it.district.name}.`, iconFor(it.lot)); }
    };
    b.onmouseenter = (e) => UI.tooltip(have ? it.lot.title : `??? · ${it.district.name}`, e.clientX, e.clientY - 40);
    b.onmouseleave = () => UI.tooltip(null);
    bar.append(b);
  }
}

// ---------------------------------------------------------------------------
// Menu tabs
// ---------------------------------------------------------------------------
let selected = null;
function openMenu(tab, sel = null) {
  if (sel) selected = sel;
  game.paused = true; game.keys.clear();
  UI.hint(null); UI.tooltip(null);
  UI.openMenu(tab);
}

function tabCollection(c) {
  const wrap = el('div', { className: 'coll' });
  const groups = el('div', { className: 'groups' });
  const detail = el('div', { className: 'detail panel' });
  if (!selected) selected = LOTS.find((l) => S.found.includes(l.lot.id)) || LOTS[0];
  const slots = [];
  for (const d of DISTRICTS) {
    const here = LOTS.filter((l) => l.district === d);
    if (!here.length) continue;
    const n = here.filter((l) => S.found.includes(l.lot.id)).length;
    const g = el('div', { className: 'group' });
    const h = el('h4', {}, el('i', { style: `background:${d.color}` }), d.name, el('small', { textContent: `${n}/${here.length}` }));
    const row = el('div', { className: 'gslots' });
    for (const it of here) {
      const have = S.found.includes(it.lot.id);
      const b = el('button', { className: `slot${have ? '' : ' missing'}${it === selected ? ' sel' : ''}`, title: have ? it.lot.title : '???' });
      const cv = el('canvas', { width: 32, height: 32 });
      cv.getContext('2d').drawImage(iconFor(it.lot), 0, 0);
      b.append(cv);
      b.onclick = () => { sfx.select(); selected = it; slots.forEach((s) => s.classList.toggle('sel', s === b)); renderDetail(detail, it); };
      slots.push(b);
      row.append(b);
    }
    g.append(h, row);
    groups.append(g);
  }
  const home = el('div', { className: 'group' }, el('h4', {}, el('i', { style: 'background:#c9763a' }), "Aaran's House"),
    el('p', { className: 'muted', textContent: 'The mailbox has contact links; knocking on the door tells you about me.' }));
  groups.append(home);
  renderDetail(detail, selected);
  wrap.append(groups, detail);
  c.append(wrap);
}
function renderDetail(box, it) {
  box.innerHTML = '';
  const { lot, district: d, code } = it;
  const have = S.found.includes(lot.id);
  const cv = el('canvas', { width: 64, height: 64 });
  const pc = cv.getContext('2d');
  pc.drawImage(propFor(lot), 0, 0);
  if (!have) { pc.globalCompositeOperation = 'source-in'; pc.fillStyle = 'rgba(59,29,14,.55)'; pc.fillRect(0, 0, 64, 64); }
  const chips = el('div', { className: 'chips' },
    el('span', { className: 'chip', textContent: code, style: `background:${d.color};color:#fff` }),
    have ? el('span', { className: 'chip status', textContent: lot.status, style: `background:${statusColor[lot.status] || '#6b3a1a'}` }) : null,
    have && lot.year ? el('span', { className: 'chip', textContent: lot.year }) : null);
  box.append(el('div', { className: 'top' }, cv, el('div', {}, el('h3', { textContent: have ? lot.title : '???' }), el('div', { className: 'muted', textContent: d.name }), chips)));
  if (have) {
    box.append(el('p', { className: 'one', textContent: lot.oneLiner }), el('p', { textContent: lot.body }));
    if (lot.points?.length) box.append(el('ul', {}, ...lot.points.map((p) => el('li', { textContent: p }))));
    if (lot.links?.length) box.append(el('div', { className: 'row-btns' }, ...lot.links.map((l) => el('a', { className: 'linkbtn', href: l.url, target: '_blank', rel: 'noopener', textContent: `${l.label} ↗` }))));
  } else {
    box.append(el('p', { textContent: `Not found yet. It's somewhere in ${d.name}.` }));
  }
  const walk = el('button', { className: 'linkbtn', textContent: 'Walk there' });
  walk.onclick = () => { UI.closeMenu(); game.walkTo(it, () => interact(it)); };
  const warp = el('button', { className: 'linkbtn', textContent: 'Warp there' });
  warp.onclick = () => { UI.closeMenu(); sfx.warp(); game.warpTo(it); };
  box.append(el('div', { className: 'row-btns', style: 'margin-top:calc(var(--px)*3)' }, walk, warp));
}

function worldSnapshot() {
  const full = document.createElement('canvas');
  full.width = world.W * T; full.height = world.H * T;
  const g = full.getContext('2d');
  g.drawImage(assets.ground.canvas, 0, 0);
  const objs = world.objects.slice().sort((a, b) => a.sortY - b.sortY);
  for (const o of objs) {
    let img = assets.A.get(o.key);
    if (Array.isArray(img)) img = img[0];
    if (img) g.drawImage(img, o.x, o.y);
  }
  const k = 3, small = document.createElement('canvas');
  small.width = Math.round(full.width / k); small.height = Math.round(full.height / k);
  const sg = small.getContext('2d');
  sg.imageSmoothingEnabled = true; sg.imageSmoothingQuality = 'high';
  sg.drawImage(full, 0, 0, small.width, small.height);
  return { canvas: small, k };
}
function tabMap(c) {
  if (!snapshot) snapshot = worldSnapshot();
  const wrap = el('div', { className: 'mapwrap' });
  const stage = el('div', { className: 'mapstage' });
  const cv = el('canvas', { width: snapshot.canvas.width, height: snapshot.canvas.height });
  cv.getContext('2d').drawImage(snapshot.canvas, 0, 0);
  stage.append(cv);
  wrap.append(stage, el('div', { className: 'maphint', textContent: coarse ? 'Tap a place or a pin to warp there.' : 'Click a place or a pin to warp there. M closes the map.' }));
  c.append(wrap);
  requestAnimationFrame(() => {
    const box = c.getBoundingClientRect();
    const scale = Math.min((box.width - 8) / cv.width, (box.height - 40) / cv.height);
    const w = Math.floor(cv.width * scale), h = Math.floor(cv.height * scale);
    cv.style.width = `${w}px`; cv.style.height = `${h}px`;
    const toCss = (wx, wy) => [(wx / (world.W * T)) * w, (wy / (world.H * T)) * h];
    for (const a of world.areas) {
      if (a.id === 's2' || a.kind === 'road') continue;
      const [x, y] = a.label ? toCss(a.label[0] * T, a.label[1] * T) : toCss(((a.x0 + a.x1 + 1) / 2) * T, (a.kind === 'beach' ? a.y0 + 1.6 : a.y0 + 0.9) * T);
      stage.append(el('div', { className: 'mlabel', textContent: a.name, style: `left:${x}px;top:${y}px` }));
    }
    for (const it of LOTS) {
      const [x, y] = toCss(it.x + it.w / 2, it.y + 8);
      const have = S.found.includes(it.lot.id);
      let pin;
      if (have) { pin = el('canvas', { className: 'mpin', width: 32, height: 32, title: it.lot.title }); pin.getContext('2d').drawImage(iconFor(it.lot), 0, 0); }
      else pin = el('div', { className: 'mq', textContent: '?', title: `Not found yet (${it.district.name})`, style: `background:${it.district.color}` });
      pin.style.left = `${x}px`; pin.style.top = `${y}px`;
      pin.onclick = (e) => { e.stopPropagation(); UI.closeMenu(); sfx.warp(); game.warpTo(it); };
      stage.append(pin);
    }
    const you = el('canvas', { className: 'mpin you', width: 32, height: 64 });
    you.getContext('2d').drawImage(assets.A.get('player').down[0], 0, 0);
    const [px, py] = toCss(game.player.x, game.player.y);
    you.style.left = `${px}px`; you.style.top = `${py}px`;
    stage.append(you);
    cv.onclick = (e) => {
      const r = cv.getBoundingClientRect();
      const wx = ((e.clientX - r.left) / r.width) * world.W * T, wy = ((e.clientY - r.top) / r.height) * world.H * T;
      let tx = Math.floor(wx / T), ty = Math.floor(wy / T);
      if (game.solidAt(tx, ty)) {
        let best = null, bd = 1e9;
        for (let y = ty - 3; y <= ty + 3; y++) for (let x = tx - 3; x <= tx + 3; x++) if (!game.solidAt(x, y)) { const d = (x - tx) ** 2 + (y - ty) ** 2; if (d < bd) { bd = d; best = [x, y]; } }
        if (!best) return;
        [tx, ty] = best;
      }
      UI.closeMenu(); sfx.warp();
      game.warp(tx * T + 16, ty * T + 24, 'down');
    };
  });
}
function tabQuests(c) {
  c.append(el('h3', { textContent: 'Quests' }));
  const ul = el('ul', { className: 'quests' });
  for (const q of QUESTS) {
    const done = questDone(q);
    const li = el('li', { className: `panel${done ? ' done' : ''}` }, el('span', { className: 'box' }), el('div', {}, el('b', { textContent: q.title }), el('small', { textContent: q.desc })));
    if (q.progress) {
      const [a, b] = q.progress();
      li.append(el('div', {}, el('div', { className: 'meter' }, el('i', { style: `width:${b ? (100 * a) / b : 0}%` })), el('small', { textContent: `${a} / ${b}`, style: 'text-align:right' })));
    } else li.append(el('span'));
    ul.append(li);
  }
  c.append(ul);
}
function tabAbout(c) {
  c.append(el('h3', { textContent: PROFILE.name }), el('p', { className: 'one', textContent: PROFILE.tagline, style: 'font-weight:700' }), el('p', { textContent: PROFILE.about }));
  if (PROFILE.lookingFor) c.append(el('p', { textContent: PROFILE.lookingFor }));
  c.append(el('div', { className: 'row-btns' },
    ...PROFILE.links.map((l) => el('a', { className: 'linkbtn', href: l.url, target: '_blank', rel: 'noopener', textContent: `${l.label} ↗` })),
    PROFILE.email ? el('a', { className: 'linkbtn', href: `mailto:${PROFILE.email}`, textContent: 'Email' }) : null,
    el('a', { className: 'linkbtn', href: 'classic.html', textContent: 'Classic website' })));
  c.append(el('p', { className: 'muted', style: 'margin-top:calc(var(--px)*6)', textContent: 'Every pixel in the valley is drawn by code, at 32 pixels per tile: twice the detail of the games that inspired it.' }));
}
function tabOptions(c) {
  const box = el('div', { className: 'opts' });
  const seg = (label, items, cur, onPick) => {
    const s = el('div', { className: 'seg' });
    for (const [val, text] of items) {
      const b = el('button', { textContent: text });
      b.setAttribute('aria-pressed', String(val === cur));
      b.onclick = () => { sfx.select(); onPick(val); UI.refreshMenu(); };
      s.append(b);
    }
    box.append(el('b', { textContent: label }), s);
  };
  seg('Sound', [[true, 'On'], [false, 'Off']], S.opts.sound, (v) => { S.opts.sound = v; setSound(v); syncSoundBtn(); save(); });
  seg('Time of day', [['real', 'Real time'], ['day', 'Day'], ['sunset', 'Sunset'], ['night', 'Night']], S.opts.time, (v) => { S.opts.time = v; game.timeMode = v; updateHUD(); save(); });
  seg('Season', [['auto', `Auto (${cap(autoSeason())})`], ['spring', 'Spring'], ['summer', 'Summer'], ['fall', 'Fall'], ['winter', 'Winter']], S.opts.season, (v) => { S.opts.season = v; save(); rebuildArt(); });
  seg('Zoom', [[0.75, 'Far'], [1, 'Normal'], [1.35, 'Close']], S.opts.zoom, (v) => { S.opts.zoom = v; game.setZoom(v); save(); });
  // appearance
  const preview = el('canvas', { width: 32, height: 64 });
  preview.getContext('2d').drawImage(assets.A.get('player').down[0], 0, 0);
  const swatches = (list, key) => {
    const s = el('div', { className: 'seg' });
    list.forEach((R, i) => {
      const [r, g, b] = unpack(R[3]);
      const btn = el('button', { className: 'swatch', style: `background:rgb(${r},${g},${b})`, title: `${key} ${i + 1}` });
      btn.setAttribute('aria-pressed', String(S.look[key] === i));
      btn.onclick = () => { S.look[key] = i; applyLook(); UI.refreshMenu(); };
      s.append(btn);
    });
    return s;
  };
  const styles = el('div', { className: 'seg' });
  ['Short', 'Long', 'Spiky'].forEach((n, i) => { const b = el('button', { textContent: n }); b.setAttribute('aria-pressed', String((S.look.style || 0) === i)); b.onclick = () => { S.look.style = i; applyLook(); UI.refreshMenu(); }; styles.append(b); });
  const look = el('div', { className: 'look' }, preview, el('div', { className: 'opts', style: 'gap:calc(var(--px)*2) calc(var(--px)*4)' },
    el('span', { textContent: 'Skin' }), swatches(SKINS, 'skin'), el('span', { textContent: 'Hair' }), swatches(HAIRS, 'hair'), el('span', { textContent: 'Style' }), styles,
    el('span', { textContent: 'Shirt' }), swatches(SHIRTS, 'shirt'), el('span', { textContent: 'Pants' }), swatches(PANTS, 'pants')));
  box.append(el('b', { textContent: 'Your look' }), look);
  const reset = el('button', { className: 'linkbtn', textContent: 'Reset progress' });
  reset.onclick = () => {
    if (reset.dataset.armed) { resetProgress(); return; }
    reset.dataset.armed = '1'; reset.textContent = 'Really reset? Click again';
  };
  box.append(el('b', { textContent: 'Progress' }), el('div', {}, reset));
  c.append(el('h3', { textContent: 'Options' }), box);
}

function applyLook() { assets.A.set('player', lookFrames(S.look)); save(); }
function syncSoundBtn() { UI.setIcon($('#bSound .ico'), S.opts.sound ? 'soundOn' : 'soundOff'); }
async function rebuildArt() {
  const load = $('#loading');
  load.hidden = false;
  await nextFrame();
  const fresh = buildAssets(world, season(), S.look);
  assets = fresh; game.assets = fresh; game._bl = null; snapshot = null;
  load.hidden = true;
  buildToolbar(); updateHUD();
}
function resetProgress() {
  const keep = { opts: S.opts, look: S.look };
  S = { ...fresh(), ...keep, started: true };
  save();
  UI.closeMenu();
  game.warp(world.spawn.x, world.spawn.y, 'up', () => { buildToolbar(); updateHUD(); setTimeout(welcome, 400); });
}

// ---------------------------------------------------------------------------
// Title screen
// ---------------------------------------------------------------------------
function showTitle() {
  titleUp = true;
  game.paused = true;
  const t = $('#title');
  const [w1, ...rest] = GAME.title.toUpperCase().split(' ');
  const lg = logo(w1, rest.join(' ') || '');
  const cv = $('#title canvas.logo');
  cv.width = lg.w; cv.height = lg.h;
  cv.getContext('2d').drawImage(lg.canvas(), 0, 0);
  sizeLogo();
  $('#tTag').textContent = PROFILE.tagline;
  $('#tPlay').textContent = S.started ? 'Continue' : 'Play';
  $('#tNew').hidden = !S.started;
  t.hidden = false;
  $('#tPlay').focus();
}
function sizeLogo() {
  const cv = $('#title canvas.logo');
  if (!cv.width || !game) return;
  const k = Math.max(1, Math.floor(Math.min((innerWidth - 32) / cv.width, (innerHeight * 0.34) / cv.height) * game.dpr)) / game.dpr;
  cv.style.width = `${cv.width * k}px`; cv.style.height = `${cv.height * k}px`;
}
function startGame(reset = false) {
  unlockAudio();
  if (reset) { const keep = { opts: S.opts, look: S.look }; S = { ...fresh(), ...keep }; }
  $('#title').hidden = true;
  $('#hud').hidden = false;
  titleUp = false;
  game.paused = false;
  if (S.pos && !reset && game.free(S.pos.x, S.pos.y)) { game.player.x = S.pos.x; game.player.y = S.pos.y; game.player.dir = S.pos.dir || 'down'; }
  else { game.player.x = world.spawn.x; game.player.y = world.spawn.y; game.player.dir = world.spawn.dir; }
  game.pet.x = game.player.x + 30; game.pet.y = game.player.y;
  game.snapCamera();
  S.started = true; save();
  buildToolbar(); updateHUD(); checkQuests(true);
  $('#game').focus();
  if (!S.flags.hello) setTimeout(() => { if (!UI.dialogueOpen() && !UI.menuOpen()) welcome(); }, 700);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const hooks = {
  petName: GAME.petName,
  onScale: (s, dpr) => { UI.applyPixelStyles(s, dpr); sizeLogo(); },
  onTarget: () => refreshHint(),
  onInteract: (it) => interact(it),
  onStep: (ground) => sfx.step(ground),
  onHover: (it, x, y) => UI.tooltip(it && !coarse ? it.label : null, x, y),
  onUserGesture: () => unlockAudio(),
  onArea: (a) => {
    if (!a || titleUp) return;
    let sub = '';
    if (a.kind === 'district') {
      sub = summaryLine(a.district);
      if (!S.visited.includes(a.district.id)) { S.visited.push(a.district.id); save(); checkQuests(); }
    } else if (a.kind === 'home') sub = 'Knock on the door, check the mailbox.';
    else if (a.kind === 'park') sub = 'A quiet spot. More builds coming.';
    else if (a.kind === 'square') sub = 'The middle of everything.';
    else if (a.kind === 'beach') sub = 'Follow the pier out to sea.';
    else if (a.kind === 'road') sub = "Aaran's house to the west, the lab to the east.";
    else if (a.kind === 'orchard') sub = 'Just trees. Nice ones, though.';
    UI.banner(a.name, sub, a.color);
  },
};

function setFavicon() {
  try {
    const link = document.querySelector('link[rel="icon"]') || document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'icon' }));
    link.type = 'image/png';
    link.href = scaledURL(petFrames().down[0], 2);
  } catch { /* no favicon is fine */ }
}

function setLoading(f) { const b = $('#loading .bar i'); if (b) b.style.width = `${Math.round(f * 100)}%`; }

async function boot() {
  setLoading(0.1);
  setFavicon();
  try { await Promise.race([document.fonts.load('16px "Jersey 15"'), new Promise((r) => setTimeout(r, 1500))]); } catch { /* fall back to system font */ }
  setLoading(0.3);
  await nextFrame();
  assets = buildAssets(world, season(), S.look);
  setLoading(0.9);
  await nextFrame();
  game = new Game({ canvas: $('#game'), world, assets, hooks });
  game.timeMode = S.opts.time;
  game.zoom = S.opts.zoom || 1;
  game.resize();
  setSound(S.opts.sound);
  syncSoundBtn();
  UI.setupMenu([
    { id: 'collection', label: 'Collection', icon: 'bag', render: tabCollection },
    { id: 'map', label: 'Map', icon: 'map', render: tabMap },
    { id: 'quests', label: 'Quests', icon: 'journal', render: tabQuests },
    { id: 'about', label: 'About', icon: 'person', render: tabAbout },
    { id: 'options', label: 'Options', icon: 'gear', render: tabOptions },
  ], () => { game.paused = UI.dialogueOpen() || titleUp; refreshHint(); });
  $('#loading').hidden = true;

  // attract mode camera for the title screen
  game.player.x = world.spawn.x; game.player.y = world.spawn.y;
  game.snapCamera();

  $('#bMenu').onclick = () => { unlockAudio(); openMenu('collection'); };
  $('#bMap').onclick = () => { unlockAudio(); openMenu('map'); };
  $('#bSound').onclick = () => { unlockAudio(); S.opts.sound = !S.opts.sound; setSound(S.opts.sound); syncSoundBtn(); save(); };
  $('#bClassic').addEventListener('click', () => save());
  $('#tPlay').onclick = () => startGame(false);
  $('#tNew').onclick = () => startGame(true);
  $('#tAct').onclick = () => { unlockAudio(); if (game.target) interact(game.target); };
  $('#dialogue').addEventListener('click', (e) => { if (!e.target.closest('.choice')) UI.advanceDialogue(); });

  addEventListener('keydown', onKey);
  addEventListener('resize', () => { game.resize(); game.snapCamera(); sizeLogo(); if (UI.currentTab() === 'map') UI.refreshMenu(); });
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  setInterval(() => { if (!titleUp) { updateHUD(); if (game.player.y > 50 * T && game.groundAt(game.player.x, game.player.y - 2) === 6 && !S.flags.pier) { S.flags.pier = true; checkQuests(); } } }, 1000);
  setInterval(() => { if (!titleUp) save(); }, 15000);

  showTitle();
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
    step(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function step(dt) {
  game.update(dt);
  if (titleUp) {
    // slow pan over the valley behind the title
    const t = game.t * 0.05;
    const vw = game.buf.width, vh = game.buf.height;
    game.cam.x = Math.max(0, Math.min(world.W * T - vw, (world.W * T - vw) / 2 + Math.sin(t) * 700));
    game.cam.y = Math.max(0, Math.min(world.H * T - vh, 15 * T - vh / 2 + Math.cos(t * 0.8) * 260));
  }
  game.render();
}

function onKey(e) {
  if (titleUp) {
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); startGame(false); }
    return;
  }
  if (UI.dialogueOpen()) { if (UI.dialogueKey(e)) e.preventDefault(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (UI.menuOpen()) {
    if (e.code === 'Escape' || (e.code === 'KeyM' && UI.currentTab() === 'map') || (e.code === 'KeyJ' && UI.currentTab() === 'quests') || (e.code === 'KeyI' && UI.currentTab() === 'collection')) { e.preventDefault(); UI.closeMenu(); }
    return;
  }
  switch (e.code) {
    case 'KeyE': case 'Space': case 'Enter': case 'KeyX': case 'NumpadEnter':
      e.preventDefault(); if (game.target) interact(game.target); break;
    case 'Escape': case 'KeyI': case 'Tab': e.preventDefault(); openMenu('collection'); break;
    case 'KeyM': e.preventDefault(); openMenu('map'); break;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5': {
      const d = DISTRICTS.filter((x) => x._gate)[+e.code.slice(5) - 1];
      if (d) { sfx.warp(); game.warp(d._gate.x, d._gate.y, d._gate.dir); }
      break;
    }
    case 'KeyH': { const h = world.interact.find((i) => i.kind === 'house'); if (h) { sfx.warp(); game.warpTo(h); } break; }
    case 'KeyJ': case 'KeyQ': e.preventDefault(); openMenu('quests'); break;
    case 'Equal': case 'NumpadAdd': S.opts.zoom = Math.min(1.8, (S.opts.zoom || 1) + 0.15); game.setZoom(S.opts.zoom); save(); break;
    case 'Minus': case 'NumpadSubtract': S.opts.zoom = Math.max(0.6, (S.opts.zoom || 1) - 0.15); game.setZoom(S.opts.zoom); save(); break;
  }
}

boot().catch((err) => {
  console.error(err);
  const l = $('#loading');
  l.hidden = false;
  l.innerHTML = '';
  l.append(el('div', { style: 'text-align:center;max-width:420px;padding:16px' }, el('p', { textContent: 'The valley could not load in this browser.' }), el('a', { href: 'classic.html', textContent: 'Read the classic website instead', style: 'color:#f7c84a' })));
});

// Test hook: step the game without animation frames (hidden tabs pause them).
window.__valley = {
  get game() { return game; }, get S() { return S; }, world, LOTS, interact, openMenu, startGame, UI,
  simulate(sec) { for (let i = 0; i < sec * 60; i++) step(1 / 60); },
  get titleUp() { return titleUp; },
};
