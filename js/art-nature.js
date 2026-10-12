// Ground, trees, bushes, grass and flowers. The ground is rendered once into a
// big canvas: every pixel picks its terrain from a blended, noise-wobbled field
// so paths, shores and fields get soft organic edges while plazas stay crisp.
import { Pix, C, pack, unpack, shade, mixC, hash, vnoise, fbm, rng, sphereLight, lightIndex } from './art-core.js';
import {
  GRASS, FOLIAGE, FOLIAGE_ALT, PINE, SNOW, BARK, DIRT, SOIL, COBBLE, SAND, WATER, WOOD, WOOD_GRAY, PAPER,
} from './palette.js';

export const GROUND = { GRASS: 0, DIRT: 1, COBBLE: 2, SOIL: 3, SAND: 4, WATER: 5, PLANK: 6 };
const HARD = new Set([GROUND.COBBLE, GROUND.SOIL, GROUND.PLANK]);
const WOBBLE = [0.3, 0.26, 0, 0, 0.3, 0.34, 0];

export const FLOWER_COLORS = {
  spring: ['#f59ac4', '#f7d54a', '#9ab8ff', '#ffffff', '#ff8a7a'],
  summer: ['#ff6a55', '#ffd24a', '#ff9ad0', '#ffffff', '#b58cff'],
  fall: ['#c27dff', '#ff9a3c', '#ffd166', '#e0584a', '#ffffff'],
  winter: [],
};

// Two-pass chamfer distance (in half-pixels, capped at 255) to the nearest pixel where mask is 1.
function chamfer(mask, w, h) {
  const d = new Uint8Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let v = d[i];
    if (v === 0) continue;
    if (x > 0) v = Math.min(v, d[i - 1] + 2);
    if (y > 0) {
      v = Math.min(v, d[i - w] + 2);
      if (x > 0) v = Math.min(v, d[i - w - 1] + 3);
      if (x < w - 1) v = Math.min(v, d[i - w + 1] + 3);
    }
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; let v = d[i];
    if (v === 0) continue;
    if (x < w - 1) v = Math.min(v, d[i + 1] + 2);
    if (y < h - 1) {
      v = Math.min(v, d[i + w] + 2);
      if (x < w - 1) v = Math.min(v, d[i + w + 1] + 3);
      if (x > 0) v = Math.min(v, d[i + w - 1] + 3);
    }
    d[i] = v;
  }
  return d;
}

// tiles: Uint8Array of GROUND types, W x H tiles. decals: { lilypads: [[px, py]], clear: Set of "tx,ty" with no flowers }
export function renderGround(tiles, W, H, season, decals = {}) {
  const T = 32, PW = W * T, PH = H * T;
  const cls = new Uint8Array(PW * PH);
  const tileAt = (x, y) => tiles[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];

  // Pass 1: classify every pixel.
  const w = new Float32Array(8);
  for (let py = 0; py < PH; py++) {
    const fy = (py + 0.5) / T - 0.5, j0 = Math.floor(fy), v = fy - j0;
    for (let px = 0; px < PW; px++) {
      const own = tiles[(py >> 5) * W + (px >> 5)];
      const i = py * PW + px;
      if (HARD.has(own)) { cls[i] = own; continue; }
      const fx = (px + 0.5) / T - 0.5, i0 = Math.floor(fx), u = fx - i0;
      const a = tileAt(i0, j0), b = tileAt(i0 + 1, j0), c = tileAt(i0, j0 + 1), d = tileAt(i0 + 1, j0 + 1);
      if (a === b && a === c && a === d) { cls[i] = HARD.has(a) ? own : a; continue; }
      w.fill(0);
      if (!HARD.has(a)) w[a] += (1 - u) * (1 - v);
      if (!HARD.has(b)) w[b] += u * (1 - v);
      if (!HARD.has(c)) w[c] += (1 - u) * v;
      if (!HARD.has(d)) w[d] += u * v;
      let best = own, bv = -1;
      for (let t = 0; t < 7; t++) {
        if (w[t] <= 0) continue;
        const fine = t === GROUND.WATER || t === GROUND.SAND ? 0.35 : 1;
        const s = w[t] + (vnoise(px / 7, py / 7, 40 + t) - 0.5) * WOBBLE[t] * fine + (vnoise(px / 23, py / 23, 60 + t) - 0.5) * WOBBLE[t] * 1.3;
        if (s > bv) { bv = s; best = t; }
      }
      cls[i] = best;
    }
  }

  // Distances used for shore foam, wet sand and water depth.
  const isWater = new Uint8Array(PW * PH), isLand = new Uint8Array(PW * PH);
  for (let i = 0; i < cls.length; i++) { const wv = cls[i] === GROUND.WATER; isWater[i] = wv ? 1 : 0; isLand[i] = wv ? 0 : 1; }
  const toWater = chamfer(isWater, PW, PH);
  const toLand = chamfer(isLand, PW, PH);

  const G = GRASS[season];
  const out = new Uint32Array(PW * PH);
  const at = (x, y) => (x < 0 || y < 0 || x >= PW || y >= PH ? 255 : cls[y * PW + x]);

  // Pass 2: texture.
  for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) {
    const i = py * PW + px, t = cls[i];
    let col;
    if (t === GROUND.GRASS) {
      const n = fbm(px / 30, py / 30, 11, 2), n2 = vnoise(px / 9, py / 9, 12);
      let k = 2.4 + (n - 0.5) * 0.7 + (n2 > 0.8 ? 0.45 : 0);
      if (k % 1 > 0.8 && ((px + py) & 1)) k += 0.2; // dithered edge between tones
      // blade marks on a jittered 8x8 grid
      const cx = px >> 3, cy = py >> 3;
      if (hash(cx, cy, 3) < 0.62) {
        const ox = (hash(cx, cy, 4) * 5) | 0, oy = (hash(cx, cy, 5) * 5) | 0;
        const rx = (px & 7) - ox, ry = (py & 7) - oy;
        if ((ry === 0 && (rx === 0 || rx === 2)) || (ry === 1 && rx === 1)) k += 1;
        else if (ry === 2 && rx === 1) k -= 1;
      }
      if (season === 'winter' && hash(px, py, 9) < 0.004) k = 5;
      // dark rim where the grass meets a path or plaza
      const near1 = at(px, py + 1) !== t || at(px - 1, py) !== t || at(px + 1, py) !== t || at(px, py - 1) !== t;
      if (near1) k = Math.min(k, 1);
      col = G[Math.max(0, Math.min(5, Math.floor(k)))];
    } else if (t === GROUND.DIRT) {
      const n = fbm(px / 16, py / 16, 21, 2);
      let k = n < 0.22 ? 2.4 : n < 0.78 ? 3 : 3.6;
      const cx = (px / 6) | 0, cy = (py / 6) | 0;
      if (hash(cx, cy, 22) < 0.16) {
        const ox = (hash(cx, cy, 23) * 4) | 0, oy = (hash(cx, cy, 24) * 4) | 0, rx = px % 6 - ox, ry = py % 6 - oy;
        if (rx >= 0 && rx < 2 && ry >= 0 && ry < 2) k = rx + ry === 0 ? 5 : rx + ry === 2 ? 1 : 4;
      }
      // grass overhang and shadow along the edges
      const up = at(px, py - 1), up2 = at(px, py - 2);
      if (up === GROUND.GRASS && hash(px, py, 25) < 0.45) { col = G[2]; out[i] = col; continue; }
      if (up === GROUND.GRASS || up2 === GROUND.GRASS || at(px - 1, py) === GROUND.GRASS || at(px + 1, py) === GROUND.GRASS) k = Math.min(k, 1.5);
      else if (at(px, py - 3) === GROUND.GRASS) k = Math.min(k, 2);
      col = DIRT[Math.max(1, Math.min(5, Math.floor(k)))];
    } else if (t === GROUND.COBBLE) {
      col = cobble(px, py);
      if (at(px, py - 1) === GROUND.GRASS || at(px, py - 2) === GROUND.GRASS) col = shade(col, -0.25);
    } else if (t === GROUND.SOIL) {
      const ry = py % 12, n = hash(px >> 1, py >> 1, 31);
      let k = ry < 2 ? 4 : ry < 7 ? 3 : ry < 10 ? 2 : 1;
      if (n < 0.08) k = Math.min(5, k + 1); else if (n > 0.93) k = Math.max(1, k - 1);
      col = SOIL[k];
    } else if (t === GROUND.SAND) {
      const n = fbm(px / 26, py / 26, 41, 2);
      let k = 3.5 + (n - 0.5) * 0.9;
      const h = hash(px, py, 42);
      if (h < 0.018) k = 2; else if (h > 0.985) k = 5;
      const dw = toWater[i] / 2;
      if (dw < 3) k = 1.6; else if (dw < 7) k = Math.min(k, 2.6);
      if (at(px, py - 1) === GROUND.GRASS || at(px, py - 2) === GROUND.GRASS) k = Math.min(k, 2);
      col = SAND[Math.max(0, Math.min(5, Math.floor(k)))];
    } else if (t === GROUND.WATER) {
      const dl = toLand[i] / 2;
      let k = dl < 2 ? 6 : dl < 4 ? (hash(px, py, 51) < 0.5 ? 5 : 6) : dl < 11 ? 4 : dl < 20 ? (hash(px >> 1, py >> 1, 56) < 0.5 ? 4 : 3) : 3;
      // baked wave streaks
      const wy = py >> 2, sx = px + ((hash(0, wy, 52) * 40) | 0);
      if (dl > 6 && (sx % 37) < 5 && hash(sx / 37 | 0, wy, 53) < 0.35 && (py & 3) === 0) k = Math.min(6, k + 1);
      // shadow under piers and docks
      if (at(px, py - 1) === GROUND.PLANK || at(px, py - 2) === GROUND.PLANK || at(px, py - 3) === GROUND.PLANK) k = 1;
      col = WATER[k];
    } else {
      col = plank(px, py, at);
    }
    out[i] = col;
  }

  // Pass 3: decals (flowers, leaves, pebbles, lily pads).
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < PW && y < PH) out[y * PW + x] = c; };
  const grassy = (x, y, r) => {
    for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) if (at(x + k, y + j) !== GROUND.GRASS) return false;
    const tk = `${(x >> 5)},${(y >> 5)}`;
    return !(decals.clear && decals.clear.has(tk));
  };
  const R = rng(777);
  const flowers = FLOWER_COLORS[season];
  const clusters = Math.round(W * H / 9);
  for (let c = 0; c < clusters; c++) {
    const cx = (R() * PW) | 0, cy = (R() * PH) | 0;
    if (!grassy(cx, cy, 2)) continue;
    const kind = R();
    const n = 3 + ((R() * 6) | 0);
    for (let k = 0; k < n; k++) {
      const x = (cx + (R() - 0.5) * 34) | 0, y = (cy + (R() - 0.5) * 22) | 0;
      if (!grassy(x, y, 3)) continue;
      if (season === 'fall' && kind < 0.55) leaf(put, x, y, R);
      else if (season === 'winter') { if (kind < 0.3) pebble(put, x, y, R); }
      else if (kind < 0.12) pebble(put, x, y, R);
      else if (flowers.length) flower(put, x, y, C(flowers[(kind * 97 | 0) % flowers.length]), G, R);
    }
  }
  for (const [lx, ly, bloom] of decals.lilypads || []) lilypad(put, lx, ly, bloom);

  const canvas = document.createElement('canvas');
  canvas.width = PW; canvas.height = PH;
  const g = canvas.getContext('2d');
  const img = g.createImageData(PW, PH);
  new Uint32Array(img.data.buffer).set(out);
  g.putImageData(img, 0, 0);
  return { canvas, cls, PW, PH };
}

// Irregular cobbles: nearest jittered cell centre, mortar where two cells are almost equally near.
function cobble(px, py) {
  const CW = 15, CH = 11;
  const gx = Math.floor(px / CW), gy = Math.floor(py / CH);
  let f1 = 1e9, f2 = 1e9, bx = 0, by = 0, bcx = 0, bcy = 0;
  for (let j = gy - 1; j <= gy + 1; j++) for (let i = gx - 1; i <= gx + 1; i++) {
    const off = (j & 1) ? CW / 2 : 0;
    const cx = i * CW + off + CW / 2 + (hash(i, j, 61) - 0.5) * 5, cy = j * CH + CH / 2 + (hash(i, j, 62) - 0.5) * 3;
    const d = Math.hypot(px + 0.5 - cx, (py + 0.5 - cy) * 1.25);
    if (d < f1) { f2 = f1; f1 = d; bx = i; by = j; bcx = cx; bcy = cy; } else if (d < f2) f2 = d;
  }
  const edge = f2 - f1;
  if (edge < 1.3) return COBBLE[1];
  const tone = hash(bx, by, 63);
  let k = tone < 0.3 ? 2 : tone < 0.8 ? 3 : 4;
  const dir = (px + 0.5 - bcx) + (py + 0.5 - bcy) * 1.3;
  if (edge < 3.2) k += dir < 0 ? 1 : -1;
  if (hash(px, py, 64) < 0.04) k -= 1;
  return COBBLE[Math.max(1, Math.min(5, k))];
}

// Boards run north-south, 8 px wide, with staggered ends, nails and posts on the edges.
function plank(px, py, at) {
  const P = WOOD_GRAY;
  const bx = px >> 3, rx = px & 7;
  const off = (hash(bx, 0, 71) * 64) | 0, seg = Math.floor((py + off) / 64), ry = (py + off) % 64;
  let k = hash(bx, seg, 72) < 0.5 ? 3 : 2;
  if (rx === 0) k = 4;
  if (rx === 7 || ry === 0) k = 1;
  if ((ry === 3 || ry === 60) && (rx === 2 || rx === 5)) k = 1;
  if (hash(px, py >> 1, 73) < 0.05) k = Math.max(1, k - 1);
  const leftW = at(px - 1, py) === GROUND.WATER || at(px - 2, py) === GROUND.WATER;
  const rightW = at(px + 1, py) === GROUND.WATER || at(px + 2, py) === GROUND.WATER;
  if (leftW || rightW) k = 1;
  // posts every two tiles along the water edges
  const edgeX = at(px - 4, py) === GROUND.WATER || at(px + 4, py) === GROUND.WATER;
  if (edgeX && (py % 64) >= 26 && (py % 64) < 34) {
    const my = (py % 64) - 30;
    return my < -2 ? P[5] : my < 2 ? P[4] : P[2];
  }
  return P[k];
}

function flower(put, x, y, c, G, R) {
  const dark = shade(c, -0.35), light = shade(c, 0.35);
  put(x, y + 2, G[1]); put(x, y + 3, G[1]); put(x - 1, y + 3, G[2]);
  if (R() < 0.5) {
    put(x, y - 1, c); put(x - 1, y, c); put(x + 1, y, dark); put(x, y + 1, dark);
    put(x, y, C('#ffd84a'));
    put(x - 1, y - 1, light);
  } else {
    put(x - 1, y - 1, c); put(x + 1, y - 1, c); put(x - 1, y, c); put(x, y, light); put(x + 1, y, dark); put(x, y + 1, dark);
  }
}
function leaf(put, x, y, R) {
  const cols = ['#c6591e', '#e6842b', '#f6b648', '#983a18', '#a37b17'];
  const c = C(cols[(R() * cols.length) | 0]);
  put(x, y, c); put(x + 1, y, c); put(x, y + 1, shade(c, -0.3));
  if (R() < 0.5) put(x + 1, y - 1, shade(c, 0.3));
}
function pebble(put, x, y) {
  put(x, y, C('#b8b0b8')); put(x + 1, y, C('#9a929c')); put(x, y + 1, C('#6f6878')); put(x + 1, y + 1, C('#57515f'));
}
function lilypad(put, x, y, bloom) {
  const G = [C('#1d4a2a'), C('#2f6e36'), C('#4a9444'), C('#72b85a')];
  for (let j = -4; j <= 4; j++) for (let i = -6; i <= 6; i++) {
    const d = (i * i) / 36 + (j * j) / 16;
    if (d > 1) continue;
    if (i > 0 && Math.abs(j) <= Math.max(0, i - 3) * 0.6 && j <= 0) continue; // notch
    const k = d > 0.72 ? 0 : (i + j < -3 ? 3 : i + j > 3 ? 1 : 2);
    put(x + i, y + j, G[k]);
  }
  if (bloom) {
    const P = [C('#b44d80'), C('#f0a6c4'), C('#ffe6f0'), C('#ffd84a')];
    put(x - 1, y - 2, P[1]); put(x + 1, y - 2, P[1]); put(x, y - 3, P[2]); put(x - 2, y - 1, P[0]); put(x + 2, y - 1, P[0]); put(x, y - 1, P[3]);
  }
}

// ---------------------------------------------------------------------------
// Trees and bushes
// ---------------------------------------------------------------------------
function leafMod(x, y) {
  // A scale-like leaf pattern on a staggered 6x5 grid: lit tips, dark gaps.
  const row = Math.floor(y / 5), off = (row & 1) * 3;
  const lx = (x + off) % 6, ly = y % 5;
  if (hash(Math.floor((x + off) / 6), row, 81) < 0.25) return 0;
  const d = ((lx - 2.6) ** 2) / 7 + ((ly - 2.2) ** 2) / 4.4;
  if (d > 1) return -0.2;
  if (lx < 3 && ly < 2) return 0.17;
  if (lx > 3 && ly > 2) return -0.1;
  return 0;
}

function trunk(p, cx, baseY, topY, seed) {
  for (let y = topY; y <= baseY; y++) {
    const t = (y - topY) / (baseY - topY);
    const flare = y > baseY - 7 ? (y - (baseY - 7)) * 1.3 : 0;
    const half = 7 + t * 2.5 + flare;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const u = (x - (cx - half)) / (2 * half);
      let k = u < 0.16 ? 4 : u < 0.5 ? 3 : u < 0.82 ? 2 : 1;
      if (hash(x, Math.floor(y / 4), seed) < 0.14 && k > 1) k--;
      if ((x * 3 + Math.floor(y / 3)) % 7 === 0 && u > 0.15 && u < 0.85) k = Math.max(1, k - 1);
      if (y < topY + 10) k = Math.max(1, k - 1); // canopy shadow
      p.set(x, y, BARK[k]);
    }
  }
}

export function oakTree(season, variant = 0) {
  const W = 96, H = 128, p = new Pix(W, H), seed = 101 + variant * 17, R = rng(seed);
  trunk(p, 48, 124, 62, seed);
  if (season === 'winter') return bareTree(p, R);
  const F = (variant === 2 ? FOLIAGE_ALT : FOLIAGE)[season];
  const base = [
    [48, 20, 17], [30, 30, 19], [67, 29, 20],
    [19, 52, 17], [77, 51, 17], [48, 44, 27],
    [31, 70, 18], [65, 70, 18], [48, 78, 15],
  ];
  for (const [bx, by, br] of base) {
    const cx = bx + (R() - 0.5) * 6, cy = by + (R() - 0.5) * 5, r = br + (R() - 0.5) * 4;
    p.ellipse(cx, cy, r, r * 0.92, (x, y, nx, ny) => {
      const dd = Math.sqrt(nx * nx + ny * ny);
      if (dd > 1 - 1.5 / r && (ny > -0.3 || nx > 0.4)) return F[1];
      const l = sphereLight(nx, ny) + leafMod(x, y);
      return F[lightIndex(l)];
    });
  }
  if (season === 'summer' && variant === 1) fruit(p, R, [C('#d13f38'), C('#ff7a5c'), C('#6a1418')]);
  if (season === 'spring' && variant !== 2) blossoms(p, R);
  return p.outline((c) => shade(c, -0.62));
}

function fruit(p, R, [c, hi, lo]) {
  for (let k = 0; k < 9; k++) {
    const x = 14 + R() * 68, y = 18 + R() * 60;
    if (!p.opaque(x, y) || !p.opaque(x + 3, y + 3)) continue;
    p.rect(x, y, 3, 3, c); p.set(x, y, hi); p.set(x + 2, y + 2, lo);
  }
}
function blossoms(p, R) {
  for (let k = 0; k < 26; k++) {
    const x = 10 + R() * 76, y = 10 + R() * 72;
    if (!p.opaque(x - 1, y - 1) || !p.opaque(x + 1, y + 1)) continue;
    p.set(x, y, C('#ffe6f0')); p.set(x - 1, y, C('#f0a6c4')); p.set(x + 1, y, C('#f0a6c4')); p.set(x, y + 1, C('#da76a4'));
  }
}

function bareTree(p, R) {
  const limb = (x, y, ang, len, w, depth) => {
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    p.seg(x, y, x2, y2, w, BARK);
    if (depth <= 0) return;
    limb(x2, y2, ang - 0.38 - R() * 0.3, len * 0.74, Math.max(1.4, w * 0.62), depth - 1);
    limb(x2, y2, ang + 0.36 + R() * 0.3, len * 0.72, Math.max(1.4, w * 0.62), depth - 1);
  };
  limb(48, 70, -Math.PI / 2 - 0.1, 22, 11, 4);
  limb(46, 84, -Math.PI / 2 - 0.9, 18, 6, 3);
  limb(50, 80, -Math.PI / 2 + 0.85, 18, 6, 3);
  // snow resting on the upper side of every branch
  const snow = p.clone();
  for (let y = 1; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    if (p.opaque(x, y) && !p.opaque(x, y - 1) && y < 100) {
      snow.set(x, y - 1, SNOW[5]);
      if (hash(x, y, 91) < 0.5) snow.set(x, y - 2, SNOW[4]);
    }
  }
  snow.outline((c) => shade(c, -0.6));
  return snow;
}

export function pineTree(season, variant = 0) {
  const W = 64, H = 128, p = new Pix(W, H), seed = 211 + variant * 13;
  for (let y = 96; y <= 124; y++) for (let x = 27; x <= 37; x++) {
    const u = (x - 27) / 10;
    p.set(x, y, BARK[u < 0.25 ? 4 : u < 0.6 ? 3 : 2]);
  }
  const tiers = [[70, 108, 30], [50, 88, 25], [31, 67, 20], [14, 46, 15], [2, 25, 9]];
  const snowy = season === 'winter';
  for (const [top, bottom, half] of tiers) {
    for (let y = top; y <= bottom; y++) {
      const t = (y - top) / (bottom - top);
      const hw = 2 + (half - 2) * Math.pow(t, 0.85);
      for (let x = Math.round(32 - hw); x <= Math.round(32 + hw); x++) {
        const jag = ((x + variant) % 6) < 3 ? 0 : 3;
        if (y > bottom - jag) continue;
        const u = (x - 32) / Math.max(1, hw);
        let l = -u * 0.55 + (1 - t) * 0.25 + 0.2;
        if ((x + y * 2) % 5 === 0) l -= 0.25;
        if ((x - y) % 7 === 0 && u < 0.1) l += 0.2;
        let c = PINE[Math.max(1, Math.min(5, Math.round(1 + (l + 0.5) * 3)))];
        if (snowy && y < top + 3 + (hash(x, top, seed) * 3 | 0) + Math.abs(u) * 8 && u < 0.7) c = SNOW[u < 0 ? 5 : 3];
        p.set(x, y, c);
      }
    }
  }
  return p.outline((c) => shade(c, -0.6));
}

export function bush(season, variant = 0) {
  const W = 64, H = 48, p = new Pix(W, H), R = rng(301 + variant * 7);
  const F = season === 'winter' ? FOLIAGE.winter : (variant === 1 ? FOLIAGE_ALT : FOLIAGE)[season];
  const clumps = [[20, 30, 13], [44, 30, 13], [32, 21, 15], [25, 35, 12], [39, 35, 12]];
  for (const [bx, by, br] of clumps) {
    const r = br + (R() - 0.5) * 2;
    p.ellipse(bx + (R() - 0.5) * 3, by, r, r * 0.85, (x, y, nx, ny) => {
      const dd = Math.sqrt(nx * nx + ny * ny);
      if (dd > 1 - 1.5 / r && (ny > -0.3 || nx > 0.4)) return F[1];
      return F[lightIndex(sphereLight(nx, ny) + leafMod(x, y))];
    });
  }
  if (season === 'summer') fruit(p, R, [C('#c7304a'), C('#ff6f86'), C('#5e1022')]);
  if (season === 'spring') blossoms(p, R);
  if (season === 'winter') {
    for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) {
      if (p.opaque(x, y) && !p.opaque(x, y - 1)) { p.set(x, y, SNOW[5]); p.set(x, y + 1, SNOW[4]); if (hash(x, y, 5) < 0.6) p.set(x, y + 2, SNOW[3]); }
    }
  }
  return p.outline((c) => shade(c, -0.6));
}

// Swaying tuft of tall grass, three frames.
export function grassTuft(season, frame) {
  const p = new Pix(32, 32);
  const Gr = season === 'fall' ? [C('#4a3a14'), C('#7a6224'), C('#a8883a'), C('#c8a84e'), C('#e2c86a')]
    : season === 'winter' ? [C('#4a3a24'), C('#6e5a3c'), C('#8e7a58'), C('#b09c78'), C('#d6c8a8')]
      : GRASS[season].slice(0, 5).map((c, i) => GRASS[season][Math.min(5, i + 1)]);
  const blades = [[9, 13, -4], [12, 19, -2], [15, 24, -1], [18, 21, 1], [21, 17, 3], [23, 12, 5], [14, 13, -3], [19, 12, 2]];
  const sway = [-2, 0, 2][frame];
  for (const [x0, h, lean] of blades) {
    const tipX = x0 + lean + sway * (h / 24);
    for (let s = 0; s <= h; s++) {
      const t = s / h, bend = t * t;
      const x = x0 + (tipX - x0) * bend, y = 30 - s;
      const wdt = t < 0.5 ? 2 : 1;
      const k = t < 0.3 ? 1 : t < 0.65 ? 2 : t < 0.9 ? 3 : 4;
      for (let q = 0; q < wdt; q++) p.set(x + q, y, Gr[q === 0 ? Math.min(4, k + 1) : k]);
    }
  }
  if (season === 'winter') for (let x = 0; x < 32; x++) for (let y = 1; y < 32; y++) if (p.opaque(x, y) && !p.opaque(x, y - 1)) p.set(x, y, SNOW[5]);
  return p.outline((c) => shade(c, -0.6));
}

export function planter(season) {
  const p = new Pix(32, 32), R = rng(401);
  // wooden box
  p.bevel(3, 18, 26, 12, WOOD, 3);
  p.rect(3, 22, 26, 1, WOOD[2]);
  p.rect(3, 26, 26, 1, WOOD[2]);
  // soil
  p.rect(5, 17, 22, 2, C('#3b2416'));
  if (season === 'winter') {
    for (let k = 0; k < 8; k++) p.seg(7 + k * 2.4, 18, 6 + k * 2.6 + (R() - 0.5) * 4, 9 + R() * 4, 2, [0, C('#143325'), C('#1b4830'), C('#25603b'), C('#347a46')]);
    p.rect(4, 16, 24, 2, SNOW[5]);
  } else {
    const F = FOLIAGE[season];
    p.ellipse(16, 13, 12, 6, (x, y, nx, ny) => F[lightIndex(sphereLight(nx, ny) + leafMod(x, y))]);
    const cols = FLOWER_COLORS[season];
    for (let k = 0; k < 7; k++) {
      const x = 7 + R() * 18, y = 9 + R() * 6, c = C(cols[k % cols.length]);
      p.set(x, y, c); p.set(x + 1, y, shade(c, -0.3)); p.set(x, y - 1, shade(c, 0.3)); p.set(x - 1, y, c); p.set(x, y + 1, shade(c, -0.3));
    }
  }
  return p.outline((c) => shade(c, -0.6));
}

export function rock(variant = 0) {
  const p = new Pix(32, 32), R = rng(501 + variant);
  const S = [0, C('#3a3642'), C('#57515f'), C('#736c7a'), C('#948c98'), C('#b8b0b8')];
  p.ellipse(16, 21, 12 - variant * 2, 8 - variant, (x, y, nx, ny) => S[lightIndex(sphereLight(nx, ny * 1.2) + (hash(x >> 1, y >> 1, 5) - 0.5) * 0.3, 6)]);
  if (variant === 0) p.ellipse(23, 24, 5, 4, (x, y, nx, ny) => S[lightIndex(sphereLight(nx, ny), 6)]);
  return p.outline((c) => shade(c, -0.55));
}

export function stump() {
  const p = new Pix(32, 32);
  p.ellipse(16, 22, 11, 7, (x, y, nx) => BARK[nx < -0.4 ? 4 : nx < 0.3 ? 3 : 2]);
  p.rect(5, 16, 22, 7, (x) => BARK[x < 9 ? 4 : x < 20 ? 3 : 2]);
  p.ellipse(16, 16, 11, 5, (x, y, nx, ny) => {
    const d = Math.sqrt(nx * nx + ny * ny);
    return d > 0.8 ? C('#b98653') : ((d * 6) | 0) % 2 ? C('#d4a06a') : C('#c28e58');
  });
  return p.outline((c) => shade(c, -0.6));
}

export function cattail() {
  const p = new Pix(32, 48);
  const G = [0, C('#1d4a2a'), C('#2f6e36'), C('#4a9444'), C('#72b85a')];
  const stems = [[10, 22, -3], [15, 34, 0], [20, 28, 2], [24, 18, 4]];
  for (const [x0, h, lean] of stems) {
    for (let s = 0; s < h; s++) { const x = x0 + lean * (s / h) ** 2; p.set(x, 46 - s, G[s < h * 0.4 ? 2 : 3]); }
  }
  for (const [x0, h, lean] of stems.slice(1, 3)) {
    const x = x0 + lean * 0.7, y = 46 - h * 0.8;
    p.rect(x - 1, y - 4, 3, 8, C('#6d4222')); p.set(x - 1, y - 4, C('#8f5a30')); p.rect(x + 1, y - 3, 1, 7, C('#4b2b16'));
  }
  // blades
  p.seg(8, 46, 4, 30, 2, G); p.seg(26, 46, 30, 32, 2, G);
  return p.outline((c) => shade(c, -0.6));
}

export function shell(variant) {
  const p = new Pix(16, 16);
  const c = variant ? [C('#e9b4a0'), C('#f7d8c8'), C('#c47c6a')] : [C('#f1eef1'), C('#ffffff'), C('#bbb7c0')];
  p.ellipse(8, 10, 5, 4, (x, y, nx) => ((x * 2) % 3 === 0 ? c[2] : nx < 0 ? c[1] : c[0]));
  return p.outline((cc) => shade(cc, -0.5));
}

export function driftwood() {
  const p = new Pix(64, 32);
  p.seg(8, 22, 54, 16, 7, [0, C('#4a3d35'), C('#67574b'), C('#837061'), C('#9f8a78'), C('#bba592')]);
  p.seg(40, 18, 50, 8, 3, [0, C('#4a3d35'), C('#67574b'), C('#837061'), C('#9f8a78'), C('#bba592')]);
  return p.outline((c) => shade(c, -0.6));
}

export { PAPER };
