/* ==========================================================
   Penisbasar – feste Daten
   Kategorien und Block-Texturen. Die Angebote selbst liegen
   jetzt in der Supabase-Datenbank (siehe supabase/seed.sql).
   ========================================================== */

const CATEGORIES = [
  { id: 'bloecke',   name: 'Blöcke',    icon: 'blocks', color: '#7c9cff' },
  { id: 'erze',      name: 'Erze',      icon: 'ores',   color: '#4fe3d6' },
  { id: 'werkzeuge', name: 'Werkzeuge', icon: 'tools',  color: '#f6c94e' },
  { id: 'ruestung',  name: 'Rüstung',   icon: 'armor',  color: '#b58cff' },
  { id: 'essen',     name: 'Essen',     icon: 'food',   color: '#ff8a65' },
  { id: 'sonstiges', name: 'Sonstiges', icon: 'misc',   color: '#45d49a' },
];

// Farbpaletten für die Pixel-Würfel (siehe pixel.js)
const STONE = ['#8c8c8c', '#7d7d7d', '#999999', '#737373'];

const TEXTURES = {
  grass:         { name: 'Grasblock',     type: 'grass', top: ['#6fb83f', '#5ea534', '#7fc74a', '#549a2e'], side: ['#8a5a35', '#7a4f2e', '#97643c', '#6d4628'] },
  stone:         { name: 'Stein',         base: STONE },
  cobblestone:   { name: 'Bruchstein',    base: ['#8f8f8f', '#5f5f5f', '#a6a6a6', '#6c6c6c', '#4f4f4f'] },
  oak_log:       { name: 'Eichenstamm',   type: 'log', top: ['#b48a52', '#a47c48', '#c29a60'], side: ['#6b5130', '#5b4428', '#7a5d37'] },
  oak_planks:    { name: 'Eichenbretter', type: 'planks', base: ['#b38a52', '#a8814c', '#bd955c'] },
  sand:          { name: 'Sand',          base: ['#e3d6a0', '#d8ca8f', '#ede1b0', '#d2c389'] },
  glass:         { name: 'Glas',          type: 'glass' },
  obsidian:      { name: 'Obsidian',      base: ['#15101f', '#21182f', '#2d2142', '#0e0b15', '#3b2a58'] },
  quartz:        { name: 'Quarzblock',    base: ['#ece6dd', '#e4ddd2', '#f4efe8'] },
  coal_ore:      { name: 'Kohleerz',      base: STONE, spots: ['#2a2a2a', '#1c1c1c', '#3a3a3a'] },
  iron_ore:      { name: 'Eisenerz',      base: STONE, spots: ['#e0b79a', '#c9967a', '#efd0b8'] },
  gold_ore:      { name: 'Golderz',       base: STONE, spots: ['#fbe35a', '#f0c22a', '#fff2a0'] },
  redstone_ore:  { name: 'Redstone-Erz',  base: STONE, spots: ['#e32b2b', '#b81c1c', '#ff5c5c'] },
  emerald_ore:   { name: 'Smaragderz',    base: STONE, spots: ['#3de07f', '#1fb35d', '#9bf7bf'] },
  diamond_ore:   { name: 'Diamanterz',    base: STONE, spots: ['#5ef2e3', '#2cc8bd', '#c2fff9'] },
  iron_block:    { name: 'Eisenblock',    type: 'block', base: ['#dedede', '#d2d2d2', '#e9e9e9', '#c4c4c4'] },
  gold_block:    { name: 'Goldblock',     type: 'block', base: ['#f8d74a', '#efc534', '#fde77a', '#dcae25'] },
  emerald_block: { name: 'Smaragdblock',  type: 'block', base: ['#3ddc7c', '#2bc46a', '#6aeb9b', '#22a95a'] },
  diamond_block: { name: 'Diamantblock',  type: 'block', base: ['#62ebe0', '#4ad6cc', '#8ff5ec', '#3cbfb5'] },
};
