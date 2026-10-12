// One 64 x 64 display prop and one 32 x 32 inventory icon per project.
// Keys match the `sprite` field in content.js; unknown keys fall back to a crate.
import { Pix, C, shade, hash, rng, sphereLight, lightIndex, drawText, signText, withAlpha } from './art-core.js';
import {
  WOOD, WOOD_LIGHT, STONE, METAL, DARK, RED, BLUE, TEAL, GREEN, YELLOW, ORANGE, PINK, PURPLE, CYAN,
  PAPER, GLASS, WHITE, GOLD, BRICK,
} from './palette.js';

const out = (p) => p.outline((c) => shade(c, -0.62));
const ball = (p, cx, cy, r, R, bias = 0) => p.ellipse(cx, cy, r, r, (x, y, nx, ny) => R[lightIndex(sphereLight(nx, ny) + bias)]);

function envelope(p, x, y, crossed = false, stripe = null) {
  p.bevel(x, y, 10, 7, PAPER, 4);
  p.line(x, y, x + 4, y + 3, PAPER[1]); p.line(x + 9, y, x + 5, y + 3, PAPER[1]);
  if (stripe) p.rect(x + 1, y + 5, 8, 1, stripe);
  if (crossed) { p.line(x + 2, y + 1, x + 7, y + 6, RED[3]); p.line(x + 7, y + 1, x + 2, y + 6, RED[3]); }
  else p.rect(x + 4, y + 3, 2, 2, RED[3]);
}
function wheel(p, cx, cy, r) {
  ball(p, cx, cy, r, DARK);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.set(cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1), GREEN[3]); }
  ball(p, cx, cy, r * 0.38, METAL);
}
function holes(p, x, y, w, h, R) {
  p.bevel(x, y, w, h, R, 4);
  for (let i = x + 2; i < x + w - 1; i += 3) p.set(i, y + (h >> 1), DARK[1]);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
const PROPS = {
  humanoid() {
    const p = new Pix(64, 64);
    p.bevel(6, 53, 52, 7, WOOD_LIGHT, 3);
    for (let x = 12; x < 56; x += 8) p.rect(x, 54, 1, 5, WOOD_LIGHT[1]);
    p.rect(6, 60, 52, 2, (x) => ((x >> 2) & 1 ? YELLOW[3] : DARK[2]));
    p.bevel(10, 12, 4, 42, METAL, 3); p.bevel(48, 12, 4, 42, METAL, 3); p.bevel(8, 9, 46, 4, METAL, 4);
    for (let y = 13; y < 18; y++) p.set(31, y, y % 2 ? METAL[2] : METAL[4]);
    // head
    p.bevel(23, 17, 17, 14, WHITE, 3);
    p.clear(23, 17); p.clear(39, 17); p.clear(23, 30); p.clear(39, 30);
    p.rect(25, 21, 13, 5, DARK[1]);
    p.rect(27, 22, 3, 2, CYAN[3]); p.rect(33, 22, 3, 2, CYAN[3]); p.set(27, 22, CYAN[5]); p.set(33, 22, CYAN[5]);
    p.rect(29, 31, 5, 2, DARK[2]);
    // torso
    p.bevel(21, 33, 21, 15, WHITE, 3);
    p.rect(26, 36, 11, 7, DARK[2]);
    p.set(28, 38, GREEN[4]); p.set(31, 38, YELLOW[4]); p.set(34, 38, RED[4]);
    p.rect(27, 41, 9, 1, DARK[3]);
    // hanging arm
    ball(p, 20, 35, 3.2, METAL);
    p.seg(19, 37, 16, 46, 4, WHITE);
    ball(p, 16, 47, 2.4, METAL);
    for (const fx of [14, 16, 18]) p.rect(fx, 49, 1, 4, METAL[3]);
    // empty socket with loose wires
    ball(p, 43, 35, 3.2, DARK);
    p.line(44, 36, 47, 43, RED[3]); p.line(43, 37, 45, 45, BLUE[4]); p.line(45, 35, 49, 40, YELLOW[4]);
    p.line(27, 48, 26, 53, BLUE[3]); p.line(35, 48, 36, 52, RED[3]);
    // the other arm, lying on the pallet
    p.seg(33, 51, 45, 49, 4, WHITE);
    ball(p, 46, 49, 2.4, METAL);
    for (const fy of [47, 49, 51]) p.rect(48, fy, 4, 1, METAL[3]);
    // cone
    p.poly([[54, 61], [58, 45], [62, 61]], (x, y) => (((y - 45) >> 2) & 1 ? WHITE[4] : ORANGE[x < 58 ? 4 : 3]));
    return out(p);
  },

  clancy() {
    const p = new Pix(64, 64);
    p.bevel(6, 52, 38, 8, WOOD, 3);
    p.rect(12, 42, 25, 10, (x) => DARK[x < 16 ? 4 : x < 29 ? 3 : 2]);
    p.ellipse(24.5, 42, 12.5, 4.5, (x, y, nx, ny) => METAL[lightIndex(sphereLight(nx, ny * 0.5))]);
    p.rect(30, 46, 2, 2, GREEN[4]);
    p.seg(24, 40, 37, 19, 9, YELLOW);
    p.line(21, 38, 33, 19, DARK[2]);
    ball(p, 24, 40, 6, DARK); ball(p, 24, 40, 2.4, METAL, 0.3);
    p.seg(37, 19, 51, 29, 7, YELLOW);
    ball(p, 37, 19, 5, DARK); ball(p, 37, 19, 2, METAL, 0.3);
    ball(p, 51, 29, 3.4, DARK);
    ball(p, 51, 41, 4.6, RED);
    p.seg(49, 31, 46, 41, 2.6, METAL); p.seg(53, 31, 56, 41, 2.6, METAL);
    return out(p);
  },

  vex() {
    const p = new Pix(64, 64);
    const F = [0, C('#3a3a44'), C('#55555f'), C('#6e6e78'), C('#86868f'), C('#9e9ea6')];
    for (let y = 40; y < 59; y++) for (let x = 3; x < 61; x++) {
      const tooth = ((y >> 2) & 1);
      if ((x < 6 && tooth) || (x > 57 && !tooth)) continue;
      p.set(x, y, F[hash(x, y, 1) < 0.1 ? 2 : y === 40 ? 5 : 3]);
    }
    p.rect(3, 59, 58, 3, F[1]);
    wheel(p, 17, 34, 5); wheel(p, 47, 34, 5);
    holes(p, 14, 35, 36, 4, METAL);
    holes(p, 14, 44, 36, 4, METAL);
    p.bevel(12, 33, 4, 15, RED, 3); p.bevel(48, 33, 4, 15, RED, 3);
    p.seg(20, 34, 26, 13, 3, METAL); p.seg(44, 34, 38, 13, 3, METAL);
    p.bevel(23, 10, 18, 4, METAL, 4);
    p.bevel(28, 4, 8, 7, RED, 3);
    p.bevel(21, 21, 13, 12, DARK, 2);
    p.rect(23, 23, 9, 6, BLUE[4]); p.rect(23, 23, 9, 1, BLUE[5]); p.set(31, 30, RED[4]);
    p.bevel(36, 25, 10, 8, DARK, 2); p.rect(37, 26, 8, 2, GREEN[3]);
    wheel(p, 14, 47, 6); wheel(p, 50, 47, 6);
    return out(p);
  },

  unsubscriber() {
    const p = new Pix(64, 64);
    for (let y = 32; y < 62; y++) for (let x = 17; x < 22; x++) p.set(x, y, WOOD[x === 17 ? 4 : x > 19 ? 2 : 3]);
    p.bevel(7, 18, 24, 15, BLUE, 3);
    p.ellipse(19, 19, 12, 7, (x, y, nx, ny) => (y > 18 ? 0 : BLUE[lightIndex(sphereLight(nx, ny))]));
    p.rect(11, 22, 16, 9, DARK[1]); p.rect(11, 22, 16, 1, DARK[0]);
    envelope(p, 14, 23);
    p.bevel(27, 22, 3, 12, RED, 3);
    // letters flying to the bin
    envelope(p, 30, 9); envelope(p, 42, 3); envelope(p, 44, 19, true);
    for (const [x, y] of [[28, 12], [40, 6], [41, 22]]) { p.set(x, y, WHITE[3]); p.set(x - 2, y, WHITE[2]); }
    // bin
    p.rect(39, 41, 20, 20, (x) => { const u = (x - 39) / 20; let k = u < 0.2 ? 4 : u < 0.6 ? 3 : 2; if ((x - 39) % 5 === 0) k--; return METAL[Math.max(1, k)]; });
    p.ellipse(49, 41, 10, 3, (x, y, nx) => METAL[nx < 0 ? 4 : 3]);
    envelope(p, 41, 34, true); envelope(p, 49, 36, true);
    p.seg(38, 35, 50, 29, 3, METAL);
    return out(p);
  },

  gmailpanel() {
    const p = new Pix(64, 64);
    p.bevel(12, 14, 40, 46, WOOD, 3);
    p.bevel(10, 11, 44, 4, WOOD_LIGHT, 3);
    const stripes = [RED[3], BLUE[4], GREEN[4], YELLOW[4]];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      const x = 15 + c * 12, y = 17 + r * 10;
      p.rect(x, y, 10, 8, DARK[1]); p.rect(x, y, 10, 1, DARK[0]);
      if (hash(r, c, 5) < 0.7) {
        p.bevel(x + 1, y + 2, 8, 6, PAPER, 4);
        p.line(x + 1, y + 2, x + 4, y + 4, PAPER[1]); p.line(x + 8, y + 2, x + 5, y + 4, PAPER[1]);
        p.rect(x + 1, y + 7, 8, 1, stripes[(r * 3 + c) % 4]);
      }
    }
    p.rect(13, 60, 4, 3, WOOD[1]); p.rect(47, 60, 4, 3, WOOD[1]);
    // plant on top
    p.bevel(38, 5, 10, 7, ORANGE, 3);
    for (const [x, y] of [[40, 3], [43, 1], [46, 3], [42, 4]]) ball(p, x, y, 2.4, GREEN);
    return out(p);
  },

  dictation() {
    const p = new Pix(64, 64);
    p.ellipse(24, 58, 12, 4, (x, y, nx, ny) => DARK[lightIndex(sphereLight(nx, ny * 0.6))]);
    p.seg(24, 57, 24, 30, 3, METAL);
    p.bevel(19, 28, 11, 4, DARK, 3);
    p.rect(16, 12, 17, 12, (x, y) => METAL[lightIndex(sphereLight((x - 24.5) / 9, 0) + 0.1)]);
    p.ellipse(24.5, 12, 8.5, 7, (x, y, nx, ny) => (y > 12 ? 0 : ((x + y) % 3 === 0 || (x - y + 99) % 3 === 0) ? METAL[2] : METAL[lightIndex(sphereLight(nx, ny))]));
    p.ellipse(24.5, 24, 8.5, 4, (x, y, nx, ny) => (y < 24 ? 0 : METAL[lightIndex(sphereLight(nx, ny))]));
    p.rect(16, 17, 17, 2, GOLD[3]); p.rect(16, 17, 17, 1, GOLD[5]);
    for (let y = 7; y < 17; y++) for (let x = 17; x < 32; x++) if (((x + y) % 3 === 0) && p.opaque(x, y)) p.set(x, y, METAL[1]);
    p.line(36, 59, 44, 61, DARK[2]); p.line(44, 61, 52, 58, DARK[2]);
    // speech bubble
    p.rect(37, 4, 23, 13, WHITE[5]); p.rect(36, 5, 25, 11, WHITE[5]);
    p.poly([[39, 16], [45, 16], [35, 22]], WHITE[5]);
    for (const x of [42, 47, 52]) p.rect(x, 9, 3, 3, DARK[3]);
    for (const r of [6, 10]) for (let a = 2.2; a < 4.1; a += 0.12) p.set(14 + Math.cos(a) * r, 15 + Math.sin(a) * r, CYAN[3]);
    return out(p);
  },

  dashboard() {
    const p = new Pix(64, 64);
    for (const lx of [12, 48]) for (let y = 40; y < 62; y++) for (let x = lx; x < lx + 4; x++) p.set(x, y, WOOD[x === lx ? 4 : 3]);
    p.bevel(4, 6, 56, 38, WOOD, 3);
    p.rect(7, 9, 50, 32, (x, y) => (hash(x, y, 3) < 0.2 ? C('#b0864e') : hash(x, y, 4) < 0.1 ? C('#8a6232') : C('#c49a60')));
    const note = (x, y, w, h, col) => {
      const c = C(col), R = [0, shade(c, -0.45), shade(c, -0.22), c, shade(c, 0.22), shade(c, 0.45)];
      p.bevel(x, y, w, h, R, 3);
      for (let ly = y + 3; ly < y + h - 1; ly += 2) p.rect(x + 2, ly, w - 4 - ((ly * 3) % 3), 1, R[1]);
      p.rect(x + (w >> 1) - 1, y, 2, 2, DARK[2]);
    };
    note(9, 11, 11, 10, '#e05a4a'); note(22, 12, 11, 10, '#4a7ad6');
    note(9, 25, 11, 11, '#5ab06a'); note(22, 27, 10, 10, '#a09aa8');
    p.bevel(35, 11, 19, 26, PAPER, 4);
    p.rect(35, 11, 19, 4, RED[3]);
    for (let gx = 38; gx < 53; gx += 4) p.rect(gx, 16, 1, 19, PAPER[2]);
    for (let gy = 19; gy < 36; gy += 4) p.rect(36, gy, 17, 1, PAPER[2]);
    p.ellipse(44.5, 25.5, 3, 2.6, (x, y, nx, ny) => (Math.hypot(nx, ny) > 0.62 ? RED[3] : 0));
    return out(p);
  },

  keyreplay() {
    const p = new Pix(64, 64);
    p.poly([[13, 6], [21, 4], [21, 62], [13, 62]], (x, y) => PURPLE[x < 15 ? 3 : 2]);
    for (const [x, y] of [[16, 20], [17, 34], [15, 46]]) { p.set(x, y, YELLOW[5]); p.set(x - 1, y, YELLOW[3]); p.set(x + 1, y, YELLOW[3]); p.set(x, y - 1, YELLOW[3]); p.set(x, y + 1, YELLOW[3]); }
    p.bevel(21, 4, 30, 58, PURPLE, 3);
    p.bevel(22, 5, 28, 9, YELLOW, 4);
    signText(p, 'PLAY', 36, 6, RED[2], YELLOW[5]);
    p.bevel(23, 15, 26, 20, DARK, 2);
    p.rect(26, 18, 20, 14, C('#10183a'));
    const arrow = (cx, cy, dir, col) => {
      const c = C(col);
      for (let k = 0; k < 3; k++) for (let s = -k; s <= k; s++) {
        const [x, y] = dir === 'u' ? [cx + s, cy - 1 + k] : dir === 'd' ? [cx + s, cy + 1 - k] : dir === 'l' ? [cx - 1 + k, cy + s] : [cx + 1 - k, cy + s];
        p.set(x, y, c);
      }
    };
    arrow(36, 21, 'u', '#3dd4e6'); arrow(36, 29, 'd', '#f597c6'); arrow(31, 25, 'l', '#f7cd4f'); arrow(41, 25, 'r', '#5eb55c');
    p.poly([[19, 36], [53, 36], [55, 43], [17, 43]], (x, y) => PURPLE[y < 38 ? 5 : 4]);
    p.rect(26, 34, 2, 4, DARK[2]); ball(p, 27, 33, 2.6, RED);
    ball(p, 37, 39, 2.2, YELLOW); ball(p, 43, 39, 2.2, CYAN);
    p.bevel(30, 47, 12, 11, DARK, 2);
    p.rect(32, 50, 2, 5, ORANGE[4]); p.rect(38, 50, 2, 5, ORANGE[4]);
    return out(p);
  },

  biopsy() {
    const p = new Pix(64, 64);
    for (const lx of [6, 55]) p.rect(lx, 43, 3, 19, (x) => METAL[x === lx ? 4 : 2]);
    p.bevel(6, 54, 52, 3, METAL, 3);
    p.bevel(2, 38, 60, 6, WHITE, 4);
    p.bevel(10, 33, 22, 6, DARK, 3);
    p.seg(28, 34, 28, 15, 5, WHITE);
    p.seg(28, 15, 23, 9, 5, WHITE);
    p.bevel(12, 25, 16, 3, DARK, 3);
    p.rect(15, 24, 10, 1, PINK[5]); p.rect(19, 24, 2, 1, PINK[2]);
    p.bevel(17, 18, 8, 6, METAL, 3); p.rect(19, 24, 3, 1, METAL[2]);
    p.seg(21, 16, 15, 5, 4, DARK);
    p.bevel(11, 2, 7, 4, DARK, 3);
    ball(p, 31, 28, 2.4, METAL);
    // laptop showing results
    p.bevel(37, 17, 23, 16, DARK, 3);
    p.rect(39, 19, 19, 12, C('#0d1830'));
    const bars = [[41, 5, '#dc5f9e'], [45, 9, '#3dd4e6'], [49, 7, '#5eb55c'], [53, 10, '#f7cd4f']];
    for (const [x, h, c] of bars) p.rect(x, 30 - h, 3, h, C(c));
    p.poly([[35, 33], [61, 33], [63, 37], [33, 37]], (x, y) => METAL[y === 33 ? 5 : 4]);
    return out(p);
  },

  secondbrain(frame = 0) {
    const p = new Pix(64, 64);
    // hologram beam
    for (let y = 8; y < 26; y++) {
      const w = 4 + (26 - y) * 0.75;
      for (let x = Math.round(32 - w); x <= Math.round(32 + w); x++) p.set(x, y, withAlpha(C('#3dd4e6'), (y + frame) % 4 === 0 ? 110 : 60));
    }
    // brain
    const glow = frame === 1 ? 0.12 : 0;
    for (const cx of [27, 37]) {
      p.ellipse(cx, 11, 8, 7.5, (x, y, nx, ny) => {
        const fold = Math.sin(x * 1.3 + y * 0.6) + Math.sin(y * 1.7 - x * 0.4) > 1.1;
        return PINK[lightIndex(sphereLight(nx, ny) + glow - (fold ? 0.4 : 0))];
      });
    }
    p.rect(32, 5, 1, 13, PINK[1]);
    // case
    p.bevel(18, 26, 29, 36, DARK, 3);
    p.rect(20, 28, 5, 32, DARK[2]);
    p.set(22, 31, frame === 2 ? GREEN[3] : GREEN[5]);
    p.rect(26, 28, 19, 31, C('#141a28'));
    const hues = ['#3dd4e6', '#dc5f9e', '#9f74d2'];
    p.rect(26, 28, 19, 1, C(hues[frame % 3])); p.rect(26, 58, 19, 1, C(hues[(frame + 1) % 3]));
    for (const [cx, cy] of [[35, 35], [35, 51]]) {
      p.ellipse(cx, cy, 6, 6, (x, y, nx, ny) => {
        const a = Math.atan2(ny, nx) + frame * 0.6, d = Math.hypot(nx, ny);
        if (d > 0.86) return METAL[2];
        if (d < 0.28) return METAL[4];
        return Math.sin(a * 5) > 0.3 ? METAL[3] : DARK[3];
      });
    }
    p.bevel(26, 42, 19, 3, METAL, 3);
    return out(p);
  },

  tks() {
    const p = new Pix(64, 64);
    p.bevel(2, 52, 60, 10, WOOD, 3);
    for (let x = 10; x < 60; x += 12) p.rect(x, 53, 1, 8, WOOD[1]);
    // banner
    for (let y = 3; y < 54; y++) p.set(55, y, GOLD[y < 5 ? 5 : 3]), p.set(56, y, GOLD[2]);
    ball(p, 55.5, 3, 2, GOLD, 0.3);
    p.poly([[33, 6], [54, 6], [54, 30], [43.5, 25], [33, 30]], (x, y) => BLUE[y < 8 ? 5 : x < 35 ? 4 : 3]);
    signText(p, 'TKS', 44, 12, WHITE[5], BLUE[1]);
    // lectern
    p.bevel(14, 28, 21, 25, WOOD_LIGHT, 3);
    p.poly([[11, 22], [38, 22], [36, 29], [13, 29]], (x, y) => WOOD_LIGHT[y === 22 ? 5 : y > 27 ? 2 : 4]);
    ball(p, 24.5, 39, 5, GOLD);
    p.rect(23, 37, 3, 3, WHITE[5]); p.rect(24, 40, 1, 2, WHITE[3]);
    p.line(17, 22, 16, 16, DARK[3]); p.line(16, 16, 14, 13, DARK[3]);
    ball(p, 13, 12, 2.4, DARK);
    return out(p);
  },

  fma() {
    const p = new Pix(64, 64);
    p.seg(32, 8, 32, 60, 2.5, WOOD);
    p.seg(15, 6, 8, 62, 3, WOOD); p.seg(49, 6, 56, 62, 3, WOOD);
    p.bevel(7, 8, 50, 36, WOOD, 3);
    p.rect(10, 11, 44, 30, (x, y) => (fbmLite(x, y) < 0.3 ? C('#35573f') : C('#2c4a36')));
    const chalk = C('#e8f0e8'), dim = C('#aec8b4');
    drawText(p, 'F=', 13, 14, chalk);
    const m = ['##.#.', '#.#.#', '#.#.#', '#.#.#'], a = ['.###.', '....#', '.####', '#...#', '.####'];
    const glyph = (g, x, y) => g.forEach((row, j) => [...row].forEach((ch, i) => ch === '#' && p.set(x + i, y + j, chalk)));
    glyph(m, 26, 17); glyph(a, 32, 16);
    p.line(14, 37, 48, 37, dim); p.line(14, 37, 48, 25, dim);
    p.poly([[33, 28], [38, 26], [40, 30], [35, 32]], chalk);
    p.line(28, 32, 35, 29, C('#ffd166')); p.set(34, 28, C('#ffd166')); p.set(35, 30, C('#ffd166'));
    p.bevel(7, 44, 50, 3, WOOD_LIGHT, 3);
    p.rect(14, 43, 4, 1, WHITE[5]); p.rect(21, 43, 3, 1, WHITE[4]);
    ball(p, 45, 56, 4.4, RED);
    p.rect(45, 50, 1, 3, WOOD[2]); p.set(46, 50, GREEN[4]); p.set(47, 49, GREEN[3]);
    return out(p);
  },

  school() {
    const p = new Pix(64, 64);
    for (const lx of [8, 53]) p.rect(lx, 40, 3, 22, (x) => METAL[x === lx ? 4 : 2]);
    p.rect(8, 55, 48, 2, METAL[3]);
    p.bevel(4, 40, 56, 6, WOOD, 2);
    p.bevel(3, 34, 58, 6, WOOD_LIGHT, 3);
    const book = (x, y, w, R) => { p.bevel(x, y, w, 5, R, 3); p.rect(x + 2, y + 2, w - 4, 1, GOLD[4]); p.rect(x + w - 2, y + 1, 1, 3, PAPER[4]); };
    book(7, 29, 25, RED); book(9, 24, 22, BLUE); book(8, 19, 23, GREEN);
    ball(p, 19, 15, 3.6, RED);
    p.rect(19, 10, 1, 2, WOOD[2]); p.set(20, 10, GREEN[4]); p.set(21, 9, GREEN[3]);
    p.seg(36, 36, 47, 34, 2, YELLOW); p.set(48, 34, WOOD_LIGHT[4]); p.set(49, 34, DARK[2]);
    p.ellipse(47, 32, 7, 2, (x, y, nx) => GOLD[nx < 0 ? 4 : 3]);
    p.rect(46, 26, 2, 6, GOLD[3]);
    p.ellipse(47, 17, 10, 10, (x, y, nx, ny) => {
      const land = fbmLite(x * 1.6, y * 1.6) > 0.55;
      const R = land ? GREEN : BLUE;
      return R[lightIndex(sphereLight(nx, ny))];
    });
    for (let a = -0.6; a < 2.6; a += 0.08) p.set(47 + Math.cos(a) * 12, 17 - Math.sin(a) * 12, GOLD[3]);
    return out(p);
  },

  generic() {
    const p = new Pix(64, 64);
    p.bevel(10, 22, 44, 36, WOOD_LIGHT, 3);
    for (let y = 28; y < 56; y += 7) p.rect(12, y, 40, 1, WOOD_LIGHT[2]);
    p.rect(10, 22, 44, 3, WOOD_LIGHT[5]);
    signText(p, '?', 32, 34, WOOD[1], WOOD_LIGHT[4], 2);
    return out(p);
  },
};

function fbmLite(x, y) {
  const n = (Math.sin(x * 0.35 + Math.sin(y * 0.21) * 2) + Math.sin(y * 0.3 - x * 0.12) + Math.sin((x + y) * 0.17)) / 3;
  return n * 0.5 + 0.5;
}

export const PROP_KEYS = Object.keys(PROPS).filter((k) => k !== 'generic');
export const ANIMATED_PROPS = { secondbrain: 3 };
export function prop(key, frame = 0) { return (PROPS[key] || PROPS.generic)(frame); }

// ---------------------------------------------------------------------------
// Icons (32 x 32) for the toolbar, collection and dialogue portraits
// ---------------------------------------------------------------------------
const ICONS = {
  humanoid(p) {
    p.rect(15, 2, 2, 6, METAL[3]); ball(p, 16, 3, 2, RED, 0.3);
    p.bevel(4, 12, 3, 9, METAL, 3); p.bevel(25, 12, 3, 9, METAL, 3);
    p.bevel(6, 7, 20, 19, WHITE, 3);
    p.clear(6, 7); p.clear(25, 7); p.clear(6, 25); p.clear(25, 25);
    p.rect(8, 12, 16, 7, DARK[1]);
    p.rect(10, 14, 4, 3, CYAN[3]); p.rect(18, 14, 4, 3, CYAN[3]); p.set(10, 14, CYAN[5]); p.set(18, 14, CYAN[5]);
    p.rect(12, 22, 8, 1, DARK[3]);
    p.rect(11, 26, 10, 4, METAL[3]);
  },
  clancy(p) {
    p.bevel(5, 26, 16, 5, DARK, 3);
    p.seg(12, 25, 17, 11, 6, YELLOW); p.seg(17, 11, 26, 17, 5, YELLOW);
    ball(p, 12, 25, 3.5, DARK); ball(p, 17, 11, 3.2, DARK);
    ball(p, 26, 24, 3.4, RED);
    p.seg(24, 18, 22, 25, 2, METAL); p.seg(28, 18, 30, 25, 2, METAL);
  },
  vex(p) {
    p.bevel(12, 5, 9, 7, DARK, 2); p.rect(13, 6, 7, 3, BLUE[4]);
    p.bevel(4, 12, 24, 8, METAL, 4);
    for (let x = 6; x < 27; x += 3) p.set(x, 16, DARK[1]);
    p.bevel(3, 12, 3, 8, RED, 3); p.bevel(26, 12, 3, 8, RED, 3);
    wheel(p, 9, 23, 5.5); wheel(p, 23, 23, 5.5);
  },
  unsubscriber(p) {
    p.bevel(3, 8, 26, 18, PAPER, 4);
    p.line(3, 8, 15, 17, PAPER[1]); p.line(28, 8, 16, 17, PAPER[1]);
    p.seg(9, 11, 23, 25, 3, RED); p.seg(23, 11, 9, 25, 3, RED);
  },
  gmailpanel(p) {
    p.bevel(5, 5, 20, 13, PAPER, 4); p.line(5, 5, 14, 11, PAPER[1]); p.line(24, 5, 15, 11, PAPER[1]);
    p.bevel(8, 9, 20, 13, PAPER, 4); p.line(8, 9, 17, 15, PAPER[1]); p.line(27, 9, 18, 15, PAPER[1]); p.rect(9, 20, 18, 1, RED[3]);
    p.bevel(3, 18, 26, 10, WOOD, 3); p.rect(5, 20, 22, 1, WOOD[2]);
  },
  dictation(p) {
    p.rect(10, 8, 12, 10, (x) => METAL[x < 13 ? 5 : x < 18 ? 4 : 2]);
    p.ellipse(16, 8, 6, 5, (x, y, nx, ny) => (y > 8 ? 0 : (x + y) % 2 ? METAL[2] : METAL[lightIndex(sphereLight(nx, ny))]));
    p.ellipse(16, 18, 6, 3, (x, y, nx, ny) => (y < 18 ? 0 : METAL[2]));
    p.rect(10, 12, 12, 2, GOLD[4]);
    p.rect(15, 21, 2, 6, METAL[3]); p.bevel(9, 27, 14, 3, DARK, 3);
    for (const r of [9, 12]) for (let a = -0.9; a < 0.9; a += 0.15) p.set(16 + Math.cos(a) * r, 12 + Math.sin(a) * r, CYAN[3]);
  },
  dashboard(p) {
    p.bevel(4, 5, 24, 23, PAPER, 4);
    p.rect(4, 5, 24, 6, RED[3]); p.rect(9, 3, 2, 4, METAL[3]); p.rect(21, 3, 2, 4, METAL[3]);
    for (let gx = 9; gx < 27; gx += 5) p.rect(gx, 12, 1, 15, PAPER[2]);
    for (let gy = 16; gy < 27; gy += 4) p.rect(5, gy, 22, 1, PAPER[2]);
    p.rect(11, 17, 3, 3, BLUE[4]); p.rect(16, 21, 3, 3, GREEN[4]); p.rect(21, 13, 3, 3, RED[4]);
  },
  keyreplay(p) {
    const key = (x, y, dir) => {
      p.bevel(x, y, 9, 9, WHITE, 4); p.rect(x, y + 8, 9, 1, WHITE[1]);
      const c = DARK[2], cx = x + 4, cy = y + 4;
      for (let k = 0; k < 3; k++) for (let s = -k; s <= k; s++) {
        const [px, py] = dir === 'u' ? [cx + s, cy - 1 + k] : dir === 'd' ? [cx + s, cy + 1 - k] : dir === 'l' ? [cx - 1 + k, cy + s] : [cx + 1 - k, cy + s];
        p.set(px, py, c);
      }
    };
    key(11, 3, 'u'); key(1, 15, 'l'); key(11, 15, 'd'); key(21, 15, 'r');
  },
  biopsy(p) {
    p.bevel(5, 26, 22, 4, DARK, 3);
    p.seg(21, 25, 21, 10, 4, WHITE); p.seg(21, 10, 16, 5, 4, WHITE);
    p.seg(13, 12, 8, 3, 4, DARK);
    p.bevel(9, 17, 12, 3, DARK, 3); p.rect(11, 16, 8, 1, PINK[4]);
    p.bevel(12, 11, 6, 5, METAL, 3);
  },
  secondbrain(p) {
    for (const cx of [11, 21]) p.ellipse(cx, 15, 9, 10, (x, y, nx, ny) => {
      const fold = Math.sin(x * 1.1 + y * 0.7) + Math.sin(y * 1.5 - x * 0.5) > 1.1;
      return PINK[lightIndex(sphereLight(nx, ny) - (fold ? 0.45 : 0))];
    });
    p.rect(16, 6, 1, 18, PINK[1]);
    p.rect(13, 25, 6, 5, METAL[3]);
    for (const x of [14, 16, 18]) p.rect(x, 29, 1, 2, GOLD[3]);
  },
  tks(p) {
    ball(p, 16, 12, 9, YELLOW, 0.1);
    p.rect(14, 10, 1, 7, YELLOW[1]); p.rect(17, 10, 1, 7, YELLOW[1]); p.rect(14, 10, 4, 1, YELLOW[1]);
    p.bevel(11, 20, 10, 3, METAL, 4); p.bevel(12, 23, 8, 3, METAL, 3); p.rect(14, 26, 4, 2, DARK[3]);
    for (const [x, y] of [[4, 4], [28, 4], [2, 14], [30, 14]]) p.set(x, y, YELLOW[5]);
  },
  fma(p) {
    ball(p, 16, 18, 10, RED);
    p.rect(16, 4, 2, 6, WOOD[2]);
    p.ellipse(22, 6, 4, 2.4, (x, y, nx) => GREEN[nx < 0 ? 4 : 3]);
    p.set(12, 13, RED[5]); p.set(11, 14, RED[5]);
  },
  school(p) {
    const book = (x, y, w, R) => { p.bevel(x, y, w, 7, R, 3); p.rect(x + 2, y + 3, w - 5, 1, GOLD[4]); p.rect(x + w - 3, y + 1, 2, 5, PAPER[4]); };
    book(3, 22, 26, RED); book(5, 15, 23, BLUE); book(4, 8, 24, GREEN);
  },
  house(p) {
    p.poly([[2, 15], [16, 3], [30, 15]], (x, y) => RED[x < 16 ? 4 : 3]);
    p.bevel(5, 15, 22, 14, WOOD_LIGHT, 3);
    p.bevel(13, 20, 6, 9, GREEN, 3);
    p.bevel(7, 18, 5, 5, GLASS, 3); p.bevel(21, 18, 5, 5, GLASS, 3);
  },
  mailbox(p) {
    p.rect(15, 18, 3, 12, WOOD[3]);
    p.bevel(5, 8, 22, 11, RED, 3);
    p.ellipse(16, 8, 11, 5, (x, y, nx, ny) => (y > 8 ? 0 : RED[lightIndex(sphereLight(nx, ny))]));
    p.bevel(25, 3, 5, 5, YELLOW, 3); p.rect(26, 7, 1, 8, DARK[3]);
    p.bevel(9, 11, 11, 6, PAPER, 4);
  },
  unknown(p) {
    p.bevel(5, 5, 22, 22, PAPER, 3);
    signText(p, '?', 16, 9, PAPER[1], null, 2);
  },
};
export function icon(key) {
  const p = new Pix(32, 32);
  (ICONS[key] || ICONS.unknown)(p);
  return out(p);
}
export const ICON_KEYS = Object.keys(ICONS);
