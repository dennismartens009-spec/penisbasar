/* ==========================================================
   Penisbasar – Pixel-Grafiken
   Zeichnet Blöcke als kleine 3D-Würfel und für jeden Spieler-
   namen einen eigenen Pixel-Kopf. Alles wird per Code erzeugt,
   wir brauchen also keine Bilddateien.
   ========================================================== */

// Aus einem Text eine Zahl machen (gleicher Text => immer gleiche Zahl)
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Zufallsgenerator, der bei gleichem Startwert immer gleich "würfelt"
function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pickFrom = (list, rnd) => list[Math.floor(rnd() * list.length)];

// Farbe heller (> 1) oder dunkler (< 1) machen
function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * factor)));
  const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

// Eine 8×8-Pixel-Fläche für eine Würfelseite erzeugen
function makeFace(tex, face, rnd) {
  const type = tex.type || 'plain';
  const grid = [];
  for (let y = 0; y < 8; y++) {
    grid.push([]);
    for (let x = 0; x < 8; x++) {
      let palette = tex.base;
      if (type === 'grass' || type === 'log') palette = face === 'top' ? tex.top : tex.side;
      grid[y].push(palette ? pickFrom(palette, rnd) : null);
    }
  }
  const each = (fn) => grid.forEach((row, y) => row.forEach((_, x) => fn(x, y)));

  if (type === 'grass' && face === 'side') {
    for (let x = 0; x < 8; x++) {
      grid[0][x] = pickFrom(tex.top, rnd);
      if (rnd() < 0.45) grid[1][x] = pickFrom(tex.top, rnd);
    }
  }
  if (type === 'log' && face === 'side') {
    each((x, y) => { if (x % 3 === 1) grid[y][x] = shade(tex.side[1], 0.82); });
  }
  if (type === 'log' && face === 'top') {
    each((x, y) => {
      const ring = Math.max(Math.abs(x - 3.5), Math.abs(y - 3.5));
      if (ring > 3) grid[y][x] = pickFrom(tex.side, rnd);
      else if (Math.floor(ring) % 2 === 1) grid[y][x] = shade(tex.top[0], 0.86);
    });
  }
  if (type === 'planks') {
    each((x, y) => {
      if (y % 4 === 3) grid[y][x] = shade(tex.base[0], 0.72);
      else if (x === (y < 4 ? 5 : 1)) grid[y][x] = shade(tex.base[0], 0.82);
    });
  }
  if (type === 'block') {
    each((x, y) => {
      if (x === 0 || y === 0) grid[y][x] = shade(grid[y][x], 1.12);
      if (x === 7 || y === 7) grid[y][x] = shade(grid[y][x], 0.8);
    });
  }
  if (type === 'glass') {
    each((x, y) => {
      const edge = x === 0 || y === 0 || x === 7 || y === 7;
      const streak = (x + y === 6 || x + y === 7) && x > 1 && x < 6;
      grid[y][x] = edge ? '#e6fbff' : streak ? '#ffffff' : null;
    });
  }
  // Erz-Flecken: ein paar kleine Pixel-Grüppchen in der Erzfarbe
  if (tex.spots) {
    const clusters = 3 + Math.floor(rnd() * 2);
    for (let i = 0; i < clusters; i++) {
      const cx = 1 + Math.floor(rnd() * 5);
      const cy = 1 + Math.floor(rnd() * 5);
      [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([dx, dy]) => {
        if (dx + dy === 0 || rnd() < 0.55) grid[cy + dy][cx + dx] = pickFrom(tex.spots, rnd);
      });
    }
  }
  return grid;
}

// Einen Block als isometrischen 3D-Würfel (SVG) zeichnen
function cubeSVG(key, seed = '') {
  const tex = TEXTURES[key];
  if (!tex) return '';
  const rnd = seededRandom(hashStr(key + '|' + seed));
  // Drei sichtbare Seiten: oben, links, rechts – die Seiten bekommen Schatten für den 3D-Effekt
  const faces = [
    { face: 'top',  transform: 'matrix(4.33 2.5 -4.33 2.5 50 10)', shadow: 0 },
    { face: 'side', transform: 'matrix(4.33 2.5 0 5 15.36 30)',    shadow: 0.2 },
    { face: 'side', transform: 'matrix(4.33 -2.5 0 5 50 50)',      shadow: 0.38 },
  ];
  let svg = '<svg class="cube" viewBox="0 0 100 100" aria-hidden="true"><ellipse class="cube-shadow" cx="50" cy="93" rx="30" ry="5"/>';
  for (const f of faces) {
    const grid = makeFace(tex, f.face, rnd);
    svg += `<g transform="${f.transform}" shape-rendering="crispEdges">`;
    if (tex.type === 'glass') svg += '<rect width="8" height="8" fill="#aee3ee" fill-opacity=".22"/>';
    grid.forEach((row, y) => row.forEach((color, x) => {
      if (color) svg += `<rect x="${x}" y="${y}" width="1.04" height="1.04" fill="${color}"/>`;
    }));
    if (f.shadow) svg += `<rect width="8" height="8" fill="#000" fill-opacity="${f.shadow}"/>`;
    svg += '</g>';
  }
  return svg + '</svg>';
}

// Zu jedem Namen einen eigenen 8×8-Pixel-Kopf erzeugen
const SKINS = ['#f2c79b', '#e0ac7e', '#c68a5c', '#9a6440', '#6e4630', '#ffd9b8'];
const HAIRS = ['#3b2a1a', '#6a4a2a', '#1f1b1b', '#d8b25e', '#a5432a', '#e6e2da', '#3d5bab', '#2f7a4f'];
const EYES = ['#3a6fd8', '#2e8b57', '#5a3a1a', '#7a3fc0', '#1d9bb5'];

function pixelHead(name) {
  const rnd = seededRandom(hashStr(String(name).toLowerCase()));
  const skin = pickFrom(SKINS, rnd);
  const hair = pickFrom(HAIRS, rnd);
  const eye = pickFrom(EYES, rnd);
  const beard = rnd() < 0.25;
  const longHair = rnd() < 0.4;
  let svg = '<svg class="head" viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      let c = skin;
      if (y < 2) c = hair;
      if (y === 2 && (x === 0 || x === 7 || rnd() < 0.25)) c = hair;
      if (y >= 3 && y <= 5 && (x === 0 || x === 7) && longHair) c = hair;
      if (y === 4 && (x === 1 || x === 6)) c = '#ffffff';
      if (y === 4 && (x === 2 || x === 5)) c = eye;
      if (y === 5 && (x === 3 || x === 4)) c = shade(skin, 0.85);
      if (y === 6 && x >= 2 && x <= 5) c = beard ? hair : shade(skin, 0.68);
      if (y === 7 && beard && x >= 1 && x <= 6) c = hair;
      svg += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${shade(c, 0.93 + rnd() * 0.14)}"/>`;
    }
  }
  return svg + '</svg>';
}
