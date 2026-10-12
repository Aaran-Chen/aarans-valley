// Pixel-art toolkit shared by every sprite generator: colours, noise, a small
// painter that works on packed RGBA pixels, and a 5x7 bitmap font for signs.
// All art in the valley is drawn procedurally at 32 px per tile (Stardew uses 16).

export const TILE = 32;

// ---------------------------------------------------------------------------
// Colour. Pixels are packed 0xAABBGGRR, the byte order ImageData uses.
// ---------------------------------------------------------------------------
export function rgbOf(hex) {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function pack(r, g, b, a = 255) {
  return (((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
}
export function C(hex, a = 255) { const [r, g, b] = rgbOf(hex); return pack(r, g, b, a); }
export function unpack(c) { return [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, c >>> 24]; }
export const ramp = (list) => list.map((h) => C(h));
export function toCss(c) { const [r, g, b, a] = unpack(c); return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`; }
export function withAlpha(c, a) { return ((c & 0x00ffffff) | ((a & 255) << 24)) >>> 0; }

function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hsl2rgb(h, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255));
}
function lerpHue(h, target, t) {
  let d = target - h;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return (h + d * t + 1) % 1;
}

// Hue-shifted shading, the way pixel artists do it by hand: shadows drift
// toward violet, highlights toward warm yellow. amt is -1..1.
const shadeCache = new Map();
export function shade(c, amt) {
  const key = c * 7 + Math.round(amt * 1000);
  const hit = shadeCache.get(key);
  if (hit !== undefined) return hit;
  const [r, g, b, a] = unpack(c);
  let [h, s, l] = rgb2hsl(r, g, b);
  if (amt < 0) { const t = -amt; l *= 1 - t; h = lerpHue(h, 0.72, t * 0.2); s = Math.min(1, s * (1 + t * 0.15)); }
  else { l += (1 - l) * amt; h = lerpHue(h, 0.14, amt * 0.18); s *= 1 - amt * 0.2; }
  const [R, G, B] = hsl2rgb(h, s, Math.max(0, Math.min(1, l)));
  const out = pack(R, G, B, a);
  shadeCache.set(key, out);
  return out;
}
export function mixC(c1, c2, t) {
  const a = unpack(c1), b = unpack(c2);
  return pack(
    Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t), Math.round(a[3] + (b[3] - a[3]) * t));
}

// ---------------------------------------------------------------------------
// Deterministic noise and randomness, so the valley looks the same every visit.
// ---------------------------------------------------------------------------
export function hash(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, s = 0, oct = 3) {
  let t = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { t += vnoise(x * f, y * f, s + i * 17) * amp; norm += amp; amp *= 0.5; f *= 2; }
  return t / norm;
}
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Light comes from the upper left, slightly in front of the scene.
const L = (() => { const v = [-0.55, -0.72, 0.62]; const m = Math.hypot(...v); return v.map((x) => x / m); })();
export function sphereLight(nx, ny) {
  const d = nx * nx + ny * ny;
  if (d > 1) return -1;
  return nx * L[0] + ny * L[1] + Math.sqrt(1 - d) * L[2];
}
// Map a light value (-1..1) to a ramp index. Index 0 is reserved for outlines.
export function lightIndex(l, n = 6) {
  const cuts = n >= 6 ? [-0.05, 0.28, 0.58, 0.82] : [0.0, 0.4, 0.75];
  let i = 1;
  for (const c of cuts) if (l > c) i++;
  return Math.min(n - 1, i);
}

// ---------------------------------------------------------------------------
// Painter
// ---------------------------------------------------------------------------
export class Pix {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint32Array(w * h); }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { x = Math.floor(x); y = Math.floor(y); return this.in(x, y) ? this.d[y * this.w + x] : 0; }
  set(x, y, c) {
    x = Math.floor(x); y = Math.floor(y);
    if (c && this.in(x, y)) this.d[y * this.w + x] = c;
  }
  clear(x, y) { x = Math.floor(x); y = Math.floor(y); if (this.in(x, y)) this.d[y * this.w + x] = 0; }
  opaque(x, y) { return (this.get(x, y) >>> 24) > 0; }
  // c may be a colour or fn(x, y, i, j) returning a colour (0 = skip)
  rect(x, y, w, h, c) {
    x = Math.round(x); y = Math.round(y);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      this.set(x + i, y + j, typeof c === 'function' ? c(x + i, y + j, i, j) : c);
    }
    return this;
  }
  // c may be a colour or fn(x, y, nx, ny) with nx, ny in -1..1 across the ellipse
  ellipse(cx, cy, rx, ry, c) {
    const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1), y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) this.set(x, y, typeof c === 'function' ? c(x, y, nx, ny) : c);
    }
    return this;
  }
  // Sphere-shaded blob using a ramp (index 0 unused, so it stays free for outlines)
  blob(cx, cy, rx, ry, R, bias = 0) {
    return this.ellipse(cx, cy, rx, ry, (x, y, nx, ny) => R[lightIndex(sphereLight(nx, ny) + bias, R.length)]);
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, typeof c === 'function' ? c(x0, y0) : c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }
  // Thick segment shaded like a cylinder, lit from the upper left. R: ramp.
  seg(x0, y0, x1, y1, width, R, capped = true) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    let lx = -uy, ly = ux;
    if (lx * -0.6 + ly * -0.8 < 0) { lx = -lx; ly = -ly; }
    const r = width / 2;
    const minX = Math.floor(Math.min(x0, x1) - r - 1), maxX = Math.ceil(Math.max(x0, x1) + r + 1);
    const minY = Math.floor(Math.min(y0, y1) - r - 1), maxY = Math.ceil(Math.max(y0, y1) + r + 1);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      let t = (px - x0) * ux + (py - y0) * uy;
      if ((t < 0 || t > len) && !capped) continue;
      t = Math.max(0, Math.min(len, t));
      const cx = x0 + ux * t, cy = y0 + uy * t;
      const ox = px - cx, oy = py - cy;
      if (ox * ox + oy * oy > r * r) continue;
      const s = (ox * lx + oy * ly) / r;
      const idx = s > 0.5 ? 4 : s > 0.05 ? 3 : s > -0.5 ? 2 : 1;
      this.set(x, y, R[Math.min(idx, R.length - 1)]);
    }
    return this;
  }
  // Filled polygon (scanline, pixel centres). c may be a colour or fn(x, y).
  poly(pts, c) {
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const py = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= py && by > py) || (by <= py && ay > py)) xs.push(ax + (py - ay) / (by - ay) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) this.set(x, y, typeof c === 'function' ? c(x, y) : c);
      }
    }
    return this;
  }
  // Rectangle with a one-pixel bevel: lit top/left, shaded bottom/right. R ramp, base index.
  bevel(x, y, w, h, R, base = 3) {
    const hi = R[Math.min(base + 1, R.length - 1)], lo = R[Math.max(base - 1, 1)];
    this.rect(x, y, w, h, R[base]);
    this.rect(x, y, w, 1, hi); this.rect(x, y, 1, h, hi);
    this.rect(x, y + h - 1, w, 1, lo); this.rect(x + w - 1, y + 1, 1, h - 1, lo);
    return this;
  }
  blit(src, dx, dy, flip = false) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const c = src.d[y * src.w + (flip ? src.w - 1 - x : x)];
      if (c >>> 24) this.set(dx + x, dy + y, c);
    }
    return this;
  }
  flipped() { const o = new Pix(this.w, this.h); o.blit(this, 0, 0, true); return o; }
  clone() { const o = new Pix(this.w, this.h); o.d.set(this.d); return o; }
  // One-pixel outline outside the opaque area. color: fixed colour, fn(neighbour), or null for hue-shifted auto.
  outline(color = null, minAlpha = 160) {
    const { w, h, d } = this, out = d.slice();
    const solid = (i) => (d[i] >>> 24) >= minAlpha;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] >>> 24) continue;
      let nb = 0;
      if (y < h - 1 && solid(i + w)) nb = d[i + w];
      else if (y > 0 && solid(i - w)) nb = d[i - w];
      else if (x > 0 && solid(i - 1)) nb = d[i - 1];
      else if (x < w - 1 && solid(i + 1)) nb = d[i + 1];
      if (nb) out[i] = typeof color === 'function' ? color(nb) : color || shade(nb | 0xff000000, -0.66);
    }
    this.d = out;
    return this;
  }
  // Recolour the opaque pixels that touch transparency (an inner rim).
  rim(fn) {
    const { w, h, d } = this, out = d.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!(d[i] >>> 24)) continue;
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
        !(d[i - 1] >>> 24) || !(d[i + 1] >>> 24) || !(d[i - w] >>> 24) || !(d[i + w] >>> 24);
      if (edge) { const c = fn(d[i], x, y); if (c) out[i] = c; }
    }
    this.d = out;
    return this;
  }
  canvas() {
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    const g = c.getContext('2d');
    const img = g.createImageData(this.w, this.h);
    new Uint32Array(img.data.buffer).set(this.d);
    g.putImageData(img, 0, 0);
    return c;
  }
}

// ---------------------------------------------------------------------------
// 5x7 bitmap font (uppercase, digits, a little punctuation) for in-world signs.
// ---------------------------------------------------------------------------
const G = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ' ': ['...', '...', '...', '...', '...', '...', '...'],
  '.': ['.', '.', '.', '.', '.', '.', '#'],
  ',': ['..', '..', '..', '..', '..', '.#', '#.'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '-': ['....', '....', '....', '####', '....', '....', '....'],
  ':': ['.', '.', '#', '.', '.', '#', '.'],
  "'": ['#', '#', '.', '.', '.', '.', '.'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '=': ['....', '....', '####', '....', '####', '....', '....'],
  '(': ['.#', '#.', '#.', '#.', '#.', '#.', '.#'],
  ')': ['#.', '.#', '.#', '.#', '.#', '.#', '#.'],
  '<': ['...#', '..#.', '.#..', '#...', '.#..', '..#.', '...#'],
  '>': ['#...', '.#..', '..#.', '...#', '..#.', '.#..', '#...'],
  '^': ['..#..', '.###.', '#.#.#', '..#..', '..#..', '..#..', '..#..'],
  'v': ['..#..', '..#..', '..#..', '..#..', '#.#.#', '.###.', '..#..'],
  '·': ['.', '.', '.', '#', '.', '.', '.'],
};
export function glyph(ch) { return G[ch] || G[ch.toUpperCase?.()] || G['?']; }
export function textWidth(str, scale = 1) {
  let w = 0;
  for (const ch of str) w += (glyph(ch)[0].length + 1) * scale;
  return Math.max(0, w - scale);
}
export function drawText(p, str, x, y, c, scale = 1) {
  let cx = Math.round(x);
  for (const ch of str) {
    const g = glyph(ch);
    for (let j = 0; j < 7; j++) for (let i = 0; i < g[j].length; i++) {
      if (g[j][i] === '#') p.rect(cx + i * scale, y + j * scale, scale, scale, c);
    }
    cx += (g[0].length + 1) * scale;
  }
  return cx;
}
// Centred text with a one-pixel drop shadow, as used on wooden signs.
export function signText(p, str, cx, y, c, shadow, scale = 1) {
  const x = Math.round(cx - textWidth(str, scale) / 2);
  if (shadow) drawText(p, str, x, y + scale, shadow, scale);
  drawText(p, str, x, y, c, scale);
}
