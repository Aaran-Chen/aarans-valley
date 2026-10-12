// Buildings and street furniture. Buildings are 256 x 192 (8 x 6 tiles) with the
// door centred at x = 128; each returns a day sprite plus a "lit" layer holding
// only the window glass, which the renderer draws brightly at night.
import { Pix, C, shade, hash, rng, sphereLight, lightIndex, textWidth, drawText, signText } from './art-core.js';
import {
  WOOD, WOOD_LIGHT, WOOD_GRAY, STONE, METAL, DARK, RED, BLUE, TEAL, GREEN, YELLOW, ORANGE, PINK, PURPLE, CYAN,
  PAPER, GLASS, BRICK, LAVENDER, WHITE, GOLD, ROOF, SNOW, WATER, BARK,
} from './palette.js';
import { FLOWER_COLORS } from './art-nature.js';

const WARM = [C('#8a4a12'), C('#c9761c'), C('#f0a431'), C('#ffd060'), C('#fff0a8'), C('#fffbe6')];

// ---------------------------------------------------------------------------
// Building parts
// ---------------------------------------------------------------------------
function shingleIdx(i, j, rowH, sw, seed) {
  const row = Math.floor(j / rowH), ry = j % rowH;
  const off = (row & 1) * (sw >> 1);
  const col = Math.floor((i + off) / sw), rx = (i + off) % sw;
  const tone = hash(col, row, seed);
  let k = tone < 0.18 ? 2 : tone > 0.86 ? 4 : 3;
  if (ry === rowH - 1) k = 1;
  else if (rx === 0) k = 2;
  else if (ry === 0) k = Math.min(5, k + 1);
  return k;
}
function metalIdx(i, j, seed) {
  const rx = i % 6;
  let k = rx === 0 ? 4 : rx < 3 ? 3 : rx < 5 ? 2 : 1;
  if (j % 30 === 29) k = 1;
  if (hash(i >> 3, j >> 3, seed) < 0.05 && hash(i, j, seed + 1) < 0.55) k = -1; // rust patches
  return k;
}

function roof(p, R, top, bottom, { left = 2, right = 253, inset = 16, kind = 'shingle', seed = 5, snow = false } = {}) {
  const H = bottom - top;
  const rust = [C('#5a2a14'), C('#8a4a1e'), C('#a8602a')];
  for (let y = top; y < bottom; y++) {
    const t = (y - top) / H;
    const lx = left + inset * (1 - t), rx = right - inset * (1 - t);
    for (let x = Math.round(lx); x <= Math.round(rx); x++) {
      const i = x - left, j = y - top;
      let k = kind === 'metal' ? metalIdx(i, j, seed) : shingleIdx(i, j, 7, 10, seed);
      let c;
      if (k < 0) c = rust[(hash(x, y, 9) * 3) | 0];
      else {
        const q = (x - lx) / Math.max(1, rx - lx);
        if (q < 0.035) k = Math.min(5, k + 1); else if (q > 0.965) k = Math.max(1, k - 1);
        if (j > H - 4) k = Math.max(1, k - 1);
        c = R[k];
      }
      if (snow && (j < 10 + hash(x >> 2, 0, 3) * 8 || (j % 21 === 0 && hash(x >> 3, j, 4) < 0.6))) c = SNOW[j < 3 ? 5 : 4];
      p.set(x, y, c);
    }
  }
  // ridge cap
  for (let x = Math.round(left + inset) - 2; x <= Math.round(right - inset) + 2; x++) {
    for (let y = top - 3; y < top + 3; y++) p.set(x, y, y === top - 3 ? R[5] : y < top + 1 ? R[4] : R[2]);
    p.set(x, top + 3, R[1]);
  }
  // fascia along the eave
  for (let x = left; x <= right; x++) { p.set(x, bottom, R[1]); p.set(x, bottom + 1, R[0]); }
}

function wall(p, x, y, w, h, kind, R, seed = 1, mortar = null) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const X = x + i, Y = y + j;
    let k = 3, c = null;
    if (kind === 'planks') {
      const row = Math.floor(j / 7), ry = j % 7, off = (hash(row, 0, seed) * 60) | 0;
      k = ry === 0 ? 4 : ry === 6 ? 1 : hash(row, Math.floor((i + off) / 60), seed) < 0.5 ? 3 : 2;
      if ((i + off) % 60 === 0) k = 1;
      if (hash(X, Y >> 1, seed) < 0.035) k = Math.max(1, k - 1);
    } else if (kind === 'boards') {
      const col = Math.floor(i / 8), rx = i % 8;
      k = rx === 0 ? 4 : rx === 7 ? 1 : hash(col, 0, seed) < 0.5 ? 3 : 2;
      if (hash(X >> 1, Y >> 2, seed) < 0.05) k = Math.max(1, k - 1);
    } else if (kind === 'brick') {
      const row = Math.floor(j / 5), ry = j % 5, off = (row & 1) * 6, rx = (i + off) % 12;
      if (ry === 4 || rx === 11) c = mortar;
      else k = ry === 0 ? 4 : hash(Math.floor((i + off) / 12), row, seed) < 0.3 ? 2 : 3;
    } else if (kind === 'stone') {
      const row = Math.floor(j / 10), ry = j % 10, off = (hash(row, 1, seed) * 18) | 0;
      const bw = 18, bx = Math.floor((i + off) / bw), rx = (i + off) % bw;
      if (ry === 9 || rx === bw - 1) c = mortar || R[1];
      else {
        k = hash(bx, row, seed) < 0.35 ? 2 : hash(bx, row, seed + 1) < 0.2 ? 4 : 3;
        if (ry === 0 || rx === 0) k = Math.min(5, k + 1);
        if (ry === 8 || rx === bw - 2) k = Math.max(1, k - 1);
      }
    }
    // under-eave shadow and edge shading
    if (!c) {
      if (j < 7) k = Math.max(1, k - (j < 3 ? 2 : 1));
      if (i < 2) k = Math.min(5, k + 1);
      if (i > w - 4) k = Math.max(1, k - 1);
      c = R[k];
    } else if (j < 5) c = shade(c, -0.3);
    p.set(X, Y, c);
  }
}

function foundation(p, x, y, w, h, seed = 3) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const off = (Math.floor(j / 5) & 1) * 8, rx = (i + off) % 16, ry = j % 5;
    let k = rx === 15 || ry === 4 ? 1 : hash(Math.floor((i + off) / 16), Math.floor(j / 5), seed) < 0.4 ? 2 : 3;
    if (ry === 0 && rx !== 15) k = 4;
    if (j === 0) k = 1;
    p.set(x + i, y + j, STONE[k]);
  }
}

function litGlass(i, j, w, h) {
  const d = Math.hypot((i - w / 2) / w, (j - h / 2) / h);
  return WARM[d < 0.22 ? 5 : d < 0.4 ? 4 : d < 0.6 ? 3 : 2];
}

function windowAt(p, lit, x, y, w, h, trim, opts = {}) {
  const { mull = true, shutters = null, box = null, season = 'summer', glow = litGlass } = opts;
  p.bevel(x - 3, y - 3, w + 6, h + 6, trim, 3);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const t = j / h;
    let k = t < 0.3 ? 4 : t < 0.66 ? 3 : 2;
    if ((i + j) % 14 < 2 && i < w * 0.75 && j < h * 0.85) k = 5;
    if (i === 0 || j === 0) k = 1;
    p.set(x + i, y + j, GLASS[k]);
    if (lit) lit.set(x + i, y + j, (i === 0 || j === 0) ? WARM[1] : glow(i, j, w, h));
  }
  if (mull) {
    const mx = x + (w >> 1) - 1, my = y + (h >> 1) - 1;
    for (const q of [p, lit]) {
      if (!q) continue;
      q.rect(mx, y, 2, h, trim[3]); q.rect(mx + 2, y, 1, h, trim[1]);
      q.rect(x, my, w, 2, trim[3]); q.rect(x, my + 2, w, 1, trim[1]);
    }
  }
  p.bevel(x - 6, y + h + 3, w + 12, 4, trim, 4);
  p.rect(x - 6, y + h + 7, w + 12, 1, shade(trim[1], -0.3));
  if (shutters) {
    for (const sx of [x - 3 - 12, x + w + 3]) {
      p.bevel(sx, y - 3, 12, h + 6, shutters, 3);
      for (let j = y + 1; j < y + h + 2; j += 4) p.rect(sx + 2, j, 8, 1, shutters[1]);
    }
  }
  if (box) {
    p.bevel(x - 4, y + h + 8, w + 8, 8, WOOD, 3);
    const cols = FLOWER_COLORS[season].length ? FLOWER_COLORS[season] : ['#1b4830'];
    const R = rng(x * 7 + y);
    for (let i = 0; i < w + 6; i += 3) {
      const c = C(cols[(R() * cols.length) | 0]);
      const fy = y + h + 5 + ((R() * 3) | 0);
      p.set(x - 3 + i, fy + 2, C('#2d662d')); p.set(x - 2 + i, fy + 1, C('#418639'));
      if (season !== 'winter') { p.set(x - 3 + i, fy, c); p.set(x - 2 + i, fy, shade(c, -0.3)); p.set(x - 3 + i, fy - 1, shade(c, 0.3)); }
      else p.set(x - 3 + i, fy, SNOW[5]);
    }
  }
  return { x, y, w, h };
}

function doorAt(p, x, y, w, h, R, trim, { window: win = true, knob = true, lit = null } = {}) {
  p.bevel(x - 4, y - 4, w + 8, h + 4, trim, 3);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const rx = i % 8;
    let k = rx === 0 ? 4 : rx === 7 ? 1 : 3;
    if (j === Math.floor(h * 0.34) || j === Math.floor(h * 0.72)) k = 1;
    if (j === Math.floor(h * 0.34) + 1 || j === Math.floor(h * 0.72) + 1) k = 4;
    if (hash(x + i, (y + j) >> 2, 7) < 0.04) k = Math.max(1, k - 1);
    if (i < 2) k = Math.min(5, k + 1);
    p.set(x + i, y + j, R[k]);
  }
  if (win) {
    const ww = w - 12, wx = x + 6, wy = y + 6;
    for (let j = 0; j < 10; j++) for (let i = 0; i < ww; i++) {
      p.set(wx + i, wy + j, GLASS[j < 4 ? 4 : 3]);
      if (lit) lit.set(wx + i, wy + j, WARM[j < 4 ? 4 : 3]);
    }
    p.rect(wx + (ww >> 1), wy, 1, 10, R[1]);
    if (lit) lit.rect(wx + (ww >> 1), wy, 1, 10, R[1]);
  }
  if (knob) { p.rect(x + w - 7, y + (h >> 1), 3, 3, GOLD[3]); p.set(x + w - 7, y + (h >> 1), GOLD[5]); p.set(x + w - 5, y + (h >> 1) + 2, GOLD[1]); }
}

function step(p, x, y, w) { p.bevel(x, y, w, 7, STONE, 3); p.rect(x, y + 7, w, 1, STONE[1]); }

function chimney(p, x, y, w, h) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const off = (Math.floor(j / 5) & 1) * 4, rx = (i + off) % 8, ry = j % 5;
    let k = rx === 7 || ry === 4 ? 1 : ry === 0 ? 4 : 3;
    if (i < 2) k = Math.min(5, k + 1); if (i > w - 3) k = Math.max(1, k - 1);
    p.set(x + i, y + j, BRICK[k]);
  }
  p.bevel(x - 3, y - 4, w + 6, 5, STONE, 4);
  p.rect(x + 2, y - 5, w - 4, 1, DARK[1]);
}

function gear(p, cx, cy, r, R) {
  for (let y = -r - 3; y <= r + 3; y++) for (let x = -r - 3; x <= r + 3; x++) {
    const d = Math.hypot(x, y), a = Math.atan2(y, x);
    const tooth = Math.cos(a * 8) > 0.35 ? 3 : 0;
    if (d <= r + tooth && d >= r * 0.38) p.set(cx + x, cy + y, R[x + y < 0 ? 4 : d > r ? 2 : 3]);
  }
}

function hangingSign(p, x, y, w, h, board, text, textColor, shadowColor) {
  p.bevel(x, y, w, h, board, 3);
  p.rect(x + 1, y + h - 2, w - 2, 1, board[1]);
  if (text) signText(p, text, x + w / 2, y + Math.round((h - 7) / 2), textColor, shadowColor);
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------
export function building(kind, season = 'summer') {
  const p = new Pix(256, 192), lit = new Pix(256, 192);
  const snow = season === 'winter';
  const out = { pix: p, lit, w: 256, h: 192, smoke: [], lights: [] };
  if (kind === 'house') {
    wall(p, 12, 100, 232, 78, 'planks', WOOD_LIGHT, 11);
    for (const x of [12, 238]) p.bevel(x, 100, 6, 78, WHITE, 3);
    foundation(p, 8, 178, 240, 10);
    roof(p, ROOF.red, 20, 100, { seed: 12, snow });
    for (const wx of [44, 176]) windowAt(p, lit, wx, 120, 36, 28, WHITE, { shutters: GREEN, box: true, season });
    // porch
    for (const px of [94, 158]) p.bevel(px, 118, 4, 60, WHITE, 3);
    roof(p, ROOF.red, 108, 120, { left: 88, right: 168, inset: 6, seed: 13, snow });
    doorAt(p, 112, 128, 32, 50, GREEN, WHITE, { lit });
    step(p, 104, 178, 48);
    chimney(p, 190, 6, 18, 40);
    out.smoke.push([199, 2]);
    out.lights.push([128, 196, 56]);
  } else if (kind === 'workshop') {
    wall(p, 12, 98, 232, 40, 'boards', RED, 21);
    wall(p, 12, 138, 232, 40, 'stone', STONE, 22);
    foundation(p, 8, 178, 240, 10);
    // chimney pipe behind the roof
    p.seg(56, 4, 56, 40, 10, METAL);
    p.bevel(48, 2, 17, 5, DARK, 3);
    roof(p, ROOF.steel, 24, 98, { kind: 'metal', seed: 23, snow });
    out.smoke.push([56, 0]);
    for (const wx of [30, 196]) windowAt(p, lit, wx, 110, 30, 22, WOOD, {});
    // garage door
    p.bevel(92, 112, 72, 66, DARK, 3);
    for (let j = 0; j < 60; j++) for (let i = 0; i < 64; i++) {
      const ry = j % 8;
      let k = ry === 0 ? 5 : ry === 7 ? 2 : ry === 6 ? 3 : 4;
      if (i < 2) k = 5;
      if (i > 61) k = 2;
      p.set(96 + i, 118 + j, METAL[k]);
    }
    for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) for (let q = 0; q < 12; q++) {
      p.set(101 + i * 15 + q, 126 + j, GLASS[j < 2 ? 4 : 3]);
      lit.set(101 + i * 15 + q, 126 + j, WARM[j < 2 ? 4 : 3]);
    }
    p.rect(96, 172, 64, 6, (x) => ((x >> 3) & 1 ? YELLOW[3] : DARK[2]));
    hangingSign(p, 104, 100, 48, 12, WOOD_LIGHT, null);
    gear(p, 128, 106, 5, ORANGE);
    step(p, 92, 178, 72);
    out.lights.push([128, 196, 60]);
  } else if (kind === 'school') {
    wall(p, 12, 100, 232, 78, 'brick', BRICK, 31, C('#c9b8a6'));
    for (const x of [12, 238]) p.bevel(x, 100, 6, 78, WHITE, 4);
    foundation(p, 8, 178, 240, 10);
    roof(p, ROOF.slate, 36, 100, { seed: 32, snow });
    // bell cupola
    p.bevel(110, 18, 36, 26, WHITE, 4);
    p.rect(118, 24, 20, 16, DARK[1]);
    p.ellipse(128, 32, 6, 6, (x, y, nx, ny) => GOLD[lightIndex(sphereLight(nx, ny))]);
    p.rect(127, 38, 3, 2, GOLD[2]);
    p.poly([[104, 20], [128, 2], [152, 20]], (x, y) => ROOF.slate[x < 128 ? 4 : 2]);
    p.line(104, 20, 128, 2, ROOF.slate[5]);
    p.rect(104, 20, 49, 2, ROOF.slate[1]);
    for (const wx of [30, 70, 158, 198]) windowAt(p, lit, wx, 112, 28, 38, WHITE, {});
    doorAt(p, 106, 128, 22, 50, BLUE, WHITE, { lit, knob: false });
    doorAt(p, 128, 128, 22, 50, BLUE, WHITE, { lit });
    hangingSign(p, 100, 104, 56, 13, WHITE, 'CAMPUS', BLUE[2], WHITE[1]);
    step(p, 98, 178, 60);
    out.lights.push([128, 196, 56]);
  } else if (kind === 'code') {
    wall(p, 12, 98, 232, 80, 'boards', TEAL, 41);
    foundation(p, 8, 178, 240, 10);
    roof(p, ROOF.purple, 22, 98, { seed: 42, snow });
    for (const wx of [26, 158]) {
      // display window with a monitor inside
      p.bevel(wx - 3, 122, 76, 48, WOOD, 3);
      for (let j = 0; j < 42; j++) for (let i = 0; i < 70; i++) {
        let c = j > 30 ? WOOD[2] : C('#1b1f2e');
        if (j === 30) c = WOOD[4];
        if ((i + j) % 17 < 2 && j < 28) c = C('#2c3350');
        p.set(wx + i, 125 + j, c);
        lit.set(wx + i, 125 + j, j > 30 ? WOOD[3] : C('#3a3050'));
      }
      for (const q of [p, lit]) {
        q.bevel(wx + 16, 131, 38, 22, DARK, 3);
        q.rect(wx + 18, 133, 34, 18, C('#0d1830'));
        const lines = [[0, '#6fe0a0', 18], [1, '#ff9ad0', 12], [2, '#9fc8ff', 22], [3, '#6fe0a0', 9], [4, '#ffd166', 16]];
        for (const [row, col, len] of lines) q.rect(wx + 20 + (row % 2) * 3, 135 + row * 3, len, 1, C(col));
        q.rect(wx + 33, 153, 4, 3, DARK[3]);
        q.rect(wx + 27, 156, 16, 2, DARK[2]);
      }
      // striped awning
      for (let j = 0; j < 20; j++) for (let i = 0; i < 84; i++) {
        const stripe = Math.floor(i / 7) & 1;
        const scallop = j >= 16 && ((i % 7) - 3) ** 2 + (j - 16) * 4 > 9;
        if (scallop) continue;
        let c = stripe ? C('#f4f1ea') : BLUE[3];
        if (j < 2) c = shade(c, 0.2);
        if (j > 12) c = shade(c, -0.18);
        p.set(wx - 7 + i, 102 + j, c);
      }
    }
    doorAt(p, 112, 128, 32, 50, PURPLE, WOOD, { lit });
    p.bevel(115, 142, 26, 10, WHITE, 4);
    drawText(p, 'OPEN', 117, 143, RED[3]);
    hangingSign(p, 100, 100, 56, 14, DARK, '</>', CYAN[3], CYAN[1]);
    step(p, 104, 178, 48);
    out.lights.push([128, 196, 56]);
  } else if (kind === 'lab') {
    wall(p, 12, 100, 232, 78, 'stone', LAVENDER, 51, LAVENDER[1]);
    foundation(p, 8, 178, 240, 10);
    // flat roof and parapet
    p.rect(8, 60, 240, 30, (x, y) => METAL[(y - 60) % 10 === 0 ? 2 : ((x >> 4) & 1) ? 3 : 4]);
    p.bevel(4, 88, 248, 12, LAVENDER, 2);
    p.rect(4, 99, 248, 2, LAVENDER[0]);
    // satellite dish
    p.seg(62, 84, 62, 52, 4, METAL);
    p.ellipse(56, 42, 22, 13, (x, y, nx, ny) => WHITE[lightIndex(sphereLight(-nx, -ny) * 0.8 + 0.1)]);
    p.ellipse(56, 42, 16, 8, (x, y, nx, ny) => WHITE[lightIndex(sphereLight(nx, ny) * 0.6)]);
    p.line(56, 42, 70, 30, METAL[1]); p.rect(69, 28, 4, 4, RED[3]);
    // observatory dome
    p.ellipse(182, 74, 42, 40, (x, y, nx, ny) => (y > 74 ? 0 : METAL[lightIndex(sphereLight(nx, ny) + 0.1)]));
    p.rect(176, 36, 12, 38, (x, y) => (x < 178 ? DARK[3] : DARK[1]));
    p.seg(182, 56, 206, 30, 8, DARK);
    p.rect(138, 72, 88, 4, METAL[1]);
    // portholes
    for (const cx of [64, 192]) {
      p.ellipse(cx, 136, 15, 15, (x, y, nx, ny) => METAL[lightIndex(sphereLight(nx, ny))]);
      p.ellipse(cx, 136, 11, 11, (x, y, nx, ny) => (nx + ny < -0.6 ? CYAN[4] : ny < 0 ? GLASS[4] : GLASS[3]));
      lit.ellipse(cx, 136, 11, 11, (x, y, nx, ny) => CYAN[Math.hypot(nx, ny) < 0.5 ? 5 : 4]);
    }
    // sliding door
    p.bevel(106, 124, 44, 54, METAL, 2);
    p.rect(109, 127, 38, 51, (x, y) => METAL[x === 127 || x === 128 ? 1 : x < 112 ? 4 : 3]);
    for (let i = 0; i < 38; i++) for (let j = 0; j < 5; j++) p.set(109 + i, 172 + j, ((i + j) >> 2) & 1 ? YELLOW[3] : DARK[2]);
    for (const q of [p, lit]) { q.rect(113, 134, 10, 18, CYAN[2]); q.rect(133, 134, 10, 18, CYAN[2]); }
    hangingSign(p, 108, 104, 40, 14, DARK, 'LAB', CYAN[3], CYAN[1]);
    step(p, 100, 178, 56);
    out.lights.push([128, 196, 56]);
  }
  p.outline((c) => shade(c, -0.6));
  return out;
}

// ---------------------------------------------------------------------------
// Fences and gates
// ---------------------------------------------------------------------------
// mask bits: 1 = connects left, 2 = right, 4 = up, 8 = down
export function fence(mask) {
  const p = new Pix(32, 64), R = WOOD;
  if (mask & 4) for (let y = 0; y < 30; y++) for (let x = 13; x < 19; x++) p.set(x, y, R[x === 13 ? 4 : x > 16 ? 2 : 3]);
  if (mask & 1) for (const ry of [36, 47]) for (let x = 0; x < 14; x++) for (let y = ry; y < ry + 4; y++) p.set(x, y, R[y === ry ? 4 : y === ry + 3 ? 1 : 3]);
  if (mask & 2) for (const ry of [36, 47]) for (let x = 18; x < 32; x++) for (let y = ry; y < ry + 4; y++) p.set(x, y, R[y === ry ? 4 : y === ry + 3 ? 1 : 3]);
  // post
  for (let y = 30; y < 60; y++) for (let x = 12; x < 20; x++) {
    let k = x < 14 ? 4 : x > 17 ? 2 : 3;
    if (hash(x, y >> 2, 5) < 0.08) k = Math.max(1, k - 1);
    p.set(x, y, R[k]);
  }
  for (let x = 12; x < 20; x++) { p.set(x, 30, R[5]); p.set(x, 31, R[4]); }
  p.outline((c) => shade(c, -0.6));
  return p;
}

export function arch(name, color) {
  const text = name.toUpperCase();
  const W = 128, H = 96, p = new Pix(W, H);
  const A = [0, shade(C(color), -0.5), shade(C(color), -0.25), C(color), shade(C(color), 0.25), shade(C(color), 0.5)];
  for (const px of [11, 107]) {
    for (let y = 16; y < 94; y++) for (let x = px; x < px + 10; x++) p.set(x, y, WOOD[x < px + 2 ? 4 : x > px + 7 ? 2 : 3]);
    p.bevel(px - 2, 88, 14, 6, STONE, 3);
    p.bevel(px - 1, 12, 12, 5, A, 3);
  }
  const tw = Math.max(textWidth(text) + 18, 70);
  const bx = Math.round(64 - tw / 2);
  p.bevel(bx, 18, tw, 20, WOOD_LIGHT, 3);
  p.rect(bx + 2, 20, tw - 4, 16, WOOD_LIGHT[3]);
  p.rect(bx, 18, tw, 2, A[4]); p.rect(bx, 36, tw, 2, A[2]);
  signText(p, text, 64, 24, WOOD[1], WOOD_LIGHT[4]);
  // little roof cap
  for (let x = bx - 6; x < bx + tw + 6; x++) for (let y = 8; y < 16; y++) {
    const k = y === 8 ? 5 : y === 15 ? 1 : ((x + (y & 1) * 3) % 6 === 0 ? 2 : 3);
    p.set(x, y, A[k]);
  }
  p.outline((c) => shade(c, -0.6));
  return p;
}

// ---------------------------------------------------------------------------
// Street furniture
// ---------------------------------------------------------------------------
export function lamp(on) {
  const p = new Pix(32, 96);
  p.bevel(10, 84, 12, 9, DARK, 3);
  p.rect(9, 92, 14, 2, DARK[1]);
  for (let y = 26; y < 86; y++) { p.set(14, y, DARK[4]); p.set(15, y, DARK[3]); p.set(16, y, DARK[2]); p.set(17, y, DARK[1]); }
  p.rect(12, 60, 8, 3, DARK[3]);
  // lantern
  p.poly([[7, 12], [16, 4], [25, 12]], (x) => DARK[x < 16 ? 4 : 2]);
  p.rect(15, 1, 2, 4, DARK[3]);
  p.bevel(8, 12, 16, 16, DARK, 2);
  for (let y = 14; y < 26; y++) for (let x = 10; x < 22; x++) {
    const on_ = on ? WARM[Math.abs(x - 15.5) < 3 && Math.abs(y - 20) < 4 ? 5 : 4] : GLASS[y < 18 ? 4 : 3];
    p.set(x, y, x === 15 || x === 16 ? DARK[3] : on_);
  }
  p.rect(8, 26, 16, 3, DARK[3]);
  p.outline((c) => shade(c, -0.6));
  return p;
}

export function bench() {
  const p = new Pix(64, 48);
  for (let k = 0; k < 3; k++) p.bevel(6, 10 + k * 6, 52, 5, WOOD, 3);
  for (let k = 0; k < 2; k++) p.bevel(4, 28 + k * 5, 56, 5, WOOD_LIGHT, 3);
  for (const x of [6, 54]) { p.rect(x, 10, 4, 36, DARK[2]); p.rect(x, 10, 1, 36, DARK[4]); }
  p.rect(4, 26, 8, 3, DARK[3]); p.rect(52, 26, 8, 3, DARK[3]);
  p.outline((c) => shade(c, -0.6));
  return p;
}

export function signpost() {
  const p = new Pix(64, 96);
  for (let y = 16; y < 94; y++) for (let x = 29; x < 36; x++) p.set(x, y, WOOD[x < 31 ? 4 : x > 33 ? 2 : 3]);
  const board = (x0, y0, w, dir) => {
    const pts = dir < 0
      ? [[x0, y0 + 6], [x0 + 7, y0], [x0 + w, y0], [x0 + w, y0 + 12], [x0 + 7, y0 + 12]]
      : dir > 0 ? [[x0, y0], [x0 + w - 7, y0], [x0 + w, y0 + 6], [x0 + w - 7, y0 + 12], [x0, y0 + 12]]
        : [[x0, y0 + 4], [x0 + w / 2, y0 - 4], [x0 + w, y0 + 4], [x0 + w, y0 + 12], [x0, y0 + 12]];
    p.poly(pts, (x, y) => WOOD_LIGHT[y === y0 || (dir === 0 && y < y0 + 5) ? 5 : y >= y0 + 11 ? 1 : 3 + ((x + y) % 9 === 0 ? -1 : 0)]);
    p.rect(x0 + (dir < 0 ? 9 : 3), y0 + 5, w - 12, 1, WOOD_LIGHT[2]);
  };
  board(4, 26, 30, -1);
  board(31, 42, 30, 1);
  board(20, 12, 24, 0);
  p.outline((c) => shade(c, -0.6));
  return p;
}

export function smallSign() {
  const p = new Pix(32, 48);
  for (let y = 22; y < 46; y++) for (let x = 14; x < 19; x++) p.set(x, y, WOOD[x === 14 ? 4 : x > 16 ? 2 : 3]);
  p.bevel(3, 8, 26, 17, WOOD_LIGHT, 3);
  for (let y = 12; y < 23; y += 4) p.rect(6, y, 20, 1, WOOD_LIGHT[2]);
  p.rect(3, 8, 26, 1, WOOD_LIGHT[5]);
  p.outline((c) => shade(c, -0.6));
  return p;
}

export function welcomeSign(lines) {
  const tw = Math.max(...lines.map((l) => textWidth(l.toUpperCase())));
  const W = Math.max(64, tw + 28), H = 72, p = new Pix(W, H);
  for (const px of [10, W - 17]) for (let y = 30; y < 70; y++) for (let x = px; x < px + 7; x++) p.set(x, y, WOOD[x < px + 2 ? 4 : x > px + 4 ? 2 : 3]);
  p.bevel(3, 8, W - 6, 30, WOOD_LIGHT, 3);
  p.rect(5, 10, W - 10, 26, WOOD_LIGHT[3]);
  for (let y = 12; y < 36; y += 6) p.rect(5, y, W - 10, 1, WOOD_LIGHT[2]);
  lines.forEach((l, i) => signText(p, l.toUpperCase(), W / 2, 12 + i * 11, WOOD[1], WOOD_LIGHT[4]));
  p.outline((c) => shade(c, -0.6));
  return p;
}

export function noticeBoard() {
  const p = new Pix(64, 80);
  for (const px of [8, 50]) for (let y = 20; y < 78; y++) for (let x = px; x < px + 6; x++) p.set(x, y, WOOD[x === px ? 4 : x > px + 3 ? 2 : 3]);
  p.bevel(3, 14, 58, 44, WOOD, 3);
  p.rect(7, 18, 50, 36, (x, y) => (hash(x, y, 3) < 0.2 ? C('#b0864e') : hash(x, y, 4) < 0.1 ? C('#8a6232') : C('#c49a60')));
  const notes = [[10, 21, 14, 12, '#f7f1e2'], [27, 20, 12, 15, '#fff0a8'], [42, 23, 12, 11, '#f7f1e2'], [12, 36, 13, 14, '#ffd0e7'], [30, 38, 15, 12, '#f7f1e2']];
  for (const [x, y, w, h, c] of notes) {
    p.bevel(x, y, w, h, [0, shade(C(c), -0.4), shade(C(c), -0.2), C(c), shade(C(c), 0.2), C('#ffffff')], 3);
    for (let ly = y + 4; ly < y + h - 2; ly += 3) p.rect(x + 2, ly, w - 5 - ((ly * 7) % 4), 1, C('#8a8478'));
    p.rect(x + (w >> 1), y + 1, 2, 2, RED[3]);
  }
  // roof cap
  p.poly([[0, 14], [8, 4], [56, 4], [64, 14]], (x, y) => WOOD[y < 6 ? 5 : y > 12 ? 1 : 3]);
  hangingSign(p, 13, 58, 38, 11, WOOD_LIGHT, 'QUESTS', WOOD[1], WOOD_LIGHT[4]);
  p.outline((c) => shade(c, -0.6));
  return p;
}

export function fountain(frame) {
  const W = 128, H = 96, p = new Pix(W, H);
  // basin front wall
  for (let y = 58; y < 86; y++) for (let x = 6; x < 122; x++) {
    const ex = (x - 64) / 58, top = 62 + Math.sqrt(Math.max(0, 1 - ex * ex)) * 22;
    if (y < top - 22 || y > top) continue;
    const off = (Math.floor(y / 6) & 1) * 7, rx = (x + off) % 14, ry = y % 6;
    let k = rx === 13 || ry === 5 ? 1 : 3;
    if (ry === 0) k = 4;
    if (x < 14) k = Math.min(5, k + 1); if (x > 114) k = Math.max(1, k - 1);
    p.set(x, y, STONE[k]);
  }
  // rim and water
  p.ellipse(64, 60, 58, 24, (x, y, nx, ny) => STONE[ny < 0 ? 5 : 4]);
  p.ellipse(64, 60, 51, 19, (x, y, nx, ny) => {
    const d = Math.hypot(nx, ny);
    const ring = (d * 5 - frame * 0.25) % 1;
    let k = ny < -0.5 ? 2 : 3;
    if (ring < 0.12 && d > 0.25) k = 4;
    if (d > 0.93) k = 1;
    return WATER[k];
  });
  // pillar
  for (let y = 26; y < 64; y++) for (let x = 58; x < 71; x++) p.set(x, y, STONE[x < 61 ? 5 : x > 67 ? 2 : 3]);
  p.ellipse(64, 64, 9, 4, (x, y, nx) => WATER[nx < 0 ? 4 : 3]);
  // upper bowl
  p.ellipse(64, 30, 18, 7, (x, y, nx, ny) => STONE[ny < 0 ? 5 : 3]);
  p.ellipse(64, 29, 14, 4, (x, y, nx) => WATER[nx < -0.3 ? 5 : 4]);
  p.rect(48, 31, 33, 3, STONE[2]);
  // spout and falling water, animated
  const f = frame % 4;
  for (let y = 8; y < 28; y++) { p.set(63, y, WATER[6]); p.set(64, y, WATER[5]); if ((y + f * 2) % 6 < 3) p.set(65, y, WATER[5]); }
  p.ellipse(64, 8, 3, 3, WATER[6]);
  for (const side of [-1, 1]) {
    for (let s = 0; s < 22; s++) {
      const x = 64 + side * (15 + s * 0.35), y = 33 + s * 1.3;
      if ((s + f * 3) % 5 < 3) p.set(x, y, WATER[s % 3 === 0 ? 6 : 5]);
    }
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + f * 0.4, x = 64 + Math.cos(a) * 20, y = 60 + Math.sin(a) * 6;
    p.set(x, y, WATER[6]); p.set(x + 1, y, WATER[5]);
  }
  p.outline((c) => shade(c, -0.6));
  return p;
}

export function barrel() {
  const p = new Pix(32, 48);
  p.rect(6, 12, 20, 32, (x, y) => {
    const u = (x - 6) / 20;
    let k = u < 0.2 ? 4 : u < 0.55 ? 3 : u < 0.85 ? 2 : 1;
    if ((x - 6) % 5 === 0) k = Math.max(1, k - 1);
    return WOOD[k];
  });
  for (const y of [16, 38]) p.rect(6, y, 20, 3, (x) => METAL[(x - 6) / 20 < 0.3 ? 4 : 2]);
  p.ellipse(16, 12, 10, 4, (x, y, nx) => WOOD[nx < 0 ? 4 : 3]);
  p.ellipse(16, 12, 7, 2.5, WOOD[2]);
  p.outline((c) => shade(c, -0.6));
  return p;
}

export function crate() {
  const p = new Pix(32, 32);
  p.bevel(4, 8, 24, 22, WOOD_LIGHT, 3);
  p.rect(6, 10, 20, 18, (x, y) => WOOD_LIGHT[(y - 10) % 6 === 5 ? 2 : 3]);
  p.line(6, 10, 25, 27, WOOD_LIGHT[2]); p.line(6, 11, 24, 27, WOOD_LIGHT[4]);
  p.rect(4, 8, 24, 2, WOOD_LIGHT[5]);
  p.outline((c) => shade(c, -0.6));
  return p;
}

export function mailbox(flagUp) {
  const p = new Pix(32, 64);
  for (let y = 30; y < 62; y++) for (let x = 14; x < 19; x++) p.set(x, y, WOOD[x === 14 ? 4 : x > 16 ? 2 : 3]);
  p.rect(4, 18, 24, 14, (x, y) => RED[x < 7 ? 5 : x > 24 ? 2 : y > 28 ? 2 : 3]);
  p.ellipse(16, 18, 12, 7, (x, y, nx, ny) => (y > 18 ? 0 : RED[lightIndex(sphereLight(nx, ny))]));
  p.bevel(6, 20, 20, 10, RED, 2);
  p.rect(9, 24, 14, 1, RED[1]);
  p.rect(15, 26, 3, 2, GOLD[4]);
  if (flagUp) { p.rect(27, 8, 2, 18, DARK[3]); p.rect(28, 8, 4, 0, 0); p.bevel(24, 8, 7, 6, YELLOW, 3); }
  else { p.rect(27, 20, 2, 10, DARK[3]); p.bevel(27, 26, 5, 4, YELLOW, 2); }
  p.outline((c) => shade(c, -0.6));
  return p;
}

export function shippingBin() {
  const p = new Pix(64, 48);
  p.bevel(4, 20, 56, 26, WOOD, 3);
  for (let y = 24; y < 44; y += 6) p.rect(6, y, 52, 1, WOOD[2]);
  p.bevel(2, 12, 60, 10, WOOD_LIGHT, 3);
  p.rect(2, 20, 60, 2, WOOD[1]);
  for (const x of [10, 50]) { p.rect(x, 12, 4, 34, METAL[3]); p.rect(x, 12, 1, 34, METAL[5]); }
  p.bevel(28, 18, 8, 7, GOLD, 3);
  p.outline((c) => shade(c, -0.6));
  return p;
}

export function campfire(frame) {
  const p = new Pix(32, 32), R = rng(900 + frame);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, x = 16 + Math.cos(a) * 11, y = 24 + Math.sin(a) * 5;
    p.ellipse(x, y, 3.2, 2.4, (xx, yy, nx, ny) => STONE[lightIndex(sphereLight(nx, ny))]);
  }
  p.seg(8, 25, 24, 21, 4, BARK); p.seg(8, 21, 24, 25, 4, BARK);
  const flame = [C('#c7361c'), C('#f06a1c'), C('#ffae2a'), C('#ffe27a'), C('#fffbe0')];
  for (let y = 4; y < 24; y++) for (let x = 8; x < 25; x++) {
    const h = (24 - y) / 18, cx = 16 + Math.sin(y * 0.7 + frame * 2) * 1.5;
    const wdt = 6.5 * (1 - h) * (1 - h * 0.3) + 1;
    const d = Math.abs(x + 0.5 - cx);
    if (d > wdt || R() < 0.08 * h) continue;
    const q = 1 - d / wdt;
    const k = h > 0.8 ? 1 : q > 0.75 && h < 0.5 ? 4 : q > 0.5 ? 3 : q > 0.2 ? 2 : 1;
    p.set(x, y, flame[k]);
  }
  return p;
}

export function constructionSign() {
  const p = new Pix(64, 64);
  for (const [x0, x1] of [[10, 6], [48, 52]]) p.seg(x0, 28, x1, 60, 3, WOOD);
  p.bevel(6, 34, 52, 8, WHITE, 4);
  for (let x = 7; x < 57; x++) for (let y = 35; y < 41; y++) if (((x + y) >> 2) & 1) p.set(x, y, ORANGE[3]);
  p.bevel(8, 6, 48, 26, WOOD_LIGHT, 3);
  signText(p, 'COMING', 32, 9, WOOD[1], WOOD_LIGHT[4]);
  signText(p, 'SOON', 32, 19, WOOD[1], WOOD_LIGHT[4]);
  // cone
  p.poly([[52, 60], [57, 40], [62, 60]], (x, y) => (((y - 40) >> 2) & 1 ? WHITE[4] : ORANGE[x < 57 ? 4 : 3]));
  p.rect(49, 60, 15, 3, ORANGE[2]);
  p.outline((c) => shade(c, -0.6));
  return p;
}

export function crop(season, variant = 0) {
  const p = new Pix(32, 32), R = rng(1000 + variant);
  if (season === 'winter') return null;
  if (season === 'spring') {
    const L = [0, C('#1f4a26'), C('#2f6e34'), C('#4a9444'), C('#72b85a'), C('#a3db72')];
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + variant; p.ellipse(16 + Math.cos(a) * 7, 21 + Math.sin(a) * 4, 6, 4, (x, y, nx, ny) => L[lightIndex(sphereLight(nx, ny))]); }
    p.ellipse(16, 18, 6, 5, (x, y, nx, ny) => WHITE[lightIndex(sphereLight(nx, ny) + (hash(x, y, 2) - 0.5) * 0.4)]);
  } else if (season === 'summer') {
    p.rect(15, 4, 2, 26, WOOD[3]);
    const L = [0, C('#1f4a26'), C('#2f6e34'), C('#4a9444'), C('#72b85a'), C('#a3db72')];
    for (let k = 0; k < 7; k++) p.ellipse(10 + R() * 12, 8 + k * 3, 5, 3, (x, y, nx, ny) => L[lightIndex(sphereLight(nx, ny))]);
    for (let k = 0; k < 4; k++) p.ellipse(10 + R() * 12, 10 + R() * 16, 2.6, 2.6, (x, y, nx, ny) => RED[lightIndex(sphereLight(nx, ny))]);
  } else {
    const L = [0, C('#1f4a26'), C('#2f6e34'), C('#4a9444'), C('#72b85a')];
    p.ellipse(9, 20, 7, 4, (x, y, nx, ny) => L[lightIndex(sphereLight(nx, ny), 5)]);
    p.ellipse(16, 22, 11, 8, (x, y, nx, ny) => {
      const rib = Math.abs(Math.sin(nx * 4.5)) < 0.2 ? -0.35 : 0;
      return ORANGE[lightIndex(sphereLight(nx, ny) + rib)];
    });
    p.seg(16, 15, 18, 11, 3, [0, C('#3a2a10'), C('#5a4418'), C('#7a6024'), C('#9a7c34')]);
  }
  p.outline((c) => shade(c, -0.6));
  return p;
}

export { WARM };
