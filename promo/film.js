/* film.js — regie van de promofilm.
   Draait in de pagina van het prototype. render.mjs roept per frame FILM.frame(t) aan, met t in seconden.
   Alles wat beweegt (camera, cursor, titels, klikken) is een functie van t, zodat elke opname exact gelijk is. */
(function () {
'use strict';
const A = window.NK_APP, M = A.model, map = A.map;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const P = (t, a, b) => b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a), 0, 1);
const lerp = (a, b, p) => a + (b - a) * p;
const E = {
  io: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  out: x => 1 - Math.pow(1 - x, 3),
  in: x => x * x * x,
  back: x => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
};
const env = (t, t0, t1, fi, fo) => Math.min(E.out(P(t, t0, t0 + fi)), 1 - E.in(P(t, t1 - fo, t1)));
const place = n => M.places.find(p => p.name === n);
const DUR = 102;

/* ---------- tijdlijn ---------- */
const TL = { act: [], cam: [], tw: [], moves: [], vis: [], clicks: [], spots: [], ev: [] };
const at = (t, fn) => TL.act.push({ t, fn });
const camTo = (t, d, shot) => TL.cam.push({ t, d, shot });
const tween = (t0, t1, fn, ease) => TL.tw.push({ t0, t1, fn, ease: ease || E.io });
const sfx = (t, type) => TL.ev.push({ t: +t.toFixed(3), type });
const showCursor = (t0, t1, from) => { TL.vis.push({ t0, t1 }); if (from) TL.moves.push({ t0, t1: t0, to: () => from }); };
const move = (t0, t1, to) => TL.moves.push({ t0, t1, to });
const follow = (t0, t1, to) => TL.moves.push({ t0, t1, to, follow: true });
const click = (t, fn, silent) => { TL.clicks.push({ t, fn }); if (!silent) sfx(t, 'click'); };
const spot = (t0, t1, rect, pad) => TL.spots.push({ t0, t1, rect, pad: pad == null ? 6 : pad });
// beweeg naar een doel en klik
const tap = (t, to, fn, dur) => { move(t - (dur || 0.5) - 0.08, t - 0.08, to); click(t, fn); };
const scrollTween = (t0, t1, sel, target) => {
  let from = null, to = null;
  tween(t0, t1, p => { const el = $(sel); if (from === null) { from = el.scrollTop; to = target(); } el.scrollTop = lerp(from, to, p); });
};

/* ---------- camera ---------- */
const shell = $('.shell');
let cam = { s: 1, cx: 800, cy: 450, sx: 800, sy: 450 }, ap = { s: 1, tx: 0, ty: 0 };
function applyCam(c) {
  const tx = c.sx - c.s * c.cx, ty = c.sy - c.s * c.cy;
  ap = { s: c.s, tx, ty };
  shell.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${c.s.toFixed(5)})`;
  shell.style.borderRadius = (16 / c.s).toFixed(2) + 'px';
  shell.style.boxShadow = `0 ${(28 / c.s).toFixed(1)}px ${(90 / c.s).toFixed(1)}px rgba(0, 0, 0, .55)`;
}
const appRect = el => { const r = el.getBoundingClientRect(); return { x: (r.left - ap.tx) / ap.s, y: (r.top - ap.ty) / ap.s, w: r.width / ap.s, h: r.height / ap.s }; };
const scr = (x, y) => [ap.tx + ap.s * x, ap.ty + ap.s * y];
const R = (x, y, w, h) => ({ x, y, w, h });
const pad = (r, p, q) => R(r.x - p, r.y - (q == null ? p : q), r.w + 2 * p, r.h + 2 * (q == null ? p : q));
const INTO = { side: [560, 0, 1040, 900], band: [40, 172, 1520, 718] };
const FULL = { s: 0.78, cx: 800, cy: 450, sx: 800, sy: 519 };
const fit = (r, into, maxS) => { const [X, Y, Wd, Hd] = into; return { s: Math.min(Wd / r.w, Hd / r.h, maxS || 2), cx: r.x + r.w / 2, cy: r.y + r.h / 2, sx: X + Wd / 2, sy: Y + Hd / 2 }; };
// rechthoek van een element zoals die eruitziet als zijn scrollcontainer op 'top' staat
const scrolled = (box, el, top) => { const r = appRect(el); r.y += $(box).scrollTop - top; return r; };
const scrollFor = (box, el, offset) => { const b = $(box); return clamp(b.scrollTop + appRect(el).y - appRect(b).y - offset, 0, b.scrollHeight - b.clientHeight); };

/* ---------- doelen voor de cursor ---------- */
const elC = (sel, ax, ay) => () => { const el = typeof sel === 'function' ? sel() : $(sel); const r = el.getBoundingClientRect(); return [r.left + r.width * (ax == null ? .5 : ax), r.top + r.height * (ay == null ? .5 : ay)]; };
const worldC = (wx, wy) => () => { const r = appRect($('#map')); const [x, y] = map.toScreen(wx, wy); return scr(r.x + x, r.y + y); };
const thumbC = sel => () => { const el = $(sel), r = appRect(el), v = (+el.value - +el.min) / (+el.max - +el.min); return scr(r.x + 8 + v * (r.w - 16), r.y + r.h / 2); };
const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
const setRange = (sel, v) => { const el = $(sel); if (+el.value !== v) { el.value = v; fire(el, 'input'); } };
const panelBlk = test => () => $$('#panel .blk').find(test);

/* ---------- DOM van de regielaag ---------- */
const STAT = ['var(--f-s0)', 'var(--f-s1)', 'var(--f-s2)', 'var(--f-s3)'];
const stripe = (w, gap) => `<div class="f-stripe" style="width:${w}px;gap:${gap || 6}px">${STAT.map(c => `<i style="flex:1;background:${c}"></i>`).join('')}</div>`;
const words = s => s.split(' ').map(w => w.startsWith('*') ? `<span class="w" style="color:var(--f-s3)">${w.slice(1)}</span>` : `<span class="w">${w}</span>`).join(' ');
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (parent, tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
const film = document.createElement('div'); film.id = 'film';
document.body.appendChild(film);
const layer = html => { const d = document.createElement('div'); d.className = 'f-layer'; d.innerHTML = html; film.appendChild(d); return d; };

// tekstblokken met woord-voor-woord animatie
function Slot(container, items, o) {
  o = Object.assign({ stagger: 0.045, out: 0.3, center: false, stripe: false }, o);
  for (const it of items) {
    const d = document.createElement('div'); d.className = 'f-item';
    d.innerHTML = (it.eb ? `<div class="f-eb">${o.stripe ? stripe(46, 3) : ''}<span>${it.eb}</span></div>` : '') +
      (it.hd ? `<div class="f-h"${it.size ? ` style="font-size:${it.size}px"` : ''}>${words(it.hd)}</div>` : '') + (it.sb ? `<div class="f-sb">${it.sb}</div>` : '');
    if (o.center) d.style.top = '50%';
    container.appendChild(d);
    Object.assign(it, { el: d, ws: $$('.f-h .w', d), eb_: $('.f-eb', d), sb_: $('.f-sb', d) });
  }
  return t => {
    for (const it of items) {
      if (t < it.t0 || t >= it.t1) { it.el.style.display = 'none'; continue; }
      it.el.style.display = '';
      const out = E.in(P(t, it.t1 - o.out, it.t1));
      it.el.style.opacity = 1 - out;
      it.el.style.transform = `translateY(calc(${o.center ? '-50%' : '0px'} - ${(out * 12).toFixed(1)}px))`;
      if (it.eb_) { const p = E.out(P(t, it.t0, it.t0 + .45)); it.eb_.style.opacity = p; it.eb_.style.transform = `translateX(${((1 - p) * -14).toFixed(1)}px)`; }
      it.ws.forEach((w, i) => { const s = it.t0 + .12 + i * o.stagger, p = E.out(P(t, s, s + .55)); w.style.opacity = p; w.style.transform = `translateY(${((1 - p) * .42).toFixed(3)}em)`; });
      if (it.sb_) { const s = it.t0 + .3 + it.ws.length * o.stagger * .6, p = E.out(P(t, s, s + .55)); it.sb_.style.opacity = p; it.sb_.style.transform = `translateY(${((1 - p) * 12).toFixed(1)}px)`; }
    }
  };
}

/* ---------- kaart A: openingsbeeld en titel ---------- */
const cardA = layer('<div class="f-card"><svg viewBox="0 0 1600 900"></svg><div class="f-abs" id="fa-text" style="left:160px;top:196px"></div><div id="fa-title"></div></div>').firstElementChild;
const svgA = $('svg', cardA);
svgEl(svgA, 'defs', {}).innerHTML = '<filter id="fglow" x="-20%" y="-300%" width="140%" height="700%"><feGaussianBlur stdDeviation="7"/></filter>' +
  '<radialGradient id="fhalo"><stop offset="0" stop-color="#2f5bea" stop-opacity=".5"/><stop offset="1" stop-color="#2f5bea" stop-opacity="0"/></radialGradient>';
const LN = [
  { y: 430, w: 12, k: 'EHS', kv: '380 kV · landelijk',   seg: [990, 1150], c: STAT[3] },
  { y: 515, w: 8,  k: 'HS',  kv: '150 kV · regionaal',   seg: [620, 780],  c: STAT[2] },
  { y: 600, w: 5,  k: 'MS',  kv: '10 kV · de wijk',      seg: [300, 430],  c: STAT[3] },
  { y: 685, w: 3,  k: 'LS',  kv: '0,4 kV · de straat',   seg: [1230, 1340], c: STAT[1] },
];
const halo = svgEl(svgA, 'circle', { cx: 0, cy: 0, r: 260, fill: 'url(#fhalo)', opacity: 0 });
const logoSq = svgEl(svgA, 'rect', { rx: 31, fill: '#2f5bea', opacity: 0 });
const gTf = svgEl(svgA, 'g', { stroke: '#7f8ba3', 'stroke-width': 2, fill: 'none' });
const TF = [];
for (const x of [470, 1290]) for (let i = 0; i < 3; i++) {
  const y0 = LN[i].y + LN[i].w / 2 + 2, y1 = LN[i + 1].y - LN[i + 1].w / 2 - 2, m = (y0 + y1) / 2, g = svgEl(gTf, 'g', { opacity: 0 });
  svgEl(g, 'line', { x1: x, x2: x, y1: y0, y2: m - 16 }); svgEl(g, 'line', { x1: x, x2: x, y1: m + 16, y2: y1 });
  svgEl(g, 'circle', { cx: x, cy: m - 5, r: 9.5, fill: '#0a1120' }); svgEl(g, 'circle', { cx: x, cy: m + 5, r: 9.5, fill: 'none' });
  TF.push({ g, i, x });
}
for (const L of LN) {
  L.glow = svgEl(svgA, 'line', { x1: L.seg[0], x2: L.seg[1], y1: L.y, y2: L.y, stroke: L.c, 'stroke-width': L.w * 2.6 + 8, filter: 'url(#fglow)', opacity: 0 });
  L.el = svgEl(svgA, 'line', { x1: 160, x2: 160, y1: L.y, y2: L.y, stroke: '#f3f6fb', 'stroke-width': L.w });
  L.hot = svgEl(svgA, 'line', { x1: L.seg[0], x2: L.seg[1], y1: L.y, y2: L.y, stroke: L.c, 'stroke-width': L.w, opacity: 0 });
  L.lab = svgEl(svgA, 'text', { x: 160, y: L.y - L.w / 2 - 14, class: 'f-lab', opacity: 0 });
  L.lab.innerHTML = `<tspan class="k">${L.k}</tspan>   ${L.kv}`;
}
const stem = svgEl(svgA, 'line', { stroke: '#f3f6fb', opacity: 0 });
const introText = Slot($('#fa-text', cardA), [
  { t0: 1.0, t1: 4.35, hd: 'Stroom reist door vier netvlakken.', size: 62 },
  { t0: 4.45, t1: 7.3, hd: 'Op elk ervan kan het *vol raken.', size: 62 },
]);
const LOGO = [[9, 6, 24, 3.2], [15.5, 9, 21, 2.2], [21.5, 12, 18, 1.4]];   // y, x1, x2, dikte in het 30-eenheden-logo
function titleBlock(id, sub) {
  return `<div class="f-abs" id="${id}-eb" style="top:0"><span class="f-eb">Prototype</span></div>
    <div class="f-abs f-wm" id="${id}-wm"><span class="w">Capaciteitskaart</span></div>
    <div class="f-abs" id="${id}-st"></div><div class="f-abs f-sb" id="${id}-sb" style="width:900px">${sub}</div>`;
}
$('#fa-title', cardA).innerHTML = titleBlock('ft', 'Waar is ruimte op het stroomnet?<br>En wat kun je doen als die er niet is?');
let LG = null;   // lay-out van logo en woordmerk, berekend in init

/* ---------- kaart B: vijf weergaven ---------- */
const VIEWS = [['thuis', 'Thuis'], ['bedrijf', 'Bedrijf'], ['opwek', 'Opwek & opslag'], ['regio', 'Regio & beleid'], ['expert', 'Netexpert']];
const cardB = layer(`<div class="f-card">
  <div class="f-abs" style="left:0;right:0;top:232px;text-align:center"><span class="f-eb" id="fb-eb">Vijf weergaven</span></div>
  <div class="f-abs f-h" id="fb-h" style="left:0;right:0;top:272px;text-align:center;font-size:84px">${words('Eén kaart, vijf vragen')}</div>
  <div class="f-abs f-sb" id="fb-sb" style="left:0;right:0;top:384px;text-align:center">Elke vraag krijgt een eigen weergave.</div>
  <div class="f-tiles">${VIEWS.map(([k, l], i) => `<div class="f-tile"><i style="background:var(--f-blue)"></i><small>${i + 1}</small><svg><use href="#i-${k}"/></svg><span>${l}</span></div>`).join('')}</div></div>`).firstElementChild;

/* ---------- kaart C: slot ---------- */
const cardC = layer(`<div class="f-card"><svg viewBox="0 0 1600 900"></svg><div id="fc-title"></div>
  <div class="f-abs" id="fc-tag" style="left:0;right:0;text-align:center;font:600 38px/1.2 var(--f-disp);color:var(--f-ink)">Van ‘het net is vol’ naar ‘zo kan het wél’.</div>
  <div class="f-abs" id="fc-disc" style="left:0;right:0;top:812px;text-align:center;font:500 16px/1 var(--f-body);color:var(--f-dim)">Prototype · alle netdata in deze film is verzonnen</div></div>`).firstElementChild;
const svgC = $('svg', cardC);
$('#fc-title', cardC).innerHTML = titleBlock('fo', '');
const blackout = layer('<div style="position:absolute;inset:0;background:#04070d;opacity:0"></div>').firstElementChild;

/* ---------- zijpaneel en band ---------- */
const sideEl = layer('<div class="f-side left"><div class="in"></div><div class="foot">Prototype · alle netdata is verzonnen</div></div>').firstElementChild;
const SIDE = [
  { t0: 21.9, t1: 29.4, eb: 'Wat is er anders · 1 / 5', hd: 'Alle netvlakken in één keten', sb: 'Bekijk het landelijke net, het regionale net, de wijk of de straat. Of de hele keten tegelijk.' },
  { t0: 29.5, t1: 34.9, eb: 'Wat is er anders · 2 / 5', hd: 'Zie welke schakel knelt', sb: 'Klik op een plek. De kaart volgt de stroom naar het landelijke net en wijst het knelpunt aan.' },
  { t0: 35.0, t1: 40.4, eb: 'Wat is er anders · 3 / 5', hd: 'Vol op de piek is niet altijd vol', sb: 'Een vierde status: aansluiten kan wel, op de uren dat er lucht is.' },
  { t0: 40.5, t1: 45.9, eb: 'Wat is er anders · 4 / 5', hd: 'Wat kun je wél doen?', sb: 'Een tijdgebonden contract, capaciteit delen, of een plek met ruimte een paar kilometer verderop.' },
];
const sideText = Slot($('.in', sideEl), SIDE, { center: true, stripe: true });

const bandEl = layer(`<div class="f-band"><div class="in"></div><div class="f-tag">Prototype · fictieve netdata</div>
  <div class="f-steps">${VIEWS.map(([k, l]) => `<div class="f-step"><svg><use href="#i-${k}"/></svg>${l}<b></b></div>`).join('')}</div></div>`).firstElementChild;
const BAND = [
  { t0: 15.3, t1: 18.7, eb: 'Maak kennis met de kaart', hd: 'Heel Nederland, van hoogspanningsmast tot wijkstation' },
  { t0: 18.8, t1: 21.8, eb: 'Maak kennis met de kaart', hd: 'Niet alleen wáár het vol zit', sb: 'Ook waarom, tot wanneer, en wat je wél kunt doen.' },
  { t0: 46.1, t1: 52.0, eb: 'Wat is er anders · 5 / 5', hd: 'Kijk vooruit tot 2035', sb: 'Geplande uitbreidingen tellen mee. Zie waar en wanneer er ruimte bijkomt.' },
  { t0: 56.0, t1: 63.1, eb: 'Weergave 1 van 5', hd: 'Kan mijn warmtepomp erbij?', sb: 'Per buurt, voor een warmtepomp, laadpaal, zonnepanelen of zwaardere aansluiting.' },
  { t0: 63.2, t1: 70.3, eb: 'Weergave 2 van 5', hd: 'Is er ruimte voor mijn bedrijf?', sb: 'Het vermogen bepaalt op welk netvlak je aansluit en welke schakels meetellen.' },
  { t0: 70.4, t1: 77.5, eb: 'Weergave 3 van 5', hd: 'Waar kan ik invoeden of opslaan?', sb: 'Voor zonneparken, windparken en batterijen.' },
  { t0: 77.6, t1: 84.7, eb: 'Weergave 4 van 5', hd: 'Waar knelt het, en tot wanneer?', sb: 'Uitbreidingen, wachtrijen en de ruimte per provincie, jaar voor jaar.' },
  { t0: 84.8, t1: 92.0, eb: 'Weergave 5 van 5', hd: 'Alle netvlakken, alle cijfers', sb: 'Elk netvlak apart, de belasting per uur en een lijst van elk station.' },
];
const bandText = Slot($('.in', bandEl), BAND, { stripe: true });
const steps = $$('.f-step', bandEl), stepBars = steps.map(s => $('b', s)), tagEl = $('.f-tag', bandEl), stepsEl = $('.f-steps', bandEl);
const VSTART = [56.0, 63.2, 70.4, 77.6, 84.8];

/* ---------- cursor, klik, spotlight ---------- */
const spotEl = layer('<div class="f-spot"></div>').firstElementChild;
film.prepend(spotEl.parentNode);   // onder de tekstlagen, zodat de spotlight alleen de interface dimt
const ripple = layer('<div class="f-ripple"></div>').firstElementChild;
const cursorEl = layer('<svg class="f-cursor" viewBox="0 0 30 36"><path d="M4 3 L4 27 L10.2 21.4 L14.6 31.6 L19 29.7 L14.7 19.8 L23 19.6 Z" fill="#ffffff" stroke="#0a1120" stroke-width="2" stroke-linejoin="round"/></svg>').firstElementChild;

/* ---------- het draaiboek ---------- */
const EIN = place('Eindhoven'), ZOE = place('Zoetermeer');
const HERO = { s: 1.5, cx: 870, cy: 478, sx: 800, sy: 452 };

// 0 – 14 · opening en titel (kaarten A); onder de kaart staat de interface al klaar
camTo(0, 0, HERO);
sfx(0.3, 'line'); sfx(7.3, 'rise'); sfx(8.0, 'hit'); sfx(13.4, 'whoosh');

// 14 – 22 · de kaart onthuld
camTo(14.1, 4.9, FULL);

// 22 – 29.5 · 1/5 netvlakken
sfx(21.5, 'whoosh');
at(21.6, () => map.reset());
camTo(21.6, 1.1, fit(R(0, 52, 940, 848), INTO.side, 1.2));
scrollTween(21.7, 22.5, '.left', () => scrollFor('.left', $('.set .blk'), 6));
showCursor(22.6, 29.3, [1120, 980]);
const rung = v => `[data-act="level"][data-v="${v}"]`;
const rungC = v => elC(rung(v), .32, .5);
tap(23.3, rungC('ehs'), () => $(rung('ehs')).click());
tap(24.9, rungC('hs'), () => $(rung('hs')).click());
tap(26.4, rungC('ms'), () => $(rung('ms')).click());
tap(27.9, rungC('ls'), () => $(rung('ls')).click());
tap(29.0, rungC('keten'), () => $(rung('keten')).click());

// 29.5 – 35 · 2/5 knelpunt
const K2 = 2.6;
at(29.2, () => map.flyTo(EIN.x - (560 - $('#map').clientWidth / 2) / K2, EIN.y + 10 / K2, K2, 900));
camTo(29.3, 1.0, fit(R(720, 52, 880, 848), INTO.side, 1.2));
showCursor(30.2, 31.5, [1500, 960]);
tap(31.0, worldC(EIN.x, EIN.y), () => A.select(EIN.x, EIN.y, false), 0.62);
camTo(31.55, 0.9, () => fit(R(1212, 56, 388, 440), INTO.side, 1.8));
camTo(32.9, 0.9, () => { const c = appRect($('#panel .chain')); return fit(R(1212, c.y - 34, 388, Math.min(c.h + 40, 470)), INTO.side, 1.8); });
spot(33.7, 34.85, () => appRect($('#panel .flag').closest('li')), 4);

// 35 – 40.5 · 3/5 buiten de piek
camTo(35.0, 0.9, () => fit(R(320, 56, 560, 400), INTO.side, 1.8));
spot(35.9, 37.3, () => appRect($('#legend .lg[data-v="2"]')), 3);
const prof = panelBlk(b => $('svg.chart', b));
scrollTween(37.1, 37.7, '#panel', () => scrollFor('#panel', prof(), $('#panel .phead').offsetHeight + 6));
camTo(37.4, 0.9, () => { const top = scrollFor('#panel', prof(), $('#panel .phead').offsetHeight + 6); return fit(pad(scrolled('#panel', prof(), top), 10), INTO.side, 2.1); });
spot(38.6, 40.3, () => appRect($('.note', prof())), 6);

// 40.5 – 46 · 4/5 wat kun je doen
const opts = panelBlk(b => $('.opts', b));
scrollTween(40.3, 40.9, '#panel', () => scrollFor('#panel', opts(), $('#panel .phead').offsetHeight + 6));
camTo(40.4, 0.9, () => { const top = scrollFor('#panel', opts(), $('#panel .phead').offsetHeight + 6); return fit(pad(scrolled('#panel', opts(), top), 10), INTO.side, 2.0); });
spot(41.3, 42.5, () => appRect($('.opts li', opts())), 3);
showCursor(42.3, 43.6, [1480, 960]);
tap(43.2, elC('[data-fk="goto-room"]', .4, .55), () => $('[data-fk="goto-room"]').click(), 0.6);
camTo(43.4, 1.0, fit(R(720, 52, 880, 848), INTO.side, 1.2));
spot(44.5, 45.6, () => appRect($('#panel .verdict')), 8);
sfx(45.65, 'whoosh');

// 46 – 52 · 5/5 vooruitblik
camTo(45.7, 1.1, FULL);
at(45.75, () => { A.state.sel = null; map.setSelection(null); A.state.layers.projects = true; A.refresh({ keepAsk: true }); map.reset(); });
scrollTween(45.8, 46.5, '.left', () => scrollFor('.left', $('#year').closest('.blk'), 470));
showCursor(46.6, 51.3, [900, 960]);
move(46.7, 47.2, thumbC('#year'));
click(47.3, null);
follow(47.3, 51.0, thumbC('#year'));
for (let y = 2027; y <= 2035; y++) { const t = 47.45 + (y - 2027) * 0.4; at(t, () => setRange('#year', y)); sfx(t, 'tick'); }

// 52 – 56 · vijf weergaven (kaart B); daaronder alles terug naar de begintoestand
sfx(51.9, 'whoosh'); sfx(55.5, 'whoosh');
at(52.6, () => {
  Object.assign(A.state, { year: 2026, sel: null }); A.state.layers.projects = false; map.setSelection(null);
  $('.left').scrollTop = 0; $('#panel').scrollTop = 0; A.refresh(); map.reset();
});

// 56 – 63.2 · thuis
const tab = v => `[data-act="view"][data-v="${v}"]`;
showCursor(56.2, 59.2, [1020, 960]);
tap(56.9, elC(tab('thuis')), () => $(tab('thuis')).click());
tap(57.7, elC('#q', .3, .5), () => $('#q').focus(), 0.42);
'Leiden'.split('').forEach((c, i) => { const t = 57.85 + i * 0.14; at(t, () => { const q = $('#q'); q.value = 'Leiden'.slice(0, i + 1); fire(q, 'input'); }); sfx(t, 'key'); });
at(58.85, () => { $('#q').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); $('#q').blur(); });
sfx(58.85, 'key');
camTo(59.4, 1.0, fit(R(560, 52, 1040, 560), INTO.band, 1.6));
spot(60.5, 62.6, () => appRect($('#panel .verdict')), 8);
camTo(62.7, 0.9, FULL);

// 63.2 – 70.4 · bedrijf
showCursor(63.3, 68.8, [820, 960]);
tap(64.0, elC(tab('bedrijf')), () => $(tab('bedrijf')).click());
at(64.1, () => map.reset());
move(64.4, 64.9, thumbC('#pw'));
click(65.0, null);
const lg = (mw, p) => Math.round(1000 * Math.log(mw / p[0]) / Math.log(p[1] / p[0]));
tween(65.1, 68.4, p => setRange('#pw', Math.round(lerp(lg(0.15, [0.06, 300]), lg(60, [0.06, 300]), p))));
follow(65.0, 68.5, thumbC('#pw'));
camTo(68.7, 0.9, () => fit(pad(appRect($('#pw').closest('.field')), 14), INTO.band, 2.2));
camTo(70.2, 0.8, FULL);

// 70.4 – 77.6 · opwek en opslag
showCursor(70.5, 73.3, [760, 960]);
tap(71.1, elC(tab('opwek')), () => $(tab('opwek')).click());
tap(72.0, elC('[data-act="tech"][data-v="batterij"]'), () => $('[data-act="tech"][data-v="batterij"]').click(), 0.42);
tap(73.0, worldC(ZOE.x, ZOE.y), () => A.select(ZOE.x, ZOE.y, false), 0.6);
camTo(73.3, 1.0, fit(R(620, 52, 980, 500), INTO.band, 1.6));
spot(74.4, 76.4, () => appRect($('#panel .verdict')), 8);
camTo(76.8, 0.8, FULL);

// 77.6 – 84.8 · regio en beleid
showCursor(77.7, 79.5, [900, 960]);
tap(78.3, elC(tab('regio')), () => $(tab('regio')).click());
at(78.35, () => { A.state.sel = null; map.setSelection(null); A.refresh({ keepAsk: true }); map.reset(); });
tap(79.2, elC('[data-act="metric"][data-v="jaar"]'), () => $('[data-act="metric"][data-v="jaar"]').click(), 0.45);
camTo(79.6, 1.0, fit(R(560, 200, 1040, 600), INTO.band, 1.6));
at(80.6, () => { const u = place('Utrecht'); map.flyTo(u.x + 30, u.y + 25, 1.75, 1600); });
camTo(84.0, 0.8, FULL);

// 84.8 – 92 · netexpert
showCursor(84.9, 91.6, [720, 960]);
tap(85.5, elC(tab('expert')), () => $(tab('expert')).click());
at(85.55, () => map.reset());
tap(86.3, elC('[data-act="metric"][data-v="belasting"]'), () => $('[data-act="metric"][data-v="belasting"]').click(), 0.42);
scrollTween(86.5, 87.1, '.left', () => scrollFor('.left', $('.set .blk'), 6));
tap(87.6, rungC('ms'), () => $(rung('ms')).click(), 0.42);
move(87.8, 88.2, thumbC('#hour'));
click(88.3, null);
tween(88.4, 91.4, p => setRange('#hour', Math.min(23, Math.floor(-1 + p * 25))), x => x);
follow(88.3, 91.5, thumbC('#hour'));

// 92 – 102 · slot
camTo(92.0, 1.3, { s: 0.5, cx: 800, cy: 450, sx: 800, sy: 470 });
sfx(92.0, 'whoosh'); sfx(92.9, 'hit');

TL.moves.sort((a, b) => a.t0 - b.t0 || a.t1 - b.t1);
TL.ev.sort((a, b) => a.t - b.t);

/* ---------- per frame ---------- */
const done = new Set();
function frameCam(t) {
  let seg = null;
  for (const c of TL.cam) {
    if (t < c.t) break;
    if (!c.from) { c.from = Object.assign({}, cam); c.to = typeof c.shot === 'function' ? c.shot() : c.shot; }
    seg = c;
  }
  if (!seg) return;
  const p = seg.d ? E.io(P(t, seg.t, seg.t + seg.d)) : 1, f = seg.from, g = seg.to;
  cam = { s: Math.exp(lerp(Math.log(f.s), Math.log(g.s), p)), cx: lerp(f.cx, g.cx, p), cy: lerp(f.cy, g.cy, p), sx: lerp(f.sx, g.sx, p), sy: lerp(f.sy, g.sy, p) };
  applyCam(cam);
}
let cpos = [1100, 980];
function frameCursor(t) {
  let pos = cpos;
  for (const m of TL.moves) {
    if (t < m.t0) break;
    if (!m.start) m.start = pos;
    if (t >= m.t1) { if (!m.end) m.end = m.to(); pos = m.end; continue; }
    const g = m.to();
    pos = m.follow ? g : [lerp(m.start[0], g[0], E.io(P(t, m.t0, m.t1))), lerp(m.start[1], g[1], E.io(P(t, m.t0, m.t1)))];
  }
  let v = 0; for (const s of TL.vis) v = Math.max(v, env(t, s.t0, s.t1, .25, .25));
  let press = 0, rip = null;
  for (const c of TL.clicks) {
    if (t < c.t) break;
    if (!c.pos) { c.pos = pos; if (c.fn) c.fn(); }
    const d = t - c.t; if (d < .6) { rip = { c, d }; press = Math.max(press, 1 - P(d, .05, .2)); }
  }
  cursorEl.style.opacity = v.toFixed(3);
  cursorEl.style.transform = `translate(${pos[0].toFixed(1)}px, ${pos[1].toFixed(1)}px) scale(${(1 - .14 * press).toFixed(3)})`;
  if (rip) {
    const p = E.out(P(rip.d, 0, .55));
    ripple.style.opacity = ((1 - p) * .9 * v).toFixed(3);
    ripple.style.transform = `translate(${rip.c.pos[0].toFixed(1)}px, ${rip.c.pos[1].toFixed(1)}px) scale(${(.25 + .9 * p).toFixed(3)})`;
  } else ripple.style.opacity = 0;
}
function frameSpot(t) {
  let best = null, v = 0;
  for (const s of TL.spots) { const e = env(t, s.t0, s.t1, .3, .3); if (e > v) { v = e; best = s; } }
  if (!best || v <= 0) { spotEl.style.opacity = 0; spotEl.style.boxShadow = 'none'; return; }
  const r = best.rect(); if (!r) return;
  const [x, y] = scr(r.x - best.pad, r.y - best.pad), w = (r.w + 2 * best.pad) * ap.s, h = (r.h + 2 * best.pad) * ap.s;
  Object.assign(spotEl.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', opacity: v.toFixed(3),
    boxShadow: `0 0 0 4000px rgba(5, 9, 18, ${(.5 * v).toFixed(3)}), 0 0 24px rgba(138, 164, 255, ${(.55 * v).toFixed(3)})` });
}
function frameCardA(t) {
  const o = 1 - E.io(P(t, 13.4, 14.05));
  cardA.style.opacity = o; cardA.style.display = o > 0 ? '' : 'none'; if (o <= 0) return;
  cardA.style.transform = `scale(${(1 + .04 * E.in(P(t, 13.4, 14.05))).toFixed(4)})`;
  introText(t);
  const m = E.io(P(t, 7.25, 8.0)), fade = 1 - P(t, 6.9, 7.4), k = LG.k;
  LN.forEach((L, i) => {
    const p = E.out(P(t, .3 + .22 * i, 1.75 + .22 * i));
    let x1 = 160, x2 = 160 + 1280 * p, y = L.y, w = L.w, op = 1;
    if (i < 3) { const b = LOGO[i]; x1 = lerp(x1, LG.lx + k * b[1], m); x2 = lerp(x2, LG.lx + k * b[2], m); y = lerp(y, LG.ly + k * b[0], m); w = lerp(w, k * b[3], m); }
    else { x1 = lerp(x1, LG.lx + k * 15, m); x2 = lerp(x2, LG.lx + k * 15, m); y = lerp(y, LG.ly + k * 21.5, m); op = 1 - m; }
    L.el.setAttribute('x1', x1.toFixed(1)); L.el.setAttribute('x2', x2.toFixed(1)); L.el.setAttribute('y1', y.toFixed(1)); L.el.setAttribute('y2', y.toFixed(1));
    L.el.setAttribute('stroke-width', w.toFixed(2)); L.el.setAttribute('opacity', op.toFixed(3));
    L.lab.setAttribute('opacity', (P(t, .7 + .22 * i, 1.2 + .22 * i) * fade).toFixed(3));
    const h = E.out(P(t, 4.9 + .3 * i, 5.35 + .3 * i)) * fade, pulse = .72 + .28 * Math.sin((t - 4.9 - .3 * i) * 5.2);
    L.hot.setAttribute('opacity', h.toFixed(3)); L.glow.setAttribute('opacity', (h * pulse * .9).toFixed(3));
  });
  TF.forEach((f, j) => f.g.setAttribute('opacity', (E.out(P(t, 1.9 + .12 * j, 2.4 + .12 * j)) * fade).toFixed(3)));
  const sq = E.back(P(t, 7.85, 8.4)), cxl = LG.lx + LG.size / 2, cyl = LG.ly + LG.size / 2, sz = LG.size * sq;
  logoSq.setAttribute('x', (cxl - sz / 2).toFixed(1)); logoSq.setAttribute('y', (cyl - sz / 2).toFixed(1));
  logoSq.setAttribute('width', Math.max(0, sz).toFixed(1)); logoSq.setAttribute('height', Math.max(0, sz).toFixed(1)); logoSq.setAttribute('opacity', P(t, 7.85, 8.0).toFixed(3));
  stem.setAttribute('x1', LG.lx + k * 15); stem.setAttribute('x2', LG.lx + k * 15); stem.setAttribute('y1', LG.ly + k * 9); stem.setAttribute('y2', LG.ly + k * 21.5);
  stem.setAttribute('stroke-width', k * 1.2); stem.setAttribute('opacity', P(t, 7.95, 8.25).toFixed(3));
  const hp = P(t, 7.95, 9.4); halo.setAttribute('cx', cxl); halo.setAttribute('cy', cyl);
  halo.setAttribute('opacity', (Math.sin(hp * Math.PI) * .9).toFixed(3)); halo.setAttribute('r', (160 + 260 * E.out(hp)).toFixed(1));
  titleAnim('ft', t, 8.05);
}
function titleAnim(id, t, t0) {
  const eb = $('#' + id + '-eb'), wm = $('#' + id + '-wm'), st = $('#' + id + '-st'), sb = $('#' + id + '-sb');
  const pe = E.out(P(t, t0 + .25, t0 + .7)), pw = E.out(P(t, t0, t0 + .6)), ps = E.out(P(t, t0 + .7, t0 + 1.3));
  eb.style.opacity = pe; eb.style.transform = `translateX(${((1 - pe) * -14).toFixed(1)}px)`;
  wm.style.opacity = pw; wm.style.transform = `translateX(${((1 - pw) * -40).toFixed(1)}px)`;
  sb.style.opacity = ps; sb.style.transform = `translateY(${((1 - ps) * 12).toFixed(1)}px)`;
  $$('i', st).forEach((s, i) => { s.style.transform = `scaleX(${E.out(P(t, t0 + .5 + .16 * i, t0 + 1.0 + .16 * i)).toFixed(3)})`; s.style.transformOrigin = '0 50%'; });
}
function frameCardB(t) {
  const o = env(t, 51.9, 56.05, .45, .5);
  cardB.style.opacity = o; cardB.style.display = o > 0 ? '' : 'none'; if (o <= 0) return;
  const pe = E.out(P(t, 52.2, 52.6)); $('#fb-eb').style.opacity = pe;
  $$('#fb-h .w').forEach((w, i) => { const s = 52.3 + i * .06, p = E.out(P(t, s, s + .55)); w.style.opacity = p; w.style.transform = `translateY(${((1 - p) * .4).toFixed(3)}em)`; });
  const ps = E.out(P(t, 52.8, 53.3)); $('#fb-sb').style.opacity = ps;
  $$('.f-tile', cardB).forEach((d, i) => { const p = E.back(P(t, 53.0 + i * .14, 53.5 + i * .14)); d.style.opacity = clamp(p, 0, 1); d.style.transform = `translateY(${((1 - p) * 40).toFixed(1)}px)`; });
}
function frameCardC(t) {
  const o = E.io(P(t, 92.3, 93.0));
  cardC.style.opacity = o; cardC.style.display = o > 0 ? '' : 'none';
  blackout.style.opacity = P(t, 101.1, 102).toFixed(3);
  if (o <= 0) return;
  const t0 = 92.9, sq = E.back(P(t, t0 - .1, t0 + .4));
  titleAnim('fo', t, t0 + .1);
  const tg = $('#fc-tag'), pt = E.out(P(t, t0 + 1.1, t0 + 1.7)); tg.style.opacity = pt; tg.style.transform = `translateY(${((1 - pt) * 14).toFixed(1)}px)`;
  $('#fc-disc').style.opacity = E.out(P(t, t0 + 1.8, t0 + 2.4));
  const L = LG.outro, g = svgC.firstElementChild;
  g.setAttribute('transform', `translate(${L.lx + L.size / 2} ${L.ly + L.size / 2}) scale(${Math.max(0.001, sq).toFixed(4)}) translate(${-L.size / 2} ${-L.size / 2})`);
  g.setAttribute('opacity', P(t, t0 - .1, t0 + .05).toFixed(3));
}
function frameShell(t) {
  const o = 1 - E.io(P(t, 92.2, 93.0));
  shell.style.opacity = o.toFixed(3);
}
function frameSide(t) {
  const v = Math.min(E.out(P(t, 21.5, 22.05)), 1 - E.in(P(t, 45.65, 46.1)));
  sideEl.style.display = v > 0 ? '' : 'none';
  sideEl.style.transform = `translateX(${((1 - v) * -105).toFixed(2)}%)`;
  sideText(t);
}
function frameBand(t) {
  const segs = [[14.6, 22.0], [45.8, 52.2], [55.6, 92.2]];
  let v = 0; for (const [a, b] of segs) v = Math.max(v, env(t, a, b, .5, .45));
  bandEl.style.display = v > 0 ? '' : 'none'; bandEl.style.opacity = v.toFixed(3);
  bandText(t);
  const views = t >= 55.6 && t < 92.2;
  stepsEl.style.display = views ? '' : 'none'; tagEl.style.display = views ? 'none' : '';
  if (views) {
    let cur = -1; VSTART.forEach((s, i) => { if (t >= s) cur = i; });
    steps.forEach((s, i) => {
      const p = i === cur ? E.out(P(t, VSTART[i], VSTART[i] + .5)) : 0;
      s.style.color = i === cur ? '#f3f6fb' : i < cur ? '#aab6cb' : '#5f6b82';
      s.style.background = `rgba(138, 164, 255, ${(.12 * p).toFixed(3)})`;
      stepBars[i].style.transform = `scaleX(${p.toFixed(3)})`;
    });
  }
}

function frame(t) {
  for (const a of TL.act) if (t >= a.t && !done.has(a)) { done.add(a); a.fn(); }
  for (const w of TL.tw) {
    if (t < w.t0 || w.done) continue;
    w.fn(w.ease(P(t, w.t0, w.t1)));
    if (t >= w.t1) w.done = true;
  }
  frameCam(t); frameCursor(t); frameSpot(t);
  frameShell(t); frameSide(t); frameBand(t);
  frameCardA(t); frameCardB(t); frameCardC(t);
}

function layoutTitle(id, root, top, size) {
  const wm = $('#' + id + '-wm', root), wmW = $('span', wm).getBoundingClientRect().width;
  const G = size + 44 + wmW, lx = 800 - G / 2, x = lx + size + 44;
  wm.style.left = x + 'px'; wm.style.top = (top + 6) + 'px';
  $('#' + id + '-eb', root).style.left = (x + 4) + 'px'; $('#' + id + '-eb', root).style.top = (top - 36) + 'px';
  const st = $('#' + id + '-st', root); st.style.left = (x + 4) + 'px'; st.style.top = (top + size + 18) + 'px'; st.innerHTML = stripe(wmW - 8, 8);
  const sb = $('#' + id + '-sb', root); sb.style.left = (x + 4) + 'px'; sb.style.top = (top + size + 52) + 'px';
  return { lx, ly: top, size, k: size / 30, x, wmW };
}
function init() {
  LG = layoutTitle('ft', cardA, 330, 136);
  LG.outro = layoutTitle('fo', cardC, 270, 136);
  $('#fc-tag').style.top = (270 + 136 + 66) + 'px';
  // logo voor het slotbeeld
  const k = LG.outro.k, g = svgEl(svgC, 'g', {});
  svgEl(g, 'rect', { x: 0, y: 0, width: 136, height: 136, rx: 31, fill: '#2f5bea' });
  LOGO.forEach(b => svgEl(g, 'line', { x1: k * b[1], x2: k * b[2], y1: k * b[0], y2: k * b[0], stroke: '#f3f6fb', 'stroke-width': k * b[3] }));
  svgEl(g, 'line', { x1: k * 15, x2: k * 15, y1: k * 9, y2: k * 21.5, stroke: '#f3f6fb', 'stroke-width': k * 1.2 });
  // beginstand van de interface
  Object.assign(A.state, { sel: null, year: 2026, power: 2 });
  map.setSelection(null); A.refresh();
  shell.style.transform = 'none'; map.resize();
  map.reset();
  frame(0);
}
window.FILM = { init, frame, events: () => TL.ev, duration: DUR };
})();
