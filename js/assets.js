// Bakes every sprite the world needs into canvases, once per season and look.
import * as N from './art-nature.js';
import * as B from './art-build.js';
import * as P from './art-props.js';
import * as CH from './art-chars.js';
import * as U from './art-ui.js';
import { GAME } from '../content.js';

export function buildAssets(world, season, look) {
  const A = new Map(), meta = new Map();
  const c = (pix) => (pix ? pix.canvas() : null);
  for (let v = 0; v < 3; v++) A.set(`oak${v}`, c(N.oakTree(season, v)));
  for (let v = 0; v < 2; v++) A.set(`pine${v}`, c(N.pineTree(season, v)));
  for (let m = 0; m < 16; m++) A.set(`fence${m}`, c(B.fence(m)));
  for (let f = 0; f < 3; f++) A.set(`tuft${f}`, c(N.grassTuft(season, f)));

  for (const o of world.objects) {
    if (A.has(o.key)) continue;
    if (o.kind === 'arch') A.set(o.key, c(B.arch(o.text, o.color, o.w)));
    else if (o.kind === 'board' && o.text) A.set(o.key, c(B.welcomeSign([o.text], o.color)));
    else if (o.kind === 'building') {
      const b = B.building(o.building, season);
      A.set(o.key, c(b.pix));
      A.set(`${o.key}:lit`, c(b.lit));
      meta.set(o.key, b);
    } else if (o.kind === 'prop') {
      const k = o.lot.sprite || 'generic';
      const n = P.ANIMATED_PROPS[k] || 1;
      A.set(o.key, n > 1 ? Array.from({ length: n }, (_, f) => c(P.prop(k, f))) : c(P.prop(k)));
    }
  }
  const once = {
    sign: () => B.smallSign(), barrel: () => B.barrel(), crate: () => B.crate(),
    mailbox: () => B.mailbox(false), 'mailbox:up': () => B.mailbox(true), bin: () => B.shippingBin(),
    crop: () => B.crop(season, 0), soon: () => B.constructionSign(),
    welcome: () => B.welcomeSign(['Welcome to', GAME.title]), board: () => B.noticeBoard(),
    signpost: () => B.signpost(), bench: () => B.bench(), planter: () => N.planter(season),
    lamp: () => B.lamp(false), 'lamp:on': () => B.lamp(true), log: () => N.driftwood(),
    rock0: () => N.rock(0), rock1: () => N.rock(1), shell0: () => N.shell(0), shell1: () => N.shell(1),
    cattail: () => N.cattail(), bubble: () => U.bubble(),
  };
  for (const [k, fn] of Object.entries(once)) A.set(k, c(fn()));
  A.set('fountain', [0, 1, 2, 3].map((f) => c(B.fountain(f))));
  A.set('campfire', [0, 1, 2].map((f) => c(B.campfire(f))));

  // characters
  A.set('player', toCanvases(CH.playerFrames(look)));
  A.set('pet', toCanvases(CH.petFrames()));
  A.set('hen', toCanvases(CH.chickenFrames(false)));
  A.set('hen2', toCanvases(CH.chickenFrames(true)));

  // icons
  for (const k of P.ICON_KEYS) A.set(`icon:${k}`, c(P.icon(k)));

  const ground = N.renderGround(world.tiles, world.W, world.H, season, world.decals);
  return { A, meta, ground, season };
}

export function lookFrames(look) { return toCanvases(CH.playerFrames(look)); }

function toCanvases(frames) {
  const out = {};
  for (const [k, v] of Object.entries(frames)) out[k] = Array.isArray(v) ? v.map((p) => p.canvas()) : v.canvas();
  return out;
}
