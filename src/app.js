/* app.js — toestand, de vijf weergaven en de panelen rond de kaart */
(function () {
'use strict';
const NK = window.NK, d3 = window.d3;
const { YEARS, CHAIN, CATS, LEVELS } = NK;
const model = NK.buildModel(window.NK_GEO, d3);
const HX = model.hex;

const $ = (s, el) => (el || document).querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (v, d) => v.toLocaleString('nl-NL', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
const fmtMW = mw => mw < 0.0995 ? nf(Math.round(mw * 1000)) + '\u00a0kW' : mw < 0.9995 ? nf(Math.round(mw * 100) * 10) + '\u00a0kW' : mw < 9.95 ? nf(mw, 1) + '\u00a0MW' : nf(Math.round(mw)) + '\u00a0MW';
const fmtCap = v => v < 1 ? nf(Math.round(v * 100) * 10) + '\u00a0kVA' : v < 10 ? nf(v, 1) + '\u00a0MVA' : nf(Math.round(v)) + '\u00a0MVA';
const pct = r => Math.round(r * 100) + '%';
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const icon = (id, cls) => `<svg class="${cls || 'ic'}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const hh2 = h => String(h).padStart(2, '0') + ':00';

const DIRW = { A: 'afname', I: 'invoeding', B: 'laden en ontladen' };
const GRANW = { hex: 'per buurt', station: 'per onderstation', deelnet: 'per HS-deelnet', region: 'per EHS-regio' };
const ST_SHORT = ['ruimte', 'beperkt', 'buiten de piek', 'geen ruimte'];
const HOME = {
  warmtepomp: { label: 'Warmtepomp', een: 'een warmtepomp', mw: 0.004 },
  laadpaal:   { label: 'Laadpaal', een: 'een laadpaal', mw: 0.011 },
  zon:        { label: 'Zonnepanelen', een: 'zonnepanelen', mw: 0.005 },
  zwaarder:   { label: 'Zwaardere aansluiting', een: 'een zwaardere aansluiting', mw: 0.024 },
};
const CATMW = { ls: 0.01, ws: 0.15, ms: 1, os: 8, hs: 60, ehs: 250 };
const AUD = { woningen: 'ls', bedrijven: 'ms', industrie: 'hs' };
const RUNGS = [
  { k: 'ehs', name: 'EHS', kv: '380 · 220 kV', sub: 'Landelijk transportnet · TenneT', tf: 'koppelstation' },
  { k: 'hs',  name: 'HS',  kv: '150 · 110 kV', sub: 'Regionaal transportnet · TenneT', tf: 'onderstation' },
  { k: 'ms',  name: 'MS',  kv: '10–20 kV',     sub: 'Distributienet · regionale netbeheerder', tf: 'wijkstation' },
  { k: 'ls',  name: 'LS',  kv: '0,4 kV',       sub: 'Het net in de straat', tf: null },
];
const VIEWS = {
  thuis:   { label: 'Thuis', h: 'Kan het bij mij thuis?', lede: 'Kies wat u wilt aansluiten. De kaart kleurt elke buurt.',
             level: 'keten', metric: 'status', layers: { lines: false, stations: false, projects: false, queue: false, operators: false, labels: true } },
  bedrijf: { label: 'Bedrijf', h: 'Is er ruimte voor mijn bedrijf?', lede: 'Stel uw vermogen in. De kaart toont de zwakste schakel tussen u en het landelijke net.',
             level: 'keten', metric: 'status', layers: { lines: true, stations: true, projects: false, queue: false, operators: false, labels: true } },
  opwek:   { label: 'Opwek & opslag', h: 'Waar kan ik invoeden of opslaan?', lede: 'Voor zonneparken, windparken en batterijen.',
             level: 'keten', metric: 'status', layers: { lines: true, stations: true, projects: false, queue: false, operators: false, labels: true } },
  regio:   { label: 'Regio & beleid', h: 'Waar knelt het, en tot wanneer?', lede: 'Voor gemeenten, provincies en planners: knelpunten, wachtrijen en geplande uitbreidingen.',
             level: 'keten', metric: 'status', layers: { lines: false, stations: false, projects: true, queue: true, operators: true, labels: true } },
  expert:  { label: 'Netexpert', h: 'Alle netvlakken, alle cijfers', lede: 'Bekijk elk netvlak apart, kies wat de kaart kleurt en schuif door de dag.',
             level: 'hs', metric: 'status', layers: { lines: true, stations: true, projects: false, queue: false, operators: false, labels: true } },
};
const METRICS = { status: 'Status', knelpunt: 'Knelpunt-netvlak', jaar: 'Jaar met ruimte', wachtrij: 'Wachtrij', belasting: 'Belasting per uur' };

const state = {
  view: 'bedrijf', level: 'keten', metric: 'status', year: 2026, hour: -1,
  home: 'warmtepomp', power: 2, dir: 'A', tech: 'zon', gen: 15, aud: 'bedrijven', cat: 'ms',
  layers: Object.assign({}, VIEWS.bedrijf.layers), hide: new Set(), patterns: false, sel: null,
  sort: { k: 'r', d: -1 }, listN: 20,
};
const cur = { d: null, units: null, b: null };

/* ---------- afleiden wat de kaart moet tonen ---------- */
function derive() {
  const v = state.view; let mw, dir;
  if (v === 'thuis') { mw = HOME[state.home].mw; dir = state.home === 'zon' ? 'I' : 'A'; }
  else if (v === 'bedrijf') { mw = state.power; dir = state.dir; }
  else if (v === 'opwek') { mw = state.gen; dir = state.tech === 'batterij' ? 'B' : 'I'; }
  else if (v === 'regio') { mw = CATMW[AUD[state.aud]]; dir = state.dir; }
  else { mw = CATMW[state.cat]; dir = state.dir; }
  const cat = NK.catFor(mw), keten = state.level === 'keten', lv = keten ? cat : LEVELS[state.level];
  let metric = state.metric; if (metric === 'knelpunt' && lv.els.length < 2) metric = 'status';
  return {
    mw, dir, cat, keten, els: lv.els, gran: lv.gran, yi: state.year - 2026, metric,
    hour: metric === 'belasting' && state.hour >= 0 ? state.hour : null,
    weight: lv.gran === 'hex' && lv.els.length === 2 ? 'hh' : 'area',
  };
}
function statusLabels(d) {
  if (state.view === 'thuis' && d.keten) return d.dir === 'I'
    ? ['Terugleveren kan', 'Kan, net is krap', 'Soms afschakelen', 'Eerst netverzwaring']
    : ['Kan direct', 'Kan, net is krap', 'Kan met slim sturen', 'Eerst netverzwaring'];
  if (d.dir === 'B') return ['Ruimte', 'Beperkte ruimte', 'Kansrijk buiten de piek', 'Geen ruimte'];
  return ['Ruimte', 'Beperkte ruimte', 'Alleen buiten de piek', 'Geen ruimte, wachtrij'];
}
const QSCALE = { hex: [0.02, 0.05, 0.1, 0.2], station: [2, 5, 10, 20], deelnet: [20, 50, 100, 200], region: [100, 250, 500, 1000] };

function binning(d, units) {
  const n = units.n, bin = new Uint8Array(n); let items, title, pats = null;
  if (d.metric === 'status') {
    bin.set(units.status);
    items = statusLabels(d).map((label, i) => ({ label, v: '--s' + i, icon: 's' + i }));
    pats = [null, null, 'dots', 'hatch']; title = 'Status';
  } else if (d.metric === 'knelpunt') {
    const G = { ehs: 1, hs: 2, ms: 3, ls: 4 };
    for (let u = 0; u < n; u++) bin[u] = units.status[u] < 2 ? 0 : G[CHAIN[units.bott[u]].group];
    items = [{ label: 'Geen knelpunt', v: '--q0' }, { label: 'EHS · landelijk net', v: '--q5' }, { label: 'HS · regionaal transport', v: '--q4' },
             { label: 'MS · middenspanning', v: '--q3' }, { label: 'LS · de straat', v: '--q1' }];
    title = 'Knelpunt zit in';
  } else if (d.metric === 'jaar') {
    for (let u = 0; u < n; u++) { const y = units.val[u]; bin[u] = y < 0 ? 5 : y === 0 ? 0 : y <= 2 ? 1 : y <= 4 ? 2 : y <= 6 ? 3 : 4; }
    items = ['Nu al ruimte', '2027–2028', '2029–2030', '2031–2032', '2033–2035', 'Na 2035'].map((label, i) => ({ label, v: '--q' + i }));
    title = 'Ruimte verwacht vanaf';
  } else if (d.metric === 'wachtrij') {
    const t = QSCALE[d.gran];
    for (let u = 0; u < n; u++) { const q = units.val[u]; bin[u] = q <= 0 ? 0 : q < t[0] ? 1 : q < t[1] ? 2 : q < t[2] ? 3 : q < t[3] ? 4 : 5; }
    items = ['Geen wachtrij', '< ' + fmtMW(t[0]), fmtMW(t[0]) + ' – ' + fmtMW(t[1]), fmtMW(t[1]) + ' – ' + fmtMW(t[2]), fmtMW(t[2]) + ' – ' + fmtMW(t[3]), '> ' + fmtMW(t[3])]
      .map((label, i) => ({ label, v: '--q' + i }));
    title = 'Wachtrij';
  } else {
    for (let u = 0; u < n; u++) { const r = units.val[u]; bin[u] = r < 0.5 ? 0 : r < 0.7 ? 1 : r < 0.85 ? 2 : r < 1 ? 3 : 4; }
    items = ['< 50%', '50 – 70%', '70 – 85%', '85 – 100%', '> 100%'].map((label, i) => ({ label, v: '--q' + (i + 1) }));
    title = 'Belasting ' + (d.hour == null ? 'op het piekmoment' : 'om ' + hh2(d.hour));
  }
  const share = new Float64Array(items.length), map = model.unitOfHex[d.gran]; let tot = 0;
  for (let i = 0; i < HX.n; i++) { const w = d.weight === 'hh' ? HX.hh[i] : 1; share[bin[map(i)]] += w; tot += w; }
  items.forEach((it, i) => { it.share = share[i] / tot; });
  return { bin, items, title, pats };
}

/* ---------- kaart ---------- */
const map = NK.createMap($('#map'), model, d3, { onClick: onMapClick, onHover: onMapHover, onZoom: onZoom });

function renderMapView() {
  const d = cur.d, b = cur.b, L = state.layers, lvl = state.level;
  let want;
  if (d.keten) want = d.cat.key === 'ls' ? { ehs: 0, hs: 0, ms: 1 } : d.cat.key === 'ehs' ? { ehs: 2, hs: 0, ms: 0 } : d.cat.key === 'hs' ? { ehs: 2, hs: 2, ms: 0 } : { ehs: 2, hs: 2, ms: 2 };
  else want = { ehs: { ehs: 2, hs: 0, ms: 0 }, hs: { ehs: 1, hs: 2, ms: 0 }, ms: { ehs: 0, hs: 1, ms: 2 }, ls: { ehs: 0, hs: 0, ms: 1 } }[lvl];
  const net = L.lines ? want : { ehs: 0, hs: 0, ms: 0 };
  const st = L.stations ? { ks: want.ehs || want.hs ? 1 : 0, os: want.hs || want.ms ? (lvl === 'ms' || lvl === 'hs' ? 2 : 1) : 0, ws: d.gran === 'hex' ? 1 : 0 } : { ks: 0, os: 0, ws: 0 };
  const colors = b.items.map(it => css(it.v));
  const own = d.metric === 'status' && (state.view === 'expert' || !d.keten), sc = [0, 1, 2, 3].map(i => css('--s' + i));
  let queue = null;
  if (L.queue) {
    queue = [];
    if (d.gran === 'hex' || d.gran === 'station') {
      for (const s of model.stations) { const q = NK.queueMW(s.os, d.dir, d.yi) + NK.queueMW(s.ms, d.dir, d.yi); if (q > 0) queue.push({ x: s.x, y: s.y, r: Math.min(20, 2 + Math.sqrt(q) * 1.5) }); }
    } else {
      for (const k of model.deelnets) { const q = NK.queueMW(k.ks, d.dir, d.yi) + NK.queueMW(k.hs, d.dir, d.yi); if (q > 0) queue.push({ x: k.x, y: k.y, r: Math.min(26, 3 + Math.sqrt(q) * 0.85) }); }
    }
  }
  map.setView({
    gran: d.gran, colors, bin: state.hide.size ? b.bin.map(v => state.hide.has(v) ? 255 : v) : b.bin,
    patterns: state.patterns ? b.pats : null, net, st, layers: L, year: state.year, provEmph: state.view === 'regio',
    projects: L.projects ? model.projects.filter(p => d.els.includes(p.ci)) : null, queue,
    ksFill: own ? i => sc[NK.stAt(model.deelnets[i].ks, d.dir, d.yi)] : null,
    osFill: own ? i => sc[NK.stAt(model.stations[i].os, d.dir, d.yi)] : null,
    wsFill: own ? i => sc[NK.stAt(HX.ws[i], d.dir, d.yi)] : null,
  });
}
function mapTitle(d) {
  let t;
  if (!d.keten) t = `${RUNGS.find(r => r.k === state.level).name}-netvlak: ${DIRW[d.dir]}`;
  else if (state.view === 'thuis') t = `Ruimte voor ${HOME[state.home].een}`;
  else if (state.view === 'opwek') t = `Ruimte voor ${{ zon: 'een zonnepark', wind: 'een windpark', batterij: 'een batterij' }[state.tech]} van ${fmtMW(d.mw)}`;
  else if (state.view === 'regio') t = `Ruimte voor ${{ woningen: 'woningen', bedrijven: 'bedrijven', industrie: 'industrie' }[state.aud]}: ${DIRW[d.dir]}`;
  else if (state.view === 'expert') t = `Keten tot ${d.cat.connShort.split(' · ')[0]}: ${DIRW[d.dir]}`;
  else t = `Ruimte voor ${fmtMW(d.mw)} ${DIRW[d.dir]}`;
  return { t, sub: `Peiljaar ${state.year} · ${GRANW[d.gran]}` };
}

/* ---------- de vraag (linksboven) ---------- */
const chip = (act, v, label, on, extra) => `<button type="button" class="chip" data-act="${act}" data-v="${v}" data-fk="${act}-${v}" aria-pressed="${on}">${label}${extra ? ` <small>${extra}</small>` : ''}</button>`;
const seg = (act, opts, val) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-act="${act}" data-v="${v}" data-fk="${act}-${v}" aria-pressed="${v === val}">${l}</button>`).join('')}</div>`;
const field = (label, body) => `<div class="field"><h2 class="lbl">${label}</h2>${body}</div>`;
const PW = { bedrijf: { key: 'power', min: 0.06, max: 300 }, opwek: { key: 'gen', min: 0.1, max: 300 } };
const toSlider = (mw, p) => Math.round(1000 * Math.log(mw / p.min) / Math.log(p.max / p.min));
const fromSlider = (v, p) => { const mw = p.min * Math.pow(p.max / p.min, v / 1000); return mw < 1 ? Math.round(mw * 100) / 100 : mw < 10 ? Math.round(mw * 10) / 10 : Math.round(mw); };
function powerField(p) {
  const mw = state[p.key], zones = CATS.filter(c => c.max > p.min);
  let lo = p.min;
  const z = zones.map(c => { const hi = Math.min(c.max, p.max), w = Math.log(hi / lo); lo = hi; return `<span data-cat="${c.key}" style="flex:${w.toFixed(3)} 1 0">${c.connShort.split(' · ')[0].replace('Onderstation', 'Onderst.').replace('Wijkstation', 'Wijkst.')}</span>`; }).join('');
  return `<div class="field"><h2 class="lbl"><span>Gevraagd vermogen</span><output id="pwOut" for="pw"></output></h2>
    <input type="range" id="pw" min="0" max="1000" step="1" value="${toSlider(mw, p)}" aria-label="Gevraagd vermogen">
    <div class="zones" id="zones" aria-hidden="true">${z}</div>
    <p class="conn" id="conn"></p></div>`;
}
function askLive() {       // wat meebeweegt terwijl u de schuif versleept
  const d = cur.d, out = $('#pwOut'); if (!out) return;
  out.textContent = fmtMW(d.mw);
  for (const el of document.querySelectorAll('#zones span')) el.classList.toggle('on', el.dataset.cat === d.cat.key);
  $('#conn').innerHTML = `U sluit aan op <b>${d.cat.conn}</b>. ${d.cat.els.length} van de 7 schakels ${d.cat.els.length === 1 ? 'telt' : 'tellen'} mee.`;
}
function renderAsk() {
  const v = state.view, V = VIEWS[v]; let h = `<h1>${V.h}</h1><p class="lede">${V.lede}</p>`;
  const dirSeg = field('Richting', seg('dir', [['A', 'Afname'], ['I', 'Invoeding']], state.dir));
  if (v === 'thuis') {
    h += `<div class="chips" role="group" aria-label="Wat wilt u aansluiten?">${Object.entries(HOME).map(([k, o]) => chip('home', k, o.label, state.home === k)).join('')}</div>`;
  } else if (v === 'bedrijf') {
    h += dirSeg + powerField(PW.bedrijf);
    h += `<div class="field"><div class="chips sm" role="group" aria-label="Voorbeelden">${[['Supermarkt', 0.15], ['Distributiecentrum', 2], ['Laadplein', 8], ['Datacenter', 60], ['Elektrolyser', 250]].map(([l, mw]) => chip('preset', mw, l, Math.abs(state.power - mw) < 1e-9).replace('<button', `<button data-tip="${l}|${fmtMW(mw)}"`)).join('')}</div></div>`;
  } else if (v === 'opwek') {
    h += `<div class="chips" role="group" aria-label="Wat wilt u aansluiten?">${[['zon', 'Zonnepark'], ['wind', 'Windpark'], ['batterij', 'Batterij']].map(([k, l]) => chip('tech', k, l, state.tech === k)).join('')}</div>` + powerField(PW.opwek);
  } else if (v === 'regio') {
    h += field('Voor wie?', `<div class="chips" role="group">${[['woningen', 'Woningbouw'], ['bedrijven', 'Bedrijventerrein'], ['industrie', 'Industrie']].map(([k, l]) => chip('aud', k, l, state.aud === k)).join('')}</div>`);
    h += dirSeg + field('Kaart kleurt op', `<div class="chips" role="group">${['status', 'jaar', 'wachtrij', 'knelpunt'].map(k => chip('metric', k, METRICS[k], state.metric === k)).join('')}</div>`);
  } else {
    h += dirSeg + field('Kaart kleurt op', `<div class="chips" role="group">${Object.keys(METRICS).map(k => chip('metric', k, METRICS[k], state.metric === k)).join('')}</div>`);
    h += field('Aansluitpunt voor ‘Hele keten’', `<select id="cat" aria-label="Aansluitpunt">${CATS.map(c => `<option value="${c.key}"${c.key === state.cat ? ' selected' : ''}>${c.connShort}</option>`).join('')}</select>`);
  }
  $('#ask').innerHTML = h; askLive();
}

/* ---------- netvlakken (links) ---------- */
function renderLadder() {
  const d = cur.d, relGroups = new Set(d.cat.els.map(k => CHAIN[k].group)), atGroup = CHAIN[d.cat.at].group;
  const mini = k => {
    const lv = LEVELS[k], u = model.computeUnits({ gran: lv.gran, els: lv.els, dir: d.dir, yi: d.yi, metric: 'status' });
    const dist = model.distribution(u, k === 'ls' ? 'hh' : 'area');
    const tip = `${RUNGS.find(r => r.k === k).name} in ${state.year}|` + dist.map((s, i) => `${pct(s)} ${ST_SHORT[i]}`).join(' · ');
    return `<span class="mini" data-tip="${tip}">${dist.map((s, i) => `<i style="flex:${s.toFixed(4)} 1 0;background:var(--s${i})"></i>`).join('')}</span>`;
  };
  let h = `<button type="button" class="rung keten" data-act="level" data-v="keten" data-fk="lv-keten" aria-pressed="${d.keten}">
      <span class="g">${icon('keten')}</span><span class="tx"><b>Hele keten</b><small>Zwakste schakel t/m ${d.cat.connShort.split(' · ')[0]}</small></span></button><div class="rail">`;
  RUNGS.forEach(r => {
    const dim = d.keten && !relGroups.has(r.k);
    h += `<button type="button" class="rung${dim ? ' dim' : ''}" data-act="level" data-v="${r.k}" data-fk="lv-${r.k}" aria-pressed="${state.level === r.k}">
      <span class="g"><span class="bus bus-${r.k}"></span></span>
      <span class="tx"><b>${r.name}</b><span class="kv">${r.kv}</span><small>${r.sub}</small>${mini(r.k)}</span>
      ${d.keten && atGroup === r.k ? `<span class="tag">${state.view === 'thuis' ? 'uw woning' : 'aansluitpunt'}</span>` : ''}</button>`;
    if (r.tf) h += `<div class="tf"><span class="g"><span class="tfs"></span></span><span>${r.tf}</span></div>`;
  });
  $('#ladder').innerHTML = h + '</div>';
}

/* ---------- legenda ---------- */
function renderLegend() {
  const d = cur.d, b = cur.b, L = state.layers, mt = mapTitle(d);
  $('#maptitle').innerHTML = `<b>${esc(mt.t)}</b><small>${esc(mt.sub)}</small>`;
  let h = `<h2 class="lbl">${esc(b.title)}</h2><ul>`;
  b.items.forEach((it, i) => {
    const pat = state.patterns && b.pats && b.pats[i] ? ' ' + b.pats[i] : '';
    h += `<li><button type="button" class="lg" data-act="hide" data-v="${i}" data-fk="lg-${i}" aria-pressed="${!state.hide.has(i)}">
      <span class="sw ${it.icon || ''}${pat}" style="background-color:var(${it.v})">${it.icon ? icon(it.icon, '') : ''}</span><span>${esc(it.label)}</span><span class="pc">${pct(it.share)}</span></button></li>`;
  });
  h += `</ul><div class="lg-foot"><span>Aandeel van ${d.weight === 'hh' ? 'de huishoudens' : 'het landoppervlak'}. Klik om te filteren.</span>`;
  if (b.pats) h += `<label><input type="checkbox" id="pat"${state.patterns ? ' checked' : ''}> Patronen voor kleurenblinden</label>`;
  const keys = [];
  if (L.stations && d.gran !== 'region') keys.push('<span><i class="k-sq"></i>koppelstation</span>', '<span><i class="k-ci"></i>onderstation</span>');
  if (L.projects) keys.push('<span><i class="k-di"></i>uitbreiding, met jaar</span>');
  if (L.queue) keys.push('<span><i class="k-bu"></i>wachtrij</span>');
  if (L.operators) keys.push('<span><i class="k-op"></i>grens netbeheerder</span>');
  if (state.sel) keys.push('<span><i class="k-rt"></i>route naar het landelijke net</span>');
  if (keys.length) h += `<div class="keys">${keys.join('')}</div>`;
  $('#legend').innerHTML = h + '</div>';
}

/* ---------- bouwstenen voor het rechterpaneel ---------- */
const stChip = (s, label) => `<span class="st" style="--c:var(--s${s})"><i class="dot"></i>${label}</span>`;
function runs(flags) {            // langste aaneengesloten blok (over middernacht heen)
  const n = flags.filter(Boolean).length; if (n === 0) return null; if (n === 24) return { all: true, n };
  let best = { len: 0, start: 0 };
  for (let s = 0; s < 24; s++) { if (!flags[s] || flags[(s + 23) % 24]) continue; let len = 0; while (flags[(s + len) % 24]) len++; if (len > best.len) best = { len, start: s }; }
  return { start: best.start, end: (best.start + best.len) % 24, len: best.len, n };
}
const dirKeyFor = (el, d) => d.dir !== 'B' ? d.dir : (el.A.r[d.yi] >= el.I.r[d.yi] ? 'A' : 'I');

function profileBlock(el, d, title) {
  const k = dirKeyFor(el, d), dd = el[k], r = dd.r[d.yi], vals = Array.from(dd.p, p => p * r);
  const max = Math.max(1.25, Math.max(...vals) * 1.08), W = 340, x0 = 34, x1 = W - 2, y0 = 8, y1 = 100, bw = (x1 - x0) / 24, Y = v => y1 - v / max * (y1 - y0);
  let s = `<svg class="chart" viewBox="0 0 ${W} 124" role="img" aria-label="Belasting per uur van ${esc(el.name)}">`;
  s += `<line class="grid" x1="${x0}" x2="${x1}" y1="${Y(0.5)}" y2="${Y(0.5)}"/><text x="${x0 - 5}" y="${Y(0.5) + 3.5}" text-anchor="end">50%</text>`;
  vals.forEach((v, h) => {
    const c = v < 0.75 ? 0 : v < 0.95 ? 1 : 3, y = Y(v);
    s += `<rect x="${(x0 + h * bw + 1).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(y1 - y).toFixed(1)}" rx="1.5" fill="var(--s${c})"/>`;
  });
  s += `<line class="cap" x1="${x0}" x2="${x1}" y1="${Y(1)}" y2="${Y(1)}"/><text x="${x0 - 5}" y="${Y(1) + 3.5}" text-anchor="end">100%</text>`;
  s += `<line class="grid" x1="${x0}" x2="${x1}" y1="${y1}" y2="${y1}" style="stroke:var(--line2)"/>`;
  for (const h of [0, 6, 12, 18, 24]) s += `<text x="${x0 + h * bw}" y="${y1 + 14}" text-anchor="middle">${String(h).padStart(2, '0')}</text>`;
  vals.forEach((v, h) => { s += `<rect class="hit" x="${(x0 + h * bw).toFixed(1)}" y="${y0}" width="${bw.toFixed(1)}" height="${y1 - y0}" data-tip="${hh2(h)} – ${hh2((h + 1) % 24)}|${pct(v)} van de capaciteit"/>`; });
  s += '</svg>';
  const fr = runs(vals.map(v => v < 0.75));
  const busy = runs(vals.map(v => v >= 0.75));
  const note = !fr ? 'Op geen enkel uur is hier lucht.' : fr.all ? 'De hele dag blijft de belasting onder 75%.'
    : fr.n >= 17 ? `Alleen tussen ${hh2(busy.start)} en ${hh2(busy.end)} komt de belasting boven 75%.` : `Lucht tussen ${hh2(fr.start)} en ${hh2(fr.end)}, ${fr.n} uur per dag onder 75%.`;
  return `<div class="blk"><h3 class="lbl"><span>${title}</span><span class="val" style="font-size:12px;font-weight:600;color:var(--ink3)">${k === 'A' ? 'winterse werkdag' : 'zonnige zomerdag'}</span></h3>${s}
    <p class="note">${esc(el.name)}: ${note} De lijn is 100% van de capaciteit.</p></div>`;
}
function timelineBlock(chain, rel, d, labels) {
  let h = '';
  for (let yi = 0; yi < YEARS.length; yi++) {
    const ev = NK.evaluate(chain, rel, d.dir, yi), pr = rel.map(k => chain[k]).filter(el => el && el.proj && el.proj.year === YEARS[yi]);
    const tip = `${YEARS[yi]} · ${labels[ev.s]}|` + (pr.length ? pr.map(el => `${el.proj.type}: ${el.name}`).join(' · ') : ev.s >= 1 ? 'Krapste schakel: ' + CHAIN[ev.b].long : 'Alle schakels hebben ruimte');
    h += `<button type="button" class="ty${yi === d.yi ? ' cur' : ''}" style="--c:var(--s${ev.s})" data-act="year" data-v="${YEARS[yi]}" data-fk="ty-${yi}" data-tip="${esc(tip)}" aria-label="${esc(tip.replace('|', '. '))}">${pr.length ? '<u></u>' : ''}<i></i><span>’${String(YEARS[yi]).slice(2)}</span></button>`;
  }
  return `<div class="blk"><h3 class="lbl">Vooruitblik</h3><div class="tline">${h}</div><p class="note">Een ruit markeert het jaar waarin een uitbreiding klaar is. Klik op een jaar om de kaart mee te nemen.</p></div>`;
}
function chainBlock(chain, rel, d, ev, st, dn, labels) {
  const msKV = st.prov === 'Flevoland' || st.prov === 'Friesland' ? 20 : 10;
  const kv = [dn.kvE + ' kV', `${dn.kvE}/${dn.kvH} kV`, dn.kvH + ' kV', `${dn.kvH}/${msKV} kV`, msKV + ' kV', msKV + '/0,4 kV', '0,4 kV'];
  const busH = [6, 0, 4, 0, 2.5, 0, 1.5];
  const you = d.keten ? `<li class="cr end"><span class="cg">${icon(state.view === 'thuis' ? 'thuis' : state.view === 'opwek' ? 'opwek' : 'bedrijf')}</span><div class="cb">${state.view === 'thuis' ? 'Uw woning' : 'Uw aansluiting'} · ${fmtMW(d.mw)} ${DIRW[d.dir]}</div></li>` : '';
  let h = '';
  chain.forEach((el, k) => {
    const m = CHAIN[k], on = rel.includes(k), s = NK.stAt(el, d.dir, d.yi), r = NK.rAt(el, d.dir, d.yi);
    const g = m.type === 'net' ? `<span class="cbus" style="height:${busH[k]}px"></span>` : '<span class="tfs"></span>';
    if (!on) { h += `<li class="cr off" style="--c:var(--s${s})"><span class="cg">${g}</span><div class="cb"><div class="ct"><b>${m.short}</b><span class="kv">${kv[k]}</span><span style="margin-left:auto">${stChip(s, ST_SHORT[s])}</span></div></div></li>`; }
    else {
      const x = [], q = NK.queueMW(el, d.dir, d.yi);
      if (k <= 4 && q > 0) x.push(`wachtrij ${fmtMW(q)}, ${nf(NK.queueN(el, d.dir, d.yi))} aanvragen`);
      if (el.proj) x.push(el.proj.year <= state.year ? `uitgebreid in ${el.proj.year}` : `${el.proj.type.toLowerCase()}, klaar in ${el.proj.year}`);
      else if (s >= 2) x.push('nog geen uitbreiding gepland');
      if (state.view === 'expert') x.push('capaciteit ' + fmtCap(el.cap));
      h += `<li class="cr" style="--c:var(--s${s})"><span class="cg">${g}</span><div class="cb">
        <div class="ct"><b>${esc(el.name)}</b><span class="kv">${kv[k]}</span>${k === ev.b && ev.s >= 2 ? '<span class="flag">Knelpunt</span>' : ''}</div>
        <div class="cm"><span class="meter" data-tip="Belasting op het piekmoment|${pct(r)} van de capaciteit. Het streepje is 100%."><i style="width:${(Math.min(r, 1.3) / 1.3 * 100).toFixed(1)}%"></i><em></em></span><span class="pct">${pct(r)}</span>${stChip(s, ST_SHORT[s])}</div>
        ${x.length ? `<div class="cx">${cap1(x.join(' · '))}</div>` : ''}</div></li>`;
    }
    if (d.keten && k === d.cat.at) h += you;
  });
  const who = rel.some(k => k <= 2) ? `TenneT (hoogspanning) en ${st.op}` : st.op;
  return `<div class="blk"><h3 class="lbl">De keten op deze plek</h3><ol class="chain">${h}</ol>
    <p class="note">${rel.length} van de 7 schakels ${rel.length === 1 ? 'telt' : 'tellen'} mee${d.keten ? ' voor deze aansluiting' : ' in dit netvlak'}. Beheer: ${who}.</p></div>`;
}
function nearestRoom(d, sel) {
  const u = cur.units, pos = { hex: i => [HX.x[i], HX.y[i]], station: i => [model.stations[i].x, model.stations[i].y], deelnet: i => [model.deelnets[i].x, model.deelnets[i].y], region: i => [model.regions[i].x, model.regions[i].y] }[d.gran];
  let best = -1, bd = Infinity;
  for (let i = 0; i < u.n; i++) { if (u.status[i] > 1) continue; const [x, y] = pos(i), dd = (x - sel.x) ** 2 + (y - sel.y) ** 2; if (dd < bd) { bd = dd; best = i; } }
  if (best < 0) return null;
  const [x, y] = pos(best);
  const name = d.gran === 'hex' ? model.hexName(best) : d.gran === 'station' ? 'het gebied van onderstation ' + model.stations[best].name : d.gran === 'deelnet' ? 'HS-deelnet ' + model.deelnets[best].name : 'EHS-regio ' + model.regions[best].name;
  return { x, y, name, km: Math.sqrt(bd) / NK.KM };
}
function optionsBlock(d, ev, chain, sel, free) {
  const o = [], v = state.view, s = ev.s, b = chain[ev.b];
  const win = free && !free.all ? `${hh2(free.start)}–${hh2(free.end)}` : null;
  if (v === 'thuis' && d.keten) {
    if (d.dir === 'I') {
      if (s <= 1) o.push(['Meld uw panelen aan', 'Dat is verplicht en gratis, en helpt de netbeheerder plannen.']);
      if (s >= 1) o.push(['Gebruik uw stroom zelf', 'Zet wasmachine, boiler of auto aan op zonnige uren. Dat scheelt teruglevering.']);
      if (s >= 2) o.push(['Overweeg een thuisbatterij of dynamisch contract', 'Dan slaat u de middagpiek op in plaats van terug te leveren.']);
    } else {
      if (s <= 1) o.push([`Meld uw ${HOME[state.home].label.toLowerCase()} aan`, 'Dat is verplicht en gratis.']);
      if (s === 1 || s === 2) o.push(['Laad en verwarm buiten de avondpiek', win ? `Tussen ${win} is er in uw buurt altijd lucht.` : 'Spreid uw verbruik over de dag.']);
      if (s === 2) o.push(['Kies een apparaat met slimme sturing', 'Dat schakelt terug als het net vol zit; u merkt er weinig van.']);
      if (s === 3) o.push(['Vraag de verzwaring nu al aan', 'U houdt uw plek; de netbeheerder pakt uw straat mee in de planning.'], ['Kijk naar een hybride warmtepomp of 1-fase lader', 'Die passen vaak wel op uw huidige aansluiting.']);
    }
  } else if (v === 'regio' || v === 'expert' || !d.keten) {
    return '';
  } else {
    if (s === 0) o.push(['Vraag een offerte aan', 'Capaciteit wordt pas vastgelegd bij een getekende offerte.']);
    if (s === 1) o.push(['Wacht niet te lang', 'De laatste ruimte gaat op volgorde van aanvraag.']);
    if (s === 2) o.push([d.dir === 'B' ? 'Vraag een tijdgebonden contract voor uw batterij aan' : 'Vraag een tijdgebonden contract aan', win ? `Transport tussen ${win}, tegen een lager tarief. Op piekuren schakelt u af.` : 'Transport buiten de piekuren, tegen een lager tarief.']);
    if (s === 3) o.push(['Schrijf u in voor de wachtrij', `U houdt uw plek. Nu ${nf(NK.queueN(b, d.dir, d.yi))} aanvragen, samen ${fmtMW(NK.queueMW(b, d.dir, d.yi))}.`]);
    if (s >= 2 && v === 'bedrijf') o.push(['Deel capaciteit met buren', 'In een groepscontract of energiehub benut u samen bestaande aansluitingen.'], ['Vang uw piek op met een batterij', 'Opslag achter de meter verlaagt het vermogen dat u van het net vraagt.']);
    if (s >= 2 && v === 'opwek' && d.dir === 'I') o.push(['Deel de aansluiting met wind of opslag', 'Zon en wind pieken zelden tegelijk; samen passen ze op één kabel.']);
    if (s >= 2) {
      const nr = nearestRoom(d, sel);
      if (nr) o.push(['Kijk ' + nf(Math.max(1, Math.round(nr.km))) + ' km verderop', `Dichtstbijzijnde plek met ruimte: ${esc(nr.name)}. <button type="button" class="link" data-act="goto" data-x="${nr.x.toFixed(1)}" data-y="${nr.y.toFixed(1)}" data-fk="goto-room">Toon op de kaart</button>`]);
    }
  }
  return o.length ? `<div class="blk"><h3 class="lbl">Wat kunt u doen?</h3><ul class="opts">${o.map(([t, p]) => `<li><b>${t}</b><span>${p}</span></li>`).join('')}</ul></div>` : '';
}

function detailHTML() {
  const d = cur.d, sel = state.sel, i = sel.hex, chain = model.chainOf.hex(i), rel = d.els, labels = statusLabels(d);
  const st = model.stations[HX.st[i]], dn = model.deelnets[st.dn];
  const ev = NK.evaluate(chain, rel, d.dir, d.yi), s = ev.s, b = chain[ev.b], bm = CHAIN[ev.b];
  const fy = NK.firstRoomYear(chain, rel, d.dir), fyTxt = fy < 0 ? 'na 2035' : fy === 0 && d.yi === 0 ? 'nu' : String(YEARS[fy]);
  const bk = dirKeyFor(b, d), free = runs(Array.from(b[bk].p, p => p * b[bk].r[d.yi] < 0.75)), peak = runs(Array.from(b[bk].p, p => p >= 0.9));
  const home = state.view === 'thuis' && d.keten;
  let vh = labels[s], vp;
  if (home) {
    const een = HOME[state.home].een, plan = b.proj && b.proj.year > state.year ? `De verzwaring staat gepland voor ${b.proj.year}.` : 'Er is nog geen verzwaring ingepland.';
    if (d.dir === 'I') { vh = ['Ja, terugleveren kan', 'Ja, het kan nog net', 'Ja, maar reken op uitval', 'Voorlopig beperkt'][s];
      vp = ['Het net in uw buurt kan uw zonnestroom aan, ook op zonnige middagen.', 'Er is nog ruimte, maar op zonnige dagen is het net in uw buurt bijna vol.', 'Op zonnige middagen zit het net hier vol. Uw omvormer schakelt dan soms af.', 'Het net in uw buurt kan er geen teruglevering meer bij hebben. ' + plan][s]; }
    else { vh = ['Ja, dat kan', 'Ja, het kan nog net', 'Ja, met slim sturen', 'Nog niet'][s];
      vp = [`Er is ruimte in uw buurt voor ${een}.`, `Het net in uw buurt is krap, maar ${een} past nog.`, `${peak && !peak.all ? `Tussen ${hh2(peak.start)} en ${hh2(peak.end)}` : 'Op piekuren'} zit het net hier vol. Met slimme sturing past ${een} wel.`, 'Het net in uw buurt wordt eerst verzwaard. ' + plan][s]; }
  } else if (!d.keten) {
    vp = [`Dit netvlak heeft hier ruimte voor ${DIRW[d.dir]}.`, `${b.name} zit op ${pct(ev.r)}; de ruimte raakt op.`, `${b.name} zit vol op piekuren, daarbuiten is lucht.`, `${b.name} zit vol. Verwachte ruimte: ${fyTxt}.`][s];
  } else {
    vh = [d.dir === 'B' ? 'Ruimte voor laden en ontladen' : 'Ruimte beschikbaar', 'Beperkte ruimte', d.dir === 'B' ? 'Kansrijk voor een netbewuste batterij' : 'Alleen buiten de piek', 'Geen ruimte, u komt in de wachtrij'][s];
    vp = [`${fmtMW(d.mw)} ${DIRW[d.dir]} past op alle schakels tussen u en het landelijke net.`, `Het past nog, maar ${bm.long.toLowerCase()} zit al op ${pct(ev.r)}.`,
      `${b.name} zit vol op piekuren. Met een tijdgebonden contract kunt u wel worden aangesloten.`, `${b.name} zit vol. Verwachte ruimte: ${fyTxt}.`][s];
  }
  const facts = [];
  if (home) {
    const wk = s === 0 ? 3 + Math.round(b.A.qu * 4) : s === 1 ? 8 + Math.round(b.A.qu * 10) : s === 2 ? 12 + Math.round(b.A.qu * 12) : null;
    facts.push(['Wachttijd', wk ? `± ${wk} weken` : (b.proj && b.proj.year > state.year ? `tot ${b.proj.year}` : 'onbekend'), wk ? 'voor aansluiten of verzwaren' : 'eerst netverzwaring']);
    facts.push(['Drukste uren', peak && !peak.all ? `${String(peak.start).padStart(2, '0')}–${String(peak.end).padStart(2, '0')} uur` : 'hele dag', d.dir === 'I' ? 'zonnige dag' : 'winterse werkdag']);
    facts.push(['Wijkstation', pct(NK.rAt(chain[5], d.dir, d.yi)), 'belast op de piek']);
  } else {
    const q = NK.queueMW(b, d.dir, d.yi);
    facts.push([s >= 2 ? 'Knelpunt' : 'Krapste schakel', bm.short, pct(ev.r) + ' belast']);
    facts.push(['Wachtrij', q > 0 && ev.b <= 4 ? fmtMW(q) : 'geen', q > 0 && ev.b <= 4 ? nf(NK.queueN(b, d.dir, d.yi)) + ' aanvragen' : 'bij deze schakel']);
    facts.push(['Ruimte vanaf', cap1(fyTxt), fy < 0 ? 'geen uitbreiding gepland' : fy <= d.yi ? 'in het peiljaar' : 'na uitbreiding']);
  }
  return `<div class="phead"><div><h2>${esc(cap1(model.hexName(i)))}</h2><p>${esc(st.prov)} · onderstation ${esc(st.name)} · ${esc(st.op)}</p></div>
      <button type="button" class="iconbtn" data-act="unsel" data-fk="unsel" aria-label="Sluit deze plek">${icon('close')}</button></div>
    <div class="verdict" style="--c:var(--s${s})"><span class="big s${s}">${icon('s' + s, '')}</span><div><h3>${esc(vh)}</h3><p>${esc(vp)}</p></div></div>
    <div class="facts">${facts.map(f => `<div class="fact"><span>${f[0]}</span><b>${esc(f[1])}</b><small>${esc(f[2])}</small></div>`).join('')}</div>
    ${chainBlock(chain, rel, d, ev, st, dn, labels)}
    ${profileBlock(b, d, s >= 2 ? 'Dagverloop knelpunt' : 'Dagverloop krapste schakel')}
    ${timelineBlock(chain, rel, d, labels)}
    ${optionsBlock(d, ev, chain, sel, free)}`;
}

/* ---------- overzicht (niets gekozen) ---------- */
function totals(d) {
  let mw = 0, n = 0; const add = el => { mw += NK.queueMW(el, d.dir, d.yi); n += NK.queueN(el, d.dir, d.yi); };
  if (d.els.includes(0)) model.regions.forEach(r => add(r.ehs));
  if (d.els.includes(1)) model.deelnets.forEach(k => add(k.ks));
  if (d.els.includes(2)) model.deelnets.forEach(k => add(k.hs));
  if (d.els.includes(3)) model.stations.forEach(s => add(s.os));
  if (d.els.includes(4)) model.stations.forEach(s => add(s.ms));
  const pr = model.projects.filter(p => d.els.includes(p.ci));
  return { mw, n, done: pr.filter(p => p.el.proj.year <= state.year).length, all: pr.length };
}
function provinceTable(d) {
  const P = model.provinces.map(p => ({ p, c: [0, 0, 0, 0], tot: 0, q: 0 })), map = model.unitOfHex[d.gran];
  for (let i = 0; i < HX.n; i++) { const w = d.weight === 'hh' ? HX.hh[i] : 1, r = P[HX.prov[i]]; r.c[cur.units.status[map(i)]] += w; r.tot += w; }
  const idx = Object.fromEntries(model.provinces.map((p, i) => [p.name, i]));
  for (const s of model.stations) P[idx[s.prov]].q += NK.queueMW(s.os, d.dir, d.yi) + NK.queueMW(s.ms, d.dir, d.yi);
  P.sort((a, b) => (b.c[3] + b.c[2] * 0.5) / b.tot - (a.c[3] + a.c[2] * 0.5) / a.tot);
  const labels = statusLabels(d);
  return `<div class="blk"><h3 class="lbl">Per provincie</h3><div class="scrollx"><table class="tbl"><thead><tr><th>Provincie</th><th>Verdeling</th><th class="r">Vol</th><th class="r">Wachtrij</th></tr></thead><tbody>
    ${P.map(r => `<tr data-act="prov" data-v="${esc(r.p.name)}" tabindex="0" data-fk="prov-${esc(r.p.name)}"><td>${esc(r.p.name)}</td>
      <td><span class="bar" data-tip="${esc(r.p.name)}|${r.c.map((c, i) => `${pct(c / r.tot)} ${labels[i].toLowerCase()}`).join(' · ')}">${r.c.map((c, i) => `<i style="flex:${(c / r.tot).toFixed(4)} 1 0;--c:var(--s${i})"></i>`).join('')}</span></td>
      <td class="r">${pct(r.c[3] / r.tot)}</td><td class="r">${fmtMW(r.q)}</td></tr>`).join('')}
    </tbody></table></div><p class="note">Gesorteerd op krapte. Wachtrij: onderstations en middenspanning. Klik op een provincie om in te zoomen.</p></div>`;
}
function assetTable(d) {
  const u = cur.units, rows = [];
  for (let i = 0; i < u.n; i++) {
    const els = model.chainOf[d.gran](i); let q = 0, py = null, r = 0;
    for (const k of d.els) { const el = els[k]; q = Math.max(q, NK.queueMW(el, d.dir, d.yi)); r = Math.max(r, NK.rAt(el, d.dir, d.yi)); if (el.proj && el.proj.year > state.year && (py == null || el.proj.year < py)) py = el.proj.year; }
    rows.push({ i, s: u.status[i], r, q, py });
  }
  const name = i => d.gran === 'hex' ? HX.ws[i].name.replace('Wijkstation ', '') : d.gran === 'station' ? model.stations[i].name : d.gran === 'deelnet' ? model.deelnets[i].name : model.regions[i].name;
  const k = state.sort.k, dir = state.sort.d;
  rows.sort((a, b) => k === 'n' ? dir * name(a.i).localeCompare(name(b.i), 'nl') : dir * (((a[k] == null ? 9999 : a[k]) - (b[k] == null ? 9999 : b[k])) || (a.r - b.r)));
  const th = (key, label, cls) => `<th${cls ? ` class="${cls}"` : ''}${k === key ? ` aria-sort="${dir > 0 ? 'ascending' : 'descending'}"` : ''}><button type="button" data-act="sort" data-v="${key}" data-fk="sort-${key}">${label}${k === key ? (dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
  const pos = i => d.gran === 'hex' ? [HX.x[i], HX.y[i]] : d.gran === 'station' ? [model.stations[i].x, model.stations[i].y] : d.gran === 'deelnet' ? [model.deelnets[i].x, model.deelnets[i].y] : [model.regions[i].x, model.regions[i].y];
  const head = { hex: 'Wijkstation', station: 'Onderstation', deelnet: 'HS-deelnet', region: 'EHS-regio' }[d.gran];
  return `<div class="blk"><h3 class="lbl"><span>Lijst ${GRANW[d.gran]}</span><span class="val" style="font-size:12px;font-weight:600;color:var(--ink3)">${nf(rows.length)} stuks</span></h3>
    <div class="scrollx"><table class="tbl"><thead><tr>${th('n', head)}${th('r', 'Belast', 'r')}${th('q', 'Wachtrij', 'r')}${th('py', 'Uitbr.', 'r')}</tr></thead><tbody>
    ${rows.slice(0, state.listN).map(r => { const [x, y] = pos(r.i); return `<tr data-act="goto" data-x="${x.toFixed(1)}" data-y="${y.toFixed(1)}" tabindex="0" data-fk="row-${r.i}"><td><span class="nm" style="--c:var(--s${r.s})"><i class="dot"></i>${esc(name(r.i))}</span></td><td class="r">${pct(r.r)}</td><td class="r">${r.q > 0 ? fmtMW(r.q) : '–'}</td><td class="r">${r.py || '–'}</td></tr>`; }).join('')}
    </tbody></table></div>${rows.length > state.listN ? `<p class="note"><button type="button" class="link" data-act="more" data-fk="more">Toon er 20 meer</button></p>` : ''}</div>`;
}
function overviewHTML() {
  const d = cur.d, b = cur.b, v = state.view, mt = mapTitle(d), t = totals(d);
  let h = `<div class="phead"><div><h2>Nederland in ${state.year}</h2><p>${esc(mt.t)}, ${GRANW[d.gran]}</p></div></div>`;
  h += `<div class="blk" style="border-top:0;margin-top:0"><h3 class="lbl">${esc(b.title)}</h3>
    <div class="bar" role="img" aria-label="Verdeling">${b.items.map(it => `<i style="flex:${it.share.toFixed(4)} 1 0;--c:var(${it.v})" data-tip="${esc(it.label)}|${pct(it.share)}"></i>`).join('')}</div>
    <ul class="rows">${b.items.map(it => `<li style="--c:var(${it.v})"><i class="dot"></i><span>${esc(it.label)}</span><span class="pc">${pct(it.share)}</span></li>`).join('')}</ul>
    <p class="note">Aandeel van ${d.weight === 'hh' ? 'de huishoudens' : 'het landoppervlak'}.</p></div>`;
  if (d.cat.key === 'ls' && d.keten) {
    const tot = HX.hh.reduce((a, c) => a + c, 0) / 1e6, sh = model.distribution(cur.units, 'hh');
    h += `<div class="facts">${[['Ruimte', nf(sh[0] * tot, 1) + ' mln', 'huishoudens'], ['Krap of slim sturen', nf((sh[1] + sh[2]) * tot, 1) + ' mln', 'huishoudens'], ['Eerst verzwaren', nf(sh[3] * tot * 1000) + ' dzd', 'huishoudens']].map(f => `<div class="fact"><span>${f[0]}</span><b>${f[1]}</b><small>${f[2]}</small></div>`).join('')}</div>`;
  } else {
    h += `<div class="facts">${[['In de wachtrij', fmtMW(t.mw), nf(t.n) + ' aanvragen'], ['Uitbreidingen', `${nf(t.done)} / ${nf(t.all)}`, 'klaar in ' + state.year], ['Schakels', String(d.els.length) + ' van 7', d.keten ? (d.els.length === 1 ? 'telt mee' : 'tellen mee') : 'in dit netvlak']].map(f => `<div class="fact"><span>${f[0]}</span><b>${f[1]}</b><small>${f[2]}</small></div>`).join('')}</div>`;
  }
  if (v === 'thuis') {
    h += `<div class="blk"><h3 class="lbl">Zo leest u de kaart</h3><ol class="how"><li>Zoek uw woonplaats of klik op uw buurt.</li><li>U ziet of het net in uw straat en het wijkstation het aankunnen.</li><li>Drukte op hogere netvlakken telt voor een woning niet mee. Die ziet u wel terug in de keten.</li></ol></div>`;
  } else if (v === 'regio') h += provinceTable(d);
  else if (v === 'expert') h += assetTable(d);
  if (v === 'bedrijf' || v === 'opwek' || v === 'regio') {
    if (d.els.length > 1) {
      const G = ['ehs', 'hs', 'ms', 'ls'], c = { ehs: 0, hs: 0, ms: 0, ls: 0 }, map = model.unitOfHex[d.gran]; let tot = 0;
      for (let i = 0; i < HX.n; i++) { const u = map(i); tot++; if (cur.units.status[u] >= 2) c[CHAIN[cur.units.bott[u]].group]++; }
      const mx = Math.max(0.01, ...G.map(g => c[g] / tot));
      h += `<div class="blk"><h3 class="lbl">Waar zit het knelpunt?</h3>${G.filter(g => d.els.some(k => CHAIN[k].group === g)).map(g => { const r = RUNGS.find(x => x.k === g); return `<div class="hbar"><span><b>${r.name}</b> ${r.kv}</span><span class="tr"><i style="width:${(c[g] / tot / mx * 100).toFixed(1)}%;--c:var(--ink2)"></i></span><span class="v">${pct(c[g] / tot)}</span></div>`; }).join('')}
        <p class="note">Aandeel van het land waar dit netvlak de zwakste schakel is. Kies een netvlak links om het los te bekijken.</p></div>`;
    }
    const up = model.projects.filter(p => p.big >= 2 && d.els.includes(p.ci) && p.el.proj.year > state.year).sort((a, c) => a.el.proj.year - c.el.proj.year).slice(0, 6);
    if (up.length) h += `<div class="blk"><h3 class="lbl">Eerstvolgende grote uitbreidingen</h3><div class="scrollx"><table class="tbl"><tbody>${up.map((p, k) => `<tr data-act="goto" data-x="${p.x.toFixed(1)}" data-y="${p.y.toFixed(1)}" tabindex="0" data-fk="up-${k}"><td class="r" style="width:40px"><b>${p.el.proj.year}</b></td><td>${esc(p.el.proj.type)}<br><span style="color:var(--ink3)">${esc(p.el.name)}</span></td><td class="r">+${fmtCap(p.el.proj.capAdd)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  if (v !== 'thuis') h += `<p class="note" style="margin-top:14px">Klik op de kaart of zoek een plaats voor de keten op één plek.</p>`;
  return h;
}
function renderPanel() { $('#panel').innerHTML = state.sel ? detailHTML() : overviewHTML(); }

/* ---------- alles bijwerken ---------- */
function refresh(o) {
  o = o || {};
  const a = document.activeElement, fk = a && a.dataset ? a.dataset.fk : null;
  const d = cur.d = derive();
  cur.units = model.computeUnits({ gran: d.gran, els: d.els, dir: d.dir, yi: d.yi, metric: d.metric, hour: d.hour });
  cur.b = binning(d, cur.units);
  renderMapView(); renderLegend(); renderLadder();
  if (o.keepAsk) askLive(); else renderAsk();
  renderPanel();
  for (const b of document.querySelectorAll('#views .view')) { if (b.dataset.v === state.view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
  for (const c of document.querySelectorAll('#layers input')) c.checked = !!state.layers[c.dataset.layer];
  $('#year').value = state.year; $('#yearOut').textContent = state.year;
  const done = model.projects.filter(p => p.big >= 1 && p.el.proj.year <= state.year).length;
  $('#yearHint').textContent = state.year === 2026 ? 'De stand van nu. Schuif naar later voor de prognose.' : `Prognose. ${nf(done)} grotere uitbreidingen zijn dan klaar.`;
  $('#hourBlk').hidden = d.metric !== 'belasting';
  $('#hour').value = state.hour; $('#hourOut').textContent = state.hour < 0 ? 'piek' : hh2(state.hour);
  if (fk) { const el = document.querySelector(`[data-fk="${fk}"]`); if (el && el !== document.activeElement) el.focus({ preventScroll: true }); }
}
function setView(v, fromHash) {
  if (!VIEWS[v]) return;
  state.view = v; state.level = VIEWS[v].level; state.metric = VIEWS[v].metric; state.layers = Object.assign({}, VIEWS[v].layers);
  state.hide.clear(); state.hour = -1; state.listN = 20;
  if (!fromHash) { try { history.replaceState(null, '', '#' + v); } catch (e) { try { location.hash = v; } catch (e2) { /* geen adresbalk */ } } }
  refresh();
}
function select(x, y, zoom) {
  let h = model.inLand(x, y) ? model.hexAt(x, y) : -1;
  if (h < 0) { let bd = Infinity; for (let i = 0; i < HX.n; i++) { const dd = (HX.x[i] - x) ** 2 + (HX.y[i] - y) ** 2; if (dd < bd) { bd = dd; h = i; } } x = HX.x[h]; y = HX.y[h]; }
  state.sel = { x, y, hex: h }; map.setSelection(state.sel);
  if (zoom) map.flyTo(x, y, Math.max(map.scale(), { hex: 3.6, station: 2.3, deelnet: 1.5, region: 1 }[cur.d.gran]));
  refresh({ keepAsk: true });
  $('#panel').scrollTop = 0;
}

/* ---------- tooltip ---------- */
const tip = $('#tip');
function showTip(html, x, y) {
  tip.innerHTML = html; tip.hidden = false;
  const r = tip.getBoundingClientRect(), W = document.documentElement.clientWidth, H = window.innerHeight;
  tip.style.left = Math.max(6, Math.min(W - r.width - 6, x + 14)) + 'px';
  tip.style.top = (y + 18 + r.height > H ? y - r.height - 10 : y + 18) + 'px';
}
const hideTip = () => { tip.hidden = true; };
function onMapHover(p, x, y) {
  if (!p) return hideTip();
  const d = cur.d, u = model.unitOfHex[d.gran](p.hex), s = cur.units.status[u], labels = statusLabels(d);
  const [name, sub] = d.gran === 'hex' ? [cap1(model.hexName(p.hex)), 'Buurt · ' + model.provinces[HX.prov[p.hex]].name]
    : d.gran === 'station' ? [model.stations[u].name, 'Gebied van dit onderstation'] : d.gran === 'deelnet' ? [model.deelnets[u].name, `HS-deelnet · ${model.deelnets[u].kvH} kV`] : [model.regions[u].name, 'EHS-regio'];
  let h = `<b>${esc(name)}</b><small>${esc(sub)}</small>${stChip(s, labels[s])}`;
  if (d.els.length > 1 && s >= 2) h += `<small>Knelpunt: ${CHAIN[cur.units.bott[u]].long}</small>`;
  const v = cur.units.val[u];
  if (d.metric === 'belasting') h += `<small>Belasting ${pct(v)}</small>`;
  else if (d.metric === 'wachtrij') h += `<small>Wachtrij ${v > 0 ? fmtMW(v) : 'geen'}</small>`;
  else if (d.metric === 'jaar') h += `<small>Ruimte ${v < 0 ? 'na 2035' : v === 0 ? 'nu al' : 'vanaf ' + YEARS[v]}</small>`;
  showTip(h, x, y);
}
document.addEventListener('mouseover', e => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) { const [a, b] = t.dataset.tip.split('|'); const r = t.getBoundingClientRect(); showTip(`<b>${esc(a)}</b>${b ? `<small>${esc(b)}</small>` : ''}`, e.clientX || r.left, e.clientY || r.bottom); } });
document.addEventListener('mouseout', e => { if (e.target.closest && e.target.closest('[data-tip]')) hideTip(); });
function onMapClick(p) { if (p) select(p.x, p.y, false); }
function onZoom(K) {
  const el = $('#scale'); if (!el) return;
  const km = [1, 2, 5, 10, 20, 50, 100].find(k => k * K * NK.KM >= 46) || 100;
  el.firstElementChild.textContent = km + ' km'; el.lastElementChild.style.width = Math.round(km * K * NK.KM) + 'px';
}

/* ---------- bediening ---------- */
let playT = 0, hplayT = 0;
const setIcon = (btn, id) => { btn.innerHTML = icon(id, 'ic fill'); };
function stopPlay() { clearInterval(playT); playT = 0; setIcon($('#play'), 'play'); clearInterval(hplayT); hplayT = 0; setIcon($('#hplay'), 'play'); }
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act, v = t.dataset.v;
  if (a === 'view') setView(v);
  else if (a === 'level') { state.level = v; state.hide.clear(); refresh({ keepAsk: true }); }
  else if (a === 'home') { state.home = v; refresh(); }
  else if (a === 'tech') { state.tech = v; refresh(); }
  else if (a === 'aud') { state.aud = v; refresh(); }
  else if (a === 'dir') { state.dir = v; refresh(); }
  else if (a === 'metric') { state.metric = v; state.hide.clear(); if (v !== 'belasting') state.hour = -1; refresh(); }
  else if (a === 'preset') { state.power = +v; refresh(); }
  else if (a === 'hide') { const i = +v; if (state.hide.has(i)) state.hide.delete(i); else state.hide.add(i); refresh({ keepAsk: true }); }
  else if (a === 'unsel') { state.sel = null; map.setSelection(null); refresh({ keepAsk: true }); }
  else if (a === 'goto') select(+t.dataset.x, +t.dataset.y, true);
  else if (a === 'prov') { const p = model.provinces.find(q => q.name === v); if (p) map.fit(p); }
  else if (a === 'year') { state.year = +v; refresh({ keepAsk: true }); }
  else if (a === 'zoom') map.zoomBy(+v);
  else if (a === 'fit') map.reset();
  else if (a === 'sort') { state.sort = { k: v, d: state.sort.k === v ? -state.sort.d : (v === 'n' || v === 'py' ? 1 : -1) }; refresh({ keepAsk: true }); }
  else if (a === 'more') { state.listN += 20; refresh({ keepAsk: true }); }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches && e.target.matches('tr[data-act]')) e.target.click(); });
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'year') { state.year = +t.value; refresh({ keepAsk: true }); }
  else if (t.id === 'hour') { state.hour = +t.value; refresh({ keepAsk: true }); }
  else if (t.id === 'pw') { const p = PW[state.view]; state[p.key] = fromSlider(+t.value, p); refresh({ keepAsk: true }); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.layer) { state.layers[t.dataset.layer] = t.checked; refresh({ keepAsk: true }); }
  else if (t.id === 'pat') { state.patterns = t.checked; refresh({ keepAsk: true }); const n = $('#pat'); if (n) n.focus({ preventScroll: true }); }
  else if (t.id === 'cat') { state.cat = t.value; refresh({ keepAsk: true }); }
});
$('#play').addEventListener('click', () => {
  if (playT) return stopPlay();
  stopPlay(); if (state.year >= 2035) state.year = 2025;
  setIcon($('#play'), 'pause');
  const step = () => { state.year++; refresh({ keepAsk: true }); if (state.year >= 2035) stopPlay(); };
  step(); playT = setInterval(step, 950);
});
$('#hplay').addEventListener('click', () => {
  if (hplayT) return stopPlay();
  stopPlay(); setIcon($('#hplay'), 'pause');
  const step = () => { state.hour = (state.hour + 1) % 24; refresh({ keepAsk: true }); };
  step(); hplayT = setInterval(step, 550);
});

/* zoeken */
const fold = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^'s-/, 's-');
const INDEX = model.places.map(p => ({ n: p.name, f: fold(p.name), t: p.prov, x: p.x, y: p.y, w: p.pop }))
  .concat(model.stations.map(s => ({ n: 'Onderstation ' + s.name, f: fold('onderstation ' + s.name), t: 'station', x: s.x, y: s.y, w: 0 })))
  .concat(model.deelnets.map(k => ({ n: 'Koppelstation ' + k.name, f: fold('koppelstation ' + k.name), t: 'station', x: k.x, y: k.y, w: 0 })));
const q = $('#q'), qres = $('#qres'); let hits = [], curHit = 0;
function renderHits() {
  qres.hidden = !hits.length;
  qres.innerHTML = hits.map((h, i) => `<li><button type="button" class="${i === curHit ? 'cur' : ''}" data-hit="${i}">${esc(h.n)}<small>${esc(h.t)}</small></button></li>`).join('');
}
q.addEventListener('input', () => {
  const s = fold(q.value.trim()); curHit = 0;
  hits = s.length < 2 ? [] : INDEX.filter(o => o.f.includes(s)).sort((a, b) => (b.f.startsWith(s) - a.f.startsWith(s)) || (b.w - a.w)).slice(0, 8);
  renderHits();
});
function pickHit(i) { const h = hits[i]; if (!h) return; q.value = h.n; hits = []; renderHits(); select(h.x, h.y, true); }
q.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { curHit = Math.min(hits.length - 1, curHit + 1); renderHits(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { curHit = Math.max(0, curHit - 1); renderHits(); e.preventDefault(); }
  else if (e.key === 'Enter') pickHit(curHit);
  else if (e.key === 'Escape') { hits = []; renderHits(); }
});
qres.addEventListener('mousedown', e => { const b = e.target.closest('[data-hit]'); if (b) { e.preventDefault(); pickHit(+b.dataset.hit); } });
q.addEventListener('blur', () => setTimeout(() => { hits = []; renderHits(); }, 120));

/* ---------- start ---------- */
$('#views').innerHTML = Object.entries(VIEWS).map(([k, V]) => `<button type="button" class="view" data-act="view" data-v="${k}">${icon(k)}${V.label}</button>`).join('');
const stage = $('#stage');
new ResizeObserver(() => map.resize()).observe(stage);
const retheme = () => { map.setTheme(); if (cur.d) renderMapView(); };
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme);
new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (VIEWS[v] && v !== state.view) setView(v, true); });

map.setTheme(); map.resize();
const h0 = location.hash.slice(1);
state.view = VIEWS[h0] ? h0 : 'bedrijf';
state.level = VIEWS[state.view].level; state.metric = VIEWS[state.view].metric; state.layers = Object.assign({}, VIEWS[state.view].layers);
cur.d = derive();
const start = model.places.find(p => p.name === 'Amersfoort') || model.places[0];
state.sel = { x: start.x, y: start.y, hex: model.hexAt(start.x, start.y) };
if (state.sel.hex < 0) state.sel = null;
map.setSelection(state.sel);
refresh();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { map.setTheme(); renderMapView(); });
window.NK_APP = { state, model, map, refresh, setView, select };
})();
