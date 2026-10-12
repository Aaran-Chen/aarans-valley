// The valley layout: a plus sign. The town square sits in the middle and four
// straight streets run out of it, one per district. Each street is lined with
// that district's project displays on both sides and ends at its building, so
// every project is a straight walk from the square. No fences, no detours.
//
//              Campus (N)
//                 |
//   Robotics (W)--[ ]--Software (E)        Pond Park NE, orchard NW
//                 |
//              ML Lab (S)
//   ======== Beach Road (house, lab) ========
//   beach, pier, sea
import { GROUND } from './art-nature.js';
import { hash, rng } from './art-core.js';
import { DISTRICTS } from '../content.js';

export const W = 64, H = 56, T = 32;

// Square and the four streets (tiles). Streets are 4 tiles wide.
const SQ = { x0: 26, x1: 37, y0: 18, y1: 29 };
const VX = 30; // first column of the north/south streets
const HY = 22; // first row of the east/west streets
const ROAD = { y0: 39, y1: 42 }; // Beach Road
export const ARMS = {
  n: { axis: 'v', dir: -1, start: SQ.y0 - 1, cross: VX, label: 'north' },
  s: { axis: 'v', dir: 1, start: SQ.y1 + 1, cross: VX, label: 'south' },
  e: { axis: 'h', dir: 1, start: SQ.x1 + 1, cross: HY, label: 'east' },
  w: { axis: 'h', dir: -1, start: SQ.x0 - 1, cross: HY, label: 'west' },
};
// Old content.js slot names still work.
const SLOT_ALIAS = { nw: 'w', ne: 'e', sw: 's', se: 's', n: 'n', e: 'e', w: 'w', s: 's' };

export function buildWorld() {
  const tiles = new Uint8Array(W * H).fill(GROUND.GRASS);
  const solid = new Uint8Array(W * H);
  const objects = [], interact = [], areas = [], lights = [], tufts = [], lily = [];
  const noFlowers = new Set();
  const R = rng(4242);

  const idx = (x, y) => y * W + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const fill = (x0, y0, x1, y1, t) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (inb(x, y)) tiles[idx(x, y)] = t; };
  const block = (x0, y0, x1 = x0, y1 = y0) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inb(x, y)) solid[idx(x, y)] = 1; };
  const clearFlowers = (x0, y0, x1 = x0, y1 = y0) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) noFlowers.add(`${x},${y}`); };
  const add = (o) => { objects.push(o); return o; };

  const tree = (tx, ty, kind = 'oak', variant = 0, cx = null) => {
    const w = kind === 'oak' ? 96 : 64;
    const px = cx ?? tx * T + 16;
    block(tx, ty);
    return add({ key: `${kind}${variant}`, kind: 'tree', x: px - w / 2, y: (ty + 1) * T - 128, w, h: 128, sortY: (ty + 1) * T - 6, fade: true, shadow: [px, (ty + 1) * T - 7, kind === 'oak' ? 26 : 16, 7] });
  };
  // Sprite whose bottom edge sits on the bottom of tile row ty, starting at tile column tx.
  const sprite = (key, tx, ty, tw, th, opts = {}) => add({ key, x: tx * T + (opts.dx || 0), y: (ty + 1) * T - th + (opts.dy || 0), w: tw, h: th, sortY: (ty + 1) * T - 2, ...opts });
  const lamp = (tx, ty) => {
    if (!inb(tx, ty) || solid[idx(tx, ty)]) return;
    sprite('lamp', tx, ty, 32, 96, { kind: 'lamp', shadow: [tx * T + 16, (ty + 1) * T - 4, 8, 3] });
    block(tx, ty);
    lights.push({ x: tx * T + 16, y: (ty + 1) * T - 30, r: 112, color: '#ffc870', k: 1, lamp: true, halo: [tx * T + 16, (ty + 1) * T - 76] });
  };
  const building = (kind, bx0, by0, extra = {}) => {
    add({ key: `bld:${kind}`, kind: 'building', x: bx0 * T, y: by0 * T, w: 256, h: 192, sortY: (by0 + 6) * T - 2, building: kind });
    block(bx0, by0, bx0 + 7, by0 + 5);
    return { doorX: bx0 + 3, doorY: by0 + 5, ...extra };
  };

  // ---------------------------------------------------------------------------
  // Terrain: square, streets, Beach Road, beach, sea, pier
  // ---------------------------------------------------------------------------
  fill(0, 43, W - 1, 46, GROUND.SAND);
  fill(0, 47, W - 1, H - 1, GROUND.WATER);
  for (let x = 0; x < W; x++) {
    const h = hash(x, 0, 77);
    if (h < 0.3) tiles[idx(x, 47)] = GROUND.SAND;
    else if (h > 0.82 && x > 3 && x < W - 4 && (x < 29 || x > 34)) tiles[idx(x, 46)] = GROUND.WATER;
  }
  fill(SQ.x0, SQ.y0, SQ.x1, SQ.y1, GROUND.COBBLE);
  fill(5, ROAD.y0, W - 6, ROAD.y1, GROUND.COBBLE);
  fill(VX + 1, ROAD.y1 + 1, VX + 2, 52, GROUND.PLANK);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (tiles[idx(x, y)] === GROUND.WATER) block(x, y);

  // Forest border: top, left and right edges down to the beach.
  for (let x = 0; x < W; x++) block(x, 0, x, 1);
  for (let y = 0; y <= 42; y++) { block(0, y, 1, y); block(W - 2, y, W - 1, y); }
  for (let x = 1; x < W; x += 3) tree(x, 1, (x / 3) % 3 === 1 ? 'pine' : 'oak', x % 2);
  for (let x = 2; x < W; x += 3) tree(x, 0, 'pine', (x >> 1) % 2);
  for (let y = 4; y <= 40; y += 3) { tree(0, y, y % 2 ? 'oak' : 'pine', y % 3 === 0 ? 1 : 0, 16); tree(W - 1, y, y % 2 ? 'pine' : 'oak', y % 3 === 0 ? 0 : 1, (W - 1) * T + 16); }

  // ---------------------------------------------------------------------------
  // Streets and districts
  // ---------------------------------------------------------------------------
  const placed = [];
  const bySlot = {};
  for (const d of DISTRICTS) {
    let slot = SLOT_ALIAS[d.slot] || d.slot;
    if (!ARMS[slot] || bySlot[slot]) slot = ['n', 'e', 'w', 's'].find((s) => !bySlot[s]);
    if (!slot) continue; // more than four districts: the extras only show on the classic site
    bySlot[slot] = d;
  }

  // Tile helpers for an arm: `t` counts tiles out from the square, `c` across the street (0-3).
  const at = (arm, t, c) => (arm.axis === 'v' ? [arm.cross + c, arm.start + arm.dir * t] : [arm.start + arm.dir * t, arm.cross + c]);
  const rectOf = (arm, t0, t1, c0, c1) => {
    const [ax, ay] = at(arm, t0, c0), [bx, by] = at(arm, t1, c1);
    return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
  };

  for (const [slot, arm] of Object.entries(ARMS)) {
    const d = bySlot[slot];
    if (!d) continue;
    const lots = d.lots.slice(0, 8);
    const pairs = Math.max(1, Math.ceil(lots.length / 2));
    const lastT = 4 + 3 * (pairs - 1);
    const endT = slot === 's' ? ROAD.y0 - arm.start - 1 : lastT + (arm.axis === 'v' ? 2 : 10);
    // the street itself
    const [sx0, sy0, sx1, sy1] = rectOf(arm, 0, endT, 0, 3);
    fill(sx0, sy0, sx1, sy1, GROUND.COBBLE);
    clearFlowers(sx0 - 2, sy0 - 2, sx1 + 2, sy1 + 2);

    // displays: lot i goes in pair i/2, on side i%2 (left/top first)
    d._placed = [];
    lots.forEach((lot, i) => {
      const p = Math.floor(i / 2), side = i % 2;
      const t0 = 3 + 3 * p;
      const [x0, y0, x1, y1] = rectOf(arm, t0, t0 + 1, side ? 4 : -2, side ? 5 : -1);
      const code = d.short[0].toUpperCase() + (i + 1);
      const o = sprite(`prop:${lot.sprite || 'generic'}`, x0, y1, 64, 64, { kind: 'prop', lot, district: d, code, shadow: [x0 * T + 32, (y1 + 1) * T - 5, 26, 6] });
      block(x0, y0, x1, y1);
      const it = { id: `lot:${lot.id}`, kind: 'lot', lot, district: d, code, x: x0 * T, y: y0 * T, w: 64, h: 64, label: lot.title, obj: o };
      interact.push(it); d._placed.push(it); placed.push(it);
      if (lot.sprite === 'secondbrain') lights.push({ x: x0 * T + 32, y: y0 * T + 14, r: 70, color: '#ff8fd0', k: 0.7 });
      if (lot.sprite === 'keyreplay') lights.push({ x: x0 * T + 32, y: y0 * T + 30, r: 56, color: '#b48cff', k: 0.6 });
    });

    // entrance marker: an arch across north/south streets, a name board beside east/west ones
    let door;
    if (arm.axis === 'v') {
      const [, ey] = at(arm, 0, 0);
      add({ key: `arch:${d.name}`, kind: 'arch', text: d.name, color: d.color, x: (VX - 1) * T, y: (ey + 1) * T - 96, w: 192, h: 96, sortY: (ey + 1) * T - 1, wide: true });
      block(VX - 1, ey); block(VX + 4, ey);
      interact.push({ id: `sign:${d.id}`, kind: 'areaSign', district: d, x: (VX - 1) * T, y: ey * T, w: T, h: T, label: `${d.name} arch` });
    } else {
      const [x0, , x1, y1] = rectOf(arm, 0, 2, -1, -1);
      sprite(`board:${d.name}`, x0, y1, 112, 72, { kind: 'board', text: d.name, color: d.color });
      block(x0, y1, x1, y1);
      interact.push({ id: `sign:${d.id}`, kind: 'areaSign', district: d, x: x0 * T, y: y1 * T, w: 3 * T, h: T, label: `${d.name} sign` });
    }
    // the district building at the end of the street (ML Lab sits on Beach Road)
    if (slot === 'n') {
      const [, by] = at(arm, lastT + 2, 0);
      door = building(d.building || 'school', VX - 2, by - 6);
    } else if (slot === 'e' || slot === 'w') {
      const [bx] = at(arm, lastT + 2, 0);
      door = building(d.building || 'code', slot === 'e' ? bx : bx - 7, HY - 6);
    } else {
      door = building(d.building || 'lab', VX + 8, ROAD.y0 - 6);
    }
    interact.push({ id: `door:${d.id}`, kind: 'door', district: d, x: door.doorX * T, y: door.doorY * T, w: 2 * T, h: T, label: d.name });
    // lamps along the street edges, between display pairs
    // lamps only at the far end of the street, where they can't stand in front of a display
    for (const c of [-1, 4]) { const [lx, ly] = at(arm, Math.max(lastT + 2, endT - 1), c); lamp(lx, ly); }

    const [gx, gy] = at(arm, 1, 1);
    d._gate = { x: (gx + (arm.axis === 'v' ? 1 : 0)) * T, y: gy * T + (arm.axis === 'v' ? 24 : 32), dir: { n: 'up', s: 'down', e: 'right', w: 'left' }[slot] };
    const [ax0, ay0, ax1, ay1] = rectOf(arm, 0, endT, -3, 6);
    const label = slot === 's' ? [VX + 12, ROAD.y0 - 7] : [door.doorX + 1, door.doorY - 6.4];
    areas.push({ id: slot, kind: 'district', district: d, name: d.name, color: d.color, slot, x0: ax0, y0: ay0, x1: ax1, y1: ay1, label });
  }
  // ML Lab's building on Beach Road counts as the lab district too
  if (bySlot.s) areas.push({ id: 's2', kind: 'district', district: bySlot.s, name: bySlot.s.name, color: bySlot.s.color, x0: VX + 6, y0: ROAD.y0 - 7, x1: VX + 17, y1: ROAD.y0 - 1 });

  // ---------------------------------------------------------------------------
  // Town Square
  // ---------------------------------------------------------------------------
  sprite('fountain', VX, SQ.y0 + 5, 128, 96, { kind: 'fountain', anim: 'fountain' });
  block(VX, SQ.y0 + 4, VX + 3, SQ.y0 + 5);
  interact.push({ id: 'fountain', kind: 'fountain', x: VX * T, y: (SQ.y0 + 4) * T, w: 4 * T, h: 2 * T, label: 'Fountain' });
  lights.push({ x: (VX + 2) * T, y: (SQ.y0 + 4) * T + 16, r: 90, color: '#9fd8ff', k: 0.45 });
  sprite('welcome', SQ.x0, SQ.y0 + 1, 112, 72, { kind: 'welcome' });
  block(SQ.x0, SQ.y0 + 1, SQ.x0 + 3, SQ.y0 + 1);
  interact.push({ id: 'welcome', kind: 'welcome', x: SQ.x0 * T, y: (SQ.y0 + 1) * T, w: 4 * T, h: T, label: 'Welcome sign' });
  sprite('board', SQ.x1 - 1, SQ.y0 + 1, 64, 80, { kind: 'board' });
  block(SQ.x1 - 1, SQ.y0 + 1, SQ.x1, SQ.y0 + 1);
  interact.push({ id: 'board', kind: 'board', x: (SQ.x1 - 1) * T, y: (SQ.y0 + 1) * T, w: 2 * T, h: T, label: 'Quest board' });
  sprite('signpost', SQ.x0 + 1, SQ.y1 - 1, 64, 96, { kind: 'signpost' });
  block(SQ.x0 + 1, SQ.y1 - 1, SQ.x0 + 2, SQ.y1 - 1);
  interact.push({ id: 'signpost', kind: 'signpost', x: (SQ.x0 + 1) * T, y: (SQ.y1 - 1) * T, w: 2 * T, h: T, label: 'Signpost' });
  sprite('bench', SQ.x1 - 2, SQ.y1 - 1, 64, 48, { kind: 'bench' });
  block(SQ.x1 - 2, SQ.y1 - 1, SQ.x1 - 1, SQ.y1 - 1);
  interact.push({ id: 'bench:sq', kind: 'bench', x: (SQ.x1 - 2) * T, y: (SQ.y1 - 1) * T, w: 2 * T, h: T, label: 'Bench' });
  for (const [px, py] of [[SQ.x0, SQ.y0 + 3], [SQ.x1, SQ.y0 + 3], [SQ.x0, SQ.y1 - 3], [SQ.x1, SQ.y1 - 3]]) { sprite('planter', px, py, 32, 32); block(px, py); }
  for (const [x, y] of [[SQ.x0, SQ.y0], [SQ.x1, SQ.y0 + 2], [SQ.x0, SQ.y1], [SQ.x1, SQ.y1]]) lamp(x, y);

  // ---------------------------------------------------------------------------
  // Beach Road: Aaran's house (west of the south street) and the beach
  // ---------------------------------------------------------------------------
  const house = building('house', VX - 12, ROAD.y0 - 6);
  interact.push({ id: 'house', kind: 'house', x: house.doorX * T, y: house.doorY * T, w: 2 * T, h: T, label: "Aaran's House" });
  sprite('mailbox', VX - 13, ROAD.y0 - 1, 32, 64, { kind: 'mailbox' });
  block(VX - 13, ROAD.y0 - 1);
  interact.push({ id: 'mailbox', kind: 'mailbox', x: (VX - 13) * T, y: (ROAD.y0 - 1) * T, w: T, h: T, label: 'Mailbox' });
  sprite('bin', VX - 4, ROAD.y0 - 1, 64, 48);
  block(VX - 4, ROAD.y0 - 1, VX - 3, ROAD.y0 - 1);
  interact.push({ id: 'bin', kind: 'bin', x: (VX - 4) * T, y: (ROAD.y0 - 1) * T, w: 2 * T, h: T, label: 'Shipping bin' });
  // field and chickens west of the house
  const fx0 = 4, fy0 = ROAD.y0 - 8;
  fill(fx0, fy0, fx0 + 5, fy0 + 3, GROUND.SOIL);
  for (let y = fy0; y <= fy0 + 3; y++) for (let x = fx0; x <= fx0 + 5; x++) { sprite('crop', x, y, 32, 32, { kind: 'crop' }); block(x, y); }
  interact.push({ id: 'field', kind: 'field', x: fx0 * T, y: fy0 * T, w: 6 * T, h: 4 * T, label: 'Field' });
  const chickens = { x0: fx0, y0: fy0 + 5, x1: VX - 14, y1: ROAD.y0 - 1 };
  areas.push({ id: 'home', kind: 'home', name: "Aaran's House", color: '#c9763a', x0: 2, y0: SQ.y1 + 1, x1: VX - 3, y1: ROAD.y0 - 1, chickens, label: [VX - 8, ROAD.y0 - 6.6] });
  for (const x of [8, 20, 40, 52]) lamp(x, ROAD.y1 + 1);
  lamp(VX + 2, 50);

  sprite('campfire', VX - 6, 44, 32, 32, { kind: 'campfire', anim: 'campfire' });
  block(VX - 6, 44);
  interact.push({ id: 'campfire', kind: 'campfire', x: (VX - 6) * T, y: 44 * T, w: T, h: T, label: 'Campfire' });
  lights.push({ x: (VX - 6) * T + 16, y: 44 * T + 16, r: 130, color: '#ff9a4a', k: 1, flicker: true });
  for (const x of [VX - 9, VX - 4]) { sprite('log', x, 45, 64, 32); block(x, 45, x + 1, 45); }
  for (const [x, y, v] of [[10, 44, 0], [46, 45, 1], [55, 43, 0], [18, 46, 1], [60, 45, 0]]) { sprite(`rock${v}`, x, y, 32, 32); block(x, y); }
  for (let k = 0; k < 16; k++) {
    const x = 3 + ((R() * (W - 6)) | 0), y = 44 + ((R() * 3) | 0);
    if (solid[idx(x, y)] || tiles[idx(x, y)] !== GROUND.SAND || (x >= VX && x <= VX + 3)) continue;
    sprite(`shell${k % 2}`, x, y, 16, 16, { dx: (R() * 12) | 0, dy: -((R() * 12) | 0) });
  }
  interact.push({ id: 'pierEnd', kind: 'pier', x: (VX + 1) * T, y: 52 * T, w: 2 * T, h: T, label: 'End of the pier' });

  // ---------------------------------------------------------------------------
  // Corners: Pond Park (north-east) and an orchard (north-west)
  // ---------------------------------------------------------------------------
  const pk = { x0: SQ.x1 + 3, x1: W - 3, y0: 2, y1: HY - 7 };
  const cx = (pk.x0 + pk.x1) / 2 + 0.5, cy = pk.y0 + 6;
  for (let y = pk.y0 + 1; y <= pk.y1; y++) for (let x = pk.x0; x <= pk.x1; x++) {
    const nx = (x + 0.5 - cx) / 7, ny = (y + 0.5 - cy) / 3.7;
    if (nx * nx + ny * ny < 1) { tiles[idx(x, y)] = GROUND.WATER; block(x, y); }
  }
  const dockX = Math.floor(cx) - 1;
  fill(dockX, cy + 1, dockX + 1, cy + 4, GROUND.PLANK);
  for (let y = cy + 1; y <= cy + 4; y++) { solid[idx(dockX, y)] = 0; solid[idx(dockX + 1, y)] = 0; }
  interact.push({ id: 'dock', kind: 'dock', x: dockX * T, y: (cy + 1) * T, w: 2 * T, h: T, label: 'Dock' });
  const Rl = rng(99);
  for (let k = 0; k < 9; k++) {
    const ang = Rl() * Math.PI * 2, rr = 0.35 + Rl() * 0.5;
    lily.push([Math.round((cx + Math.cos(ang) * 7 * rr) * T), Math.round((cy + Math.sin(ang) * 3.7 * rr) * T), k % 3 === 0]);
  }
  for (const [x, y] of [[cx - 6, cy + 1.4], [cx + 5.4, cy + 1.6], [cx - 3.5, cy - 3], [cx + 3.6, cy - 3.1]]) sprite('cattail', Math.floor(x), Math.floor(y), 32, 48);
  for (const bx of [pk.x0 + 1, pk.x1 - 2]) { sprite('bench', bx, pk.y1 - 1, 64, 48, { kind: 'bench' }); block(bx, pk.y1 - 1, bx + 1, pk.y1 - 1); interact.push({ id: `bench:${bx}`, kind: 'bench', x: bx * T, y: (pk.y1 - 1) * T, w: 2 * T, h: T, label: 'Bench' }); }
  sprite('soon', pk.x0 + 4, pk.y1 - 1, 64, 64, { kind: 'soon' });
  block(pk.x0 + 4, pk.y1 - 2, pk.x0 + 5, pk.y1 - 1);
  interact.push({ id: 'soon', kind: 'soon', x: (pk.x0 + 4) * T, y: (pk.y1 - 2) * T, w: 2 * T, h: 2 * T, label: 'Coming soon' });
  areas.push({ id: 'park', kind: 'park', name: 'Pond Park', color: '#46a0c8', ...pk });

  for (const ty of [5, 10]) for (let tx = 4; tx <= SQ.x0 - 4; tx += 4) tree(tx, ty, 'oak', (tx + ty) % 3);
  areas.push({ id: 'orchard', kind: 'orchard', name: 'The Orchard', color: '#5a9a3a', x0: 2, y0: 2, x1: SQ.x0 - 3, y1: HY - 7 });
  // trees dotted around the south-east corner
  for (const [x, y] of [[SQ.x1 + 14, SQ.y1 + 2], [SQ.x1 + 19, SQ.y1 + 4], [W - 4, SQ.y1 + 1]]) if (!solid[idx(x, y)]) tree(x, y, 'oak', (x + y) % 3);

  // Named places for the location banner (checked in order, after the districts).
  areas.push({ id: 'square', name: 'Town Square', color: '#9a8f86', kind: 'square', ...SQ, label: [VX + 2, SQ.y1 - 0.5] });
  areas.push({ id: 'road', name: 'Beach Road', color: '#9a8f86', kind: 'road', x0: 0, y0: ROAD.y0, x1: W - 1, y1: ROAD.y1 });
  areas.push({ id: 'beach', name: 'The Beach', color: '#e5c48e', kind: 'beach', x0: 0, y0: ROAD.y1 + 1, x1: W - 1, y1: H - 1 });

  // Tall grass tufts on open grass, away from streets.
  for (let k = 0; k < 1200 && tufts.length < 120; k++) {
    const x = 2 + ((R() * (W - 4)) | 0), y = 2 + ((R() * 40) | 0);
    if (solid[idx(x, y)] || tiles[idx(x, y)] !== GROUND.GRASS || noFlowers.has(`${x},${y}`)) continue;
    const near = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => tiles[idx(x + dx, y + dy)] !== GROUND.GRASS);
    if (near && R() < 0.7) continue;
    tufts.push({ x: x * T + ((R() * 10) | 0) - 5, y: y * T + ((R() * 10) | 0), phase: R() * 6.28, rustle: 0 });
  }

  const spawn = { x: (VX + 2) * T, y: (SQ.y0 + 7) * T + 26, dir: 'up' };
  const petSpawn = { x: (VX + 4) * T + 16, y: (SQ.y0 + 7) * T + 24 };
  return {
    W, H, T, tiles, solid, objects, interact, areas, lights, tufts, placed, bySlot,
    decals: { lilypads: lily, clear: noFlowers }, spawn, petSpawn, chickens,
  };
}
