// Interface art: nine-slice frames for the HTML UI, the title logo, the cursor,
// small UI icons and the in-world "!" bubble. Frames are exported as data URLs
// pre-scaled by the current pixel scale so the browser never smooths them.
import { Pix, C, shade, drawText, textWidth, glyph } from './art-core.js';
import { RED, GREEN, YELLOW, DARK, WHITE, PAPER, WOOD, BLUE, CYAN, GOLD } from './palette.js';

const K = {
  ink: C('#3b1d0e'), woodDark: C('#6b3314'), wood: C('#b4642a'), woodMid: C('#c97a34'), woodLight: C('#e59a4a'), woodHi: C('#f7c070'),
  parch: C('#f7dca6'), parchHi: C('#fff0cc'), parchLo: C('#e2b878'), parchEdge: C('#c89556'),
};

// 24 x 24, 8 px slices: dark outline, bevelled wood band, inner lip, parchment.
export function frameWood() {
  const p = new Pix(24, 24);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const d = Math.min(x, y, 23 - x, 23 - y);
    const corner = Math.min(x, 23 - x) + Math.min(y, 23 - y);
    if (corner < 2) continue;
    let c;
    if (d === 0 || corner === 2) c = K.ink;
    else if (d === 1) c = (x < 12 && y < 12) || (y < 2) || (x < 2) ? K.woodHi : K.woodDark;
    else if (d === 2 || d === 3) c = y < 4 || x < 4 ? K.woodLight : K.wood;
    else if (d === 4) c = y > 19 || x > 19 ? K.woodMid : K.wood;
    else if (d === 5) c = K.woodDark;
    else if (d === 6) c = y < 7 || x < 7 ? K.parchLo : K.parchHi;
    else c = K.parch;
    p.set(x, y, c);
  }
  for (const [x, y] of [[3, 3], [20, 3], [3, 20], [20, 20]]) { p.set(x, y, K.woodHi); p.set(x + 1, y + 1, K.woodDark); }
  return p;
}
// Lighter inset panel, 12 x 12 with 4 px slices.
export function framePanel() {
  const p = new Pix(12, 12);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    const d = Math.min(x, y, 11 - x, 11 - y);
    if (Math.min(x, 11 - x) + Math.min(y, 11 - y) < 1) continue;
    p.set(x, y, d === 0 ? K.parchEdge : d === 1 ? (y < 2 || x < 2 ? K.parchLo : K.parchHi) : C('#fae6bb'));
  }
  return p;
}
// Toolbar / collection slot, 16 x 16 with 5 px slices.
export function frameSlot(active = false) {
  const p = new Pix(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.min(x, y, 15 - x, 15 - y);
    if (Math.min(x, 15 - x) + Math.min(y, 15 - y) < 1) continue;
    let c;
    if (d === 0) c = active ? C('#e0402a') : C('#7a4a1e');
    else if (d === 1) c = active ? C('#ff7a4a') : (y < 2 || x < 2 ? C('#b8783a') : C('#f0cc8e'));
    else c = active ? C('#fbe6b4') : C('#f2cf92');
    p.set(x, y, c);
  }
  return p;
}
// Wooden button, 16 x 16 with 5 px slices.
export function frameButton(hover = false) {
  const p = new Pix(16, 16);
  const base = hover ? K.woodLight : K.woodMid, top = hover ? C('#fbd68c') : K.woodHi;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.min(x, y, 15 - x, 15 - y);
    if (Math.min(x, 15 - x) + Math.min(y, 15 - y) < 2) continue;
    let c;
    if (d === 0 || Math.min(x, 15 - x) + Math.min(y, 15 - y) === 2) c = K.ink;
    else if (d === 1) c = y < 3 || x < 2 ? top : K.woodDark;
    else c = y > 11 ? K.wood : base;
    p.set(x, y, c);
  }
  return p;
}

export function scaledURL(pix, s) {
  const src = pix.canvas();
  const c = document.createElement('canvas');
  c.width = pix.w * s; c.height = pix.h * s;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

// ---------------------------------------------------------------------------
// Title logo: two lines of chunky outlined letters with a leafy gradient.
// ---------------------------------------------------------------------------
export function logo(line1, line2) {
  const s1 = 5, s2 = 9;
  const w1 = textWidth(line1, s1), w2 = textWidth(line2, s2);
  const W = Math.max(w1, w2) + 24, H = 7 * s1 + 7 * s2 + 34;
  const fill = new Pix(W, H);
  const grad = ['#fff7a0', '#fbe36a', '#d9e85e', '#9fd452', '#6ab844', '#469a3a', '#2f7a32'].map((c) => C(c));
  const gradB = ['#fff7d6', '#ffe9a8', '#ffd27a', '#f7b04e', '#e98a36', '#cf6a2a', '#a8501f'].map((c) => C(c));
  const put = (text, scale, y, G) => {
    let cx = Math.round(W / 2 - textWidth(text, scale) / 2);
    for (const ch of text) {
      const g = glyph(ch);
      for (let j = 0; j < 7; j++) for (let i = 0; i < g[j].length; i++) {
        if (g[j][i] !== '#') continue;
        for (let yy = 0; yy < scale; yy++) for (let xx = 0; xx < scale; xx++) {
          let c = G[j];
          if (yy === 0 && (j === 0 || g[j - 1][i] !== '#')) c = shade(c, 0.45);
          if (xx === 0 && (i === 0 || g[j][i - 1] !== '#')) c = shade(c, 0.2);
          fill.set(cx + i * scale + xx, y + j * scale + yy, c);
        }
      }
      cx += (g[0].length + 1) * scale;
    }
  };
  put(line1, s1, 8, gradB);
  put(line2, s2, 8 + 7 * s1 + 8, grad);
  const ink = C('#3b1d0e');
  fill.outline(ink); fill.outline(ink); fill.outline(C('#5a2e12'));
  // drop shadow
  const out = new Pix(W, H);
  const sh = C('#2a1208', 150);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fill.opaque(x, y)) out.set(x + 2, y + 4, sh);
  out.blit(fill, 0, 0);
  return out;
}

// ---------------------------------------------------------------------------
// Cursor (16 x 16 art) and UI icons (16 x 16)
// ---------------------------------------------------------------------------
export function cursor(kind = 'arrow') {
  const p = new Pix(16, 16);
  if (kind === 'arrow') {
    const rows = ['#', '##', '#.#', '#..#', '#...#', '#....#', '#.....#', '#......#', '#.......#', '#....####', '#..#..#', '#.# #..#', '##   #..#', '#     ##'];
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      if (ch === '#') p.set(x + 1, y + 1, K.ink);
      else if (ch === '.') p.set(x + 1, y + 1, x < 3 ? C('#ffffff') : C('#f7e6c4'));
    }));
  } else {
    const rows = ['..##', '.#..#', '.#..#', '.#..###', '.#..#..##', '##..#..#.#', '#...#..#..#', '#.........#', '#.........#', '.#........#', '..#......#', '...#.....#', '....#####'];
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      if (ch === '#') p.set(x + 2, y + 1, K.ink);
      else if (ch === '.' && x > 0) {
        const inside = r.indexOf('#') < x && r.lastIndexOf('#') > x;
        if (inside) p.set(x + 2, y + 1, y < 5 ? C('#ffffff') : C('#f7e6c4'));
      }
    }));
  }
  return p;
}

const UI = {
  menu(p) { p.bevel(3, 5, 10, 9, [0, C('#6b3314'), C('#8f4a1c'), C('#b4642a'), C('#e59a4a'), C('#f7c070')], 3); p.rect(5, 3, 6, 3, C('#6b3314')); p.rect(6, 4, 4, 1, 0); p.rect(5, 8, 6, 2, C('#f7c070')); p.set(8, 9, GOLD[3]); },
  map(p) {
    p.rect(2, 3, 12, 10, C('#f2dca8'));
    p.rect(2, 3, 4, 10, C('#e2c488')); p.rect(10, 3, 4, 10, C('#e2c488'));
    p.rect(3, 5, 3, 2, GREEN[3]); p.rect(9, 8, 3, 3, BLUE[3]); p.set(7, 6, RED[3]); p.set(8, 7, RED[3]); p.set(6, 9, RED[3]);
  },
  journal(p) { p.bevel(3, 2, 10, 12, [0, C('#1a2c62'), C('#26448e'), C('#3a62b8'), C('#5a88d8'), C('#8ab0f0')], 3); p.rect(4, 3, 1, 10, C('#1a2c62')); p.rect(7, 5, 4, 1, GOLD[4]); p.rect(7, 7, 4, 1, GOLD[4]); },
  classic(p) { p.bevel(2, 3, 12, 10, WHITE, 4); p.rect(2, 3, 12, 3, BLUE[3]); p.set(3, 4, RED[4]); p.set(5, 4, YELLOW[4]); p.rect(4, 8, 8, 1, WHITE[1]); p.rect(4, 10, 6, 1, WHITE[1]); },
  soundOn(p) { p.rect(3, 6, 3, 4, DARK[3]); p.poly([[5, 6], [9, 3], [9, 13], [5, 10]], DARK[3]); for (const r of [3, 5]) for (let a = -0.8; a <= 0.8; a += 0.2) p.set(9 + Math.cos(a) * r, 8 + Math.sin(a) * r, DARK[3]); },
  soundOff(p) { p.rect(3, 6, 3, 4, DARK[3]); p.poly([[5, 6], [9, 3], [9, 13], [5, 10]], DARK[3]); p.line(11, 5, 14, 11, RED[3]); p.line(14, 5, 11, 11, RED[3]); },
  close(p) { for (let i = 0; i < 9; i++) { p.rect(3 + i, 3 + i, 2, 2, RED[3]); p.rect(11 - i, 3 + i, 2, 2, RED[3]); } },
  star(p) { p.poly([[8, 1], [10, 6], [15, 6], [11, 9], [13, 15], [8, 11], [3, 15], [5, 9], [1, 6], [6, 6]], YELLOW[4]); p.set(8, 4, YELLOW[5]); },
  check(p) { for (let i = 0; i < 4; i++) p.rect(2 + i, 8 + i, 2, 2, GREEN[3]); for (let i = 0; i < 8; i++) p.rect(6 + i, 11 - i, 2, 2, GREEN[3]); },
  gear(p) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx); if (d <= 5.5 + (Math.cos(a * 6) > 0.3 ? 1.8 : 0) && d > 2.2) p.set(x, y, d > 5.5 ? DARK[2] : DARK[3]); } },
  person(p) { p.ellipse(8, 5, 3.2, 3.2, C('#e2a17d')); p.rect(4, 9, 8, 6, BLUE[3]); p.rect(4, 9, 8, 1, BLUE[4]); },
  bag(p) { p.bevel(3, 5, 10, 9, [0, C('#6b3314'), C('#8f4a1c'), C('#b4642a'), C('#e59a4a'), C('#f7c070')], 3); p.rect(5, 2, 6, 1, C('#6b3314')); p.rect(5, 2, 1, 4, C('#6b3314')); p.rect(10, 2, 1, 4, C('#6b3314')); p.rect(6, 8, 4, 2, GOLD[4]); },
};
export function uiIcon(key) {
  const p = new Pix(16, 16);
  (UI[key] || UI.star)(p);
  return p.outline((c) => shade(c, -0.55));
}

// The bouncing "!" bubble drawn over things you can inspect.
export function bubble() {
  const p = new Pix(16, 20);
  p.rect(2, 1, 12, 13, C('#ffffff')); p.rect(1, 2, 14, 11, C('#ffffff'));
  p.poly([[6, 13], [10, 13], [8, 17]], C('#ffffff'));
  p.rect(7, 3, 2, 6, RED[3]); p.rect(7, 10, 2, 2, RED[3]);
  p.rect(2, 12, 12, 1, C('#dcd8de'));
  return p.outline(C('#3b1d0e'));
}
