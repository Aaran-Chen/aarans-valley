// The classic website: the same content.js, as a normal page. Pixel icons are
// borrowed from the game's art code; everything still reads fine without them.
import { PROFILE, GAME, DISTRICTS } from '../content.js';

const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter((k) => k != null)); return e; };
// All at least 4.5:1 against white text.
const statusColor = { 'Running': '#2e7a38', 'In progress': '#a8620c', 'Done': '#4a5a80', 'Now': '#6a3ba0', 'Open': '#c0301c' };
const todo = (text) => (text && text.startsWith('TODO') ? el('span', { className: 'todo', textContent: text }) : document.createTextNode(text || ''));

// theme
try { const t = localStorage.getItem('aaranClassicTheme'); if (t) document.documentElement.dataset.theme = t; } catch { /* no storage */ }
$('#theme').onclick = () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('aaranClassicTheme', document.documentElement.dataset.theme); } catch { /* no storage */ }
};

// text
document.title = `${PROFILE.name} · Projects`;
$('#brandName').textContent = PROFILE.name;
$('#hName').textContent = `Hi, I'm ${PROFILE.name}.`;
$('#hTag').textContent = PROFILE.tagline;
$('#hLooking').append(todo(PROFILE.lookingFor));
$('#aText').textContent = PROFILE.about;
$('#aLooking').append(todo(PROFILE.lookingFor));
$('#fName').textContent = `© ${new Date().getFullYear()} ${PROFILE.name}`;
const linkBtns = () => [
  ...PROFILE.links.map((l) => el('a', { className: 'btn', href: l.url, target: '_blank', rel: 'noopener', textContent: l.label })),
  PROFILE.email && !PROFILE.email.startsWith('TODO') ? el('a', { className: 'btn', href: `mailto:${PROFILE.email}`, textContent: PROFILE.email }) : null,
];
$('#hLinks').append(...linkBtns());
$('#cLinks').append(...linkBtns());

const total = DISTRICTS.reduce((n, d) => n + d.lots.length, 0);
$('#pLead').textContent = `${total} projects across ${DISTRICTS.length} areas. In the game, each one is a display you can walk up to in ${GAME.title}.`;

// projects
let filter = 'all';
const filters = $('#filters');
const addFilter = (id, label, color) => {
  const b = el('button', {}, color ? el('i', { style: `background:${color}` }) : null, label);
  b.setAttribute('aria-pressed', String(id === filter));
  b.onclick = () => { filter = id; for (const x of filters.children) x.setAttribute('aria-pressed', String(x === b)); render(); };
  filters.append(b);
};
addFilter('all', 'All');
for (const d of DISTRICTS) addFilter(d.id, d.name, d.color);

let iconOf = () => null;
function render() {
  const root = $('#groups');
  root.innerHTML = '';
  for (const d of DISTRICTS) {
    if (filter !== 'all' && filter !== d.id) continue;
    const cards = el('div', { className: 'cards' });
    d.lots.forEach((lot, i) => {
      const src = iconOf(lot.sprite);
      const icon = el('canvas', { width: src ? src.width : 32, height: src ? src.height : 32, ariaHidden: 'true' });
      if (src) icon.getContext('2d').drawImage(src, 0, 0);
      const chips = el('div', { className: 'chips' },
        el('span', { className: 'chip s', textContent: lot.status, style: `background:${statusColor[lot.status] || '#6e5a4a'}` }),
        lot.year ? el('span', { className: 'chip', textContent: lot.year }) : null,
        el('span', { className: 'chip', textContent: `${d.short[0].toUpperCase()}${i + 1}` }));
      const more = el('details', {}, el('summary', { textContent: 'More' }), el('p', {}, todo(lot.body)));
      if (lot.points?.length) more.append(el('ul', {}, ...lot.points.map((p) => el('li', {}, todo(p)))));
      const links = lot.links?.length ? el('div', { className: 'links' }, ...lot.links.map((l) => el('a', { className: 'btn sm', href: l.url, target: '_blank', rel: 'noopener', textContent: `${l.label} \u2197` }))) : null;
      cards.append(el('article', { className: 'card' },
        el('div', { className: 'top' }, icon, el('div', {}, el('h4', { textContent: lot.title }), chips)),
        el('p', { className: 'one' }, todo(lot.oneLiner)), links, more));
    });
    root.append(el('div', { className: 'group' }, el('h3', {}, el('i', { style: `background:${d.color}` }), d.name), el('p', { textContent: d.summary }), cards));
  }
}
render();

// Pixel art (optional): icons, the hero scene and the brand mark.
try {
  const P = await import('./art-props.js');
  const CH = await import('./art-chars.js');
  const N = await import('./art-nature.js');
  const cache = new Map();
  iconOf = (k) => { if (!cache.has(k)) cache.set(k, P.icon(k).canvas()); return cache.get(k); };
  render();
  const mi = iconOf('mailbox'), mc = $('#mailIcon'); mc.width = mi.width; mc.height = mi.height; mc.getContext('2d').drawImage(mi, 0, 0);
  const d = new Date(), md = (d.getMonth() + 1) * 100 + d.getDate();
  const season = md >= 1221 || md < 320 ? 'winter' : md < 621 ? 'spring' : md < 922 ? 'summer' : 'fall';
  const look = GAME.look;
  const fr = CH.playerFrames(look), pet = CH.petFrames();
  try {
    const pf = pet.down[0].canvas(), big = document.createElement('canvas');
    big.width = 64; big.height = 64;
    const bg = big.getContext('2d'); bg.imageSmoothingEnabled = false; bg.drawImage(pf, 0, 0, 64, 64);
    document.head.append(Object.assign(document.createElement('link'), { rel: 'icon', type: 'image/png', href: big.toDataURL() }));
  } catch { /* optional */ }
  const brand = $('#brandIcon').getContext('2d');
  $('#brandIcon').width = 64; $('#brandIcon').height = 64;
  brand.drawImage(fr.down[0].canvas(), 0, 0, 64, 64, 0, 4, 64, 64);
  const sc = $('#scene'); sc.width = 384; sc.height = 288;
  const g = sc.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.scale(2, 2);
  const put = (cv, x, y) => g.drawImage(cv, x, y, cv.width / 2, cv.height / 2);
  const grass = N.grassTuft(season, 1).canvas();
  put(N.oakTree(season, 0).canvas(), -24, 4);
  put(P.prop('humanoid').canvas(), 118, 70);
  put(fr.down[0].canvas(), 72, 70);
  put(pet.down[0].canvas(), 100, 102);
  for (const x of [8, 44, 160, 176]) put(grass, x, 112);
} catch (err) {
  console.warn('Pixel art skipped:', err);
}
