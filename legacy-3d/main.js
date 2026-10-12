import * as THREE from 'three';
import { PROFILE, DISTRICTS } from './content.js';

// ---------------------------------------------------------------------------
// Layout. The island is a strict grid: a round hub at the origin, two main
// avenues crossing it, a square ring road, and one walled plaza per quadrant.
// Inside each plaza a single street runs from the avenue gate to the ring gate,
// with lots in two columns of three facing it.
// ---------------------------------------------------------------------------
const AVE_HALF = 4;          // main avenues span -4..4
const RING = 70, RING_HALF = 4;
const HUB_R = 13;
const PLAZA_MIN = 8, PLAZA_MAX = 63;
const STREET_X = 36, STREET_HALF = 3;
const COL_BUILD = [20, 52], COL_PAD = [29, 43];
const ROWS = [18, 36, 54];
const BUILD_HALF = 5;
const LAND = 88, SAND = 96, BOUND = 91;
const PAD_R = 3.2;
const ROBOT_R = 1.9;

const STATUS_COLORS = { 'Running': '#3fa37a', 'In progress': '#e39b1f', 'Done': '#6b7a99', 'Now': '#8a5cd6', 'Open': '#e0525e' };

// Flatten lots with their world positions.
const LOTS = [];
DISTRICTS.forEach((d, di) => {
  const [sx, sz] = d.quadrant;
  d.index = di;
  d.lotRefs = [];
  d.lots.slice(0, 6).forEach((lot, i) => {
    const col = i < 3 ? 0 : 1, row = i % 3;
    const b = { x: sx * COL_BUILD[col], z: sz * ROWS[row] };
    const p = { x: sx * COL_PAD[col], z: sz * ROWS[row] };
    const ref = {
      lot, district: d, n: i + 1, code: d.short[0].toUpperCase() + (i + 1),
      building: b, pad: p,
      heading: Math.atan2(-(b.x - p.x), -(b.z - p.z)),
    };
    LOTS.push(ref);
    d.lotRefs.push(ref);
  });
  d.center = { x: sx * (PLAZA_MIN + PLAZA_MAX) / 2, z: sz * (PLAZA_MIN + PLAZA_MAX) / 2 };
  // gate on the avenue side, robot faces into the district
  d.gate = { x: sx * STREET_X, z: sz * (PLAZA_MIN + 1), heading: sz < 0 ? 0 : Math.PI };
});

// ---------------------------------------------------------------------------
// Persistence (per-viewer convenience only).
// ---------------------------------------------------------------------------
const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const visited = new Set(store.get('aaranIsland.visited', []));

// ---------------------------------------------------------------------------
// Renderer, scene, camera
// ---------------------------------------------------------------------------
const canvas = document.getElementById('world');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (e) {
  document.getElementById('btnGo').textContent = 'WebGL is off in this browser';
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const SKY = new THREE.Color('#f3c7a6');
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 120, 260);

const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 600);
const CAM_OFFSET = new THREE.Vector3(0, 50, 42);
let camZoom = 1, baseZoom = 1;

scene.add(new THREE.HemisphereLight(0xfff3e2, 0x7f8f63, 1.25));
const sun = new THREE.DirectionalLight(0xffe0bd, 1.9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 200 });
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(key);
}
function box(w, h, d, color, x, y, z, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = cast; m.receiveShadow = receive;
  scene.add(m);
  return m;
}
function flat(w, d, color, x, z, y) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}
function mix(a, b, t) { return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString(); }

const colliders = [];
function addCollider(cx, cz, hw, hd) { colliders.push({ minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd }); }

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// Canvas-texture label sprite. Rendered at 2x for crisp text.
function label(text, { sub = null, bg = '#fffaf0', fg = '#2a2238', tag = null, tagColor = '#2a2238', px = 40, world = 0.032, font = 'Nunito' } = {}) {
  const S = 2, P = px * S, pad = 16 * S;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const mainFont = `800 ${P}px "${font}", system-ui, sans-serif`;
  const subFont = `700 ${Math.round(P * 0.62)}px Nunito, system-ui, sans-serif`;
  const tagFont = `800 ${Math.round(P * 0.62)}px Nunito, system-ui, sans-serif`;
  g.font = mainFont; const mw = g.measureText(text).width;
  let sw = 0; if (sub) { g.font = subFont; sw = g.measureText(sub).width; }
  let tw = 0; if (tag) { g.font = tagFont; tw = g.measureText(tag).width + 18 * S; }
  const W = Math.ceil(Math.max(mw + (tag ? tw + 12 * S : 0), sw) + pad * 2);
  const H = Math.ceil(P * 1.25 + (sub ? P * 0.8 : 0) + pad);
  c.width = W; c.height = H + 12 * S;
  g.fillStyle = 'rgba(42,34,56,0.18)'; roundRect(g, 3 * S, 6 * S, W - 6 * S, H, 18 * S); g.fill();
  g.fillStyle = bg; roundRect(g, 0, 0, W, H, 18 * S); g.fill();
  let x = pad;
  const midMain = pad / 2 + P * 0.62;
  if (tag) {
    g.font = tagFont; g.fillStyle = tagColor;
    roundRect(g, x, midMain - P * 0.45, tw, P * 0.9, 8 * S); g.fill();
    g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(tag, x + 9 * S, midMain + 1);
    x += tw + 12 * S;
  }
  g.font = mainFont; g.fillStyle = fg; g.textBaseline = 'middle'; g.fillText(text, x, midMain);
  if (sub) { g.font = subFont; g.globalAlpha = 0.75; g.fillText(sub, pad, midMain + P * 0.9); g.globalAlpha = 1; }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
  s.scale.set((c.width / S) * world, (c.height / S) * world, 1);
  s.center.set(0.5, 0);
  s.renderOrder = 10;
  scene.add(s);
  return s;
}

// ---------------------------------------------------------------------------
// Build the world
// ---------------------------------------------------------------------------
async function buildWorld() {
  await Promise.all([
    document.fonts.load('800 40px "Baloo 2"'),
    document.fonts.load('800 40px Nunito'),
    document.fonts.load('700 40px Nunito'),
  ]).catch(() => {});

  // water, sand, grass
  const water = flat(1200, 1200, '#6fb3c6', 0, 0, -0.6);
  water.receiveShadow = false;
  box(SAND * 2, 1.2, SAND * 2, '#f0d7a1', 0, -0.6, 0, { cast: false });
  box(LAND * 2, 0.1, LAND * 2, '#a9c77a', 0, 0.02, 0, { cast: false });

  const ROAD = '#5d6070', SIDEWALK = '#d9cdb8', DASH = '#f7f1e3';
  // avenues and ring road
  flat(AVE_HALF * 2, (RING + RING_HALF) * 2, ROAD, 0, 0, 0.09);
  flat((RING + RING_HALF) * 2, AVE_HALF * 2, ROAD, 0, 0, 0.091);
  for (const s of [-1, 1]) {
    flat((RING + RING_HALF) * 2, RING_HALF * 2, ROAD, 0, s * RING, 0.092);
    flat(RING_HALF * 2, (RING + RING_HALF) * 2, ROAD, s * RING, 0, 0.093);
  }
  // hub
  const hub = new THREE.Mesh(new THREE.CircleGeometry(HUB_R, 48), mat('#e8dcc6'));
  hub.rotation.x = -Math.PI / 2; hub.position.y = 0.1; hub.receiveShadow = true; scene.add(hub);
  const hubRing = new THREE.Mesh(new THREE.RingGeometry(HUB_R - 0.8, HUB_R, 48), mat('#c9b79a'));
  hubRing.rotation.x = -Math.PI / 2; hubRing.position.y = 0.11; scene.add(hubRing);

  // centre dashes on avenues and ring
  const dashGeo = new THREE.PlaneGeometry(0.35, 2.2);
  const dashes = [];
  for (let t = -RING + 4; t <= RING - 4; t += 5) {
    if (Math.abs(t) < HUB_R + 2) continue;
    dashes.push([0, t, 0], [t, 0, Math.PI / 2]);
    for (const s of [-1, 1]) dashes.push([t, s * RING, Math.PI / 2], [s * RING, t, 0]);
  }
  const dashMesh = new THREE.InstancedMesh(dashGeo, mat(DASH), dashes.length);
  const o = new THREE.Object3D();
  dashes.forEach(([x, z, r], i) => { o.position.set(x, 0.12, z); o.rotation.set(-Math.PI / 2, 0, r); o.updateMatrix(); dashMesh.setMatrixAt(i, o.matrix); });
  scene.add(dashMesh);

  // districts
  const hedgeColor = '#5f8f4a';
  for (const d of DISTRICTS) {
    const [sx, sz] = d.quadrant;
    const span = PLAZA_MAX - PLAZA_MIN;
    const cx = d.center.x, cz = d.center.z;
    flat(span, span, mix(d.color, '#f4ead8', 0.82), cx, cz, 0.08);
    // internal street
    const streetLen = (RING - RING_HALF) - AVE_HALF;
    flat(STREET_HALF * 2, streetLen, mix(ROAD, d.color, 0.18), sx * STREET_X, sz * (AVE_HALF + streetLen / 2), 0.1);

    // hedges on the plaza edge, with gaps for the street
    const hedgeH = 1.5, t = 0.6;
    const gapA = STREET_X - STREET_HALF - 0.5, gapB = STREET_X + STREET_HALF + 0.5;
    for (const edge of [PLAZA_MIN, PLAZA_MAX]) {
      const z = sz * edge;
      for (const [a, b] of [[PLAZA_MIN, gapA], [gapB, PLAZA_MAX]]) {
        const cxh = sx * (a + b) / 2, len = b - a;
        box(len, hedgeH, t * 2, hedgeColor, cxh, hedgeH / 2, z);
        addCollider(cxh, z, len / 2, t);
      }
    }
    for (const edge of [PLAZA_MIN, PLAZA_MAX]) {
      const x = sx * edge;
      box(t * 2, hedgeH, span, hedgeColor, x, hedgeH / 2, cz);
      addCollider(x, cz, t, span / 2);
    }

    // gates on both ends of the street
    for (const edge of [PLAZA_MIN, PLAZA_MAX]) {
      const z = sz * edge;
      for (const side of [-1, 1]) {
        const px = sx * (STREET_X + side * (STREET_HALF + 0.9));
        box(0.8, 6, 0.8, d.color, px, 3, z);
        addCollider(px, z, 0.5, 0.5);
      }
      box(STREET_HALF * 2 + 2.6, 0.9, 0.9, d.color, sx * STREET_X, 6.2, z);
    }
    label(d.name, { sub: `${d.lotRefs.length} lots · press ${d.index + 1}`, bg: d.color, fg: '#fff', px: 34, world: 0.038, font: 'Baloo 2' })
      .position.set(sx * STREET_X, 6.8, sz * PLAZA_MIN);

    // lots
    for (const ref of d.lotRefs) {
      const { building: b, pad: p, lot } = ref;
      const h = 5 + ((ref.n * 7) % 4);
      const wall = mix(d.color, '#fff8ec', 0.62);
      box(BUILD_HALF * 2, h, BUILD_HALF * 2, wall, b.x, h / 2, b.z);
      box(BUILD_HALF * 2 + 1, 0.8, BUILD_HALF * 2 + 1, mix(d.color, '#2a2238', 0.15), b.x, h + 0.4, b.z);
      addCollider(b.x, b.z, BUILD_HALF, BUILD_HALF);
      // door + windows on the pad side
      const face = Math.sign(p.x - b.x);
      box(0.2, 3, 2.4, '#3a3148', b.x + face * (BUILD_HALF + 0.05), 1.5, b.z, { cast: false });
      for (const wz of [-3, 3]) box(0.2, 1.6, 1.8, '#fdf3d0', b.x + face * (BUILD_HALF + 0.05), h - 2.2, b.z + wz, { cast: false });
      if (lot.status === 'In progress') {
        // scaffolding so work in progress reads at a glance
        for (const k of [-1, 1]) box(0.3, h + 2.5, 0.3, '#c98a3a', b.x - face * (BUILD_HALF + 0.6), (h + 2.5) / 2, b.z + k * 4);
        box(0.3, 0.3, 8.3, '#c98a3a', b.x - face * (BUILD_HALF + 0.6), h + 1.2, b.z);
      }
      // pad
      const padMat = new THREE.MeshLambertMaterial({ color: d.color, emissive: d.color, emissiveIntensity: 0.1 });
      const padMesh = new THREE.Mesh(new THREE.RingGeometry(PAD_R - 0.7, PAD_R, 40), padMat);
      padMesh.rotation.x = -Math.PI / 2; padMesh.position.set(p.x, 0.14, p.z); scene.add(padMesh);
      const padFill = new THREE.Mesh(new THREE.CircleGeometry(PAD_R - 0.7, 40), mat(mix(d.color, '#ffffff', 0.7)));
      padFill.rotation.x = -Math.PI / 2; padFill.position.set(p.x, 0.13, p.z); padFill.receiveShadow = true; scene.add(padFill);
      ref.padMat = padMat;
      ref.label = label(lot.title, { tag: ref.code, tagColor: d.color, sub: lot.status + (lot.year ? ' · ' + lot.year : ''), px: 30 });
      ref.label.position.set(b.x, h + 1.4, b.z);
    }
  }

  // wayfinding: coloured guide lines from the hub to each district street
  for (const d of DISTRICTS) {
    const [sx, sz] = d.quadrant;
    const lane = sz * 2;
    const a = HUB_R, bEnd = STREET_X;
    flat(bEnd - a, 0.55, d.color, sx * (a + bEnd) / 2, lane, 0.13);
    const zA = Math.abs(lane), zB = PLAZA_MAX - 2;
    flat(0.55, zB - zA, d.color, sx * STREET_X + sx * 0.0, sz * (zA + zB) / 2, 0.131);
  }

  // hub signpost
  box(0.6, 7, 0.6, '#6b4b3a', 0, 3.5, 0); // no collider: the start spot faces it
  const west = DISTRICTS.filter(d => d.quadrant[0] < 0).map(d => d.short).join(' · ');
  const east = DISTRICTS.filter(d => d.quadrant[0] > 0).map(d => d.short).join(' · ');
  label('◀  ' + west, { px: 26 }).position.set(-8.5, 4.6, 0);
  label(east + '  ▶', { px: 26 }).position.set(8.5, 4.6, 0);
  label(`Hi, I'm ${PROFILE.name}.`, { sub: 'Follow a coloured line, or press M for the map', px: 40, font: 'Baloo 2', world: 0.036 }).position.set(0, 8.5, -2);

  // trees in straight rows: along every avenue and outside the ring
  const trees = [];
  for (let t = HUB_R + 5; t <= RING - 8; t += 7) {
    for (const s of [-1, 1]) for (const side of [-1, 1]) {
      trees.push([side * 6, s * t], [s * t, side * 6]);
    }
  }
  for (let t = -RING - 8; t <= RING + 8; t += 8) {
    if (Math.abs(t) < AVE_HALF + 3) continue;
    for (const s of [-1, 1]) for (const r of [RING + 8, RING + 14]) trees.push([t, s * r], [s * r, t]);
  }
  const uniq = new Map(); trees.forEach(([x, z]) => uniq.set(x + ',' + z, [x, z]));
  const treePts = [...uniq.values()].filter(([x, z]) => {
    // keep street gaps and the hub clear
    if (Math.hypot(x, z) < HUB_R + 3) return false;
    const ax = Math.abs(x), az = Math.abs(z);
    if (ax > STREET_X - STREET_HALF - 2 && ax < STREET_X + STREET_HALF + 2 && az < PLAZA_MIN) return false;
    return true;
  });
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.4, 2, 6), mat('#7a5a44'), treePts.length);
  const crownMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.9, 0), mat('#6fa65a'), treePts.length);
  const crownColors = ['#6fa65a', '#86b35f', '#e0a526', '#d9795f'];
  trunkMesh.castShadow = crownMesh.castShadow = true;
  treePts.forEach(([x, z], i) => {
    o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
    o.position.set(x, 1, z); o.updateMatrix(); trunkMesh.setMatrixAt(i, o.matrix);
    o.position.set(x, 3, z); o.rotation.y = i; o.updateMatrix(); crownMesh.setMatrixAt(i, o.matrix);
    crownMesh.setColorAt(i, new THREE.Color(crownColors[(Math.abs(x * 3 + z * 7) / 7 | 0) % crownColors.length]));
    addCollider(x, z, 0.6, 0.6);
  });
  scene.add(trunkMesh, crownMesh);
}

// ---------------------------------------------------------------------------
// Robot
// ---------------------------------------------------------------------------
const robot = new THREE.Group();
const wheels = [];
(function buildRobot() {
  const add = (m) => { m.castShadow = true; robot.add(m); return m; };
  add(new THREE.Mesh(new THREE.BoxGeometry(3, 0.7, 3.6), mat('#3b3a45'))).position.y = 0.9;
  for (const s of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.3, 3.8), mat('#e0525e'))).position.set(s * 1.4, 1.25, 0);
  for (const s of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.6, 0.25), mat('#c9ccd6'))).position.set(s * 0.9, 2.3, 0.6);
  add(new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.25, 0.25), mat('#c9ccd6'))).position.set(0, 3.55, 0.6);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, 1.0), mat('#23222a'))).position.set(0, 1.6, 0.8);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 0.3), mat('#ffd166', { emissive: '#ffb703', emissiveIntensity: 0.6 }))).position.set(0, 1.15, -1.85);
  const wheelGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.5, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = add(new THREE.Mesh(wheelGeo, mat('#222')));
    w.position.set(sx * 1.8, 0.62, sz * 1.25);
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.9, 0.2), mat('#e0525e'));
    w.add(hub);
    wheels.push(w);
  }
})();
scene.add(robot);

const state = {
  pos: new THREE.Vector3(0, 0, 8), heading: 0, vf: 0, vs: 0,
  driving: false, nearLot: null, openLot: null, where: '',
};
const keys = new Set();
const joy = { x: 0, y: 0 };

function teleport(x, z, heading = state.heading) {
  state.pos.set(x, 0, z); state.heading = heading; state.vf = state.vs = 0;
  snapCamera();
}
function goHub() { teleport(0, 8, 0); }
function goDistrict(d) { teleport(d.gate.x, d.gate.z + d.quadrant[1] * 3, d.gate.heading); showToast(d); }
function goLot(ref, open = true) { teleport(ref.pad.x, ref.pad.z, ref.heading); if (open) openCard(ref); }

function collide(p) {
  for (const c of colliders) {
    const qx = Math.max(c.minX, Math.min(p.x, c.maxX));
    const qz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
    const dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz;
    if (d2 < ROBOT_R * ROBOT_R) {
      if (d2 > 1e-6) { const d = Math.sqrt(d2); p.x = qx + dx / d * ROBOT_R; p.z = qz + dz / d * ROBOT_R; }
      else {
        // centre inside the box: push out along the shallowest axis
        const opts = [[c.minX - ROBOT_R - p.x, 0], [c.maxX + ROBOT_R - p.x, 0], [0, c.minZ - ROBOT_R - p.z], [0, c.maxZ + ROBOT_R - p.z]];
        opts.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
        p.x += opts[0][0]; p.z += opts[0][1];
      }
    }
  }
  p.x = Math.max(-BOUND, Math.min(BOUND, p.x));
  p.z = Math.max(-BOUND, Math.min(BOUND, p.z));
}
function blocked(x, z) {
  if (Math.abs(x) > BOUND || Math.abs(z) > BOUND) return true;
  return colliders.some(c => x > c.minX - ROBOT_R && x < c.maxX + ROBOT_R && z > c.minZ - ROBOT_R && z < c.maxZ + ROBOT_R);
}

// balls
const balls = [];
const ballGeo = new THREE.SphereGeometry(0.45, 14, 10);
function launchBall() {
  if (balls.length >= 6) { scene.remove(balls[0].mesh); balls.shift(); }
  const m = new THREE.Mesh(ballGeo, mat(['#f28c28', '#3fb6a8', '#e0525e'][balls.length % 3]));
  m.castShadow = true;
  const fx = -Math.sin(state.heading), fz = -Math.cos(state.heading);
  m.position.set(state.pos.x + fx * 2.2, 2.4, state.pos.z + fz * 2.2);
  scene.add(m);
  balls.push({ mesh: m, v: new THREE.Vector3(fx * (20 + state.vf), 7, fz * (20 + state.vf)), life: 6 });
}
function updateBalls(dt) {
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i], p = b.mesh.position;
    b.v.y -= 22 * dt;
    p.addScaledVector(b.v, dt);
    if (p.y < 0.45) { p.y = 0.45; b.v.y *= -0.55; b.v.x *= 0.86; b.v.z *= 0.86; }
    for (const c of colliders) {
      if (p.y < 6 && p.x > c.minX - 0.45 && p.x < c.maxX + 0.45 && p.z > c.minZ - 0.45 && p.z < c.maxZ + 0.45) {
        const penX = Math.min(p.x - c.minX, c.maxX - p.x), penZ = Math.min(p.z - c.minZ, c.maxZ - p.z);
        if (penX < penZ) b.v.x *= -0.7; else b.v.z *= -0.7;
        p.addScaledVector(b.v, dt * 2);
      }
    }
    b.life -= dt;
    if (b.life < 0 || Math.abs(p.x) > SAND) { scene.remove(b.mesh); balls.splice(i, 1); }
  }
}

// ---------------------------------------------------------------------------
// Where am I
// ---------------------------------------------------------------------------
function locate(x, z) {
  const ax = Math.abs(x), az = Math.abs(z);
  if (Math.hypot(x, z) < HUB_R) return { main: 'The Hub', sub: 'start here', color: '#c9b79a' };
  for (const d of DISTRICTS) {
    const [sx, sz] = d.quadrant;
    if (Math.sign(x) === sx && Math.sign(z) === sz && ax >= PLAZA_MIN - 0.5 && ax <= PLAZA_MAX + 0.5 && az >= PLAZA_MIN - 0.5 && az <= PLAZA_MAX + 0.5) {
      return { main: d.name, sub: state.nearLot ? `Lot ${state.nearLot.n} · ${state.nearLot.lot.title}` : `${d.lotRefs.length} lots`, color: d.color, district: d };
    }
  }
  if (ax <= AVE_HALF + 1 && az < RING) return { main: z < 0 ? 'North Avenue' : 'South Avenue', sub: '', color: '#5d6070' };
  if (az <= AVE_HALF + 1 && ax < RING) return { main: x < 0 ? 'West Avenue' : 'East Avenue', sub: '', color: '#5d6070' };
  if (Math.max(ax, az) >= RING - RING_HALF - 1 && Math.max(ax, az) <= RING + RING_HALF + 1) return { main: 'Ring Road', sub: '', color: '#5d6070' };
  if (Math.max(ax, az) > LAND) return { main: 'The Beach', sub: '', color: '#f0d7a1' };
  return { main: 'The Green', sub: '', color: '#a9c77a' };
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const $ = (s) => document.querySelector(s);
const whereEl = $('#where'), promptEl = $('#prompt'), toastEl = $('#toast'), cardEl = $('#card');
let lastDistrict = null, toastTimer = 0;

function showToast(d) {
  toastEl.querySelector('h3').textContent = d.name;
  toastEl.querySelector('h3').style.color = d.color;
  toastEl.querySelector('p').textContent = d.summary;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

function updateVisited() {
  const n = LOTS.filter(r => visited.has(r.lot.id)).length;
  $('#visitedText').textContent = `${n} / ${LOTS.length} lots visited`;
  $('#visited .bar i').style.width = (100 * n / LOTS.length) + '%';
}

function openCard(ref) {
  const { lot, district: d } = ref;
  state.openLot = ref;
  visited.add(lot.id); store.set('aaranIsland.visited', [...visited]); updateVisited(); renderMapList();
  const header = cardEl.querySelector('header');
  header.style.background = d.color;
  header.querySelector('.addr').textContent = `${d.name} · Lot ${ref.n} (${ref.code})`;
  header.querySelector('h2').textContent = lot.title;
  const meta = cardEl.querySelector('.meta'); meta.innerHTML = '';
  const chip = (t, c) => { const s = document.createElement('span'); s.className = 'chip'; s.textContent = t; if (c) { s.style.background = c; s.style.color = '#fff'; } meta.append(s); };
  chip(lot.status, STATUS_COLORS[lot.status]);
  if (lot.year) chip(lot.year);
  cardEl.querySelector('.one').textContent = lot.oneLiner;
  cardEl.querySelector('.body').textContent = lot.body;
  const ul = cardEl.querySelector('ul'); ul.innerHTML = '';
  (lot.points || []).forEach(p => { const li = document.createElement('li'); li.textContent = p; ul.append(li); });
  const links = cardEl.querySelector('.links'); links.innerHTML = '';
  const linkList = lot.links === 'profile' ? [...PROFILE.links, { label: PROFILE.email, url: 'mailto:' + PROFILE.email }] : (lot.links || []);
  linkList.forEach(l => { const a = document.createElement('a'); a.href = l.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = l.label; links.append(a); });
  const i = LOTS.indexOf(ref);
  $('#prevLot').disabled = i === 0;
  $('#nextLot').disabled = i === LOTS.length - 1;
  cardEl.classList.add('open');
}
function closeCard() { cardEl.classList.remove('open'); state.openLot = null; }
cardEl.querySelector('.close').onclick = closeCard;
$('#prevLot').onclick = () => { const i = LOTS.indexOf(state.openLot); if (i > 0) goLot(LOTS[i - 1]); };
$('#nextLot').onclick = () => { const i = LOTS.indexOf(state.openLot); if (i < LOTS.length - 1) goLot(LOTS[i + 1]); };
promptEl.onclick = () => state.nearLot && openCard(state.nearLot);

// --- map drawing (shared by minimap and big map)
function drawMap(g, size, { labels = true } = {}) {
  const k = size / (SAND * 2 + 8);
  const X = (x) => size / 2 + x * k, Z = (z) => size / 2 + z * k;
  g.fillStyle = '#6fb3c6'; g.fillRect(0, 0, size, size);
  g.fillStyle = '#f0d7a1'; roundRect(g, X(-SAND), Z(-SAND), SAND * 2 * k, SAND * 2 * k, 10 * k); g.fill();
  g.fillStyle = '#a9c77a'; g.fillRect(X(-LAND), Z(-LAND), LAND * 2 * k, LAND * 2 * k);
  g.strokeStyle = '#5d6070'; g.lineWidth = RING_HALF * 2 * k;
  g.strokeRect(X(-RING), Z(-RING), RING * 2 * k, RING * 2 * k);
  g.fillStyle = '#5d6070';
  g.fillRect(X(-AVE_HALF), Z(-RING), AVE_HALF * 2 * k, RING * 2 * k);
  g.fillRect(X(-RING), Z(-AVE_HALF), RING * 2 * k, AVE_HALF * 2 * k);
  g.fillStyle = '#e8dcc6'; g.beginPath(); g.arc(X(0), Z(0), HUB_R * k, 0, Math.PI * 2); g.fill();
  for (const d of DISTRICTS) {
    const [sx, sz] = d.quadrant;
    const x0 = sx < 0 ? -PLAZA_MAX : PLAZA_MIN, z0 = sz < 0 ? -PLAZA_MAX : PLAZA_MIN;
    const span = PLAZA_MAX - PLAZA_MIN;
    g.fillStyle = mix(d.color, '#f4ead8', 0.7); g.fillRect(X(x0), Z(z0), span * k, span * k);
    g.strokeStyle = '#5f8f4a'; g.lineWidth = Math.max(1, 1.2 * k); g.strokeRect(X(x0), Z(z0), span * k, span * k);
    g.fillStyle = mix('#5d6070', d.color, 0.25);
    g.fillRect(X(sx * STREET_X - STREET_HALF), Z(sz < 0 ? -RING : AVE_HALF), STREET_HALF * 2 * k, (RING - AVE_HALF) * k);
    for (const ref of d.lotRefs) {
      g.fillStyle = mix(d.color, '#ffffff', visited.has(ref.lot.id) ? 0.1 : 0.45);
      g.fillRect(X(ref.building.x - BUILD_HALF), Z(ref.building.z - BUILD_HALF), BUILD_HALF * 2 * k, BUILD_HALF * 2 * k);
      g.fillStyle = d.color; g.beginPath(); g.arc(X(ref.pad.x), Z(ref.pad.z), PAD_R * k, 0, Math.PI * 2); g.fill();
      if (labels) {
        g.fillStyle = '#fff'; g.font = `800 ${Math.round(3 * k)}px Nunito, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(ref.n), X(ref.pad.x), Z(ref.pad.z) + 0.5);
      }
    }
    if (labels) {
      const lx = X(d.center.x), lz = Z(sz < 0 ? -PLAZA_MAX - 3.5 : PLAZA_MAX + 3.5);
      g.font = `800 ${Math.round(5 * k)}px "Baloo 2", sans-serif`;
      const w = g.measureText(d.name).width + 10 * k;
      g.fillStyle = d.color; roundRect(g, lx - w / 2, lz - 3.4 * k, w, 6.8 * k, 3.4 * k); g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`${d.index + 1}  ${d.name}`, lx, lz + 0.5 * k);
    }
  }
  return { X, Z, k };
}
function drawRobot(g, X, Z, k, big) {
  const x = X(state.pos.x), z = Z(state.pos.z), r = Math.max(big ? 7 : 5, 3 * k);
  g.save(); g.translate(x, z); g.rotate(-state.heading);
  g.fillStyle = '#2a2238'; g.strokeStyle = '#fff'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -r * 1.3); g.lineTo(r, r); g.lineTo(0, r * 0.5); g.lineTo(-r, r); g.closePath(); g.fill(); g.stroke();
  g.restore();
}

const mini = $('#minimap'), miniG = mini.getContext('2d');
const miniBase = document.createElement('canvas');
function sizeMini() {
  const css = mini.clientWidth || 168, dpr = Math.min(devicePixelRatio, 2);
  mini.width = mini.height = miniBase.width = miniBase.height = Math.round(css * dpr);
  mini.dataset.css = css;
  drawMap(miniBase.getContext('2d'), mini.width, { labels: false });
}
function drawMini() {
  // zoomed, player-centred view of the static base layer
  const S = mini.width, zoom = 1.9;
  miniG.clearRect(0, 0, S, S);
  const k = S / (SAND * 2 + 8);
  const px = S / 2 + state.pos.x * k, pz = S / 2 + state.pos.z * k;
  miniG.save();
  miniG.translate(S / 2, S / 2); miniG.scale(zoom, zoom); miniG.translate(-px, -pz);
  miniG.drawImage(miniBase, 0, 0);
  miniG.restore();
  miniG.save(); miniG.translate(S / 2, S / 2); miniG.rotate(-state.heading);
  const r = S * 0.04;
  miniG.fillStyle = '#2a2238'; miniG.strokeStyle = '#fff'; miniG.lineWidth = 2;
  miniG.beginPath(); miniG.moveTo(0, -r * 1.3); miniG.lineTo(r, r); miniG.lineTo(0, r * 0.5); miniG.lineTo(-r, r); miniG.closePath(); miniG.fill(); miniG.stroke();
  miniG.restore();
}

const mapEl = $('#map'), big = $('#bigmap'), bigG = big.getContext('2d');
let bigXform = null;
function renderBigMap() {
  const stage = mapEl.querySelector('.stage');
  const css = Math.max(260, Math.min(stage.clientWidth - 40, stage.clientHeight - 100));
  const dpr = Math.min(devicePixelRatio, 2);
  big.style.width = big.style.height = css + 'px';
  big.width = big.height = Math.round(css * dpr);
  const t = drawMap(bigG, big.width);
  drawRobot(bigG, t.X, t.Z, t.k, true);
  bigXform = { css, dpr, k: t.k };
}
function renderMapList() {
  const list = $('#mapList'); list.innerHTML = '';
  const hubBtn = document.createElement('button'); hubBtn.className = 'row';
  hubBtn.innerHTML = `<span class="n" style="background:#8a7a62">0</span>The Hub`;
  hubBtn.onclick = () => { goHub(); toggleMap(false); };
  list.append(hubBtn);
  for (const d of DISTRICTS) {
    const h = document.createElement('h4'); h.style.color = d.color;
    h.textContent = `${d.index + 1} · ${d.name}`;
    const gate = document.createElement('button'); gate.textContent = 'gate'; gate.onclick = () => { goDistrict(d); toggleMap(false); };
    h.append(gate); list.append(h);
    for (const ref of d.lotRefs) {
      const b = document.createElement('button'); b.className = 'row';
      b.innerHTML = `<span class="n" style="background:${d.color}">${ref.code}</span><span></span>${visited.has(ref.lot.id) ? '<span class="tick">✓</span>' : ''}`;
      b.children[1].textContent = ref.lot.title;
      b.onclick = () => { toggleMap(false); goLot(ref); };
      list.append(b);
    }
  }
}
function toggleMap(force) {
  const open = force ?? !mapEl.classList.contains('open');
  mapEl.classList.toggle('open', open);
  if (open) { renderMapList(); renderBigMap(); }
  else canvas.focus();
}
big.addEventListener('click', (e) => {
  const r = big.getBoundingClientRect();
  const k = bigXform.k / bigXform.dpr;
  const x = (e.clientX - r.left - bigXform.css / 2) / k, z = (e.clientY - r.top - bigXform.css / 2) / k;
  const nearest = LOTS.map(ref => [ref, Math.hypot(ref.pad.x - x, ref.pad.z - z)]).sort((a, b) => a[1] - b[1])[0];
  if (nearest && nearest[1] < 9) { toggleMap(false); goLot(nearest[0]); return; }
  if (Math.abs(x) > BOUND || Math.abs(z) > BOUND) return;
  let tx = x, tz = z;
  if (blocked(tx, tz)) { const p = { x: tx, z: tz }; collide(p); tx = p.x; tz = p.z; }
  teleport(tx, tz);
  toggleMap(false);
});
$('#btnMap').onclick = () => toggleMap(true);
$('#btnCloseMap').onclick = () => toggleMap(false);
mini.onclick = () => toggleMap(true);
$('#btnHome').onclick = () => { goHub(); canvas.focus(); };
$('#namePill').onclick = () => { $('#intro').classList.remove('hide'); state.driving = false; };

// --- input
const DRIVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'];
addEventListener('keydown', (e) => {
  if (!state.driving || e.metaKey || e.ctrlKey || e.altKey) return;
  if (DRIVE_KEYS.includes(e.code) || e.code === 'Space') e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'KeyM') toggleMap();
  else if (e.code === 'Escape') { if (mapEl.classList.contains('open')) toggleMap(false); else closeCard(); }
  else if (mapEl.classList.contains('open')) return;
  else if (e.code === 'KeyF' && state.nearLot) state.openLot === state.nearLot ? closeCard() : openCard(state.nearLot);
  else if (e.code === 'KeyR' || e.code === 'Digit0') goHub();
  else if (/^Digit[1-9]$/.test(e.code)) { const d = DISTRICTS[+e.code.slice(5) - 1]; if (d) goDistrict(d); }
  else if (e.code === 'Space') launchBall();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
canvas.addEventListener('wheel', (e) => { e.preventDefault(); camZoom = Math.max(0.55, Math.min(1.8, camZoom * (1 + e.deltaY * 0.001))); }, { passive: false });

// touch joystick
const coarse = matchMedia('(pointer: coarse)').matches;
if (coarse) document.body.classList.add('coarse');
const joyEl = $('#joy'), knob = joyEl.querySelector('i');
let joyId = null;
joyEl.addEventListener('pointerdown', (e) => { joyId = e.pointerId; joyEl.setPointerCapture(e.pointerId); moveJoy(e); });
joyEl.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) moveJoy(e); });
const endJoy = () => { joyId = null; joy.x = joy.y = 0; knob.style.transform = ''; };
joyEl.addEventListener('pointerup', endJoy); joyEl.addEventListener('pointercancel', endJoy);
function moveJoy(e) {
  const r = joyEl.getBoundingClientRect(), R = r.width / 2;
  let dx = e.clientX - r.left - R, dy = e.clientY - r.top - R;
  const len = Math.hypot(dx, dy); if (len > R * 0.7) { dx *= R * 0.7 / len; dy *= R * 0.7 / len; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  joy.x = dx / (R * 0.7); joy.y = dy / (R * 0.7);
}
$('#touchF').onclick = () => state.nearLot && openCard(state.nearLot);

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
const camTarget = new THREE.Vector3();
function snapCamera() {
  robot.position.copy(state.pos); robot.rotation.y = state.heading;
  camTarget.copy(state.pos);
  camera.position.copy(state.pos).addScaledVector(CAM_OFFSET, camZoom * baseZoom);
  camera.lookAt(camTarget);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < 720 ? 52 : 40;
  baseZoom = w / h < 0.8 ? 1.45 : 1;
  camera.updateProjectionMatrix();
  sizeMini();
  if (mapEl.classList.contains('open')) renderBigMap();
}
addEventListener('resize', resize);

const clock = new THREE.Clock();
let introSpin = 0;
let simTime = 0;
function tick() {
  step(Math.min(clock.getDelta(), 0.05));
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
function step(dt) {
  simTime += dt;
  const t = simTime;

  if (state.driving && !mapEl.classList.contains('open')) {
    const k = (c) => keys.has(c) ? 1 : 0;
    const fwd = Math.max(-1, Math.min(1, k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown') - joy.y));
    const turn = Math.max(-1, Math.min(1, k('KeyA') + k('ArrowLeft') - k('KeyD') - k('ArrowRight') - joy.x));
    const strafe = k('KeyE') - k('KeyQ');
    const boost = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1.6 : 1;
    const a = 1 - Math.exp(-7 * dt);
    state.vf += (fwd * 20 * boost - state.vf) * a;
    state.vs += (strafe * 13 * boost - state.vs) * a;
    state.heading += turn * 2.5 * dt * (fwd < 0 ? -1 : 1);
    const fx = -Math.sin(state.heading), fz = -Math.cos(state.heading);
    const rx = Math.cos(state.heading), rz = -Math.sin(state.heading);
    const before = state.pos.clone();
    state.pos.x += (fx * state.vf + rx * state.vs) * dt;
    state.pos.z += (fz * state.vf + rz * state.vs) * dt;
    collide(state.pos);
    const moved = state.pos.distanceTo(before);
    wheels.forEach(w => { w.rotation.x -= moved / 0.62 * Math.sign(state.vf || 1); });
  }
  robot.position.copy(state.pos);
  robot.position.y = Math.abs(state.vf) > 1 ? Math.sin(t * 22) * 0.03 : 0;
  robot.rotation.y = state.heading;

  // camera
  if (state.driving) {
    camTarget.lerp(state.pos, 1 - Math.exp(-6 * dt));
    const want = camTarget.clone().addScaledVector(CAM_OFFSET, camZoom * baseZoom);
    camera.position.lerp(want, 1 - Math.exp(-5 * dt));
    camera.lookAt(camTarget);
  } else {
    introSpin += dt * 0.08;
    camera.position.set(Math.sin(introSpin) * 120, 90, Math.cos(introSpin) * 120);
    camera.lookAt(0, 0, 0);
  }
  sun.position.set(camTarget.x + 30, 70, camTarget.z + 25);
  sun.target.position.copy(camTarget);

  // nearest pad
  let near = null;
  for (const ref of LOTS) {
    const d = Math.hypot(ref.pad.x - state.pos.x, ref.pad.z - state.pos.z);
    const on = d < PAD_R + 0.6;
    ref.padMat.emissiveIntensity = on ? 0.55 + Math.sin(t * 5) * 0.2 : 0.1;
    if (on) near = ref;
  }
  if (near !== state.nearLot) {
    state.nearLot = near;
    if (near) {
      promptEl.querySelector('.code').textContent = near.code;
      promptEl.querySelector('.code').style.background = near.district.color;
      promptEl.querySelector('.t').textContent = 'Read: ' + near.lot.title;
    }
    promptEl.classList.toggle('show', !!near && state.driving);
  }
  if (state.openLot && Math.hypot(state.openLot.pad.x - state.pos.x, state.openLot.pad.z - state.pos.z) > PAD_R + 6) closeCard();

  // location pill + district toast
  if (state.driving) {
    const loc = locate(state.pos.x, state.pos.z);
    const key = loc.main + loc.sub;
    if (key !== state.where) {
      state.where = key;
      whereEl.querySelector('.main').textContent = loc.main;
      whereEl.querySelector('.sub').textContent = loc.sub;
      whereEl.querySelector('.swatch').style.background = loc.color;
    }
    const d = loc.district || null;
    if (d !== lastDistrict) { if (d) showToast(d); lastDistrict = d; }
    drawMini();
  }

  updateBalls(dt);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
$('#nameText').textContent = PROFILE.name;
$('#introEyebrow').textContent = `${PROFILE.name}'s island`;
$('#introTitle').textContent = `Hi, I'm ${PROFILE.name}.`;
$('#introTag').textContent = PROFILE.tagline;
$('#introBlurb').textContent = PROFILE.blurb;
const introD = $('#introDistricts');
DISTRICTS.forEach(d => { const s = document.createElement('span'); s.style.background = d.color; s.textContent = `${d.index + 1} · ${d.name}`; introD.append(s); });

resize();
await buildWorld();
sizeMini();
updateVisited();
goHub();
requestAnimationFrame(tick);

const go = $('#btnGo');
go.disabled = false; go.textContent = 'Start driving';
go.onclick = () => {
  $('#intro').classList.add('hide');
  $('#hud').hidden = false;
  state.driving = true;
  state.where = '';
  snapCamera();
  sizeMini();
  canvas.focus();
};
// Test hook: advance the simulation without animation frames (they pause in hidden tabs).
function simulate(seconds) { for (let i = 0; i < seconds * 60; i++) step(1 / 60); renderer.render(scene, camera); }
window.__island = { simulate, keys, state, LOTS, DISTRICTS, goLot, goDistrict, goHub, colliders, locate, blocked };
