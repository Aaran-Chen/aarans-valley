// Every colour ramp in the valley. Ramps run dark -> light; index 0 is the outline shade.
import { ramp } from './art-core.js';

export const SEASONS = ['spring', 'summer', 'fall', 'winter'];

export const GRASS = {
  spring: ramp(['#1f4a2a', '#2e6b34', '#3f8a3c', '#56a646', '#76c257', '#a3db72']),
  summer: ramp(['#1b3f24', '#28592c', '#377532', '#4b9039', '#67ab47', '#8fc75f']),
  fall: ramp(['#3d2e12', '#5f4c1b', '#857126', '#a48e31', '#c1a843', '#dcc262']),
  winter: ramp(['#7b8da6', '#9dafc5', '#bfcede', '#d9e3ee', '#edf3f8', '#ffffff']),
};
export const FOLIAGE = {
  spring: ramp(['#1b3a22', '#2a582b', '#3d7a33', '#57a03e', '#7ac24d', '#aee07a']),
  summer: ramp(['#13301c', '#1f4a26', '#2d662d', '#418639', '#5ca546', '#84c65c']),
  fall: ramp(['#3c140f', '#6a2313', '#983a18', '#c6591e', '#e6842b', '#f6b648']),
  winter: ramp(['#13301c', '#1f4a26', '#2d662d', '#418639', '#5ca546', '#84c65c']),
};
export const FOLIAGE_ALT = {
  spring: ramp(['#52203d', '#84325c', '#b44d80', '#da76a4', '#f0a6c4', '#ffd6e6']), // blossom
  summer: ramp(['#173a1a', '#255a22', '#367a2a', '#4d9a33', '#6cba40', '#98d45e']),
  fall: ramp(['#46300e', '#755512', '#a37b17', '#cda223', '#e9c63a', '#f9e278']),
  winter: ramp(['#13301c', '#1f4a26', '#2d662d', '#418639', '#5ca546', '#84c65c']),
};
export const PINE = ramp(['#0c1f17', '#143325', '#1b4830', '#25603b', '#347a46', '#4c9655']);
export const SNOW = ramp(['#6f829c', '#9fb2c8', '#c6d4e2', '#e2eaf2', '#f4f8fb', '#ffffff']);
export const BARK = ramp(['#2a180e', '#452b19', '#633f24', '#825531', '#9e6c40', '#b98653']);
export const DIRT = ramp(['#4a2d19', '#5f3b22', '#7a4f2e', '#94653b', '#ad7c4b', '#c79662']);
export const SOIL = ramp(['#2b190f', '#3b2416', '#4e311e', '#634028', '#7a5334', '#8f6744']);
export const COBBLE = ramp(['#3a3642', '#57515f', '#736c7a', '#8f8894', '#aba2ac', '#c9c0c6']);
export const SAND = ramp(['#9c7244', '#bb905c', '#d3aa72', '#e5c48e', '#f1dab0', '#fbeed2']);
export const WATER = ramp(['#132f4d', '#1a4468', '#225a86', '#2e74a3', '#4a93c2', '#7cbde0', '#c6e9f6']);
export const WOOD = ramp(['#2c180c', '#4b2b16', '#6d4222', '#8f5a30', '#b07542', '#cf955a']);
export const WOOD_GRAY = ramp(['#2e2622', '#4a3d35', '#67574b', '#837061', '#9f8a78', '#bba592']);
export const WOOD_LIGHT = ramp(['#4a2c16', '#7a4c26', '#a26a36', '#c28848', '#dca660', '#f0c480']);
export const STONE = ramp(['#2f2c36', '#4b4753', '#67626f', '#837d8a', '#a39ca8', '#c5bec8']);
export const METAL = ramp(['#1c1f2b', '#373c4f', '#565e75', '#7c859c', '#a8b0c3', '#dce2ec']);
export const DARK = ramp(['#0c0c12', '#191a24', '#262735', '#353648', '#4a4b62', '#66677f']);
export const RED = ramp(['#360d13', '#661720', '#a0242c', '#d13f38', '#ef6750', '#ff9f85']);
export const BLUE = ramp(['#0d1837', '#182c63', '#244695', '#3767c3', '#5d9ee8', '#a5d1ff']);
export const TEAL = ramp(['#0c2828', '#15403f', '#1f5b57', '#2d7a70', '#46998a', '#6fbba6']);
export const GREEN = ramp(['#0e2918', '#184627', '#266a35', '#3a9046', '#5eb55c', '#97da84']);
export const YELLOW = ramp(['#4a2a06', '#86500e', '#c07a14', '#e6a526', '#f7cd4f', '#fff196']);
export const ORANGE = ramp(['#3f1606', '#77300c', '#b24d12', '#e0701c', '#f59a3c', '#ffc77a']);
export const PINK = ramp(['#480f2e', '#78204e', '#ad3a75', '#dc5f9e', '#f597c6', '#ffd0e7']);
export const PURPLE = ramp(['#1c0f2e', '#361c56', '#553084', '#784bae', '#9f74d2', '#cda9ef']);
export const CYAN = ramp(['#07303e', '#0c586c', '#1799b1', '#3dd4e6', '#9ff6ff', '#ffffff']);
export const PAPER = ramp(['#6b5d46', '#a8977a', '#cfc0a0', '#e9dfc6', '#f7f1e2', '#ffffff']);
export const GLASS = ramp(['#132238', '#20395c', '#335c86', '#5287b0', '#8fbfdc', '#d7f0fb']);
export const BRICK = ramp(['#34110f', '#5e1d19', '#842c23', '#a53d2f', '#c35643', '#dc7a62']);
export const LAVENDER = ramp(['#2b2840', '#48445f', '#666180', '#857fa0', '#a7a2bf', '#cbc7dd']);
export const WHITE = ramp(['#5b5a66', '#8f8c98', '#bbb7c0', '#dcd8de', '#f1eef1', '#ffffff']);
export const GOLD = ramp(['#3d2604', '#6d460a', '#a06d12', '#d09a22', '#f0c64a', '#fff08e']);

export const ROOF = {
  red: ramp(['#34101a', '#5f1a22', '#8a2a2b', '#b23d36', '#d35f47', '#ec8b66']),
  slate: ramp(['#161c2e', '#232e4a', '#33456a', '#46608c', '#6581ad', '#8ea7cc']),
  purple: ramp(['#1d1030', '#351d52', '#502d76', '#6d4399', '#8f64bb', '#b692da']),
  steel: ramp(['#1b2029', '#2c3441', '#414b5c', '#5b6779', '#7d899b', '#a7b1c1']),
  green: ramp(['#10261c', '#1a3f2b', '#265a3a', '#347849', '#4c985c', '#72b879']),
};

// Character options. Index into these from content.js / the appearance menu.
export const SKINS = [
  ramp(['#5a2e22', '#9a5a42', '#c47c5e', '#e2a17d', '#f4c29e', '#fde0c6']),
  ramp(['#43221a', '#7a4430', '#a05f3e', '#c07c52', '#d99a6a', '#ecb888']),
  ramp(['#2a150d', '#512b1a', '#6f3e24', '#8d5532', '#a86d42', '#c28858']),
  ramp(['#1c0e09', '#3a1f14', '#522c1c', '#6a3b26', '#824c32', '#9a6042']),
];
export const HAIRS = [
  ramp(['#0c0a10', '#17131c', '#241d2a', '#352a3a', '#4a3a4e', '#62506a']), // black
  ramp(['#1e1009', '#3a2012', '#56321c', '#744628', '#925d36', '#b07a4a']), // brown
  ramp(['#3a1c06', '#6a3a0e', '#9a5a18', '#c47e28', '#e2a444', '#f6c86a']), // ginger
  ramp(['#4a3a12', '#7a6224', '#a88a3a', '#d0b256', '#ead27a', '#f8eaa8']), // blond
  ramp(['#101a3a', '#1a2c62', '#26448e', '#3a62b8', '#5a88d8', '#8ab0f0']), // blue
];
export const SHIRTS = [
  TEAL, RED, BLUE, GREEN, PURPLE, ORANGE,
];
export const PANTS = [
  ramp(['#0d1226', '#182244', '#233266', '#304486', '#4460a8', '#6482c4']),
  ramp(['#1a1410', '#2e241c', '#43362a', '#5a4a3a', '#73604c', '#8c7862']),
];
export const SHOES = ramp(['#1a0e08', '#2e1a10', '#472a1a', '#603c26', '#7a5034', '#946644']);
