// The valley layout. Everything sits on a strict grid:
//
//   forest border
//   [ NW district ]  [  N district  ]  [ NE district ]     <- gates face Main Street
//   ================ Main Street + Town Square =========
//   [ SW district ]  [ Aaran's house ]  [ SE district/park ] <- gates face South Lane
//   ================ South Lane ========================
//   beach, pier, sea
//
// Every district: building at the back, a straight path from its door to the gate,
// and project displays lined up either side of that path along a cross path.
import { GROUND } from './art-nature.js';
import { hash, rng } from './art-core.js';
import { DISTRICTS, GAME } from '../content.js';

export const W = 72, H = 56, T = 32;

export const SLOTS = {
  nw: { x0: 3, x1: 24, y0: 3, y1: 17 },
  n: { x0: 27, x1: 44, y0: 3, y1: 17 },
  ne: { x0: 47, x1: 68, y0: 3, y1: 17 },
  sw: { x0: 3, x1: 24, y0: 23, y1: 37 },
  s: { x0: 27, x1: 44, y0: 23, y1: 37 },
  se: { x0: 47, x1: 68, y0: 23, y1: 37 },
};
// Display columns, inner-first so small districts stay balanced around the path.
const SIDE_SLOTS = [7, 13, 4, 16, 1, 19];
const MID_SLOTS = [5, 11, 2, 14];

export function buildWorld() {
  const tiles = new Uint8Array(W * H).fill(GROUND.GRASS);
  const solid = new Uint8Array(W * H);
  const fences = new Set();
  const objects = [], interact = [], areas = [], lights = [], tufts = [], lily = [];
  const noFlowers = new Set();
  const R = rng(4242);

  const idx = (x, y) => y * W + x;
  const fill = (x0, y0, x1, y1, t) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < W && y < H) tiles[idx(x, y)] = t; };
  const block = (x0, y0, x1 = x0, y1 = y0) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < W && y < H) solid[idx(x, y)] = 1; };
  const clearFlowers = (x0, y0, x1 = x0, y1 = y0) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) noFlowers.add(`${x},${y}`); };
  const add = (o) => { objects.push(o); return o; };

  // --- sprite placement helpers (tile coordinates) ---
  const tree = (tx, ty, kind = 'oak', variant = 0, cx = null) => {
    const w = kind === 'oak' ? 96 : 64;
    const px = cx ?? tx * T + 16;
    block(tx, ty);
    return add({ key: `${kind}${variant}`, kind: 'tree', x: px - w / 2, y: (ty + 1) * T - 128, w, h: 128, sortY: (ty + 1) * T - 6, fade: true, shadow: [px, (ty + 1) * T - 7, kind === 'oak' ? 26 : 16, 7] });
  };
  const sprite = (key, tx, ty, tw, th, opts = {}) => {
    // Sprite whose bottom edge sits on the bottom of tile row ty, starting at tile column tx.
    const o = { key, x: tx * T + (opts.dx || 0), y: (ty + 1) * T - th + (opts.dy || 0), w: tw, h: th, sortY: (ty + 1) * T - 2, ...opts };
    return add(o);
  };

  // ---------------------------------------------------------------------------
  // Terrain
  // ---------------------------------------------------------------------------
  fill(0, 41, W - 1, 45, GROUND.SAND);
  fill(0, 46, W - 1, H - 1, GROUND.WATER);
  for (let x = 0; x < W; x++) {
    const h = hash(x, 0, 77);
    if (h < 0.3) tiles[idx(x, 46)] = GROUND.SAND;
    else if (h > 0.82 && x > 3 && x < W - 4 && (x < 33 || x > 38)) tiles[idx(x, 45)] = GROUND.WATER;
  }
  fill(3, 19, 68, 21, GROUND.COBBLE);          // Main Street
  fill(27, 18, 44, 22, GROUND.COBBLE);         // Town Square
  fill(3, 39, 68, 40, GROUND.DIRT);            // South Lane
  fill(25, 22, 26, 40, GROUND.DIRT);           // West Lane
  fill(45, 22, 46, 40, GROUND.DIRT);           // East Lane
  fill(35, 41, 36, 51, GROUND.PLANK);          // Pier
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (tiles[idx(x, y)] === GROUND.WATER) block(x, y);

  // Forest border
  for (let x = 0; x < W; x++) block(x, 0, x, 2);
  for (let y = 0; y <= 40; y++) { block(0, y, 2, y); block(W - 3, y, W - 1, y); }
  for (let x = 1; x < W; x += 3) tree(x, 2, (x / 3) % 3 === 1 ? 'pine' : 'oak', x % 2, null);
  for (let x = 2; x < W; x += 3) tree(x, 0, 'pine', (x >> 1) % 2);
  for (let y = 5; y <= 38; y += 3) { tree(1, y, y % 2 ? 'oak' : 'pine', y % 3 === 0 ? 1 : 0); tree(W - 2, y, y % 2 ? 'pine' : 'oak', y % 3 === 0 ? 0 : 1); }
  for (let y = 4; y <= 38; y += 3) { tree(0, y, 'pine', 1); tree(W - 1, y, 'pine', 0); }
  // pines between the northern yards
  for (const gx of [26, 46]) for (const ty of [5, 10, 15]) tree(gx - 1, ty, 'pine', ty % 2, gx * T);
  for (const gx of [25, 45]) block(gx, 3, gx + 1, 17);

  // ---------------------------------------------------------------------------
  // Areas
  // ---------------------------------------------------------------------------
  const fenceRect = (a, gateX) => {
    for (let x = a.x0; x <= a.x1; x++) { fences.add(`${x},${a.y0}`); if (x !== gateX && x !== gateX + 1) fences.add(`${x},${a.y1}`); }
    for (let y = a.y0; y <= a.y1; y++) { fences.add(`${a.x0},${y}`); fences.add(`${a.x1},${y}`); }
  };
  const archAt = (name, color, gateX, gateY) => add({ key: `arch:${name}`, kind: 'arch', text: name, color, x: (gateX - 1) * T, y: (gateY + 1) * T - 96, w: 128, h: 96, sortY: (gateY + 1) * T - 1 });

  const used = new Set();
  const placed = [];
  const bySlot = {};
  for (const d of DISTRICTS) {
    const slot = SLOTS[d.slot] && d.slot !== 's' && !used.has(d.slot) ? d.slot : ['nw', 'n', 'ne', 'sw', 'se'].find((s) => !used.has(s));
    if (!slot) continue; // more districts than slots: extra ones only show on the classic site
    used.add(slot);
    bySlot[slot] = d;
  }

  const layoutYard = (a, name, color) => {
    const gateX = Math.floor((a.x0 + a.x1) / 2);
    fenceRect(a, gateX);
    archAt(name, color, gateX, a.y1);
    fill(gateX, a.y0 + 7, gateX + 1, a.y1 + 1, GROUND.DIRT);
    clearFlowers(gateX, a.y0 + 7, gateX + 1, a.y1 + 1);
    return gateX;
  };

  for (const [slot, a] of Object.entries(SLOTS)) {
    const d = bySlot[slot];
    const mid = slot === 'n' || slot === 's';
    const area = { id: slot, x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1, slot };
    if (slot === 's') {
      Object.assign(area, { name: "Aaran's House", color: '#c9763a', kind: 'home' });
      area.chickens = layoutHome(a);
    } else if (d) {
      Object.assign(area, { name: d.name, color: d.color, kind: 'district', district: d });
      const gateX = layoutYard(a, d.name, d.color);
      const bx0 = gateX - 3, by0 = a.y0 + 1;
      add({ key: `bld:${d.building || 'code'}`, kind: 'building', x: bx0 * T, y: by0 * T, w: 256, h: 192, sortY: (by0 + 6) * T - 2, building: d.building || 'code' });
      block(bx0, by0, bx0 + 7, by0 + 5);
      interact.push({ id: `door:${d.id}`, kind: 'door', district: d, x: (gateX) * T, y: (by0 + 5) * T, w: 2 * T, h: T, label: `${d.name}` });
      // cross path and displays
      const crossY = a.y0 + 11;
      fill(a.x0 + 2, crossY, a.x1 - 2, crossY, GROUND.DIRT);
      clearFlowers(a.x0 + 1, crossY - 3, a.x1 - 1, crossY);
      const order = (mid ? MID_SLOTS : SIDE_SLOTS).slice(0, Math.min(d.lots.length, mid ? 4 : 6)).map((o) => a.x0 + o).sort((p, q) => p - q);
      d._placed = [];
      order.forEach((sx, i) => {
        const lot = d.lots[i];
        const code = d.short[0].toUpperCase() + (i + 1);
        const o = sprite(`prop:${lot.sprite || 'generic'}`, sx, crossY - 1, 64, 64, { kind: 'prop', lot, district: d, code, shadow: [sx * T + 32, crossY * T - 5, 26, 6] });
        block(sx, crossY - 2, sx + 1, crossY - 1);
        const it = { id: `lot:${lot.id}`, kind: 'lot', lot, district: d, code, x: sx * T, y: (crossY - 2) * T, w: 64, h: 64, label: lot.title, obj: o };
        interact.push(it);
        d._placed.push(it);
        placed.push(it);
        if (lot.sprite === 'secondbrain') lights.push({ x: sx * T + 32, y: (crossY - 2) * T + 14, r: 70, color: '#ff8fd0', k: 0.7 });
        if (lot.sprite === 'keyreplay') lights.push({ x: sx * T + 32, y: (crossY - 2) * T + 30, r: 56, color: '#b48cff', k: 0.6 });
      });
      // yard dressing
      const signX = gateX - 2, signY = a.y1 - 1;
      sprite('sign', signX, signY, 32, 48, { kind: 'sign' });
      block(signX, signY);
      interact.push({ id: `sign:${d.id}`, kind: 'areaSign', district: d, x: signX * T, y: signY * T, w: T, h: T, label: `${d.name} sign` });
      tree(bx0 - 3, by0 + 4, 'oak', slot.length % 3);
      tree(bx0 + 10, by0 + 4, 'oak', (slot.length + 1) % 3);
      sprite('barrel', bx0 - 1, by0 + 5, 32, 48); block(bx0 - 1, by0 + 5);
      sprite('crate', bx0 + 8, by0 + 5, 32, 32); block(bx0 + 8, by0 + 5);
    } else {
      Object.assign(area, { name: 'Pond Park', color: '#46a0c8', kind: 'park' });
      layoutPark(a);
    }
    areas.push(area);
  }

  // ---------------------------------------------------------------------------
  // Home: house, mailbox, shipping bin, a small field and some chickens
  // ---------------------------------------------------------------------------
  function layoutHome(a) {
    const gateX = layoutYard(a, "Aaran's House", '#c9763a');
    const bx0 = gateX - 3, by0 = a.y0 + 1;
    add({ key: 'bld:house', kind: 'building', x: bx0 * T, y: by0 * T, w: 256, h: 192, sortY: (by0 + 6) * T - 2, building: 'house' });
    block(bx0, by0, bx0 + 7, by0 + 5);
    interact.push({ id: 'house', kind: 'house', x: gateX * T, y: (by0 + 5) * T, w: 2 * T, h: T, label: "Aaran's House" });
    sprite('mailbox', gateX - 2, by0 + 6, 32, 64, { kind: 'mailbox' });
    block(gateX - 2, by0 + 6);
    interact.push({ id: 'mailbox', kind: 'mailbox', x: (gateX - 2) * T, y: (by0 + 6) * T, w: T, h: T, label: 'Mailbox' });
    sprite('bin', gateX + 3, by0 + 6, 64, 48);
    block(gateX + 3, by0 + 6, gateX + 4, by0 + 6);
    interact.push({ id: 'bin', kind: 'bin', x: (gateX + 3) * T, y: (by0 + 6) * T, w: 2 * T, h: T, label: 'Shipping bin' });
    // field
    fill(a.x0 + 2, a.y0 + 9, a.x0 + 6, a.y0 + 12, GROUND.SOIL);
    for (let y = a.y0 + 9; y <= a.y0 + 12; y++) for (let x = a.x0 + 2; x <= a.x0 + 6; x++) {
      sprite('crop', x, y, 32, 32, { kind: 'crop', variant: (x + y) % 3 });
      block(x, y);
    }
    interact.push({ id: 'field', kind: 'field', x: (a.x0 + 2) * T, y: (a.y0 + 9) * T, w: 5 * T, h: 4 * T, label: 'Field' });
    tree(a.x0 + 2, a.y0 + 5, 'oak', 1);
    tree(a.x1 - 2, a.y0 + 5, 'oak', 0);
    return { x0: gateX + 3, y0: a.y0 + 8, x1: a.x1 - 1, y1: a.y1 - 2 };
  }

  // ---------------------------------------------------------------------------
  // Pond Park
  // ---------------------------------------------------------------------------
  function layoutPark(a) {
    const gateX = layoutYard(a, 'Pond Park', '#46a0c8');
    const cx = (a.x0 + a.x1) / 2 + 0.5, cy = a.y0 + 6.5;
    for (let y = a.y0 + 1; y < a.y1; y++) for (let x = a.x0 + 1; x < a.x1; x++) {
      const nx = (x + 0.5 - cx) / 7.2, ny = (y + 0.5 - cy) / 3.9;
      if (nx * nx + ny * ny < 1) { tiles[idx(x, y)] = GROUND.WATER; block(x, y); }
    }
    // dock from the path into the pond
    fill(gateX, a.y0 + 8, gateX + 1, a.y0 + 10, GROUND.PLANK);
    for (let y = a.y0 + 8; y <= a.y0 + 10; y++) { solid[idx(gateX, y)] = 0; solid[idx(gateX + 1, y)] = 0; }
    interact.push({ id: 'dock', kind: 'dock', x: gateX * T, y: (a.y0 + 8) * T, w: 2 * T, h: T, label: 'Dock' });
    const Rl = rng(99);
    for (let k = 0; k < 9; k++) {
      const ang = Rl() * Math.PI * 2, rr = 0.35 + Rl() * 0.5;
      const lx = (cx + Math.cos(ang) * 7.2 * rr) * T, ly = (cy + Math.sin(ang) * 3.9 * rr) * T;
      lily.push([Math.round(lx), Math.round(ly), k % 3 === 0]);
    }
    for (const [x, y] of [[cx - 6.2, cy + 1.4], [cx + 5.6, cy + 1.6], [cx - 3.5, cy - 3], [cx + 3.6, cy - 3.1]]) {
      sprite('cattail', Math.floor(x), Math.floor(y), 32, 48);
    }
    for (const bx of [a.x0 + 3, a.x1 - 4]) { sprite('bench', bx, a.y1 - 3, 64, 48, { kind: 'bench' }); block(bx, a.y1 - 3, bx + 1, a.y1 - 3); interact.push({ id: `bench:${bx}`, kind: 'bench', x: bx * T, y: (a.y1 - 3) * T, w: 2 * T, h: T, label: 'Bench' }); }
    fill(a.x0 + 2, a.y1 - 5, a.x0 + 4, a.y1 - 4, GROUND.SOIL);
    sprite('soon', a.x0 + 2, a.y1 - 4, 64, 64, { kind: 'soon' });
    block(a.x0 + 2, a.y1 - 5, a.x0 + 4, a.y1 - 4);
    interact.push({ id: 'soon', kind: 'soon', x: (a.x0 + 2) * T, y: (a.y1 - 5) * T, w: 3 * T, h: 2 * T, label: 'Coming soon' });
    tree(a.x1 - 2, a.y1 - 5, 'oak', 2);
    tree(a.x0 + 1, a.y0 + 2, 'pine', 0);
    tree(a.x1 - 1, a.y0 + 2, 'pine', 1);
  }

  // Fences are placed last so the masks see their neighbours.
  for (const k of fences) {
    const [x, y] = k.split(',').map(Number);
    let m = 0;
    if (fences.has(`${x - 1},${y}`)) m |= 1;
    if (fences.has(`${x + 1},${y}`)) m |= 2;
    if (fences.has(`${x},${y - 1}`)) m |= 4;
    if (fences.has(`${x},${y + 1}`)) m |= 8;
    add({ key: `fence${m}`, kind: 'fence', x: x * T, y: y * T - 32, w: 32, h: 64, sortY: (y + 1) * T - 4 });
    block(x, y);
    clearFlowers(x, y);
  }

  // ---------------------------------------------------------------------------
  // Town Square and streets
  // ---------------------------------------------------------------------------
  const fountainObj = sprite('fountain', 34, 21, 128, 96, { kind: 'fountain', anim: 'fountain' });
  block(34, 20, 37, 21);
  interact.push({ id: 'fountain', kind: 'fountain', x: 34 * T, y: 20 * T, w: 4 * T, h: 2 * T, label: 'Fountain' });
  lights.push({ x: 36 * T, y: 20 * T + 16, r: 90, color: '#9fd8ff', k: 0.45 });
  const wsX = 28;
  const welcome = sprite('welcome', wsX, 18, 112, 72, { kind: 'welcome' });
  block(wsX, 18, wsX + 3, 18);
  interact.push({ id: 'welcome', kind: 'welcome', x: wsX * T, y: 18 * T, w: 4 * T, h: T, label: 'Welcome sign' });
  sprite('board', 40, 18, 64, 80, { kind: 'board' });
  block(40, 18, 41, 18);
  interact.push({ id: 'board', kind: 'board', x: 40 * T, y: 18 * T, w: 2 * T, h: T, label: 'Quest board' });
  sprite('signpost', 32, 22, 64, 96, { kind: 'signpost' });
  block(32, 22, 33, 22);
  interact.push({ id: 'signpost', kind: 'signpost', x: 32 * T, y: 22 * T, w: 2 * T, h: T, label: 'Signpost' });
  for (const bx of [28, 41]) { sprite('bench', bx, 22, 64, 48, { kind: 'bench' }); block(bx, 22, bx + 1, 22); interact.push({ id: `bench:sq${bx}`, kind: 'bench', x: bx * T, y: 22 * T, w: 2 * T, h: T, label: 'Bench' }); }
  for (const px of [33, 38]) { sprite('planter', px, 18, 32, 32); block(px, 18); }

  const lamp = (tx, ty) => {
    sprite('lamp', tx, ty, 32, 96, { kind: 'lamp', shadow: [tx * T + 16, (ty + 1) * T - 4, 8, 3] });
    block(tx, ty);
    lights.push({ x: tx * T + 16, y: (ty + 1) * T - 30, r: 112, color: '#ffc870', k: 1, lamp: true, halo: [tx * T + 16, (ty + 1) * T - 76] });
  };
  for (const [x, y] of [[27, 18], [44, 18], [27, 22], [44, 22]]) lamp(x, y);
  for (const x of [6, 19, 50, 63]) { lamp(x, 18); lamp(x, 22); }
  for (const x of [8, 20, 31, 40, 51, 63]) lamp(x, 38);
  lamp(34, 42); lamp(37, 42); lamp(37, 51);

  // Beach dressing
  sprite('campfire', 29, 43, 32, 32, { kind: 'campfire', anim: 'campfire' });
  block(29, 43);
  interact.push({ id: 'campfire', kind: 'campfire', x: 29 * T, y: 43 * T, w: T, h: T, label: 'Campfire' });
  lights.push({ x: 29 * T + 16, y: 43 * T + 16, r: 130, color: '#ff9a4a', k: 1, flicker: true });
  for (const [x, y] of [[27, 44], [31, 44]]) { sprite('log', x - 1, y, 64, 32); block(x - 1, y, x, y); }
  for (const [x, y, v] of [[12, 43, 0], [50, 44, 1], [60, 42, 0], [20, 45, 1], [66, 44, 0]]) { sprite(`rock${v}`, x, y, 32, 32); block(x, y); }
  for (let k = 0; k < 16; k++) {
    const x = 3 + ((R() * 66) | 0), y = 42 + ((R() * 3) | 0);
    if (solid[idx(x, y)] || tiles[idx(x, y)] !== GROUND.SAND || (x >= 34 && x <= 37)) continue;
    sprite(`shell${k % 2}`, x, y, 16, 16, { dx: (R() * 12) | 0, dy: -((R() * 12) | 0) });
  }
  interact.push({ id: 'pierEnd', kind: 'pier', x: 35 * T, y: 51 * T, w: 2 * T, h: T, label: 'End of the pier' });

  // Tall grass tufts on open grass, away from paths and doors.
  for (let k = 0; k < 900 && tufts.length < 130; k++) {
    const x = 3 + ((R() * (W - 6)) | 0), y = 3 + ((R() * 40) | 0);
    if (solid[idx(x, y)] || tiles[idx(x, y)] !== GROUND.GRASS) continue;
    if (noFlowers.has(`${x},${y}`)) continue;
    const near = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => tiles[idx(x + dx, y + dy)] !== GROUND.GRASS);
    if (near && R() < 0.7) continue;
    if (y >= 17 && y <= 23 && x >= 26 && x <= 45) continue;
    tufts.push({ x: x * T + ((R() * 10) | 0) - 5, y: y * T + ((R() * 10) | 0), phase: R() * 6.28, rustle: 0 });
  }

  // Named places without fences, for the location banner.
  areas.push({ id: 'square', name: 'Town Square', color: '#9a8f86', kind: 'square', x0: 27, y0: 18, x1: 44, y1: 22 });
  areas.push({ id: 'beach', name: 'The Beach', color: '#e5c48e', kind: 'beach', x0: 0, y0: 41, x1: W - 1, y1: H - 1 });

  const spawn = { x: 36 * T, y: 22 * T + 26, dir: 'up' };
  const petSpawn = { x: 38 * T + 16, y: 22 * T + 24 };
  return {
    W, H, T, tiles, solid, objects, interact, areas, lights, tufts, placed,
    decals: { lilypads: lily, clear: noFlowers }, spawn, petSpawn,
    chickens: areas.find((a) => a.kind === 'home')?.chickens,
  };
}
