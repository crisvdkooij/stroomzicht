/* model.js — fictieve netdata: generator en statuslogica.
   Alles hier is verzonnen en reproduceerbaar (vaste seed). Alleen de kustlijn,
   provinciegrenzen en plaatsnamen komen uit open data. */
(function (root) {
'use strict';

const YEARS = Array.from({ length: 10 }, (_, i) => 2026 + i);
const NY = YEARS.length;
const FLEXMAX = 1.08;            // daarboven helpt ook een tijdgebonden contract niet meer
const KM = 3.665;                // kaarteenheden per kilometer (rond 52° NB)

// Dagprofielen per uur, elk met piek = 1
const PROFILE = {
  res:  [0.42,0.38,0.36,0.35,0.36,0.42,0.58,0.74,0.72,0.64,0.60,0.60,0.62,0.60,0.60,0.66,0.80,0.96,1.00,0.97,0.88,0.76,0.62,0.50],
  biz:  [0.40,0.38,0.37,0.37,0.38,0.44,0.60,0.82,0.96,1.00,1.00,0.98,0.94,0.98,1.00,0.97,0.90,0.76,0.62,0.54,0.50,0.46,0.43,0.41],
  ind:  [0.86,0.85,0.84,0.84,0.85,0.88,0.93,0.97,1.00,1.00,0.99,0.98,0.97,0.99,1.00,0.99,0.97,0.95,0.93,0.91,0.90,0.89,0.88,0.87],
  sun:  [0.03,0.03,0.03,0.03,0.03,0.05,0.10,0.24,0.43,0.63,0.80,0.93,1.00,0.99,0.92,0.78,0.60,0.40,0.21,0.09,0.04,0.03,0.03,0.03],
  wind: [0.80,0.82,0.83,0.82,0.80,0.78,0.76,0.75,0.76,0.78,0.80,0.83,0.86,0.88,0.90,0.90,0.88,0.86,0.84,0.83,0.82,0.81,0.80,0.80],
};

// De keten van hoog naar laag: netten (lijnen) en stations (transformatie) wisselen elkaar af
const CHAIN = [
  { key: 'ehs', group: 'ehs', type: 'net',     short: 'EHS-net',       long: 'Extra-hoogspanningsnet',  owner: 'tennet' },
  { key: 'ks',  group: 'hs',  type: 'station', short: 'Koppelstation', long: 'Koppelstation EHS/HS',    owner: 'tennet' },
  { key: 'hs',  group: 'hs',  type: 'net',     short: 'HS-net',        long: 'Hoogspanningsnet',        owner: 'tennet' },
  { key: 'os',  group: 'ms',  type: 'station', short: 'Onderstation',  long: 'Onderstation HS/MS',      owner: 'regio' },
  { key: 'ms',  group: 'ms',  type: 'net',     short: 'MS-net',        long: 'Middenspanningsnet',      owner: 'regio' },
  { key: 'ws',  group: 'ls',  type: 'station', short: 'Wijkstation',   long: 'Wijkstation MS/LS',       owner: 'regio' },
  { key: 'ls',  group: 'ls',  type: 'net',     short: 'LS-net',        long: 'Laagspanningsnet',        owner: 'regio' },
];

const LEVELS = {
  ehs: { els: [0],    gran: 'region'  },
  hs:  { els: [1, 2], gran: 'deelnet' },
  ms:  { els: [3, 4], gran: 'station' },
  ls:  { els: [5, 6], gran: 'hex'     },
};

// Aansluitcategorie volgt uit het gevraagde vermogen (MW)
const CATS = [
  { key: 'ls',  max: 0.055,    label: 'Kleinverbruik',        conn: 'het laagspanningsnet',  connShort: 'LS-net · 0,4 kV',        els: [5, 6],             gran: 'hex',     at: 6 },
  { key: 'ws',  max: 0.25,     label: 'Klein zakelijk',       conn: 'het wijkstation',       connShort: 'Wijkstation · MS/LS',    els: [0, 1, 2, 3, 4, 5], gran: 'hex',     at: 5 },
  { key: 'ms',  max: 3,        label: 'Middelgroot zakelijk', conn: 'het middenspanningsnet', connShort: 'MS-net · 10–20 kV',     els: [0, 1, 2, 3, 4],    gran: 'station', at: 4 },
  { key: 'os',  max: 20,       label: 'Groot zakelijk',       conn: 'het onderstation',      connShort: 'Onderstation · HS/MS',   els: [0, 1, 2, 3],       gran: 'station', at: 3 },
  { key: 'hs',  max: 150,      label: 'Industrie',            conn: 'het hoogspanningsnet',  connShort: 'HS-net · 110–150 kV',    els: [0, 1, 2],          gran: 'deelnet', at: 2 },
  { key: 'ehs', max: Infinity, label: 'Zware industrie',      conn: 'het extra-hoogspanningsnet', connShort: 'EHS-net · 220–380 kV', els: [0],             gran: 'region',  at: 0 },
];
const catFor = mw => CATS.find(c => mw <= c.max);

const KIND = {
  ehs: { minCap: 800,  avg: 80,    types: ['Nieuwe 380 kV-verbinding', 'Opwaardering 380 kV-ring'] },
  ks:  { bA: 0.42, sA: 0.70, bI: 0.38, sI: 0.72, pProj: 0.90, y0: 2029, y1: 2033, minCap: 200, avg: 40,
         types: ['Extra koppeltransformator', 'Nieuw koppelstation'] },
  hs:  { bA: 0.46, sA: 0.80, bI: 0.40, sI: 0.84, pProj: 0.88, y0: 2028, y1: 2033, minCap: 150, avg: 25,
         types: ['Nieuwe hoogspanningsverbinding', 'Verzwaring bestaande lijn'] },
  os:  { bA: 0.40, sA: 0.86, bI: 0.32, sI: 0.90, pProj: 0.85, y0: 2027, y1: 2031, minCap: 20,  avg: 4,
         types: ['Extra transformator', 'Nieuw onderstation', 'Uitbreiding schakeltuin'] },
  ms:  { bA: 0.38, sA: 0.84, bI: 0.32, sI: 0.88, pProj: 0.80, y0: 2027, y1: 2030, minCap: 12,  avg: 0.8,
         types: ['Nieuwe middenspanningsring', 'Extra voedingskabel'] },
  ws:  { bA: 0.26, sA: 1.06, bI: 0.24, sI: 1.00, pProj: 0.80, y0: 2027, y1: 2029, minCap: 0.16, avg: 0.08,
         types: ['Zwaarder wijkstation', 'Extra transformatorhuisje'] },
  ls:  { bA: 0.24, sA: 0.94, bI: 0.22, sI: 0.96, pProj: 0.72, y0: 2027, y1: 2031, minCap: 0.12, avg: 0.012,
         types: ['Dikkere kabels in de straat', 'Extra laagspanningskabel'] },
};

// EHS-regio's: met de hand gezet, zodat de kaart een herkenbaar verhaal vertelt
const REGIONS = [
  { name: 'Groningen–Drenthe',              A: 0.66, I: 1.06, year: 2031, relief: 0.68, mixA: [0.35, 0.35, 0.30], mixI: [0.45, 0.55] },
  { name: 'Friesland',                      A: 0.74, I: 1.02, year: 2030, relief: 0.70, mixA: [0.45, 0.40, 0.15], mixI: [0.50, 0.50] },
  { name: 'Overijssel–Noordoostpolder',     A: 0.84, I: 0.90, year: 2029, relief: 0.72, mixA: [0.40, 0.42, 0.18], mixI: [0.60, 0.40] },
  { name: 'Flevopolder–Gelderland–Utrecht', A: 1.19, I: 0.86, year: 2032, relief: 0.64, mixA: [0.42, 0.43, 0.15], mixI: [0.55, 0.45] },
  { name: 'Noord-Holland',                  A: 0.99, I: 0.70, year: 2030, relief: 0.70, mixA: [0.42, 0.45, 0.13], mixI: [0.60, 0.40] },
  { name: 'Zuid-Holland',                   A: 0.88, I: 0.64, year: 2029, relief: 0.75, mixA: [0.30, 0.30, 0.40], mixI: [0.50, 0.50] },
  { name: 'Zeeland–West-Brabant',           A: 0.76, I: 1.06, year: 2030, relief: 0.70, mixA: [0.25, 0.30, 0.45], mixI: [0.12, 0.88] },
  { name: 'Midden- en Oost-Brabant',        A: 1.03, I: 0.97, year: 2031, relief: 0.70, mixA: [0.47, 0.45, 0.08], mixI: [0.80, 0.20] },
  { name: 'Limburg',                        A: 0.93, I: 0.78, year: 2030, relief: 0.74, mixA: [0.38, 0.40, 0.22], mixI: [0.80, 0.20] },
];

// Koppelstations EHS/HS: [naam, lengte, breedte, kV, regio, provincies die het voedt]
const KOPPEL = [
  ['Eemshaven',       6.86, 53.44, 380, 0, ['Groningen']],
  ['Meeden',          6.93, 53.14, 380, 0, ['Groningen', 'Drenthe']],
  ['Vierverlaten',    6.48, 53.22, 220, 0, ['Groningen', 'Drenthe']],
  ['Zeyerveen',       6.55, 53.00, 220, 0, ['Drenthe']],
  ['Hoogeveen',       6.50, 52.72, 220, 0, ['Drenthe']],
  ['Bergum',          5.98, 53.20, 220, 1, ['Friesland']],
  ['Louwsmeer',       5.72, 53.19, 220, 1, ['Friesland']],
  ['Oudehaske',       5.87, 52.96, 220, 1, ['Friesland']],
  ['Ens',             5.83, 52.64, 380, 2, ['Flevoland', 'Overijssel']],
  ['Zwolle',          6.15, 52.52, 380, 2, ['Overijssel']],
  ['Hengelo',         6.78, 52.25, 380, 2, ['Overijssel']],
  ['Lelystad',        5.53, 52.55, 380, 3, ['Flevoland']],
  ['Apeldoorn',       6.02, 52.21, 380, 3, ['Gelderland']],
  ['Dodewaard',       5.65, 51.90, 380, 3, ['Gelderland', 'Utrecht']],
  ['Doetinchem',      6.30, 51.96, 380, 3, ['Gelderland']],
  ['Breukelen',       5.00, 52.17, 380, 3, ['Utrecht']],
  ['Diemen',          4.98, 52.34, 380, 4, ['Noord-Holland']],
  ['Oostzaan',        4.87, 52.44, 380, 4, ['Noord-Holland']],
  ['Beverwijk',       4.66, 52.48, 380, 4, ['Noord-Holland']],
  ['Vijfhuizen',      4.68, 52.35, 380, 4, ['Noord-Holland']],
  ['Middenmeer',      5.00, 52.81, 380, 4, ['Noord-Holland']],
  ['Bleiswijk',       4.53, 52.01, 380, 5, ['Zuid-Holland']],
  ['Wateringen',      4.28, 52.02, 380, 5, ['Zuid-Holland']],
  ['Westerlee',       4.22, 51.975, 380, 5, ['Zuid-Holland']],
  ['Maasvlakte',      4.03, 51.95, 380, 5, ['Zuid-Holland']],
  ['Simonshaven',     4.29, 51.82, 380, 5, ['Zuid-Holland']],
  ['Krimpen',         4.60, 51.91, 380, 5, ['Zuid-Holland']],
  ['Crayestein',      4.75, 51.80, 380, 5, ['Zuid-Holland']],
  ['Borssele',        3.72, 51.43, 380, 6, ['Zeeland']],
  ['Rilland',         4.18, 51.42, 380, 6, ['Zeeland', 'Noord-Brabant']],
  ['Geertruidenberg', 4.86, 51.70, 380, 6, ['Noord-Brabant']],
  ['Tilburg',         5.05, 51.60, 380, 7, ['Noord-Brabant']],
  ['Eindhoven',       5.45, 51.47, 380, 7, ['Noord-Brabant']],
  ['Boxmeer',         5.94, 51.64, 380, 7, ['Noord-Brabant', 'Limburg']],
  ['Maasbracht',      5.89, 51.15, 380, 8, ['Limburg']],
  ['Graetheide',      5.82, 50.98, 380, 8, ['Limburg']],
];

const EHS_LINES = [
  ['Eemshaven', 'Meeden', 380], ['Meeden', 'Zwolle', 380], ['Zwolle', 'Ens', 380], ['Ens', 'Lelystad', 380],
  ['Lelystad', 'Diemen', 380], ['Diemen', 'Oostzaan', 380], ['Oostzaan', 'Beverwijk', 380], ['Beverwijk', 'Vijfhuizen', 380],
  ['Vijfhuizen', 'Bleiswijk', 380], ['Bleiswijk', 'Wateringen', 380], ['Wateringen', 'Westerlee', 380],
  ['Westerlee', 'Maasvlakte', 380], ['Maasvlakte', 'Simonshaven', 380], ['Simonshaven', 'Crayestein', 380],
  ['Crayestein', 'Krimpen', 380], ['Krimpen', 'Bleiswijk', 380], ['Krimpen', 'Breukelen', 380], ['Breukelen', 'Diemen', 380],
  ['Crayestein', 'Geertruidenberg', 380], ['Geertruidenberg', 'Tilburg', 380], ['Tilburg', 'Eindhoven', 380],
  ['Eindhoven', 'Maasbracht', 380], ['Maasbracht', 'Graetheide', 380], ['Maasbracht', 'Boxmeer', 380],
  ['Boxmeer', 'Dodewaard', 380], ['Dodewaard', 'Doetinchem', 380], ['Doetinchem', 'Hengelo', 380], ['Hengelo', 'Zwolle', 380],
  ['Dodewaard', 'Breukelen', 380], ['Zwolle', 'Apeldoorn', 380], ['Apeldoorn', 'Dodewaard', 380],
  ['Borssele', 'Rilland', 380], ['Rilland', 'Geertruidenberg', 380], ['Rilland', 'Tilburg', 380], ['Beverwijk', 'Middenmeer', 380],
  ['Eemshaven', 'Vierverlaten', 220], ['Vierverlaten', 'Bergum', 220], ['Bergum', 'Louwsmeer', 220], ['Louwsmeer', 'Oudehaske', 220],
  ['Oudehaske', 'Ens', 220], ['Vierverlaten', 'Zeyerveen', 220], ['Zeyerveen', 'Hoogeveen', 220], ['Hoogeveen', 'Zwolle', 220],
  ['Meeden', 'Zeyerveen', 220],
];
// Verbindingen met het buitenland: [koppelstation, lengte, breedte, land]
const INTERCONNECT = [
  ['Meeden', 7.36, 53.12, 'DE'], ['Hengelo', 7.12, 52.21, 'DE'], ['Doetinchem', 6.66, 51.79, 'DE'], ['Maasbracht', 6.28, 51.09, 'DE'],
  ['Maasbracht', 5.66, 51.10, 'BE'], ['Rilland', 4.27, 51.31, 'BE'], ['Maasvlakte', 3.36, 51.90, 'GB'],
  ['Eemshaven', 6.62, 53.72, 'NO'], ['Eemshaven', 7.02, 53.70, 'DK'],
];

const OPERATOR = {
  Groningen: 'Enexis', Drenthe: 'Enexis', Overijssel: 'Enexis', 'Noord-Brabant': 'Enexis', Limburg: 'Enexis',
  Friesland: 'Liander', 'Noord-Holland': 'Liander', Flevoland: 'Liander', Gelderland: 'Liander',
  Utrecht: 'Stedin', 'Zuid-Holland': 'Stedin', Zeeland: 'Stedin',
};

/* ---------- hulpjes ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x, y, G, seed) {
  const fx = x / G, fy = y / G, ix = Math.floor(fx), iy = Math.floor(fy);
  let tx = fx - ix, ty = fy - iy;
  tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const norm3 = m => { const s = m[0] + m[1] + (m[2] || 0); return m.map(v => v / s); };

function prepDir(d, keys) {
  const p = new Float32Array(24); let mx = 0;
  for (let h = 0; h < 24; h++) {
    let v = 0;
    for (let k = 0; k < keys.length; k++) v += d.mix[k] * PROFILE[keys[k]][h];
    p[h] = v; if (v > mx) mx = v;
  }
  for (let h = 0; h < 24; h++) p[h] /= mx;
  d.p = p;
  d.off = Array.from(p).sort((a, b) => a - b)[7];    // niveau waar 8 uur per dag onder blijft
}
function finalize(el) {
  for (const k of ['A', 'I']) {
    const d = el[k];
    d.r = new Float32Array(NY); d.s = new Uint8Array(NY);
    for (let i = 0; i < NY; i++) {
      let r = d.r0 * Math.pow(1 + d.g, i);
      if (el.proj && YEARS[i] >= el.proj.year) r *= el.proj.relief;
      d.r[i] = r;
      d.s[i] = r < 0.8 ? 0 : r < 0.95 ? 1 : (r < FLEXMAX && r * d.off < 0.75) ? 2 : 3;
    }
  }
}
function mkEl(kind, name, load, sA, sI, mixA, mixI, R, hand) {
  const K = KIND[kind];
  const el = { kind, name, proj: null };
  el.A = { r0: hand ? hand.A : K.bA + K.sA * sA, g: 0.006 + 0.018 * R(), mix: mixA, qu: R() };
  el.I = { r0: hand ? hand.I : K.bI + K.sI * sI, g: 0.010 + 0.022 * R(), mix: mixI, qu: R() };
  el.cap = Math.max(K.minCap, load / el.A.r0);
  prepDir(el.A, ['res', 'biz', 'ind']); prepDir(el.I, ['sun', 'wind']);
  const need = Math.max(el.A.r0 * Math.pow(1 + el.A.g, 9), el.I.r0 * Math.pow(1 + el.I.g, 9));
  const pr = R(), py = R(), pl = R(), pt = R();
  if (hand ? hand.year : (need > 0.86 && pr < K.pProj)) {
    el.proj = {
      year: hand ? hand.year : K.y0 + Math.floor(py * (K.y1 - K.y0 + 1)),
      relief: hand ? hand.relief : 0.46 + 0.2 * pl,
      type: K.types[Math.floor(pt * K.types.length)],
    };
    el.proj.capAdd = el.cap * (1 / el.proj.relief - 1);
  }
  finalize(el);
  return el;
}

/* ---------- uitlezen ---------- */
function stAt(el, dir, yi) { return dir === 'A' ? el.A.s[yi] : dir === 'I' ? el.I.s[yi] : Math.max(el.A.s[yi], el.I.s[yi]); }
function rAt(el, dir, yi, hour) {
  const one = d => d.r[yi] * (hour == null ? 1 : d.p[hour]);
  return dir === 'A' ? one(el.A) : dir === 'I' ? one(el.I) : Math.max(one(el.A), one(el.I));
}
function queueOne(el, k, yi) {
  const d = el[k];
  if (d.s[yi] < 2) return 0;
  let first = yi; while (first > 0 && d.s[first - 1] >= 2) first--;
  const yrs = yi - first + (first === 0 ? 3 : 1);     // in 2026 staat er al een paar jaar een rij
  return el.cap * (0.03 + 0.07 * d.qu) * yrs;
}
function queueMW(el, dir, yi) {
  return dir === 'B' ? queueOne(el, 'A', yi) + queueOne(el, 'I', yi) : queueOne(el, dir, yi);
}
function queueN(el, dir, yi) {
  const mw = queueMW(el, dir, yi);
  return mw > 0 ? Math.max(1, Math.round(mw / KIND[el.kind].avg)) : 0;
}
// Beoordeel een keten op de relevante schakels
function evaluate(els, rel, dir, yi) {
  let s = 0, b = -1, br = -1;
  for (let k = 0; k < rel.length; k++) {
    const el = els[rel[k]]; if (!el) continue;
    const st = stAt(el, dir, yi), r = rAt(el, dir, yi);
    if (st > s || (st === s && r > br)) { s = st; b = rel[k]; br = r; }
  }
  return { s, b, r: br };
}
function firstRoomYear(els, rel, dir) {
  for (let i = 0; i < NY; i++) if (evaluate(els, rel, dir, i).s <= 1) return i;
  return -1;
}
// Uren waarop de schakel onder 80% blijft
function freeHours(el, dir, yi) {
  const out = [];
  for (let h = 0; h < 24; h++) out.push(rAt(el, dir, yi, h) < 0.75);
  return out;
}

/* ---------- opbouw ---------- */
function buildModel(GEO, d3) {
  const R = mulberry32(20261116);
  const LON0 = 3.25, LAT1 = 53.62, S = 250;
  const mercY = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 180 / Math.PI;
  const Y1 = mercY(LAT1);
  const proj = (lon, lat) => [(lon - LON0) * S, (Y1 - mercY(lat)) * S];
  const inv = (x, y) => [x / S + LON0, Math.atan(Math.exp((Y1 - y / S) * Math.PI / 180)) * 360 / Math.PI - 90];
  const W = (7.3 - LON0) * S, H = (Y1 - mercY(50.7)) * S;

  const decode = a => {
    const n = a.length / 2, out = new Float32Array(n * 2); let x = 0, y = 0;
    for (let i = 0; i < n; i++) { x += a[2 * i]; y += a[2 * i + 1]; const p = proj(x / GEO.q, y / GEO.q); out[2 * i] = p[0]; out[2 * i + 1] = p[1]; }
    return out;
  };
  const land = GEO.land.map(poly => poly.map(decode));
  const neighbours = GEO.nb.map(poly => poly.map(decode));
  const borders = GEO.borders.map(decode);

  // Snelle punt-in-land-toets: randen per horizontale strook
  const STRIP = 6, nStrips = Math.ceil(H / STRIP) + 2, strips = Array.from({ length: nStrips }, () => []);
  for (const poly of land) for (const ring of poly) {
    for (let i = 0, n = ring.length / 2; i < n; i++) {
      const j = (i + 1) % n, x1 = ring[2 * i], y1 = ring[2 * i + 1], x2 = ring[2 * j], y2 = ring[2 * j + 1];
      if (y1 === y2) continue;
      const s0 = clamp(Math.floor(Math.min(y1, y2) / STRIP), 0, nStrips - 1), s1 = clamp(Math.floor(Math.max(y1, y2) / STRIP), 0, nStrips - 1);
      for (let s = s0; s <= s1; s++) strips[s].push(x1, y1, x2, y2);
    }
  }
  const inLand = (x, y) => {
    const s = Math.floor(y / STRIP); if (s < 0 || s >= nStrips) return false;
    const e = strips[s]; let c = false;
    for (let k = 0; k < e.length; k += 4) {
      const y1 = e[k + 1], y2 = e[k + 3];
      if ((y1 > y) !== (y2 > y) && x < e[k] + (y - y1) / (y2 - y1) * (e[k + 2] - e[k])) c = !c;
    }
    return c;
  };

  const places = GEO.places.map(p => {
    const [x, y] = proj(p[1] / 1000, p[2] / 1000);
    return { name: p[0], lon: p[1] / 1000, lat: p[2] / 1000, x, y, pop: p[3] * 100, prov: GEO.provs[p[4]] };
  });

  /* Zeshoekige buurtcellen */
  const HR = 5.6, HW = Math.sqrt(3) * HR, VS = 1.5 * HR;
  const NC = Math.ceil(W / HW) + 2, NR = Math.ceil(H / VS) + 2;
  const grid = new Int32Array(NC * NR).fill(-1);
  const hx = [], hy = [], hrow = [], hcol = [];
  for (let row = 0; row < NR; row++) for (let col = 0; col < NC; col++) {
    const x = (col + 0.5 * (row & 1)) * HW, y = row * VS;
    let ok = inLand(x, y);
    if (!ok) {
      let cnt = 0;
      for (let a = 0; a < 6; a++) { const t = Math.PI / 6 + a * Math.PI / 3; if (inLand(x + Math.cos(t) * HR, y + Math.sin(t) * HR)) cnt++; }
      ok = cnt >= 2;
    }
    if (!ok) continue;
    grid[row * NC + col] = hx.length; hx.push(x); hy.push(y); hrow.push(row); hcol.push(col);
  }
  const NH = hx.length;
  const hexAt = (x, y) => {
    const r0 = Math.round(y / VS); let best = -1, bd = Infinity;
    for (let row = r0 - 1; row <= r0 + 1; row++) {
      if (row < 0 || row >= NR) continue;
      const c0 = Math.round(x / HW - 0.5 * (row & 1));
      for (let col = c0 - 1; col <= c0 + 1; col++) {
        if (col < 0 || col >= NC) continue;
        const d = (x - (col + 0.5 * (row & 1)) * HW) ** 2 + (y - row * VS) ** 2;
        if (d < bd) { bd = d; best = grid[row * NC + col]; }
      }
    }
    return best;
  };
  const neighboursOf = i => {
    const row = hrow[i], col = hcol[i], o = row & 1, out = [];
    const cand = [[row, col - 1], [row, col + 1], [row - 1, col - 1 + o], [row - 1, col + o], [row + 1, col - 1 + o], [row + 1, col + o]];
    for (const [r, c] of cand) if (r >= 0 && r < NR && c >= 0 && c < NC) { const j = grid[r * NC + c]; if (j >= 0) out.push(j); }
    return out;
  };

  /* Bevolkingsdichtheid en dichtstbijzijnde plaats per cel */
  const dens = new Float32Array(NH);
  for (const p of places) {
    const sig = (1.2 + Math.sqrt(p.pop / 1000) * 0.22) * KM, amp = p.pop / (2 * Math.PI * sig * sig), cut = 3 * sig;
    const r0 = Math.max(0, Math.floor((p.y - cut) / VS)), r1 = Math.min(NR - 1, Math.ceil((p.y + cut) / VS));
    const c0 = Math.max(0, Math.floor((p.x - cut) / HW) - 1), c1 = Math.min(NC - 1, Math.ceil((p.x + cut) / HW));
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
      const i = grid[row * NC + col]; if (i < 0) continue;
      const d2 = (hx[i] - p.x) ** 2 + (hy[i] - p.y) ** 2;
      if (d2 < cut * cut) dens[i] += amp * Math.exp(-d2 / (2 * sig * sig));
    }
  }
  const hexArea = 2.598 * HR * HR;
  const hh = new Float32Array(NH), urb = new Float32Array(NH), hplace = new Int32Array(NH);
  const pdel = d3.Delaunay.from(places, p => p.x, p => p.y);
  let prevP = 0;
  for (let i = 0; i < NH; i++) {
    hh[i] = Math.round(35 + dens[i] * hexArea / 2.15);
    const perKm2 = dens[i] * KM * KM;
    urb[i] = clamp(Math.log10(1 + perKm2 / 150) / Math.log10(1 + 6000 / 150), 0, 1);
    prevP = pdel.find(hx[i], hy[i], prevP); hplace[i] = prevP;
  }

  /* Onderstations: bij plaatsen, grote steden krijgen er meer */
  const stations = [];
  const nearSt = (x, y, r) => stations.some(s => (s.x - x) ** 2 + (s.y - y) ** 2 < r * r);
  const WIND = ['Oost', 'Zuidoost', 'Zuid', 'Zuidwest', 'West', 'Noordwest', 'Noord', 'Noordoost'];
  const used = new Set();
  const addSt = (name, x, y, place) => {
    let n = name, k = 2; while (used.has(n)) n = name + ' ' + (k++);
    used.add(n); stations.push({ id: stations.length, name: n, x, y, prov: place.prov, op: OPERATOR[place.prov], hexes: [] });
  };
  for (const p of places) {
    if (!inLand(p.x, p.y) || nearSt(p.x, p.y, (p.pop >= 20000 ? 7.4 : 10.2) * KM)) continue;
    addSt(p.name, p.x, p.y, p);
    const extra = p.pop > 600000 ? 5 : p.pop > 400000 ? 4 : p.pop > 200000 ? 3 : p.pop > 120000 ? 2 : p.pop > 75000 ? 1 : 0;
    const a0 = R() * Math.PI * 2;
    for (let k = 0; k < extra; k++) for (let t = 0; t < 6; t++) {
      const a = a0 + k * 2 * Math.PI / extra + t * 0.5, d = (3.4 + R() * 2.4) * KM * (extra > 3 ? 1.3 : 1);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (!inLand(x, y) || nearSt(x, y, 2.6 * KM)) continue;
      const w = Math.round((((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8;
      addSt(p.name + ' ' + WIND[w], x, y, p); break;
    }
  }
  const NS = stations.length;

  /* Koppelstations en HS-deelnetten */
  const regions = REGIONS.map((r, id) => ({ id, name: r.name, x: 0, y: 0, ks: [] }));
  const deelnets = KOPPEL.map((k, id) => {
    const [x, y] = proj(k[1], k[2]);
    const reg = regions[k[4]]; reg.ks.push(id);
    return { id, name: k[0], x, y, kvE: k[3], kvH: k[4] <= 2 ? 110 : 150, region: k[4], provs: k[5], stations: [] };
  });
  for (const r of regions) { r.x = r.ks.reduce((a, i) => a + deelnets[i].x, 0) / r.ks.length; r.y = r.ks.reduce((a, i) => a + deelnets[i].y, 0) / r.ks.length; }
  for (const s of stations) {
    let best = 0, bd = Infinity;
    for (const d of deelnets) {
      const dist = Math.hypot(s.x - d.x, s.y - d.y) * (d.provs.includes(s.prov) ? 1 : 1.9);
      if (dist < bd) { bd = dist; best = d.id; }
    }
    s.dn = best; s.region = deelnets[best].region; s.kv = deelnets[best].kvH; deelnets[best].stations.push(s.id);
  }
  const ksByName = Object.fromEntries(deelnets.map(d => [d.name, d]));
  const ehsLines = EHS_LINES.map(([a, b, kv]) => ({ a: ksByName[a], b: ksByName[b], kv }));
  const interconnect = INTERCONNECT.map(([a, lon, lat, land]) => { const [x, y] = proj(lon, lat); return { a: ksByName[a], x, y, land }; });

  // HS-lijnen: kortste boom per deelnet plus een enkele ring
  const hsLines = [];
  for (const d of deelnets) {
    const nodes = [{ x: d.x, y: d.y, st: -1 }].concat(d.stations.map(i => ({ x: stations[i].x, y: stations[i].y, st: i })));
    const inTree = new Uint8Array(nodes.length); inTree[0] = 1;
    const dist = nodes.map(n => Math.hypot(n.x - d.x, n.y - d.y)), from = new Int32Array(nodes.length);
    for (let it = 1; it < nodes.length; it++) {
      let b = -1; for (let i = 0; i < nodes.length; i++) if (!inTree[i] && (b < 0 || dist[i] < dist[b])) b = i;
      inTree[b] = 1;
      const p = nodes[from[b]];
      hsLines.push({ x1: p.x, y1: p.y, x2: nodes[b].x, y2: nodes[b].y, kv: d.kvH, dn: d.id });
      stations[nodes[b].st].up = p.st;                   // -1 = rechtstreeks op het koppelstation
      for (let i = 0; i < nodes.length; i++) if (!inTree[i]) {
        const dd = Math.hypot(nodes[i].x - nodes[b].x, nodes[i].y - nodes[b].y);
        if (dd < dist[i]) { dist[i] = dd; from[i] = b; }
      }
    }
    for (let i = 1; i < nodes.length; i++) {
      if (R() > 0.3) continue;
      let b = -1, bd = Infinity;
      for (let j = 1; j < nodes.length; j++) {
        if (j === i || stations[nodes[i].st].up === nodes[j].st || stations[nodes[j].st].up === nodes[i].st) continue;
        const dd = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        if (dd < bd) { bd = dd; b = j; }
      }
      if (b > 0 && bd < 22 * KM) hsLines.push({ x1: nodes[i].x, y1: nodes[i].y, x2: nodes[b].x, y2: nodes[b].y, kv: d.kvH, dn: d.id });
    }
  }

  /* Voorzieningsgebieden: Voronoi rond de onderstations */
  const del = d3.Delaunay.from(stations, s => s.x, s => s.y);
  const vor = del.voronoi([-60, -60, W + 60, H + 60]);
  const cells = stations.map((s, i) => { const c = vor.cellPolygon(i); return c ? Float32Array.from(c.flat()) : new Float32Array(0); });
  const edges = [];   // grenzen tussen gebieden, met het hoogste niveau waarop ze verschillen
  for (let e = 0; e < del.halfedges.length; e++) {
    const o = del.halfedges[e]; if (o < e) continue;
    const i = del.triangles[e], j = del.triangles[e % 3 === 2 ? e - 2 : e + 1];
    const t1 = Math.floor(e / 3), t2 = Math.floor(o / 3), cc = vor.circumcenters;
    const a = stations[i], b = stations[j];
    edges.push({ x1: cc[2 * t1], y1: cc[2 * t1 + 1], x2: cc[2 * t2], y2: cc[2 * t2 + 1],
      lvl: a.region !== b.region ? 3 : a.dn !== b.dn ? 2 : 1, op: a.op !== b.op, a: i, b: j });
  }
  const hst = new Int32Array(NH), hparent = new Int32Array(NH).fill(-1);
  let prevS = 0;
  for (let i = 0; i < NH; i++) { prevS = del.find(hx[i], hy[i], prevS); hst[i] = prevS; stations[prevS].hexes.push(i); }
  // MS-strengen: elke cel hangt aan de buurcel die dichter bij het onderstation ligt
  for (let i = 0; i < NH; i++) {
    const s = stations[hst[i]], d0 = (hx[i] - s.x) ** 2 + (hy[i] - s.y) ** 2;
    let b = -1, bd = d0;
    for (const j of neighboursOf(i)) {
      if (hst[j] !== hst[i]) continue;
      const d = (hx[j] - s.x) ** 2 + (hy[j] - s.y) ** 2;
      if (d < bd) { bd = d; b = j; }
    }
    hparent[i] = b;
  }

  /* Schakels met hun belasting, groei, uitbreiding en wachtrij */
  const LOAD = 0.0024;   // MVA per huishouden, inclusief bedrijvigheid
  for (const s of stations) {
    s.hh = s.hexes.reduce((a, i) => a + hh[i], 0);
    s.urb = s.hexes.length ? s.hexes.reduce((a, i) => a + urb[i], 0) / s.hexes.length : 0;
    s.ind = Math.pow(R(), 2.2);
  }
  for (const d of deelnets) d.hh = d.stations.reduce((a, i) => a + stations[i].hh, 0);
  for (const r of regions) {
    r.hh = r.ks.reduce((a, i) => a + deelnets[i].hh, 0);
    const h = REGIONS[r.id];
    r.sA = clamp((h.A - 0.6) / 0.6, 0, 1); r.sI = clamp((h.I - 0.6) / 0.5, 0, 1);
    r.ehs = mkEl('ehs', 'EHS-net ' + r.name, r.hh * LOAD, 0, 0, h.mixA, h.mixI, R, h);
  }
  for (const d of deelnets) {
    const reg = regions[d.region], h = REGIONS[d.region];
    d.sA = 0.45 * reg.sA + 0.55 * R(); d.sI = 0.45 * reg.sI + 0.55 * R();
    const load = Math.max(60, d.hh * LOAD);
    const wind = clamp(h.mixI[1] + (R() - 0.5) * 0.3, 0.05, 0.9);
    d.ks = mkEl('ks', 'Koppelstation ' + d.name, load * 1.15, 0.6 * d.sA + 0.4 * R(), 0.6 * d.sI + 0.4 * R(), h.mixA, [1 - wind, wind], R);
    d.hs = mkEl('hs', 'HS-net ' + d.name, load, d.sA, d.sI, h.mixA, [1 - wind, wind], R);
  }
  for (const s of stations) {
    const d = deelnets[s.dn], rural = 1 - s.urb;
    s.sA = 0.28 * d.sA + 0.27 * s.urb + 0.45 * R();
    s.sI = 0.28 * d.sI + 0.30 * rural + 0.42 * R();
    const mixA = norm3([0.30 + 0.35 * s.urb, 0.36, 0.06 + 0.9 * s.ind]);
    const wind = clamp(0.1 + 0.5 * rural * noise(s.x, s.y, 120, 7) + (R() - 0.5) * 0.2, 0.02, 0.7);
    const load = Math.max(14, s.hh * LOAD);
    s.os = mkEl('os', 'Onderstation ' + s.name, load, s.sA, s.sI, mixA, [1 - wind, wind], R);
    s.ms = mkEl('ms', 'MS-net ' + s.name, load * 0.85, 0.55 * s.sA + 0.45 * R(), 0.55 * s.sI + 0.45 * R(), mixA, [1 - wind, wind], R);
  }
  const ws = new Array(NH), ls = new Array(NH);
  for (let i = 0; i < NH; i++) {
    const s = stations[hst[i]], x = hx[i], y = hy[i];
    const n1 = clamp((noise(x, y, 46, 11) * 0.65 + noise(x, y, 17, 12) * 0.35 - 0.5) * 1.7 + 0.5, 0, 1);
    const n2 = clamp((noise(x, y, 52, 21) * 0.65 + noise(x, y, 19, 22) * 0.35 - 0.5) * 1.7 + 0.5, 0, 1);
    const biz = clamp(noise(x, y, 30, 31) * 0.7 * (0.4 + urb[i]), 0, 0.7);
    const suburb = 1 - Math.abs(urb[i] - 0.45) * 2;                    // zon op dak vooral in buitenwijken en dorpen
    const sA = 0.16 * s.ms.A.r0 + 0.42 * n1 + 0.22 * urb[i] + 0.20 * R();
    const sI = 0.12 * s.ms.I.r0 + 0.44 * n2 + 0.24 * clamp(suburb, 0, 1) + 0.20 * R();
    const mixA = norm3([0.86 - biz, 0.12 + biz, 0.02]), mixI = [0.97, 0.03];
    const load = hh[i] * 0.0015;
    const code = String(1000 + i);
    ws[i] = mkEl('ws', 'Wijkstation ' + places[hplace[i]].name + ' ' + code, load, sA, sI, mixA, mixI, R);
    ls[i] = mkEl('ls', 'LS-net bij wijkstation ' + code, load * 0.9, 0.5 * sA + 0.3 * n1 + 0.2 * R(), 0.5 * sI + 0.3 * n2 + 0.2 * R(), mixA, mixI, R);
  }

  const chainOfStation = si => { const s = stations[si], d = deelnets[s.dn]; return [regions[d.region].ehs, d.ks, d.hs, s.os, s.ms, null, null]; };
  const chainOfHex = i => { const c = chainOfStation(hst[i]); c[5] = ws[i]; c[6] = ls[i]; return c; };
  const chainOfDeelnet = di => { const d = deelnets[di]; return [regions[d.region].ehs, d.ks, d.hs, null, null, null, null]; };
  const chainOfRegion = ri => [regions[ri].ehs, null, null, null, null, null, null];
  const chainOf = { hex: chainOfHex, station: chainOfStation, deelnet: chainOfDeelnet, region: chainOfRegion };
  const countOf = { hex: NH, station: NS, deelnet: deelnets.length, region: regions.length };
  const unitOfHex = {
    hex: i => i, station: i => hst[i], deelnet: i => stations[hst[i]].dn, region: i => stations[hst[i]].region,
  };
  const unitOfStation = { station: i => i, deelnet: i => stations[i].dn, region: i => stations[i].region };

  /* Status, knelpunt en waarde per eenheid, voor de huidige kaartinstelling */
  function computeUnits(o) {
    const gran = o.gran, n = countOf[gran], rel = o.els;
    const status = new Uint8Array(n), bott = new Int8Array(n), val = new Float32Array(n);
    for (let u = 0; u < n; u++) {
      const els = chainOf[gran](u), ev = evaluate(els, rel, o.dir, o.yi);
      status[u] = ev.s; bott[u] = ev.b;
      if (o.metric === 'jaar') val[u] = firstRoomYear(els, rel, o.dir);
      else if (o.metric === 'wachtrij') { let q = 0; for (const k of rel) if (els[k]) q = Math.max(q, queueMW(els[k], o.dir, o.yi)); val[u] = q; }
      else if (o.metric === 'belasting') { let r = 0; for (const k of rel) if (els[k]) r = Math.max(r, rAt(els[k], o.dir, o.yi, o.hour)); val[u] = r; }
      else val[u] = ev.r;
    }
    return { gran, n, status, bott, val };
  }
  // Verdeling over statussen, gewogen naar huishoudens of naar oppervlak
  function distribution(units, weight) {
    const out = [0, 0, 0, 0]; let tot = 0; const map = unitOfHex[units.gran];
    for (let i = 0; i < NH; i++) { const w = weight === 'hh' ? hh[i] : 1; out[units.status[map(i)]] += w; tot += w; }
    return out.map(v => v / tot);
  }

  const provinces = GEO.provs.slice().sort((a, b) => a.localeCompare(b, 'nl')).map(name => {
    const ps = places.filter(p => p.prov === name);
    return { name, op: OPERATOR[name], x0: Math.min(...ps.map(p => p.x)), y0: Math.min(...ps.map(p => p.y)), x1: Math.max(...ps.map(p => p.x)), y1: Math.max(...ps.map(p => p.y)) };
  });
  const hprov = new Uint8Array(NH);
  const provIdx = Object.fromEntries(provinces.map((p, i) => [p.name, i]));
  for (let i = 0; i < NH; i++) hprov[i] = provIdx[places[hplace[i]].prov];

  const hexName = i => {
    const p = places[hplace[i]], dx = hx[i] - p.x, dy = hy[i] - p.y, d = Math.hypot(dx, dy) / KM;
    if (d < 1.3) return p.name;
    const w = Math.round((((Math.atan2(dy, dx) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8;
    const dirs = ['oosten', 'zuidoosten', 'zuiden', 'zuidwesten', 'westen', 'noordwesten', 'noorden', 'noordoosten'];
    return `${Math.round(d)} km ten ${dirs[w]} van ${p.name}`;
  };

  // Alle geplande uitbreidingen met een plek op de kaart
  const projects = [];
  for (const r of regions) if (r.ehs.proj) projects.push({ el: r.ehs, ci: 0, x: r.x, y: r.y, big: 3 });
  for (const d of deelnets) {
    if (d.ks.proj) projects.push({ el: d.ks, ci: 1, x: d.x, y: d.y, big: 2 });
    if (d.hs.proj && d.stations.length) { const s = stations[d.stations[0]]; projects.push({ el: d.hs, ci: 2, x: (d.x + s.x) / 2, y: (d.y + s.y) / 2, big: 2 }); }
  }
  for (const s of stations) {
    if (s.os.proj) projects.push({ el: s.os, ci: 3, x: s.x, y: s.y, big: 1 });
    if (s.ms.proj && s.hexes.length > 3) { const h = s.hexes[Math.floor(s.hexes.length / 2)]; projects.push({ el: s.ms, ci: 4, x: (hx[h] + s.x) / 2, y: (hy[h] + s.y) / 2, big: 1 }); }
  }
  for (let i = 0; i < NH; i++) {
    if (ws[i].proj) projects.push({ el: ws[i], ci: 5, x: hx[i], y: hy[i], big: 0 });
    else if (ls[i].proj) projects.push({ el: ls[i], ci: 6, x: hx[i], y: hy[i], big: 0 });
  }

  return {
    W, H, proj, inv, KM, land, neighbours, borders, places, provinces, inLand,
    hex: { n: NH, R: HR, x: Float32Array.from(hx), y: Float32Array.from(hy), st: hst, parent: hparent, hh, urb, place: hplace, prov: hprov, ws, ls },
    hexAt, hexName, stations, deelnets, regions, cells, edges, hsLines, ehsLines, interconnect, projects,
    chainOf, countOf, unitOfHex, unitOfStation, computeUnits, distribution,
  };
}

root.NK = Object.assign(root.NK || {}, {
  YEARS, NY, KM, CHAIN, LEVELS, CATS, KIND, PROFILE, OPERATOR, catFor,
  stAt, rAt, queueMW, queueN, evaluate, firstRoomYear, freeHours, buildModel,
});
})(typeof window !== 'undefined' ? window : globalThis);
