// The always-on minimap in the corner: a flat-colour plan of the valley drawn
// from the tile grid, with the camera's view, the displays and the player on
// top. Click (or tap) it to walk there; hover it to see the place's name.
import { GROUND } from './art-nature.js';
import { RES } from './art-core.js';

const PX = 6; // canvas pixels per tile (shown at 3 CSS px per tile)
const GROUND_COL = {
  [GROUND.GRASS]: '#7cba50', [GROUND.DIRT]: '#b58a52', [GROUND.COBBLE]: '#e2d2ae', [GROUND.SOIL]: '#7a5232',
  [GROUND.SAND]: '#efd9a0', [GROUND.WATER]: '#4c9bd6', [GROUND.PLANK]: '#a8763f',
};

export function createMinimap({ canvas, world, game, isFound, onPick }) {
  const { W, H, T } = world;
  canvas.width = W * PX; canvas.height = H * PX;
  canvas.style.setProperty('--mw', W); canvas.style.setProperty('--mh', H);
  const g = canvas.getContext('2d');

  // static layer: ground, trees, buildings
  const base = document.createElement('canvas');
  base.width = canvas.width; base.height = canvas.height;
  const b = base.getContext('2d');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    b.fillStyle = GROUND_COL[world.tiles[y * W + x]] || GROUND_COL[GROUND.GRASS];
    b.fillRect(x * PX, y * PX, PX, PX);
  }
  b.fillStyle = '#2e6a35';
  for (const o of world.objects) {
    if (o.kind !== 'tree') continue;
    const tx = Math.floor((o.x + o.w / 2) / T), ty = Math.floor(o.sortY / T);
    b.beginPath(); b.arc((tx + 0.5) * PX, (ty + 0.5) * PX, PX * 0.85, 0, Math.PI * 2); b.fill();
  }
  const doors = world.interact.filter((i) => i.kind === 'door' || i.kind === 'house');
  for (const o of world.objects) {
    if (o.kind !== 'building' && o.kind !== 'fountain') continue;
    let col = '#4c9bd6';
    if (o.kind === 'building') {
      const door = doors.find((d) => d.x >= o.x && d.x < o.x + o.w && d.y >= o.y && d.y <= o.y + o.h);
      col = door?.district?.color || '#c9763a';
    }
    const x = (o.x / T) * PX, y = (o.y / T) * PX, w = (o.w / T) * PX, h = (o.kind === 'fountain' ? 2 : o.h / T) * PX;
    const yy = o.kind === 'fountain' ? (Math.floor(o.sortY / T) - 1) * PX : y;
    b.fillStyle = 'rgba(40, 24, 14, .55)'; b.fillRect(x, yy + 2, w, h);
    b.fillStyle = col; b.fillRect(x, yy, w, h - 2);
  }

  const toWorld = (e) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W * T, ((e.clientY - r.top) / r.height) * H * T];
  };
  const lotAt = (wx, wy) => world.placed.find((it) => wx > it.x - 16 && wx < it.x + it.w + 16 && wy > it.y - 16 && wy < it.y + it.h + 16);
  const areaAt = (wx, wy) => {
    const tx = Math.floor(wx / T), ty = Math.floor(wy / T);
    return world.areas.find((a) => tx >= a.x0 && tx <= a.x1 && ty >= a.y0 && ty <= a.y1);
  };
  canvas.addEventListener('click', (e) => {
    e.stopPropagation();
    const [wx, wy] = toWorld(e);
    const lot = lotAt(wx, wy);
    onPick?.(lot ? { lot } : { x: wx, y: wy });
  });
  canvas.addEventListener('pointermove', (e) => {
    const [wx, wy] = toWorld(e);
    const lot = lotAt(wx, wy);
    canvas.title = lot ? `${lot.lot.title} (${isFound(lot.lot.id) ? 'found' : 'not found yet'})` : (areaAt(wx, wy)?.name || 'Click to walk there');
  });

  return {
    draw(t) {
      g.drawImage(base, 0, 0);
      const s = PX / T;
      // displays: found ones settle, unfound ones blink white
      const blink = Math.sin(t * 5) > 0;
      for (const it of world.placed) {
        const found = isFound(it.lot.id);
        const x = it.x * s, y = it.y * s, w = it.w * s, h = it.h * s;
        g.globalAlpha = found ? 0.6 : 1;
        g.fillStyle = it.district.color; g.fillRect(x, y, w, h);
        g.globalAlpha = 1;
        if (!found) { g.strokeStyle = blink ? '#ffffff' : '#3b1d0e'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2); }
      }
      // what's on screen right now
      const vw = game.buf.width / RES, vh = game.buf.height / RES;
      g.strokeStyle = 'rgba(255, 255, 255, .85)'; g.lineWidth = 2;
      g.strokeRect(Math.max(1, game.cam.x * s), Math.max(1, game.cam.y * s), Math.min(canvas.width - 2, vw * s), Math.min(canvas.height - 2, vh * s));
      // where you're walking to, then you
      const path = game.player.path;
      if (path?.length) { const n = path[path.length - 1]; g.fillStyle = '#ffe14a'; g.fillRect(n.x * s - 3, n.y * s - 3, 6, 6); }
      const px = game.player.x * s, py = (game.player.y - 8) * s;
      g.fillStyle = '#3b1d0e'; g.beginPath(); g.arc(px, py, PX * 1.15, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(px, py, PX * 0.75, 0, Math.PI * 2); g.fill();
    },
  };
}
