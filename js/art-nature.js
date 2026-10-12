// Ground, trees, bushes, grass and flowers. The ground is rendered once into a
// big canvas: every pixel picks its terrain from a blended, noise-wobbled field
// so paths, shores and fields get soft organic edges while plazas stay crisp.
import { Pix, C, pack, unpack, shade, mixC, hash, vnoise, fbm, rng, sphereLight, lightIndex, RES } from './art-core.js';
import {
  GRASS, FOLIAGE, FOLIAGE_ALT, PINE, SNOW, BARK, DIRT, SOIL, COBBLE, SAND, WATER, WOOD, WOOD_GRAY, PAPER,
} from './palette.js';

export const GROUND = { GRASS: 0, DIRT: 1, COBBLE: 2, SOIL: 3, SAND: 4, WATER: 5, PLANK: 6 };
const HARD = new Set([GROUND.COBBLE, GROUND.SOIL, GROUND.PLANK]);
const HARDT = new Uint8Array(8); for (const h of HARD) HARDT[h] = 1;
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

// Classify one point of the map (logical pixel coords, may be fractional) into a terrain type.
function classifier(tiles, W, H) {
  const T = 32;
  const tileAt = (x, y) => tiles[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  const w = new Float32Array(8);
  return (px, py) => {
    const own = tileAt(Math.floor(px / T), Math.floor(py / T));
    if (HARDT[own]) return own;
    const fy = py / T - 0.5, j0 = Math.floor(fy), v = fy - j0;
    const fx = px / T - 0.5, i0 = Math.floor(fx), u = fx - i0;
    const a = tileAt(i0, j0), b = tileAt(i0 + 1, j0), c = tileAt(i0, j0 + 1), d = tileAt(i0 + 1, j0 + 1);
    if (a === b && a === c && a === d) return HARDT[a] ? own : a;
    w.fill(0);
    if (!HARDT[a]) w[a] += (1 - u) * (1 - v);
    if (!HARDT[b]) w[b] += u * (1 - v);
    if (!HARDT[c]) w[c] += (1 - u) * v;
    if (!HARDT[d]) w[d] += u * v;
    let best = own, bv = -1;
    for (let t = 0; t < 7; t++) {
      if (w[t] <= 0) continue;
      const fine = t === GROUND.WATER || t === GROUND.SAND ? 0.35 : 1;
      const sc = w[t] + (vnoise(px / 7, py / 7, 40 + t) - 0.5) * WOBBLE[t] * fine + (vnoise(px / 23, py / 23, 60 + t) - 0.5) * WOBBLE[t] * 1.3;
      if (sc > bv) { bv = sc; best = t; }
    }
    return best;
  };
}

// The ground at RES stored pixels per logical pixel, built in horizontal bands so a
// band is only generated when the camera first needs it (or in idle time).
// tiles: Uint8Array of GROUND types, W x H tiles. decals: { lilypads: [[px, py]], clear: Set of "tx,ty" with no flowers }
export function renderGround(tiles, W, H, season, decals = {}) {
  const T = 32, S = RES, PW = W * T, PH = H * T, QW = PW * S, QH = PH * S;
  const classify = classifier(tiles, W, H);

  // Logical-resolution pass, only for distances to water and land (shore foam, depth, wet sand).
  const lcls = new Uint8Array(PW * PH);
  // Tiles whose 3x3 neighbourhood is all one type (or that are hard-edged) fill in one go; only border tiles classify per pixel.
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const own = tiles[ty * W + tx];
    let uniform = HARDT[own] === 1;
    if (!uniform) {
      uniform = true;
      for (let j = -1; j <= 1 && uniform; j++) for (let i = -1; i <= 1; i++) {
        const nx = Math.min(W - 1, Math.max(0, tx + i)), ny = Math.min(H - 1, Math.max(0, ty + j));
        const nt = tiles[ny * W + nx];
        if (nt !== own && !HARDT[nt]) { uniform = false; break; }
      }
    }
    for (let py = ty * T; py < ty * T + T; py++) for (let px = tx * T; px < tx * T + T; px++) lcls[py * PW + px] = uniform ? own : classify(px + 0.5, py + 0.5);
  }
  const isWater = new Uint8Array(PW * PH), isLand = new Uint8Array(PW * PH);
  for (let i = 0; i < lcls.length; i++) { const wv = lcls[i] === GROUND.WATER; isWater[i] = wv ? 1 : 0; isLand[i] = wv ? 0 : 1; }
  const toWater = chamfer(isWater, PW, PH), toLand = chamfer(isLand, PW, PH);
  const G = GRASS[season];
  // 1 where a logical pixel has a differently classified neighbour (only there do stored pixels need their own classification)
  const ledge = new Uint8Array(PW * PH);
  for (let py = 1; py < PH - 1; py++) for (let px = 1; px < PW - 1; px++) {
    const i = py * PW + px, c = lcls[i];
    if (lcls[i - 1] !== c || lcls[i + 1] !== c || lcls[i - PW] !== c || lcls[i + PW] !== c || lcls[i - PW - 1] !== c || lcls[i + PW + 1] !== c || lcls[i - PW + 1] !== c || lcls[i + PW - 1] !== c) ledge[i] = 1;
  }

  // Decal positions are decided once for the whole map, in stored pixels.
  const decalList = [];
  {
    const lat = (x, y) => (x < 0 || y < 0 || x >= PW || y >= PH ? 255 : lcls[y * PW + x]);
    const grassy = (x, y, r) => {
      for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) if (lat(x + k, y + j) !== GROUND.GRASS) return false;
      return !(decals.clear && decals.clear.has(`${x >> 5},${y >> 5}`));
    };
    const R = rng(777);
    const flowers = FLOWER_COLORS[season];
    const clusters = Math.round(W * H / 9);
    for (let c = 0; c < clusters; c++) {
      const cx = (R() * PW) | 0, cy = (R() * PH) | 0;
      if (!grassy(cx, cy, 2)) continue;
      const kind = R(), n = 3 + ((R() * 6) | 0);
      for (let k = 0; k < n; k++) {
        const x = (cx + (R() - 0.5) * 34) | 0, y = (cy + (R() - 0.5) * 22) | 0;
        if (!grassy(x, y, 3)) continue;
        if (season === 'fall' && kind < 0.55) decalList.push(['leaf', x * S, y * S, R()]);
        else if (season === 'winter') { if (kind < 0.3) decalList.push(['pebble', x * S, y * S]); }
        else if (kind < 0.12) decalList.push(['pebble', x * S, y * S]);
        else if (flowers.length) decalList.push(['flower', x * S, y * S, C(flowers[(kind * 97 | 0) % flowers.length]), R()]);
      }
    }
    for (const [lx, ly, bloom] of decals.lilypads || []) decalList.push(['lily', lx * S, ly * S, bloom]);
  }

  const BAND = 256; // stored rows per band (4 tiles)
  const bands = [];
  for (let y0 = 0; y0 < QH; y0 += BAND) bands.push({ y0, y1: Math.min(QH, y0 + BAND), canvas: null });

  function build(band) {
    const M = 4; // margin rows for neighbour checks
    const by0 = Math.max(0, band.y0 - M), by1 = Math.min(QH, band.y1 + M), bh = by1 - by0;
    const cls = new Uint8Array(QW * bh);
    for (let qy = by0; qy < by1; qy++) {
      const lrow = Math.min(PH - 1, Math.floor(qy / S)) * PW;
      for (let qx = 0; qx < QW; qx++) {
        const li = lrow + Math.min(PW - 1, Math.floor(qx / S));
        cls[(qy - by0) * QW + qx] = ledge[li] ? classify((qx + 0.5) / S, (qy + 0.5) / S) : lcls[li];
      }
    }
    // low-frequency noise once per logical pixel, shared by its S x S stored pixels
    const ly0 = Math.floor(band.y0 / S), ly1 = Math.ceil(band.y1 / S), lh = ly1 - ly0;
    const nG = new Float32Array(PW * lh), nG2 = new Float32Array(PW * lh), nD = new Float32Array(PW * lh), nS = new Float32Array(PW * lh);
    for (let ly = ly0; ly < ly1; ly++) for (let lx = 0; lx < PW; lx++) {
      const c = lcls[Math.min(PH - 1, ly) * PW + lx], i = (ly - ly0) * PW + lx;
      if (c === GROUND.GRASS) { nG[i] = fbm(lx / 30, ly / 30, 11, 2); nG2[i] = vnoise(lx / 9, ly / 9, 12); }
      else if (c === GROUND.DIRT) nD[i] = fbm(lx / 16, ly / 16, 21, 2);
      else if (c === GROUND.SAND) nS[i] = fbm(lx / 26, ly / 26, 41, 2);
      else { nG[i] = 0.5; nD[i] = 0.5; nS[i] = 0.5; }
    }
    const at = (x, y) => (x < 0 || y < by0 || x >= QW || y >= by1 ? 255 : cls[(y - by0) * QW + x]);
    const h = band.y1 - band.y0;
    const out = new Uint32Array(QW * h);
    for (let qy = band.y0; qy < band.y1; qy++) for (let qx = 0; qx < QW; qx++) {
      const t = at(qx, qy), li = Math.min(PH - 1, Math.floor(qy / S)) * PW + Math.min(PW - 1, Math.floor(qx / S));
      const ni = (Math.floor(qy / S) - ly0) * PW + Math.min(PW - 1, Math.floor(qx / S));
      let col;
      if (t === GROUND.GRASS) {
        const n = nG[ni], n2 = nG2[ni];
        let k = 2.4 + (n - 0.5) * 0.7 + (n2 > 0.8 ? 0.45 : 0);
        if (k % 1 > 0.8 && ((qx + qy) & 1)) k += 0.2;
        // fine blade marks on a jittered 9x9 grid of stored pixels
        const cx = Math.floor(qx / 9), cy = Math.floor(qy / 9);
        if (hash(cx, cy, 3) < 0.7) {
          const ox = (hash(cx, cy, 4) * 5) | 0, oy = (hash(cx, cy, 5) * 4) | 0;
          const rx = qx - cx * 9 - ox, ry = qy - cy * 9 - oy;
          if ((ry === 0 && (rx === 0 || rx === 3)) || (ry === 1 && (rx === 1 || rx === 2)) || (ry === 2 && rx === 1)) k += 1;
          else if ((ry === 3 && (rx === 1 || rx === 2)) || (ry === 2 && rx === 2)) k -= 1;
        }
        if (season === 'winter' && hash(qx, qy, 9) < 0.003) k = 5;
        if (at(qx, qy + 1) !== t || at(qx - 1, qy) !== t || at(qx + 1, qy) !== t || at(qx, qy - 1) !== t) k = Math.min(k, 1);
        else if (at(qx, qy + 2) !== t || at(qx, qy - 2) !== t) k = Math.min(k, 1.9);
        col = G[Math.max(0, Math.min(5, Math.floor(k)))];
      } else if (t === GROUND.DIRT) {
        const n = nD[ni] || 0.5;
        let k = n < 0.22 ? 2.4 : n < 0.78 ? 3 : 3.6;
        const cx = Math.floor(qx / 7), cy = Math.floor(qy / 7);
        if (hash(cx, cy, 22) < 0.2) {
          const ox = (hash(cx, cy, 23) * 4) | 0, oy = (hash(cx, cy, 24) * 4) | 0, rx = qx - cx * 7 - ox, ry = qy - cy * 7 - oy;
          if (rx >= 0 && rx < 3 && ry >= 0 && ry < 2) k = rx + ry === 0 ? 5 : rx === 2 && ry === 1 ? 1 : 4;
        }
        const up = at(qx, qy - 1);
        if (up === GROUND.GRASS && hash(qx, qy, 25) < 0.45) { out[(qy - band.y0) * QW + qx] = G[2]; continue; }
        if (up === GROUND.GRASS || at(qx, qy - 2) === GROUND.GRASS || at(qx - 1, qy) === GROUND.GRASS || at(qx + 1, qy) === GROUND.GRASS) k = Math.min(k, 1.5);
        else if (at(qx, qy - 4) === GROUND.GRASS) k = Math.min(k, 2);
        col = DIRT[Math.max(1, Math.min(5, Math.floor(k)))];
      } else if (t === GROUND.COBBLE) {
        col = cobble(qx, qy);
        if (at(qx, qy - 1) === GROUND.GRASS || at(qx, qy - 2) === GROUND.GRASS || at(qx, qy - 3) === GROUND.GRASS) col = shade(col, -0.25);
      } else if (t === GROUND.SOIL) {
        const ry = qy % 24, n = hash(qx >> 1, qy >> 1, 31);
        let k = ry < 3 ? 4 : ry < 13 ? 3 : ry < 19 ? 2 : 1;
        if (ry === 3 || ry === 12) k = ry === 3 ? 5 : k;
        if (n < 0.08) k = Math.min(5, k + 1); else if (n > 0.93) k = Math.max(1, k - 1);
        col = SOIL[k];
      } else if (t === GROUND.SAND) {
        const n = nS[ni] || 0.5;
        let k = 3.5 + (n - 0.5) * 0.9;
        const hh = hash(qx, qy, 42);
        if (hh < 0.012) k = 2; else if (hh > 0.99) k = 5;
        const dw = toWater[li] / 2;
        if (dw < 3) k = 1.6; else if (dw < 7) k = Math.min(k, 2.6);
        if (at(qx, qy - 1) === GROUND.GRASS || at(qx, qy - 3) === GROUND.GRASS) k = Math.min(k, 2);
        col = SAND[Math.max(0, Math.min(5, Math.floor(k)))];
      } else if (t === GROUND.WATER) {
        const dl = toLand[li] / 2;
        let k = dl < 1.5 ? 6 : dl < 4 ? (hash(qx, qy, 51) < 0.5 ? 5 : 6) : dl < 11 ? 4 : dl < 20 ? (hash(qx >> 1, qy >> 1, 56) < 0.5 ? 4 : 3) : 3;
        const wy = qy >> 2, sx = qx + ((hash(0, wy, 52) * 80) | 0);
        if (dl > 6 && (sx % 74) < 9 && hash(sx / 74 | 0, wy, 53) < 0.35 && (qy & 3) === 0) k = Math.min(6, k + 1);
        if (at(qx, qy - 1) === GROUND.PLANK || at(qx, qy - 3) === GROUND.PLANK || at(qx, qy - 5) === GROUND.PLANK) k = 1;
        col = WATER[k];
      } else {
        col = plank(qx, qy, at);
      }
      out[(qy - band.y0) * QW + qx] = col;
    }
    // decals that touch this band
    const put = (x, y, c) => { if (x >= 0 && y >= band.y0 && x < QW && y < band.y1) out[(y - band.y0) * QW + x] = c; };
    const block = (x, y, c) => { for (let b = 0; b < S; b++) for (let a = 0; a < S; a++) put(x * S + a, y * S + b, c); };
    for (const d of decalList) {
      if (d[2] < band.y0 - 32 || d[2] > band.y1 + 32) continue;
      const seeded = () => d[d.length - 1];
      if (d[0] === 'flower') flower(block, d[1] / S, d[2] / S, d[3], G, seeded);
      else if (d[0] === 'leaf') leaf(block, d[1] / S, d[2] / S, seeded);
      else if (d[0] === 'pebble') pebble(block, d[1] / S, d[2] / S);
      else lilypad(put, d[1], d[2], d[3]);
    }
    const canvas = document.createElement('canvas');
    canvas.width = QW; canvas.height = h;
    const g = canvas.getContext('2d');
    const img = g.createImageData(QW, h);
    new Uint32Array(img.data.buffer).set(out);
    g.putImageData(img, 0, 0);
    band.canvas = canvas;
  }

  const ground = {
    S, PW, PH, QW, QH, bands,
    // ensure the bands covering logical rows y0..y1 exist
    need(y0, y1) { for (const b of bands) if (!b.canvas && b.y1 > y0 * S && b.y0 < y1 * S) build(b); },
    pending() { return bands.some((b) => !b.canvas); },
    buildNext() { const b = bands.find((x) => !x.canvas); if (b) build(b); return !!b; },
    all() { for (const b of bands) if (!b.canvas) build(b); },
    // draw logical rect (sx, sy, w, h) of the ground at (dx, dy) on a context scaled to logical pixels
    draw(g, sx, sy, w, h, dx, dy) {
      this.need(sy, sy + h);
      for (const b of bands) {
        const top = b.y0 / S, bot = b.y1 / S;
        if (bot <= sy || top >= sy + h) continue;
        const y0 = Math.max(sy, top), y1 = Math.min(sy + h, bot);
        g.drawImage(b.canvas, sx * S, (y0 - top) * S, w * S, (y1 - y0) * S, dx, dy + (y0 - sy), w, y1 - y0);
      }
    },
  };
  return ground;
}

// Irregular cobbles: nearest jittered cell centre, mortar where two cells are almost equally near.
function cobble(px, py) {
  const CW = 15 * RES, CH = 11 * RES;
  const gx = Math.floor(px / CW), gy = Math.floor(py / CH);
  let f1 = 1e9, f2 = 1e9, bx = 0, by = 0, bcx = 0, bcy = 0;
  for (let j = gy - 1; j <= gy + 1; j++) for (let i = gx - 1; i <= gx + 1; i++) {
    const off = (j & 1) ? CW / 2 : 0;
    const cx = i * CW + off + CW / 2 + (hash(i, j, 61) - 0.5) * 5 * RES, cy = j * CH + CH / 2 + (hash(i, j, 62) - 0.5) * 3 * RES;
    const d = Math.hypot(px + 0.5 - cx, (py + 0.5 - cy) * 1.25);
    if (d < f1) { f2 = f1; f1 = d; bx = i; by = j; bcx = cx; bcy = cy; } else if (d < f2) f2 = d;
  }
  const edge = f2 - f1;
  if (edge < 1.4) return COBBLE[1];
  const tone = hash(bx, by, 63);
  let k = tone < 0.3 ? 2 : tone < 0.8 ? 3 : 4;
  const dir = (px + 0.5 - bcx) + (py + 0.5 - bcy) * 1.3;
  if (edge < 3.4) k += dir < 0 ? 1 : -1;
  else if (edge < 5 && dir < 0) k = Math.min(5, k + (hash(bx, by, 65) < 0.5 ? 1 : 0));
  if (hash(px, py, 64) < 0.03) k -= 1;
  return COBBLE[Math.max(1, Math.min(5, k))];
}

// Boards run north-south, 8 px wide, with staggered ends, nails and posts on the edges.
function plank(px, py, at) {
  const P = WOOD_GRAY, S = RES, BW = 8 * S, SL = 64 * S;
  const bx = Math.floor(px / BW), rx = px % BW;
  const off = (hash(bx, 0, 71) * SL) | 0, seg = Math.floor((py + off) / SL), ry = (py + off) % SL;
  let k = hash(bx, seg, 72) < 0.5 ? 3 : 2;
  if (rx === 0) k = 4;
  if (rx === BW - 1 || ry === 0) k = 1;
  if ((ry >= 3 * S && ry < 4 * S || ry >= 60 * S && ry < 61 * S) && (rx === 2 * S || rx === 5 * S)) k = 1;
  if (hash(px, py >> 1, 73) < 0.04) k = Math.max(1, k - 1);
  const leftW = at(px - 1, py) === GROUND.WATER || at(px - 3, py) === GROUND.WATER;
  const rightW = at(px + 1, py) === GROUND.WATER || at(px + 3, py) === GROUND.WATER;
  if (leftW || rightW) k = 1;
  // posts every two tiles along the water edges
  const edgeX = at(px - 4 * S, py) === GROUND.WATER || at(px + 4 * S, py) === GROUND.WATER;
  const pm = py % SL;
  if (edgeX && pm >= 26 * S && pm < 34 * S) {
    const my = pm - 30 * S;
    return my < -2 * S ? P[5] : my < 2 * S ? P[4] : P[2];
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
  // drawn at stored resolution: x, y are stored pixels
  const S = RES, G = [C('#1d4a2a'), C('#2f6e36'), C('#4a9444'), C('#72b85a'), C('#9ad07a')];
  for (let j = -4 * S; j <= 4 * S; j++) for (let i = -6 * S; i <= 6 * S; i++) {
    const u = i / S, v = j / S;
    const d = (u * u) / 36 + (v * v) / 16;
    if (d > 1) continue;
    if (u > 0 && Math.abs(v) <= Math.max(0, u - 3) * 0.6 && v <= 0) continue; // notch
    let k = d > 0.8 ? 0 : (u + v < -3 ? 3 : u + v > 3 ? 1 : 2);
    if (k === 3 && d < 0.25) k = 4;
    if (k > 0 && Math.abs(Math.atan2(v, u) * 3 % 1) < 0.08 && d > 0.1) k = 1; // veins
    put(x + i, y + j, G[k]);
  }
  if (bloom) {
    const P = [C('#b44d80'), C('#f0a6c4'), C('#ffe6f0'), C('#ffd84a')];
    for (const [i, j, c] of [[-1, -2, 1], [1, -2, 1], [0, -3, 2], [-2, -1, 0], [2, -1, 0], [0, -1, 3]]) for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) put(x + i * S + a, y + j * S + b, P[c]);
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
  const k = p.k;
  for (let Y = topY * k; Y <= baseY * k + k - 1; Y++) {
    const y = Y / k, t = (y - topY) / (baseY - topY);
    const flare = y > baseY - 7 ? (y - (baseY - 7)) * 1.3 : 0;
    const half = 7 + t * 2.5 + flare;
    for (let X = Math.round((cx - half) * k); X <= Math.round((cx + half) * k); X++) {
      const x = X / k, u = (x - (cx - half)) / (2 * half);
      let c = u < 0.16 ? 4 : u < 0.5 ? 3 : u < 0.82 ? 2 : 1;
      // fine bark: wavy vertical grooves one stored pixel wide
      const groove = Math.sin(X * 0.9 + Math.sin(Y * 0.23 + X) * 1.6);
      if (groove > 0.82 && u > 0.1 && u < 0.9) c = Math.max(1, c - 1);
      else if (groove < -0.9 && u < 0.6) c = Math.min(5, c + 1);
      if (hash(X >> 1, Y >> 2, seed) < 0.08 && c > 1) c--;
      if (y < topY + 10) c = Math.max(1, c - 1); // canopy shadow
      p.hset(X, Y, BARK[c]);
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
    p.ellipse(cx, cy, r, r * 0.92, (x, y, nx, ny, X, Y) => {
      const dd = Math.sqrt(nx * nx + ny * ny);
      if (dd > 1 - 1 / r && (ny > -0.3 || nx > 0.4)) return F[1];
      const l = sphereLight(nx, ny) + leafMod(X / 1.5, Y / 1.5);
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
    p.ellipse(x + 1.5, y + 1.5, 1.7, 1.7, (xx, yy, nx, ny) => (nx + ny < -0.6 ? hi : nx + ny > 0.7 ? lo : c));
  }
}
function blossoms(p, R) {
  for (let k = 0; k < 30; k++) {
    const x = 10 + R() * 76, y = 10 + R() * 72;
    if (!p.opaque(x - 1, y - 1) || !p.opaque(x + 1, y + 1)) continue;
    p.ellipse(x + 0.5, y + 0.5, 1.4, 1.4, (xx, yy, nx, ny) => (Math.hypot(nx, ny) < 0.45 ? C('#fff4f8') : ny < 0 ? C('#f6bcd4') : C('#e08ab0')));
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
    p.ellipse(bx + (R() - 0.5) * 3, by, r, r * 0.85, (x, y, nx, ny, X, Y) => {
      const dd = Math.sqrt(nx * nx + ny * ny);
      if (dd > 1 - 1.5 / r && (ny > -0.3 || nx > 0.4)) return F[1];
      return F[lightIndex(sphereLight(nx, ny) + leafMod(X / 1.5, Y / 1.5))];
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
  const p = new Pix(32, 32), k = p.k;
  const Gr = season === 'fall' ? [C('#4a3a14'), C('#7a6224'), C('#a8883a'), C('#c8a84e'), C('#e2c86a')]
    : season === 'winter' ? [C('#4a3a24'), C('#6e5a3c'), C('#8e7a58'), C('#b09c78'), C('#d6c8a8')]
      : GRASS[season].slice(0, 5).map((c, i) => GRASS[season][Math.min(5, i + 1)]);
  // more, thinner blades, drawn in stored pixels
  const blades = [[9, 13, -4], [10.5, 17, -3], [12, 19, -2], [13.5, 15, -2.5], [15, 24, -1], [16.5, 20, 0.5], [18, 21, 1], [19.5, 16, 2], [21, 17, 3], [22.5, 13, 4], [23.5, 11, 5], [14, 12, -3], [19, 12, 2]];
  const sway = [-2, 0, 2][frame];
  blades.forEach(([x0, h, lean], bi) => {
    const tipX = x0 + lean + sway * (h / 24);
    for (let S2 = 0; S2 <= h * k; S2++) {
      const t = S2 / (h * k), bend = t * t;
      const X = Math.round((x0 + (tipX - x0) * bend) * k), Y = Math.round((30.5 - S2 / k) * k);
      const wdt = t < 0.45 ? 2 : 1;
      const c = t < 0.3 ? 1 : t < 0.65 ? 2 : t < 0.9 ? 3 : 4;
      for (let q = 0; q < wdt; q++) p.hset(X + q, Y, Gr[q === 0 ? Math.min(4, c + (bi & 1)) : c]);
    }
  });
  if (season === 'winter') for (let X = 0; X < p.W; X++) for (let Y = 1; Y < p.H; Y++) if ((p.hget(X, Y) >>> 24) && !(p.hget(X, Y - 1) >>> 24)) p.hset(X, Y, SNOW[5]);
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
    p.ellipse(16, 13, 12, 6, (x, y, nx, ny, X, Y) => F[lightIndex(sphereLight(nx, ny) + leafMod(X / 1.5, Y / 1.5))]);
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
