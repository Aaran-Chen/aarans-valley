// Tiny synthesised sound effects (no audio files). Everything is quiet by design.
import { GROUND } from './art-nature.js';

let ctx = null, master = null, enabled = true, noiseBuf = null;

export function setSound(on) { enabled = on; if (master) master.gain.value = on ? 0.32 : 0; }
export function soundOn() { return enabled; }

// Browsers only allow audio after a user gesture; call this from one.
export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.32 : 0;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
}

function tone(freq, dur, { type = 'square', vol = 0.12, at = 0, slide = 0, attack = 0.005 } = {}) {
  if (!ctx || !enabled) return;
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(dur, { freq = 1200, q = 1, vol = 0.1, at = 0, type = 'bandpass' } = {}) {
  if (!ctx || !enabled) return;
  const t0 = ctx.currentTime + at;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t0); s.stop(t0 + dur + 0.02);
}

const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, A5 = 880, D6 = 1174.66;

export const sfx = {
  step(ground) {
    if (ground === GROUND.COBBLE) noise(0.05, { freq: 2600, q: 2, vol: 0.05 });
    else if (ground === GROUND.PLANK) { noise(0.06, { freq: 500, q: 3, vol: 0.07 }); tone(140, 0.05, { type: 'sine', vol: 0.03 }); }
    else if (ground === GROUND.SAND) noise(0.07, { freq: 1600, q: 0.7, vol: 0.035 });
    else if (ground === GROUND.DIRT) noise(0.05, { freq: 900, q: 1.2, vol: 0.05 });
    else noise(0.06, { freq: 1300, q: 0.8, vol: 0.03, type: 'highpass' });
  },
  blip(i = 0) { tone(520 + ((i * 37) % 5) * 22, 0.035, { vol: 0.035 }); },
  open() { tone(A5, 0.07, { type: 'triangle', vol: 0.1 }); tone(D6, 0.09, { type: 'triangle', vol: 0.1, at: 0.06 }); },
  close() { tone(D6, 0.06, { type: 'triangle', vol: 0.08 }); tone(A5, 0.08, { type: 'triangle', vol: 0.08, at: 0.05 }); },
  select() { tone(1400, 0.03, { type: 'square', vol: 0.03 }); },
  get() { [C5, E5, G5, C6].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.12, at: i * 0.08 })); tone(C6 * 1.5, 0.3, { type: 'sine', vol: 0.05, at: 0.34 }); },
  quest() { [G5, C6, E5 * 2, G5 * 2].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.1, at: i * 0.1 })); },
  warp() { tone(900, 0.35, { type: 'sine', vol: 0.08, slide: -600 }); noise(0.3, { freq: 3000, q: 4, vol: 0.03, at: 0.05 }); },
  beep() { tone(880, 0.07, { type: 'sine', vol: 0.08 }); tone(1320, 0.09, { type: 'sine', vol: 0.08, at: 0.09 }); },
  cluck() { tone(700, 0.06, { type: 'square', vol: 0.04, slide: 300 }); tone(560, 0.08, { type: 'square', vol: 0.04, at: 0.08, slide: 200 }); },
  splash() { noise(0.25, { freq: 900, q: 0.6, vol: 0.08 }); },
};
