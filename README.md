# Aaran's Valley

A Stardew-style pixel-art portfolio you can walk around, plus a classic web page with the same content.

- `index.html`: the game. Walk with WASD/arrows (or click/tap to walk), E to inspect, M for the map, Esc for the menu, 1-4 to jump to a district, H to go home.
- `classic.html`: the classic website (light/dark, printable). `plain.html` redirects to it.
- `content.js`: all the text. Edit this, not the renderers. Search for `TODO` before publishing.

Every pixel is drawn by code. The world is laid out at 32 logical px per tile and every sprite and the ground are stored at 2x (`RES` in `js/art-core.js`), so each tile is 64x64 stored pixels: 16x the pixels of a Stardew tile. There is no image folder to maintain.

## Layout

A plus sign: the town square in the middle and four straight streets out of it, one per district
(north, east, west, south; set `slot` in `content.js` to `n`, `e`, `w` or `s`). Each street is lined with that
district's displays on both sides and ends at its building, so every project is a straight walk from the square.
The south street runs down to Beach Road (Aaran's house, the lab building), then the beach and pier. Pond Park and
an orchard fill the top corners.

## Files

| File | What it does |
| --- | --- |
| `js/art-core.js` | pixel painter, hue-shifted shading, noise, 5x7 sign font |
| `js/palette.js` | every colour ramp, seasons, character options |
| `js/art-nature.js` | ground (per-pixel terrain blend), trees, grass, flowers |
| `js/art-build.js` | buildings (with lit-window layers), fences, arches, street furniture |
| `js/art-props.js` | one display prop and one icon per project |
| `js/art-chars.js` | player (4 directions, walk cycle, item-get pose), robot pet, chickens |
| `js/art-ui.js` | nine-slice frames, logo, cursor, UI icons |
| `js/world.js` | the map layout and collision |
| `js/game.js` | engine: scaling, camera, movement, pathfinding, lighting, particles |
| `js/ui.js`, `js/main.js` | HUD, dialogue, menus, quests, save state |
| `js/audio.js` | synthesised sound effects |
| `js/classic.js` | the classic page |

## Run

    python3 serve.py   # http://127.0.0.1:8742

## Test

Open `http://127.0.0.1:8742/dev/tests.html` (reachability, collision, pathfinding, art in all four seasons,
classic page). `dev/sprites.html?season=fall` shows every sprite. `window.__valley.simulate(seconds)`
steps the game without animation frames, which pause in hidden tabs.

The old 3D version is in `legacy-3d/`.
