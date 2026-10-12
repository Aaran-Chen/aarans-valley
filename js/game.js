// The engine: pixel-perfect scaling, camera, movement with corner sliding,
// click-to-walk pathfinding, y-sorted drawing, a real-time day/night cycle
// with lamps and lit windows, seasonal particles, and the little NPCs.
import { GROUND } from './art-nature.js';
import { hash, RES } from './art-core.js';

const T = 32;
const DIRS = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
const RUN = 230, WALK = 120; // art px per second (about 7 and 4 tiles a second)
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};

// Time-of-day keyframes: minute, multiply colour, how strongly lights show.
const SKY = [
  [0, [84, 96, 164], 1], [300, [84, 96, 164], 1], [360, [236, 190, 184], 0.45], [420, [255, 255, 255], 0],
  [1020, [255, 255, 255], 0], [1110, [255, 222, 186], 0.12], [1170, [178, 138, 196], 0.65], [1230, [84, 96, 164], 1], [1440, [84, 96, 164], 1],
];
export const TIME_PRESETS = { day: 720, sunset: 1140, night: 1320 };

export class Game {
  constructor({ canvas, world, assets, hooks = {} }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.buf = document.createElement('canvas');
    this.bctx = this.buf.getContext('2d');
    this.light = document.createElement('canvas');
    this.lctx = this.light.getContext('2d');
    this.world = world;
    this.assets = assets;
    this.hooks = hooks;
    this.keys = new Set();
    this.keyOrder = [];
    this.zoom = 1;
    this.timeMode = 'real';
    this.paused = false;
    this.t = 0;
    this.particles = [];
    this.fade = 0; this.fadeDir = 0; this.fadeThen = null;
    this.shadowCache = new Map();
    this.mailFlag = false;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sp = world.spawn;
    this.player = { x: sp.x, y: sp.y, dir: sp.dir, moving: false, frame: 0, animT: 0, hold: 0, holdIcon: null, path: null, onArrive: null, lastStep: 0 };
    this.pet = { x: world.petSpawn.x, y: world.petSpawn.y, dir: 'down', frame: 0, animT: 0, moving: false, blinkT: 2 };
    this.trail = [];
    this.chickens = [];
    const cb = world.chickens;
    if (cb) for (let i = 0; i < 3; i++) this.chickens.push({ x: (cb.x0 + 1 + i * 1.5) * T, y: (cb.y0 + 1 + (i % 2) * 2) * T + 20, dir: i % 2 ? 'left' : 'right', state: 'idle', timer: 1 + i, tx: 0, ty: 0, frame: 0, brown: i === 1 });
    this.cam = { x: 0, y: 0 };
    this.target = null;
    this.hover = null;
    this.lastArea = undefined;
    this.resize();
    this.snapCamera();
    this.bindInput();
  }

  // -------------------------------------------------------------------------
  // Scale: one art pixel = s device pixels, always an integer.
  // -------------------------------------------------------------------------
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const vw = window.innerWidth, vh = window.innerHeight;
    const tileCss = Math.max(34, Math.min(64, Math.min(vw, vh) / 11)) * this.zoom;
    // a = device pixels per stored art pixel (whole number), s = device pixels per logical pixel
    const a = Math.max(1, Math.round((tileCss * dpr) / (T * RES)));
    const s = a * RES;
    this.s = s; this.a = a; this.dpr = dpr;
    this.canvas.width = Math.round(vw * dpr);
    this.canvas.height = Math.round(vh * dpr);
    this.buf.width = Math.ceil(this.canvas.width / a);
    this.buf.height = Math.ceil(this.canvas.height / a);
    this.light.width = this.buf.width; this.light.height = this.buf.height;
    this.cssPx = s / dpr;
    // the interface keeps its size when the world is zoomed
    const baseCss = Math.max(34, Math.min(64, Math.min(vw, vh) / 11));
    const uiS = Math.max(1, Math.round((baseCss * dpr) / (T * RES))) * RES;
    this.hooks.onScale?.(uiS, dpr);
  }
  setZoom(z) { this.zoom = Math.max(0.6, Math.min(1.8, z)); this.resize(); this.snapCamera(); }

  // -------------------------------------------------------------------------
  // Collision
  // -------------------------------------------------------------------------
  solidAt(tx, ty) {
    const { W, H, solid } = this.world;
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
    return solid[ty * W + tx] === 1;
  }
  free(x, y) {
    const x0 = Math.floor((x - 9) / T), x1 = Math.floor((x + 8) / T);
    const y0 = Math.floor((y - 9) / T), y1 = Math.floor((y - 1) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.solidAt(tx, ty)) return false;
    return true;
  }
  move(dx, dy) {
    const p = this.player;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 3));
    const sx = dx / steps, sy = dy / steps;
    let moved = false;
    for (let i = 0; i < steps; i++) {
      if (sx) {
        if (this.free(p.x + sx, p.y)) { p.x += sx; moved = true; }
        else if (!sy) moved = this.nudge('y', sx) || moved;
      }
      if (sy) {
        if (this.free(p.x, p.y + sy)) { p.y += sy; moved = true; }
        else if (!sx) moved = this.nudge('x', sy) || moved;
      }
    }
    return moved;
  }
  // Slide around corners when a move is only slightly blocked.
  nudge(axis, d) {
    const p = this.player;
    for (let k = 1; k <= 12; k++) {
      for (const sgn of [-1, 1]) {
        const ox = axis === 'x' ? sgn * k : 0, oy = axis === 'y' ? sgn * k : 0;
        if (this.free(p.x + ox + (axis === 'y' ? d : 0), p.y + oy + (axis === 'x' ? d : 0)) && this.free(p.x + Math.sign(ox) * 1.5, p.y + Math.sign(oy) * 1.5)) {
          p.x += Math.sign(ox) * 1.5; p.y += Math.sign(oy) * 1.5;
          return true;
        }
      }
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Pathfinding (Dijkstra over tiles, 8-way without cutting corners)
  // -------------------------------------------------------------------------
  pathTo(goals) {
    const { W, H } = this.world;
    const start = Math.floor(this.player.y / T - 0.01) * W + Math.floor(this.player.x / T);
    const goalSet = new Set(goals.map(([x, y]) => y * W + x));
    if (goalSet.has(start)) return [start];
    // Float64: float32 rounding would make fresh heap entries look stale and skip them.
    const dist = new Float64Array(W * H).fill(Infinity), prev = new Int32Array(W * H).fill(-1);
    const heap = [];
    const push = (n, d) => { heap.push([d, n]); let i = heap.length - 1; while (i > 0) { const pi = (i - 1) >> 1; if (heap[pi][0] <= heap[i][0]) break; [heap[pi], heap[i]] = [heap[i], heap[pi]]; i = pi; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    dist[start] = 0; push(start, 0);
    let found = -1;
    while (heap.length) {
      const [d, n] = pop();
      if (d > dist[n]) continue;
      if (goalSet.has(n)) { found = n; break; }
      const x = n % W, y = (n / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (this.solidAt(nx, ny)) continue;
        if (dx && dy && (this.solidAt(x + dx, y) || this.solidAt(x, y + dy))) continue;
        const nd = d + (dx && dy ? 1.414 : 1);
        const m = ny * W + nx;
        if (nd < dist[m]) { dist[m] = nd; prev[m] = n; push(m, nd); }
      }
    }
    if (found < 0) return null;
    const out = [];
    for (let n = found; n !== -1; n = prev[n]) out.push(n);
    return out.reverse();
  }
  walkPath(nodes, onArrive = null) {
    if (!nodes) return false;
    const { W } = this.world;
    this.player.path = nodes.slice(1).map((n) => ({ x: (n % W) * T + 16, y: ((n / W) | 0) * T + 24 }));
    this.player.onArrive = onArrive;
    if (!this.player.path.length) { this.player.path = null; onArrive?.(); }
    return true;
  }
  approachTiles(it) {
    const x0 = Math.floor(it.x / T), y0 = Math.floor(it.y / T), x1 = Math.floor((it.x + it.w - 1) / T), y1 = Math.floor((it.y + it.h - 1) / T);
    const out = [];
    for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
      const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;
      const corner = (x < x0 || x > x1) && (y < y0 || y > y1);
      if (!inside && !corner && !this.solidAt(x, y)) out.push([x, y]);
    }
    return out;
  }
  // Walk up to an interactable, face it, then call back.
  walkTo(it, then) {
    const goals = this.approachTiles(it);
    const path = goals.length ? this.pathTo(goals) : null;
    if (!path) return false;
    return this.walkPath(path, () => { this.face(it.x + it.w / 2, it.y + it.h / 2); then?.(); });
  }
  walkToPoint(wx, wy) {
    let tx = Math.floor(wx / T), ty = Math.floor(wy / T);
    if (this.solidAt(tx, ty)) {
      let best = null;
      for (let r = 1; r <= 2 && !best; r++) for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) if (!this.solidAt(x, y) && !best) best = [x, y];
      if (!best) return false;
      [tx, ty] = best;
    }
    const ok = this.walkPath(this.pathTo([[tx, ty]]));
    if (ok) this.particles.push({ kind: 'mark', x: tx * T + 16, y: ty * T + 24, life: 0.6, max: 0.6 });
    return ok;
  }
  face(cx, cy) {
    const p = this.player, dx = cx - p.x, dy = cy - (p.y - 8);
    p.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
  }

  // -------------------------------------------------------------------------
  // Warps (with a fade), used by the map and the district hotkeys
  // -------------------------------------------------------------------------
  warp(x, y, dir = 'down', then = null) {
    const go = () => {
      this.player.x = x; this.player.y = y; this.player.dir = dir; this.player.path = null;
      this.pet.x = x + 28; this.pet.y = y; this.trail = [];
      this.snapCamera();
      then?.();
    };
    if (this.reducedMotion) { go(); return; }
    this.fadeDir = 1; this.fadeThen = go;
  }
  warpTo(it) {
    // land on the street side of the thing (cobbles first), facing it
    const all = this.approachTiles(it);
    const { W, tiles } = this.world;
    const onStreet = all.filter(([x, y]) => tiles[y * W + x] === GROUND.COBBLE);
    const below = all.filter(([, y]) => y > Math.floor((it.y + it.h - 1) / T));
    const [tx, ty] = onStreet[Math.floor(onStreet.length / 2)] || below[0] || all[0] || [Math.floor(it.x / T), Math.floor(it.y / T) + 2];
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2, dx = cx - (tx * T + 16), dy = cy - (ty * T + 16);
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    this.warp(tx * T + 16, ty * T + 24, dir);
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------
  bindInput() {
    addEventListener('keydown', (e) => {
      const d = KEYMAP[e.code];
      if (!d || this.paused || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      this.keys.add(e.code);
      this.keyOrder = this.keyOrder.filter((k) => k !== e.code); this.keyOrder.push(e.code);
      this.player.path = null;
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); this.keyOrder = this.keyOrder.filter((k) => k !== e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.keyOrder = []; });
    const toWorld = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return [(e.clientX - r.left) * this.dpr / this.s + Math.round(this.cam.x), (e.clientY - r.top) * this.dpr / this.s + Math.round(this.cam.y)];
    };
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.paused) return;
      const [wx, wy] = toWorld(e);
      this.hover = this.pick(wx, wy);
      this.canvas.style.cursor = this.hover ? 'var(--cursor-hand)' : 'var(--cursor-arrow)';
      this.hooks.onHover?.(this.hover, e.clientX, e.clientY);
    });
    this.canvas.addEventListener('pointerleave', () => { this.hover = null; this.hooks.onHover?.(null); });
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.paused || e.button > 0) return;
      this.hooks.onUserGesture?.();
      const [wx, wy] = toWorld(e);
      const it = this.pick(wx, wy);
      if (it) {
        const near = this.target === it || this.distTo(it) < 20;
        if (near) { this.face(it.x + it.w / 2, it.y + it.h / 2); this.hooks.onInteract?.(it); }
        else this.walkTo(it, () => this.hooks.onInteract?.(it));
      } else this.walkToPoint(wx, wy);
    });
  }
  // What's under a world point: interactables by sprite bounds, plus the pet and chickens.
  pick(wx, wy) {
    const pt = this.pet;
    if (Math.abs(wx - pt.x) < 14 && wy > pt.y - 30 && wy < pt.y + 2) return this.petTarget();
    for (const c of this.chickens) if (Math.abs(wx - c.x) < 13 && wy > c.y - 26 && wy < c.y + 2) return { id: 'chicken', kind: 'chicken', ref: c, x: c.x - 10, y: c.y - 20, w: 20, h: 20, label: 'Chicken' };
    let best = null;
    for (const it of this.world.interact) {
      const o = it.obj;
      const top = o ? o.y : it.y - (it.kind === 'lot' ? 0 : 24);
      if (wx >= it.x - 2 && wx <= it.x + it.w + 2 && wy >= top && wy <= it.y + it.h + 2) best = it;
    }
    return best;
  }
  petTarget() { const pt = this.pet; return { id: 'pet', kind: 'pet', x: pt.x - 12, y: pt.y - 20, w: 24, h: 20, label: this.hooks.petName || 'Robot' }; }
  distTo(it) {
    const p = this.player;
    const cx = Math.max(it.x, Math.min(p.x, it.x + it.w)), cy = Math.max(it.y, Math.min(p.y - 4, it.y + it.h));
    return Math.hypot(p.x - cx, p.y - 4 - cy);
  }
  // The thing in front of the player (for the keyboard and the "!" bubble).
  findTarget() {
    const p = this.player, [dx, dy] = DIRS[p.dir];
    const px = p.x + dx * 18, py = p.y - 6 + dy * 18;
    const pet = this.pet;
    if (Math.hypot(pet.x - px, pet.y - 8 - py) < 18) return this.petTarget();
    for (const c of this.chickens) if (Math.hypot(c.x - px, c.y - 8 - py) < 16) return { id: 'chicken', kind: 'chicken', ref: c, x: c.x - 10, y: c.y - 20, w: 20, h: 20, label: 'Chicken' };
    let best = null, bd = 1e9;
    for (const it of this.world.interact) {
      const inside = px >= it.x - 4 && px <= it.x + it.w + 4 && py >= it.y - 4 && py <= it.y + it.h + 4;
      if (inside) return it;
      const d = this.distTo(it);
      const cx = it.x + it.w / 2 - p.x, cy = it.y + it.h / 2 - (p.y - 6);
      const facing = cx * dx + cy * dy > 0;
      if (d < 10 && facing && d < bd) { bd = d; best = it; }
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------
  update(dt) {
    this.t += dt;
    const p = this.player;
    if (this.fadeDir) {
      this.fade += this.fadeDir * dt * 4;
      if (this.fade >= 1) { this.fade = 1; this.fadeDir = -1; const f = this.fadeThen; this.fadeThen = null; f?.(); }
      if (this.fade <= 0) { this.fade = 0; this.fadeDir = 0; }
    }
    if (p.hold > 0) p.hold -= dt;

    let ix = 0, iy = 0, dirKey = null;
    if (!this.paused && p.hold <= 0) {
      for (const k of this.keys) { const d = KEYMAP[k]; if (!d) continue; ix += DIRS[d][0]; iy += DIRS[d][1]; }
      for (let i = this.keyOrder.length - 1; i >= 0; i--) if (this.keys.has(this.keyOrder[i])) { dirKey = KEYMAP[this.keyOrder[i]]; break; }
      if (!ix && !iy && p.path) {
        const wp = p.path[0];
        const dx = wp.x - p.x, dy = wp.y - p.y, d = Math.hypot(dx, dy);
        if (d < 4) {
          p.path.shift();
          if (!p.path.length) { p.path = null; const cb = p.onArrive; p.onArrive = null; cb?.(); }
        } else { ix = dx / d; iy = dy / d; }
      }
    }
    if (ix || iy) {
      const len = Math.hypot(ix, iy);
      const speed = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? WALK : RUN;
      const moved = this.move((ix / len) * speed * dt, (iy / len) * speed * dt);
      if (dirKey) p.dir = dirKey;
      else p.dir = Math.abs(ix) > Math.abs(iy) + 0.01 ? (ix < 0 ? 'left' : 'right') : (iy < 0 ? 'up' : 'down');
      p.moving = true;
      p.animT += dt * (speed / RUN);
      const f = 1 + (Math.floor(p.animT * 10) % 4);
      if (f !== p.frame && (f === 1 || f === 3) && moved) this.hooks.onStep?.(this.groundAt(p.x, p.y - 2));
      p.frame = f;
      if (!moved && p.path) { p.stuck = (p.stuck || 0) + dt; if (p.stuck > 0.6) { p.path = null; p.stuck = 0; } } else p.stuck = 0;
      if (moved && speed === RUN && this.t - p.lastStep > 0.28 && this.groundAt(p.x, p.y) === GROUND.DIRT) {
        p.lastStep = this.t;
        this.particles.push({ kind: 'dust', x: p.x - DIRS[p.dir][0] * 6, y: p.y - 1, vx: -DIRS[p.dir][0] * 10, vy: -8, life: 0.4, max: 0.4 });
      }
    } else { p.moving = false; p.frame = 0; p.animT = 0; }

    this.updatePet(dt);
    this.updateChickens(dt);
    this.updateTufts(dt);
    this.updateParticles(dt);
    this.updateCamera(dt);

    if (!this.paused) {
      const t = this.findTarget();
      if (t?.id !== this.target?.id) { this.target = t; this.hooks.onTarget?.(t); }
      const a = this.areaAt(p.x, p.y);
      if (a !== this.lastArea) { this.lastArea = a; this.hooks.onArea?.(a); }
    }
  }
  groundAt(x, y) {
    const { W, H, tiles } = this.world;
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    return tx < 0 || ty < 0 || tx >= W || ty >= H ? -1 : tiles[ty * W + tx];
  }
  areaAt(x, y) {
    const tx = Math.floor(x / T), ty = Math.floor((y - 4) / T);
    for (const a of this.world.areas) if (tx >= a.x0 && tx <= a.x1 && ty >= a.y0 && ty <= a.y1) return a;
    return null;
  }

  updatePet(dt) {
    const pt = this.pet, p = this.player;
    this.trail.push([p.x, p.y]);
    if (this.trail.length > 90) this.trail.shift();
    const back = this.trail[Math.max(0, this.trail.length - 22)] || [p.x, p.y];
    const dx = back[0] - pt.x, dy = back[1] - pt.y, d = Math.hypot(dx, dy);
    const gap = Math.hypot(p.x - pt.x, p.y - pt.y);
    if (gap > 420) { pt.x = p.x + 24; pt.y = p.y; }
    if (d > 3 && gap > 30) {
      const sp = Math.min(d * 6, RUN * 1.15);
      pt.x += (dx / d) * sp * dt; pt.y += (dy / d) * sp * dt;
      pt.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      pt.moving = true; pt.animT += dt;
      pt.frame = Math.floor(pt.animT * 8) % 4;
    } else {
      pt.moving = false;
      pt.blinkT -= dt;
      if (pt.blinkT < 0) pt.blinkT = 2.5 + hash(Math.floor(this.t), 0, 5) * 3;
      pt.frame = pt.blinkT < 0.14 && (pt.dir === 'down' || pt.dir === 'left' || pt.dir === 'right') ? 4 : Math.floor(this.t * 1.2) % 4 === 3 ? 3 : 0;
      if (gap < 70 && (pt.dir === 'up')) pt.dir = 'down';
    }
  }

  updateChickens(dt) {
    const cb = this.world.chickens;
    if (!cb) return;
    for (const c of this.chickens) {
      c.timer -= dt;
      if (c.state === 'walk') {
        const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
        if (d < 2 || c.timer < 0) { c.state = 'idle'; c.timer = 1 + hash(c.x | 0, c.y | 0, 3) * 3; }
        else { c.x += (dx / d) * 34 * dt; c.y += (dy / d) * 34 * dt; c.dir = dx < 0 ? 'left' : 'right'; c.frame = Math.floor(this.t * 6) % 2; }
      } else if (c.state === 'peck') {
        c.frame = Math.floor(this.t * 5) % 2 ? 2 : 0;
        if (c.timer < 0) { c.state = 'idle'; c.timer = 0.8; }
      } else {
        c.frame = 0;
        if (c.timer < 0) {
          const r = hash(Math.floor(this.t * 10), c.x | 0, 9);
          if (r < 0.35) { c.state = 'peck'; c.timer = 0.9; }
          else {
            const tx = (cb.x0 + 0.5 + hash(c.x | 0, this.t * 7 | 0, 1) * (cb.x1 - cb.x0)) * T, ty = (cb.y0 + 0.7 + hash(this.t * 13 | 0, c.y | 0, 2) * (cb.y1 - cb.y0)) * T;
            if (!this.solidAt(Math.floor(tx / T), Math.floor(ty / T))) { c.state = 'walk'; c.tx = tx; c.ty = ty; c.timer = 4; }
            else c.timer = 0.5;
          }
        }
      }
    }
  }

  updateTufts(dt) {
    const p = this.player;
    for (const tf of this.world.tufts) {
      if (tf.rustle > 0) tf.rustle -= dt;
      else if (p.moving && Math.abs(tf.x + 16 - p.x) < 14 && Math.abs(tf.y + 28 - p.y) < 10) tf.rustle = 0.45;
    }
  }

  updateCamera(dt, snap = false) {
    const vw = this.buf.width / RES, vh = this.buf.height / RES, mw = this.world.W * T, mh = this.world.H * T;
    let tx = this.player.x - vw / 2, ty = this.player.y - 36 - vh / 2;
    tx = mw <= vw ? (mw - vw) / 2 : Math.max(0, Math.min(mw - vw, tx));
    ty = mh <= vh ? (mh - vh) / 2 : Math.max(0, Math.min(mh - vh, ty));
    if (snap) { this.cam.x = tx; this.cam.y = ty; return; }
    const k = 1 - Math.exp(-9 * dt);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
  }
  snapCamera() { this.updateCamera(0, true); }

  // -------------------------------------------------------------------------
  // Time of day
  // -------------------------------------------------------------------------
  minutes() {
    if (this.timeMode !== 'real') return TIME_PRESETS[this.timeMode] ?? 720;
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  }
  sky() {
    const m = this.minutes() % 1440;
    for (let i = 0; i < SKY.length - 1; i++) {
      const [m0, c0, k0] = SKY[i], [m1, c1, k1] = SKY[i + 1];
      if (m >= m0 && m <= m1) {
        const t = (m - m0) / Math.max(1, m1 - m0);
        return { c: c0.map((v, j) => Math.round(v + (c1[j] - v) * t)), k: k0 + (k1 - k0) * t };
      }
    }
    return { c: [255, 255, 255], k: 0 };
  }

  // -------------------------------------------------------------------------
  // Particles
  // -------------------------------------------------------------------------
  updateParticles(dt) {
    const season = this.assets.season, vw = this.buf.width, vh = this.buf.height;
    const cx = this.cam.x, cy = this.cam.y;
    const night = this.sky().k;
    if (!this.reducedMotion) {
      const rate = season === 'fall' ? 3 : season === 'winter' ? 14 : season === 'spring' ? 2.2 : 0;
      if (Math.random() < rate * dt) {
        this.particles.push({ kind: season === 'winter' ? 'snow' : season === 'fall' ? 'leaf' : 'petal', x: cx + Math.random() * vw * 1.2 - vw * 0.1, y: cy - 10, vx: season === 'winter' ? -4 : -14, vy: season === 'winter' ? 22 : 18, life: 14, max: 14, seed: Math.random() * 6, c: Math.floor(Math.random() * 4) });
      }
      if (season === 'summer' && night > 0.5 && Math.random() < 1.5 * dt) {
        this.particles.push({ kind: 'firefly', x: cx + Math.random() * vw, y: cy + Math.random() * vh, vx: 0, vy: 0, life: 6, max: 6, seed: Math.random() * 6 });
      }
      for (const o of this.world.objects) {
        if (o.kind !== 'building') continue;
        const m = this.assets.meta.get(o.key);
        if (!m || !m.smoke.length || o.x > cx + vw + 64 || o.x + o.w < cx - 64 || o.y > cy + vh || o.y + o.h < cy - 120) continue;
        for (const [sx, sy] of m.smoke) if (Math.random() < 2.2 * dt) this.particles.push({ kind: 'smoke', x: o.x + sx + (Math.random() - 0.5) * 4, y: o.y + sy, vx: 4 + Math.random() * 3, vy: -14, life: 2.6, max: 2.6 });
      }
    }
    for (const q of this.particles) {
      q.life -= dt;
      if (q.kind === 'leaf' || q.kind === 'petal') { q.x += (q.vx + Math.sin(this.t * 2 + q.seed) * 16) * dt; q.y += q.vy * dt; }
      else if (q.kind === 'snow') { q.x += (q.vx + Math.sin(this.t + q.seed) * 8) * dt; q.y += q.vy * dt; }
      else if (q.kind === 'firefly') { q.x += Math.sin(this.t * 0.9 + q.seed) * 10 * dt; q.y += Math.cos(this.t * 0.7 + q.seed * 2) * 8 * dt; }
      else { q.x += (q.vx || 0) * dt; q.y += (q.vy || 0) * dt; }
    }
    this.particles = this.particles.filter((q) => q.life > 0 && q.y < this.cam.y + vh + 40);
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  }
  burst(kind, x, y, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.particles.push({ kind, x, y, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40 - 30, life: 0.8, max: 0.8, seed: i });
    }
  }
  hearts(x, y) { for (let i = 0; i < 3; i++) this.particles.push({ kind: 'heart', x: x + (i - 1) * 8, y: y - i * 4, vx: (i - 1) * 6, vy: -24, life: 1.1, max: 1.1 }); }
  holdUp(iconCanvas, dur = 1.3) { this.player.hold = dur; this.player.holdIcon = iconCanvas; this.player.path = null; this.burst('spark', this.player.x, this.player.y - 90, 12); }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  shadowSprite(rx, ry) {
    const key = rx * 100 + ry;
    if (this.shadowCache.has(key)) return this.shadowCache.get(key);
    const c = document.createElement('canvas');
    c.width = (rx * 2 + 2) * RES; c.height = (ry * 2 + 2) * RES;
    const g = c.getContext('2d');
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const nx = ((x + 0.5) / RES - rx - 1) / rx, ny = ((y + 0.5) / RES - ry - 1) / ry, d = nx * nx + ny * ny;
      if (d > 1) continue;
      g.fillStyle = d > 0.7 ? 'rgba(28,18,48,0.17)' : 'rgba(28,18,48,0.26)';
      g.fillRect(x, y, 1, 1);
    }
    this.shadowCache.set(key, c);
    return c;
  }

  render() {
    if (!this.buf.width || !this.buf.height) return; // window has no size yet (hidden or minimised)
    const g = this.bctx, A = this.assets.A;
    const vw = this.buf.width / RES, vh = this.buf.height / RES;
    const cx = Math.round(this.cam.x * RES) / RES, cy = Math.round(this.cam.y * RES) / RES;
    g.setTransform(RES, 0, 0, RES, 0, 0);
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#132f4d'; g.fillRect(0, 0, vw, vh);
    const gr = this.assets.ground;
    const sx = Math.max(0, cx), sy = Math.max(0, cy);
    gr.draw(g, sx, sy, Math.min(vw, gr.PW - sx), Math.min(vh, gr.PH - sy), sx - cx, sy - cy);
    this.drawWater(g, cx, cy, vw, vh);

    // collect drawables in view
    const list = [];
    const inView = (x, y, w, h) => x < cx + vw && x + w > cx && y < cy + vh && y + h > cy;
    for (const o of this.world.objects) {
      let img = A.get(o.key === 'mailbox' && this.mailFlag ? 'mailbox:up' : o.key);
      if (Array.isArray(img)) img = img[Math.floor(this.t * (o.key === 'fountain' ? 6 : o.key === 'campfire' ? 8 : 3)) % img.length];
      if (!img) continue;
      const w = img.width / RES, h = img.height / RES;
      const x = o.kind === 'prop' || o.kind === 'fence' || o.kind === 'building' || o.kind === 'arch' || o.kind === 'tree' ? o.x : o.x;
      if (!inView(x, o.y, w, h)) continue;
      list.push({ y: o.sortY, img, x, yy: o.y, o, w, h });
    }
    const tuftImgs = [A.get('tuft0'), A.get('tuft1'), A.get('tuft2')];
    if (tuftImgs[0]) for (const tf of this.world.tufts) {
      if (!inView(tf.x, tf.y, 32, 32)) continue;
      let f = Math.floor((Math.sin(this.t * 1.7 + tf.phase) + 1) * 1.5);
      if (tf.rustle > 0) f = Math.floor(tf.rustle * 16) % 2 ? 0 : 2;
      list.push({ y: tf.y + 30, img: tuftImgs[Math.max(0, Math.min(2, f))], x: tf.x, yy: tf.y });
    }
    const p = this.player;
    const pf = A.get('player');
    const pImg = p.hold > 0 ? pf.hold : pf[p.dir][p.frame];
    list.push({ y: p.y, img: pImg, x: Math.round(p.x - 16), yy: Math.round(p.y - 62), player: true });
    const pt = this.pet, petF = A.get('pet');
    const petSet = petF[pt.dir] || petF.down;
    const petImg = petSet[Math.max(0, Math.min(pt.frame | 0, petSet.length - 1))];
    list.push({ y: pt.y, img: petImg, x: Math.round(pt.x - 16), yy: Math.round(pt.y - 30) });
    for (const c of this.chickens) {
      const F = A.get(c.brown ? 'hen2' : 'hen');
      list.push({ y: c.y, img: F[c.dir][c.frame], x: Math.round(c.x - 16), yy: Math.round(c.y - 30) });
    }
    list.sort((a, b) => a.y - b.y);

    // shadows first
    for (const d of list) {
      const s = d.o?.shadow;
      if (s) this.img(g, this.shadowSprite(s[2], s[3]), Math.round(s[0] - s[2] - 1 - cx), Math.round(s[1] - s[3] - 1 - cy));
    }
    for (const who of [[p.x, p.y, 10, 4], [pt.x, pt.y - 1, 9, 3], ...this.chickens.map((c) => [c.x, c.y - 1, 8, 3])]) {
      this.img(g, this.shadowSprite(who[2], who[3]), Math.round(who[0] - who[2] - 1 - cx), Math.round(who[1] - who[3] - 1 - cy));
    }

    // sprites, fading tree tops the player walks behind
    const pr = { x: p.x - 12, y: p.y - 60, w: 24, h: 60 };
    for (const d of list) {
      let alpha = 1;
      if (d.o?.fade && p.y < d.o.sortY && pr.x < d.x + d.w - 18 && pr.x + pr.w > d.x + 18 && pr.y < d.yy + d.h - 24 && pr.y + pr.h > d.yy + 8) alpha = 0.42;
      g.globalAlpha = alpha;
      this.img(g, d.img, d.x - cx, d.yy - cy);
    }
    g.globalAlpha = 1;

    this.drawParticles(g, cx, cy, false);
    this.drawLighting(g, cx, cy, vw, vh, list);
    this.drawParticles(g, cx, cy, true);

    // in-world UI: bubble over the current target, and the held item
    const tgt = this.target;
    if (tgt && !this.paused && p.hold <= 0) {
      const b = A.get('bubble');
      const top = tgt.obj ? tgt.obj.y : tgt.y - (tgt.kind === 'pet' || tgt.kind === 'chicken' ? 14 : 30);
      const bob = Math.round(Math.sin(this.t * 5) * 2);
      this.img(g, b, Math.round(tgt.x + tgt.w / 2 - 8 - cx), Math.round(top - 22 + bob - cy));
    }
    if (p.hold > 0 && p.holdIcon) this.img(g, p.holdIcon, Math.round(p.x - 16 - cx), Math.round(p.y - 98 - cy));

    if (this.fade > 0) { g.globalAlpha = this.fade; g.fillStyle = '#000'; g.fillRect(0, 0, vw, vh); g.globalAlpha = 1; }

    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buf, 0, 0, this.buf.width * this.a, this.buf.height * this.a);
  }
  // Sprites are stored at RES x; drawing them at their logical size maps one stored pixel to one buffer pixel.
  img(g, im, x, y) { g.drawImage(im, x, y, im.width / RES, im.height / RES); }

  drawWater(g, cx, cy, vw, vh) {
    const { W, H, tiles } = this.world;
    const x0 = Math.max(0, Math.floor(cx / T)), x1 = Math.min(W - 1, Math.floor((cx + vw) / T));
    const y0 = Math.max(0, Math.floor(cy / T)), y1 = Math.min(H - 1, Math.floor((cy + vh) / T));
    const t = this.t;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (tiles[ty * W + tx] !== GROUND.WATER) continue;
      for (let k = 0; k < 2; k++) {
        const h1 = hash(tx, ty, 90 + k), h2 = hash(tx, ty, 95 + k);
        const ph = (t * 0.45 + h1 * 7) % 3;
        if (ph > 1) continue;
        const len = 2 + Math.floor(h2 * 4);
        const x = tx * T + Math.floor(h1 * 26) + Math.round(Math.sin(t * 0.8 + h2 * 6) * 3), y = ty * T + Math.floor(h2 * 28);
        const ground = this.groundAt(x, y);
        if (ground !== GROUND.WATER) continue;
        g.globalAlpha = Math.sin(ph * Math.PI) * 0.85;
        g.fillStyle = k ? '#c6e9f6' : '#7cbde0';
        g.fillRect(x - cx, y - cy, len, 0.5);
      }
    }
    g.globalAlpha = 1;
  }

  drawParticles(g, cx, cy, glowPass) {
    const leafC = ['#e6842b', '#c6591e', '#f6b648', '#983a18'], petalC = ['#f0a6c4', '#ffd6e6', '#da76a4', '#ffffff'];
    for (const q of this.particles) {
      const x = Math.round((q.x - cx) * RES) / RES, y = Math.round((q.y - cy) * RES) / RES, a = Math.max(0, Math.min(1, q.life / (q.max * 0.3)));
      if (glowPass !== (q.kind === 'firefly')) continue;
      g.globalAlpha = a;
      if (q.kind === 'leaf') { const flip = Math.sin(this.t * 3 + q.seed) > 0; g.fillStyle = leafC[q.c]; g.fillRect(x, y, flip ? 2 : 1.5, 1.5); g.fillStyle = '#7a3a12'; g.fillRect(x + (flip ? 2 : -0.5), y + 1, 0.5, 0.5); }
      else if (q.kind === 'petal') { g.fillStyle = petalC[q.c]; g.fillRect(x, y, 1.5, 1); g.fillRect(x + 0.5, y + 1, 1, 0.5); }
      else if (q.kind === 'snow') { g.fillStyle = '#ffffff'; const z = q.c > 1 ? 1.5 : q.c > 0 ? 1 : 0.5; g.fillRect(x, y, z, z); }
      else if (q.kind === 'smoke') {
        const age = 1 - q.life / q.max, r = 2 + age * 5;
        g.globalAlpha = 0.5 * (1 - age); g.fillStyle = '#d8d4dc';
        g.fillRect(x - r, y - r, r * 2, r * 2); g.fillRect(x - r + 1, y - r - 1, r * 2 - 2, r * 2 + 2);
      } else if (q.kind === 'dust') { g.globalAlpha = q.life / q.max * 0.7; g.fillStyle = '#c79662'; g.fillRect(x - 1, y - 1, 3, 2); }
      else if (q.kind === 'spark') { g.fillStyle = q.seed % 2 ? '#fff196' : '#ffffff'; g.fillRect(x, y, 2, 2); g.fillRect(x - 1, y + 0, 4, 0); }
      else if (q.kind === 'heart') {
        g.fillStyle = '#ef4f6a';
        g.fillRect(x - 3, y - 2, 2, 2); g.fillRect(x + 1, y - 2, 2, 2); g.fillRect(x - 3, y, 6, 1); g.fillRect(x - 2, y + 1, 4, 1); g.fillRect(x - 1, y + 2, 2, 1);
      } else if (q.kind === 'mark') {
        g.globalAlpha = q.life / q.max; g.fillStyle = '#fff6d6';
        g.fillRect(x - 3, y, 7, 1); g.fillRect(x, y - 2, 1, 5);
      } else if (q.kind === 'firefly') {
        const on = Math.sin(this.t * 3 + q.seed * 4) > 0.2;
        if (!on) continue;
        g.globalAlpha = a * 0.35; g.fillStyle = '#fff4a0'; g.fillRect(x - 2, y - 2, 5, 5);
        g.globalAlpha = a; g.fillStyle = '#fffbd0'; g.fillRect(x, y, 1, 1);
      }
    }
    g.globalAlpha = 1;
  }

  drawLighting(g, cx, cy, vw, vh, list) {
    const { c, k } = this.sky();
    if (c[0] > 250 && c[1] > 250 && c[2] > 250) return;
    const l = this.lctx;
    l.setTransform(RES, 0, 0, RES, 0, 0);
    l.globalCompositeOperation = 'source-over';
    l.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    l.fillRect(0, 0, vw, vh);
    if (k > 0.02) {
      l.globalCompositeOperation = 'lighter';
      const flick = 0.92 + Math.sin(this.t * 13) * 0.05 + Math.sin(this.t * 7.3) * 0.03;
      const lights = this.world.lights.concat(this.buildingLights());
      for (const L of lights) {
        const x = L.x - cx, y = L.y - cy, r = L.r * (L.flicker ? flick : 1);
        if (x < -r || y < -r || x > vw + r || y > vh + r) continue;
        const grd = l.createRadialGradient(x, y, 0, x, y, r);
        const col = L.color || '#ffc870';
        grd.addColorStop(0, hexA(col, 0.95 * k * (L.k ?? 1)));
        grd.addColorStop(0.45, hexA(col, 0.45 * k * (L.k ?? 1)));
        grd.addColorStop(1, hexA(col, 0));
        l.fillStyle = grd;
        l.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(this.light, 0, 0);
    g.restore();
    if (k > 0.02) {
      const A = this.assets.A;
      g.globalAlpha = Math.min(1, k * 1.15);
      for (const d of list) {
        const o = d.o;
        if (!o) continue;
        if (o.kind === 'building') { const lit = A.get(`${o.key}:lit`); if (lit) this.img(g, lit, o.x - cx, o.y - cy); }
        else if (o.kind === 'lamp') this.img(g, A.get('lamp:on'), o.x - cx, o.y - cy);
      }
      g.globalAlpha = 1;
      // soft halos around lanterns
      g.globalCompositeOperation = 'lighter';
      for (const L of this.world.lights) {
        if (!L.halo) continue;
        const x = L.halo[0] - cx, y = L.halo[1] - cy;
        if (x < -30 || y < -30 || x > vw + 30 || y > vh + 30) continue;
        const grd = g.createRadialGradient(x, y, 0, x, y, 26);
        grd.addColorStop(0, hexA('#ffd890', 0.45 * k)); grd.addColorStop(1, hexA('#ffd890', 0));
        g.fillStyle = grd; g.fillRect(x - 26, y - 26, 52, 52);
      }
      g.globalCompositeOperation = 'source-over';
    }
  }
  buildingLights() {
    if (!this._bl) {
      this._bl = [];
      for (const o of this.world.objects) {
        if (o.kind !== 'building') continue;
        const m = this.assets.meta.get(o.key);
        for (const [x, y, r] of m?.lights || []) this._bl.push({ x: o.x + x, y: o.y + y - 6, r: r + 30, color: '#ffc870', k: 0.8 });
      }
    }
    return this._bl;
  }
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}
