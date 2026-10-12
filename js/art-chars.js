// Characters: the player (32 x 64, four directions, four-frame walk, an
// item-get pose), the little robot companion, and chickens.
import { Pix, C, shade, mixC, sphereLight, lightIndex } from './art-core.js';
import { SKINS, HAIRS, SHIRTS, PANTS, SHOES, WHITE, DARK, METAL, CYAN, RED, YELLOW, ORANGE, PAPER } from './palette.js';

const EYE = C('#2a1e2c'), MOUTH = C('#8a3f3a');

// Walk cycle: which leg is forward, whether the body is raised, arm swing.
const CYCLE = [
  { step: 0, bob: 0, swing: 0 },
  { step: -1, bob: 0, swing: 1 },
  { step: 0, bob: 1, swing: 0 },
  { step: 1, bob: 0, swing: -1 },
  { step: 0, bob: 1, swing: 0 },
];

function palette(look) {
  return {
    skin: SKINS[look.skin % SKINS.length], hair: HAIRS[look.hair % HAIRS.length],
    shirt: SHIRTS[look.shirt % SHIRTS.length], pants: PANTS[(look.pants || 0) % PANTS.length], shoes: SHOES,
    style: (look.style || 0) % 3,
  };
}

function head(p, P, cx, cy, dir, style) {
  const S = P.skin, H = P.hair;
  // face / skull
  p.ellipse(cx, cy, 10.5, 10, (x, y, nx, ny) => {
    const l = sphereLight(nx * 0.75, ny * 0.75);
    return S[l > 0.78 ? 4 : l > 0.25 ? 3 : 2];
  });
  // ears
  if (dir === 'down' || dir === 'up') {
    p.rect(cx - 11, cy, 2, 4, S[2]); p.rect(cx + 10, cy, 2, 4, S[2]);
    p.set(cx - 10, cy + 1, S[1]); p.set(cx + 10, cy + 1, S[1]);
  }
  // hair
  const fringe = (x) => {
    if (dir === 'up') return cy + 8;
    if (dir === 'left') return x > cx + 1 ? cy + 7 : cy - 4 + [0, 1, 2, 1][(x + 8) % 4];
    const side = Math.abs(x - cx) > 7.5;
    if (side) return style === 1 ? cy + 12 : cy + 4;
    return cy - 4 + [0, 1, 2, 1][(x + 8) % 4] + (style === 2 ? 1 : 0);
  };
  const ry = style === 2 ? 11.5 : 10.5;
  p.ellipse(cx, cy - 2.5, 11.5, ry, (x, y, nx, ny) => {
    if (y > fringe(x)) return 0;
    if (style === 2 && ny < -0.55 && ((x + 16) % 4 === 0)) return 0;
    const hl = ((x - cx + 4) ** 2) / 30 + ((y - (cy - 8)) ** 2) / 5 < 1;
    let k = hl ? 4 : nx > 0.55 ? 2 : 3;
    if (y === fringe(x)) k = 2;
    return H[k];
  });
  if (style === 2) {
    for (const [x, y] of [[cx - 6, cy - 13], [cx - 1, cy - 14], [cx + 4, cy - 13]]) {
      p.rect(x, y, 3, 3, H[3]); p.set(x + 1, y - 1, H[3]); p.set(x, y, H[4]);
    }
  }
  if (style === 1 && dir !== 'up') {
    // longer hair falls behind the ears
    for (const sx of dir === 'left' ? [cx + 4] : [cx - 11, cx + 8]) p.rect(sx, cy, 4, 12, H[2]);
  }
  if (dir === 'up' && style === 1) p.rect(cx - 9, cy + 6, 18, 6, H[3]);
  if (dir === 'left') {
    p.rect(cx + 3, cy + 1, 3, 4, S[2]); p.set(cx + 4, cy + 2, S[1]);
  }
}

function face(p, P, cx, cy, dir, happy) {
  const S = P.skin;
  const blush = mixC(S[3], C('#ff6f7a'), 0.35);
  if (dir === 'down') {
    if (happy) {
      for (const ex of [cx - 6, cx + 3]) { p.set(ex, cy + 3, EYE); p.set(ex + 1, cy + 2, EYE); p.set(ex + 2, cy + 3, EYE); }
      p.rect(cx - 1, cy + 7, 3, 2, MOUTH); p.set(cx, cy + 8, C('#e2737a'));
    } else {
      for (const ex of [cx - 5, cx + 3]) {
        p.rect(ex, cy + 1, 2, 4, EYE);
        p.set(ex + 1, cy + 1, C('#ffffff'));
      }
      p.rect(cx - 6, cy - 1, 3, 1, P.hair[2]); p.rect(cx + 3, cy - 1, 3, 1, P.hair[2]);
      p.rect(cx - 1, cy + 7, 2, 1, MOUTH);
    }
    p.rect(cx - 8, cy + 5, 2, 1, blush); p.rect(cx + 6, cy + 5, 2, 1, blush);
  } else if (dir === 'left') {
    p.rect(cx - 7, cy + 1, 2, 4, EYE); p.set(cx - 6, cy + 1, C('#ffffff'));
    p.rect(cx - 7, cy - 1, 3, 1, P.hair[2]);
    p.set(cx - 11, cy + 4, S[3]); p.set(cx - 11, cy + 5, S[2]);
    p.rect(cx - 9, cy + 7, 2, 1, MOUTH);
    p.rect(cx - 5, cy + 5, 2, 1, blush);
  }
}

function drawPerson(look, dir, f, hold = false) {
  const P = palette(look);
  const p = new Pix(32, 64);
  const { step, bob, swing } = CYCLE[f];
  const b = -bob;
  const Sh = P.shirt, Pa = P.pants, So = P.shoes, S = P.skin;
  const side = dir === 'left';

  // legs and shoes
  if (!side) {
    for (const [lx, leg] of [[10, -1], [17, 1]]) {
      const lift = step === leg ? 2 : 0;
      p.rect(lx, 47, 5, 10 - lift, (x) => Pa[x === lx ? 4 : x === lx + 4 ? 2 : 3]);
      const sy = 57 - lift;
      p.rect(lx - 1, sy, 6, 4, (x, y) => So[y === sy ? 4 : x === lx - 1 ? 3 : 2]);
    }
    p.rect(10, 45 + b, 12, 3, Pa[3]);
    if (dir === 'down') p.rect(15, 49, 2, 5, Pa[1]);
  } else {
    const legs = step === 0 ? [[13, 0], [15, 0]] : [[10, -1], [17, 1]];
    const order = step === 0 ? legs : (step < 0 ? [legs[1], legs[0]] : legs);
    for (const [lx, fwd] of order) {
      const back = (step < 0 && fwd > 0) || (step > 0 && fwd < 0);
      const dark = back ? 1 : 0;
      p.rect(lx, 47, 5, 10, (x) => Pa[(x === lx ? 4 : 3) - dark]);
      p.rect(lx - 3, 57, 7, 4, (x, y) => So[(y === 57 ? 4 : 2) - dark]);
    }
    p.rect(11, 45 + b, 10, 3, Pa[3]);
  }

  // torso
  const ty = 31 + b;
  if (!side) {
    for (let y = ty; y < ty + 15; y++) {
      const inset = y === ty ? 2 : y === ty + 1 ? 1 : 0;
      for (let x = 9 + inset; x <= 22 - inset; x++) {
        let k = x <= 10 ? 4 : x >= 21 ? 2 : 3;
        if (y >= ty + 13) k = Math.max(1, k - 1);
        p.set(x, y, Sh[k]);
      }
    }
    if (dir === 'down') {
      p.rect(15, ty, 2, 3, S[2]); p.set(14, ty, Sh[1]); p.set(17, ty, Sh[1]);
      p.set(14, ty + 1, Sh[2]); p.set(17, ty + 1, Sh[2]); p.set(15, ty + 3, Sh[2]); p.set(16, ty + 3, Sh[2]);
    } else {
      p.rect(15, ty + 3, 1, 10, Sh[2]);
    }
  } else {
    p.rect(11, ty, 10, 15, (x, y) => Sh[y >= ty + 13 ? 2 : x <= 12 ? 4 : x >= 19 ? 2 : 3]);
  }
  // neck
  p.rect(14, 28 + b, 4, 3, S[2]);

  // arms (the item-get pose raises them after the head is drawn, below)
  if (hold) {
    // nothing yet
  } else if (!side) {
    for (const [ax, s] of [[6, 1], [23, -1]]) {
      const dy = swing * s;
      p.rect(ax, ty + 1 + dy, 3, 8, (x) => Sh[ax < 16 ? (x === ax ? 4 : 3) : (x === ax + 2 ? 2 : 3)]);
      p.rect(ax, ty + 9 + dy, 3, 3, S[ax < 16 ? 3 : 2]);
      p.rect(ax, ty + 12 + dy, 3, 2, S[3]);
    }
  } else {
    const hx = 15 - swing * 4;
    p.seg(15.5, ty + 2, hx + 0.5, ty + 10, 4, Sh);
    p.ellipse(hx + 0.5, ty + 12, 2.2, 2.2, (x, y, nx, ny) => S[lightIndex(sphereLight(nx, ny), 5)]);
  }

  // head
  const hy = 19 + b;
  head(p, P, 16, hy, dir, P.style);
  face(p, P, 16, hy, dir, hold);
  if (hold) {
    for (const [sx, ex, hx] of [[8, 4.5, 11.5], [24, 27.5, 20.5]]) {
      p.seg(sx, ty + 2, ex, ty - 8, 4, Sh);
      p.seg(ex, ty - 8, hx, 6, 3, S);
      p.ellipse(hx, 5, 2.6, 2.6, (x, y, nx, ny) => S[lightIndex(sphereLight(nx, ny), 5)]);
    }
  }

  p.outline((c) => shade(c, -0.66));
  return p;
}

// frames[dir][i]: i = 0 idle, 1..4 walk. Right is the mirrored left.
export function playerFrames(look) {
  const frames = {};
  for (const dir of ['down', 'up', 'left']) frames[dir] = CYCLE.map((_, i) => drawPerson(look, dir, i));
  frames.right = frames.left.map((f) => f.flipped());
  frames.hold = drawPerson(look, 'down', 0, true);
  return frames;
}

// ---------------------------------------------------------------------------
// Robot companion (32 x 32)
// ---------------------------------------------------------------------------
export function petFrames() {
  const make = (dir, f, blink = false) => {
    const p = new Pix(32, 32);
    const side = dir === 'left';
    if (!side) {
      p.bevel(7, 24, 18, 6, DARK, 2);
      for (let x = 8 + (f % 2) * 2; x < 25; x += 4) p.rect(x, 26, 2, 3, DARK[4]);
      p.bevel(3, 14, 4, 7, METAL, 3); p.bevel(25, 14, 4, 7, METAL, 3);
      p.bevel(6, 9, 20, 16, WHITE, 4);
      p.rect(6, 22, 20, 3, WHITE[2]);
      if (dir === 'down') {
        p.rect(9, 11, 14, 9, DARK[1]);
        if (blink) { p.rect(11, 15, 4, 1, CYAN[3]); p.rect(17, 15, 4, 1, CYAN[3]); }
        else { p.rect(11, 13, 4, 4, CYAN[3]); p.rect(17, 13, 4, 4, CYAN[3]); p.set(11, 13, CYAN[5]); p.set(17, 13, CYAN[5]); }
        p.rect(14, 18, 4, 1, CYAN[2]);
      } else {
        p.rect(9, 12, 14, 8, WHITE[3]);
        for (let y = 13; y < 19; y += 2) p.rect(11, y, 10, 1, WHITE[1]);
      }
    } else {
      p.bevel(8, 24, 17, 6, DARK, 2);
      for (const wx of [11, 21]) { p.ellipse(wx, 27, 2.6, 2.6, METAL[f % 2 ? 3 : 4]); p.set(wx, 27, DARK[1]); }
      p.bevel(9, 9, 16, 16, WHITE, 4);
      p.rect(9, 22, 16, 3, WHITE[2]);
      p.rect(9, 11, 7, 9, DARK[1]);
      if (blink) p.rect(10, 15, 4, 1, CYAN[3]); else { p.rect(10, 13, 4, 4, CYAN[3]); p.set(10, 13, CYAN[5]); }
      p.bevel(18, 14, 4, 7, METAL, 3);
    }
    p.rect(15, 4, 2, 6, METAL[3]);
    p.ellipse(16, 3.5, 2.2, 2.2, (x, y, nx, ny) => (f === 3 ? YELLOW : RED)[lightIndex(sphereLight(nx, ny), 5)]);
    p.outline((c) => shade(c, -0.66));
    return p;
  };
  const frames = {
    down: [make('down', 0), make('down', 1), make('down', 2), make('down', 3), make('down', 0, true)],
    up: [make('up', 0), make('up', 1), make('up', 2), make('up', 3)],
    left: [make('left', 0), make('left', 1), make('left', 2), make('left', 3), make('left', 0, true)],
  };
  frames.right = frames.left.map((f) => f.flipped());
  return frames;
}

// ---------------------------------------------------------------------------
// Chicken (32 x 32), facing left; frames: 0-1 walk, 2 peck
// ---------------------------------------------------------------------------
export function chickenFrames(brown = false) {
  const F = brown
    ? [0, C('#4a2a14'), C('#7a4a24'), C('#a86a36'), C('#c98a4e'), C('#e2ae72')]
    : [0, C('#8f8c98'), C('#bbb7c0'), C('#dcd8de'), C('#f1eef1'), C('#ffffff')];
  const make = (f) => {
    const p = new Pix(32, 32);
    const peck = f === 2;
    const legs = f === 1 ? [[14, 0], [19, 1]] : [[15, 1], [18, 0]];
    for (const [lx, up] of legs) { p.rect(lx, 25 - up, 1, 5 + up, ORANGE[3]); p.rect(lx - 1, 29, 3, 1, ORANGE[2]); }
    p.ellipse(24, 14, 5, 7, (x, y, nx, ny) => F[lightIndex(sphereLight(nx, ny), 6)]);
    p.ellipse(17, 20, 9.5, 7, (x, y, nx, ny) => F[lightIndex(sphereLight(nx, ny) + 0.1, 6)]);
    for (let a = 0.2; a < 2.6; a += 0.1) p.set(19 + Math.cos(a) * 5, 19 + Math.sin(a) * 3, F[2]);
    const hx = peck ? 8 : 10, hy = peck ? 22 : 11;
    p.ellipse(hx, hy, 5, 5, (x, y, nx, ny) => F[lightIndex(sphereLight(nx, ny) + 0.1, 6)]);
    p.rect(hx - 2, hy - 7, 5, 2, RED[3]); p.set(hx - 2, hy - 7, RED[4]); p.rect(hx - 1, hy - 8, 2, 1, RED[3]);
    p.rect(hx - 7, hy - 1, 3, 2, ORANGE[4]); p.set(hx - 7, hy, ORANGE[2]);
    p.rect(hx - 5, hy + 2, 2, 2, RED[3]);
    p.set(hx - 3, hy - 2, DARK[1]);
    p.outline((c) => shade(c, -0.6));
    return p;
  };
  const left = [make(0), make(1), make(2)];
  return { left, right: left.map((f) => f.flipped()) };
}
