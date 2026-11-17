/* map.js — de kaart op canvas: vlakken per netvlak, lijnen, stations, lagen en selectie */
(function (root) {
'use strict';

function createMap(canvas, model, d3, hooks) {
  const NK = root.NK;
  const ctx = canvas.getContext('2d');
  const baseCv = document.createElement('canvas'), bctx = baseCv.getContext('2d');
  const HX = model.hex, HR = HX.R, ST = model.stations, DN = model.deelnets;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  /* ---- vaste paden in kaartcoördinaten ---- */
  const CX = [], CY = [];
  for (let a = 0; a < 6; a++) { const t = Math.PI / 6 + a * Math.PI / 3; CX.push(Math.cos(t) * HR); CY.push(Math.sin(t) * HR); }
  const addHex = (p, i) => {
    const x = HX.x[i], y = HX.y[i];
    p.moveTo(x + CX[0], y + CY[0]); for (let k = 1; k < 6; k++) p.lineTo(x + CX[k], y + CY[k]); p.closePath();
  };
  const addRing = (p, r) => { if (r.length < 6) return; p.moveTo(r[0], r[1]); for (let i = 2; i < r.length; i += 2) p.lineTo(r[i], r[i + 1]); p.closePath(); };
  const seg = (p, e) => { p.moveTo(e.x1, e.y1); p.lineTo(e.x2, e.y2); };
  const polyPath = polys => { const p = new Path2D(); for (const poly of polys) for (const r of poly) addRing(p, r); return p; };

  const landPath = polyPath(model.land), nbPath = polyPath(model.neighbours);
  const LB = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const poly of model.land) { const r = poly[0]; for (let i = 0; i < r.length; i += 2) { LB.x0 = Math.min(LB.x0, r[i]); LB.x1 = Math.max(LB.x1, r[i]); LB.y0 = Math.min(LB.y0, r[i + 1]); LB.y1 = Math.max(LB.y1, r[i + 1]); } }
  const borderPath = new Path2D();
  for (const l of model.borders) { borderPath.moveTo(l[0], l[1]); for (let i = 2; i < l.length; i += 2) borderPath.lineTo(l[i], l[i + 1]); }
  const hexOutline = new Path2D(); for (let i = 0; i < HX.n; i++) addHex(hexOutline, i);
  const edgePath = [null, new Path2D(), new Path2D(), new Path2D()], opPath = new Path2D();
  for (const e of model.edges) { for (let l = 1; l <= e.lvl; l++) seg(edgePath[l], e); if (e.op) seg(opPath, e); }
  const msPath = new Path2D();
  for (let i = 0; i < HX.n; i++) {
    const p = HX.parent[i], s = ST[HX.st[i]];
    msPath.moveTo(HX.x[i], HX.y[i]); msPath.lineTo(p >= 0 ? HX.x[p] : s.x, p >= 0 ? HX.y[p] : s.y);
  }
  const hsPath = { 150: new Path2D(), 110: new Path2D() }, ehsPath = { 380: new Path2D(), 220: new Path2D() }, icPath = new Path2D();
  for (const l of model.hsLines) seg(hsPath[l.kv], l);
  for (const l of model.ehsLines) { ehsPath[l.kv].moveTo(l.a.x, l.a.y); ehsPath[l.kv].lineTo(l.b.x, l.b.y); }
  for (const l of model.interconnect) { icPath.moveTo(l.a.x, l.a.y); icPath.lineTo(l.x, l.y); }

  /* ---- toestand ---- */
  let cw = 100, ch = 100, dpr = 1, base = { k: 1, x: 0, y: 0 }, T = d3.zoomIdentity, K = 1, OX = 0, OY = 0;
  let theme = null, view = null, binPaths = [], sel = null, hover = -1, hoverPath = null, selPath = null, baseDirty = true, raf = 0, pats = {};

  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function setTheme() {
    theme = {};
    for (const k of ['sea', 'land-out', 'land', 'coast', 'prov', 'cell', 'net', 'halo', 'accent', 'ink', 'ink2', 'panel'])
      theme[k.replace('-o', 'O')] = cssVar('--' + k);
    theme.font = cssVar('--f-disp') || 'sans-serif';
    pats = {};
    baseDirty = true; schedule();
  }
  function pattern(kind) {
    if (pats[kind]) return pats[kind];
    const n = Math.round(7 * dpr), t = document.createElement('canvas'); t.width = t.height = n;
    const c = t.getContext('2d'); c.strokeStyle = c.fillStyle = theme.ink; c.globalAlpha = 0.62; c.lineWidth = Math.max(1, dpr * 0.9);
    if (kind === 'hatch') { c.beginPath(); c.moveTo(-1, n + 1); c.lineTo(n + 1, -1); c.moveTo(-1, 1); c.lineTo(1, -1); c.moveTo(n - 1, n + 1); c.lineTo(n + 1, n - 1); c.stroke(); }
    else { c.beginPath(); c.arc(n / 2, n / 2, dpr * 0.95, 0, 6.3); c.fill(); }
    return (pats[kind] = ctx.createPattern(t, 'repeat'));
  }

  function setView(v) {
    view = v;
    binPaths = v.colors.map(() => new Path2D());
    if (v.gran === 'hex') { for (let i = 0; i < HX.n; i++) { const b = v.bin[i]; if (b !== 255) addHex(binPaths[b], i); } }
    else {
      const map = model.unitOfStation[v.gran];
      for (let i = 0; i < ST.length; i++) { const b = v.bin[map(i)]; if (b !== 255) addRing(binPaths[b], model.cells[i]); }
    }
    hoverPath = null; selPath = null;
    baseDirty = true; schedule();
  }
  function setSelection(s) { sel = s; selPath = null; schedule(); }

  function unitPath(gran, u) {
    const p = new Path2D();
    if (gran === 'hex') addHex(p, u);
    else if (gran === 'station') addRing(p, model.cells[u]);
    else {
      const key = gran === 'deelnet' ? 'dn' : 'region';
      for (const e of model.edges) if ((ST[e.a][key] === u) !== (ST[e.b][key] === u)) seg(p, e);
    }
    return p;
  }

  /* ---- tekenen ---- */
  const world = c => c.setTransform(dpr * K, 0, 0, dpr * K, dpr * OX, dpr * OY);
  const screen = c => c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sx = x => OX + K * x, sy = y => OY + K * y;
  const visible = (x, y, m) => { const a = sx(x), b = sy(y); return a > -m && a < cw + m && b > -m && b < ch + m; };

  function strokeNet(c, path, px, alpha, dash, halo) {
    c.lineJoin = 'round'; c.lineCap = 'butt';
    if (halo) { c.setLineDash([]); c.globalAlpha = alpha * 0.8; c.strokeStyle = theme.halo; c.lineWidth = (px + 2.2) / K; c.stroke(path); }
    c.globalAlpha = alpha; c.setLineDash(dash ? dash.map(v => v / K) : []); c.strokeStyle = theme.net; c.lineWidth = px / K; c.stroke(path);
    c.setLineDash([]); c.globalAlpha = 1;
  }

  function renderBase() {
    const c = bctx, v = view, L = v.layers;
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = theme.sea; c.fillRect(0, 0, baseCv.width, baseCv.height);
    world(c);
    c.fillStyle = theme.landOut; c.fill(nbPath, 'evenodd');
    c.fillStyle = theme.land; c.fill(landPath, 'evenodd');

    c.save(); c.clip(landPath, 'evenodd');
    for (let b = 0; b < binPaths.length; b++) {
      c.fillStyle = c.strokeStyle = v.colors[b]; c.lineWidth = 0.8 / K;
      c.fill(binPaths[b]); c.stroke(binPaths[b]);
    }
    if (v.patterns) for (let b = 0; b < binPaths.length; b++) {
      if (!v.patterns[b]) continue;
      const p = pattern(v.patterns[b]); p.setTransform(new DOMMatrix([1 / (dpr * K), 0, 0, 1 / (dpr * K), 0, 0]));
      c.fillStyle = p; c.fill(binPaths[b]);
    }
    c.strokeStyle = theme.cell;
    if (v.gran === 'hex') {
      if (K * HR > 6.5) { c.globalAlpha = 0.5; c.lineWidth = 0.7 / K; c.stroke(hexOutline); }
      c.globalAlpha = 0.4; c.lineWidth = 1 / K; c.stroke(edgePath[1]);
    } else {
      c.globalAlpha = 0.9; c.lineWidth = (v.gran === 'station' ? 1 : 1.6) / K;
      c.stroke(edgePath[v.gran === 'station' ? 1 : v.gran === 'deelnet' ? 2 : 3]);
    }
    c.globalAlpha = 1;
    c.strokeStyle = theme.prov; c.lineWidth = (v.provEmph ? 1.5 : 0.8) / K; c.setLineDash(v.provEmph ? [] : [3 / K, 3 / K]);
    c.globalAlpha = v.provEmph ? 0.9 : 0.6; c.stroke(borderPath); c.setLineDash([]); c.globalAlpha = 1;
    if (L.operators) { c.strokeStyle = theme.halo; c.lineWidth = 4.4 / K; c.globalAlpha = 0.85; c.stroke(opPath); c.globalAlpha = 1; c.strokeStyle = theme.accent; c.lineWidth = 2 / K; c.setLineDash([7 / K, 4 / K]); c.stroke(opPath); c.setLineDash([]); }
    c.restore();
    c.strokeStyle = theme.coast; c.lineWidth = 0.9 / K; c.stroke(landPath);

    /* netten */
    const N = v.net, zf = clamp(0.85 + 0.22 * Math.log2(K / 0.6), 0.85, 1.9), fade = n => n === 2 ? 1 : 0.38;
    if (N.ms && K >= 2) { c.save(); c.clip(landPath, 'evenodd'); strokeNet(c, msPath, 0.75 * zf, 0.4 * fade(N.ms), null, false); c.restore(); }
    if (N.hs && (K >= 0.85 || N.hs === 2)) {
      strokeNet(c, hsPath[150], 1.45 * zf, fade(N.hs), null, N.hs === 2);
      strokeNet(c, hsPath[110], 1.45 * zf, fade(N.hs), [7, 3.5], N.hs === 2);
    }
    if (N.ehs) {
      strokeNet(c, icPath, 1.5 * zf, 0.55 * fade(N.ehs), [2.5, 3.5], false);
      strokeNet(c, ehsPath[220], 2.5 * zf, fade(N.ehs), [11, 4], true);
      strokeNet(c, ehsPath[380], 2.9 * zf, fade(N.ehs), null, true);
    }

    /* alles hierna op schermmaat */
    screen(c);
    const boxes = [];
    const fits = (x0, y0, x1, y1) => { for (const b of boxes) if (x0 < b[2] && x1 > b[0] && y0 < b[3] && y1 > b[1]) return false; return true; };
    const label = (txt, x, y, size, weight, align, color, force) => {
      c.font = `${weight} ${size}px ${theme.font}`;
      const w = c.measureText(txt).width, x0 = align === 'center' ? x - w / 2 : x, bx = [x0 - 3, y - size * 0.62 - 2, x0 + w + 3, y + size * 0.42 + 2];
      if (!force && !fits(...bx)) return false;
      boxes.push(bx); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.lineJoin = 'round'; c.strokeStyle = theme.halo; c.lineWidth = 3.2; c.globalAlpha = 0.9; c.strokeText(txt, x0, y);
      c.globalAlpha = 1; c.fillStyle = color; c.fillText(txt, x0, y); return true;
    };

    if (v.queue) for (const q of v.queue) {
      if (!visible(q.x, q.y, 40)) continue;
      c.beginPath(); c.arc(sx(q.x), sy(q.y), q.r, 0, 6.2832);
      c.globalAlpha = 0.16; c.fillStyle = theme.net; c.fill(); c.globalAlpha = 0.85; c.strokeStyle = theme.net; c.lineWidth = 1.1; c.stroke(); c.globalAlpha = 1;
    }

    const S = v.st;
    if (S.ws && K >= 3.4) {
      for (let i = 0; i < HX.n; i++) {
        if (!visible(HX.x[i], HX.y[i], 6)) continue;
        const x = sx(HX.x[i]), y = sy(HX.y[i]), r = K >= 6 ? 2.6 : 1.9;
        c.fillStyle = v.wsFill ? v.wsFill(i) : theme.panel; c.strokeStyle = theme.net; c.lineWidth = 0.9;
        c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill(); c.stroke();
      }
    }
    if (S.os && (K >= 0.95 || S.os === 2)) {
      const r = K >= 2.4 ? 4.6 : K >= 1.2 ? 3.6 : 2.7;
      for (let i = 0; i < ST.length; i++) {
        const s = ST[i]; if (!visible(s.x, s.y, 8)) continue;
        c.beginPath(); c.arc(sx(s.x), sy(s.y), r, 0, 6.2832);
        c.fillStyle = v.osFill ? v.osFill(i) : theme.panel; c.fill(); c.strokeStyle = theme.net; c.lineWidth = 1.3; c.stroke();
      }
    }
    if (S.ks) {
      const r = clamp(3.6 + K, 4.2, 7);
      for (let i = 0; i < DN.length; i++) {
        const d = DN[i]; if (!visible(d.x, d.y, 10)) continue;
        const x = sx(d.x), y = sy(d.y);
        c.fillStyle = theme.halo; c.fillRect(x - r - 1.5, y - r - 1.5, 2 * r + 3, 2 * r + 3);
        c.fillStyle = v.ksFill ? v.ksFill(i) : theme.panel; c.fillRect(x - r, y - r, 2 * r, 2 * r);
        c.strokeStyle = theme.net; c.lineWidth = 1.7; c.strokeRect(x - r, y - r, 2 * r, 2 * r);
      }
    }

    if (L.projects && v.projects) for (const p of v.projects) {
      if ((p.big === 0 && K < 3.4) || (p.big === 1 && K < 0.9) || !visible(p.x, p.y, 12)) continue;
      const x = sx(p.x), y = sy(p.y) - (p.big >= 1 ? 9 : 0), r = [3.4, 4.6, 5.6, 6.6][p.big], done = p.el.proj.year <= v.year;
      c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath();
      c.strokeStyle = theme.halo; c.lineWidth = 3; c.stroke();
      c.fillStyle = done ? theme.panel : theme.accent; c.fill(); c.strokeStyle = theme.accent; c.lineWidth = 1.5; c.stroke();
      if (!done && (p.big >= 2 || K >= 2)) label('’' + String(p.el.proj.year).slice(2), x + r + 3, y + 4, 11, 600, 'left', theme.accent, false);
    }

    if (N.ehs) for (const l of model.interconnect) if (visible(l.x, l.y, 20)) label(l.land, sx(l.x), sy(l.y) + 4, 10.5, 600, 'center', theme.ink2, false);
    if (S.ks && (K >= 1.1 || N.ehs === 2)) for (const d of DN) if (visible(d.x, d.y, 30)) label(d.name, sx(d.x) + 10, sy(d.y) - 7, 11.5, 600, 'left', theme.ink, false);
    if (L.labels) {
      const minPop = K >= 6 ? 0 : K >= 3.6 ? 4000 : K >= 2 ? 12000 : K >= 1.1 ? 35000 : K >= 0.5 ? 90000 : 150000;
      for (const p of model.places) {
        if (p.pop < minPop) break;
        if (!visible(p.x, p.y, 40)) continue;
        label(p.name, sx(p.x), sy(p.y) + 4, p.pop > 150000 ? 13.5 : 12, p.pop > 150000 ? 700 : 600, 'center', theme.ink, false);
      }
    }
    if (S.os && K >= 3) for (const s of ST) if (visible(s.x, s.y, 30)) label('OS ' + s.name, sx(s.x) + 8, sy(s.y) + 15, 10.5, 500, 'left', theme.ink2, false);
  }

  function frame() {
    raf = 0; if (!view || !theme) return;
    if (baseDirty) { renderBase(); baseDirty = false; }
    const c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(baseCv, 0, 0);
    const outline = (p, w, col) => {
      world(c); c.save(); if (view.gran !== 'hex') c.clip(landPath, 'evenodd');
      c.lineJoin = 'round'; c.strokeStyle = theme.halo; c.lineWidth = (w + 2.4) / K; c.stroke(p);
      c.strokeStyle = col; c.lineWidth = w / K; c.stroke(p); c.restore();
    };
    if (hover >= 0) {
      if (!hoverPath) hoverPath = unitPath(view.gran, model.unitOfHex[view.gran](hover));
      outline(hoverPath, 1.5, theme.ink);
    }
    if (sel) {
      if (!selPath) selPath = unitPath(view.gran, model.unitOfHex[view.gran](sel.hex));
      outline(selPath, 2.4, theme.ink);
      // de route van de stroom: buurtcel → onderstation → koppelstation
      const pts = [[sel.x, sel.y]]; let h = sel.hex, guard = 0;
      while (h >= 0 && guard++ < 400) { pts.push([HX.x[h], HX.y[h]]); h = HX.parent[h]; }
      let s = HX.st[sel.hex]; const d = DN[ST[s].dn]; guard = 0;
      while (s >= 0 && guard++ < 80) { pts.push([ST[s].x, ST[s].y]); s = ST[s].up; }
      pts.push([d.x, d.y]);
      world(c); c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
      c.lineJoin = c.lineCap = 'round'; c.strokeStyle = theme.halo; c.lineWidth = 6 / K; c.stroke();
      c.strokeStyle = theme.accent; c.lineWidth = 3 / K; c.stroke();
      screen(c);
      const x = sx(sel.x), y = sy(sel.y);
      c.beginPath(); c.arc(x, y, 7.5, 0, 6.2832); c.fillStyle = theme.halo; c.fill();
      c.beginPath(); c.arc(x, y, 5.5, 0, 6.2832); c.fillStyle = theme.accent; c.fill();
      c.beginPath(); c.arc(x, y, 2, 0, 6.2832); c.fillStyle = theme.halo; c.fill();
    }
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(frame); }
  function update() { K = T.k * base.k; OX = T.x + T.k * base.x; OY = T.y + T.k * base.y; baseDirty = true; schedule(); if (hooks.onZoom) hooks.onZoom(K); }

  /* ---- zoomen, slepen, aanwijzen ---- */
  const zoom = d3.zoom().scaleExtent([0.85, 70]).on('zoom', e => { T = e.transform; update(); });
  const node = d3.select(canvas).call(zoom);
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const go = (t, ms) => (reduce() || !ms ? node : node.transition().duration(ms)).call(zoom.transform, t);

  function resize() {
    cw = Math.max(60, canvas.clientWidth); ch = Math.max(60, canvas.clientHeight);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [canvas, baseCv]) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
    const pad = cw < 560 ? 8 : 22, padL = cw >= 780 ? 236 : pad;
    base.k = Math.min((cw - pad - padL) / (LB.x1 - LB.x0), (ch - 2 * pad) / (LB.y1 - LB.y0));
    base.y = (ch - base.k * (LB.y0 + LB.y1)) / 2;
    base.x = padL + ((cw - pad - padL) - base.k * (LB.x1 - LB.x0)) / 2 - base.k * LB.x0;
    zoom.extent([[0, 0], [cw, ch]]).translateExtent([[-cw * 0.7, -ch * 0.7], [cw * 1.7, ch * 1.7]]);
    pats = {};
    update();
  }
  function flyTo(x, y, k, ms) {
    const tk = clamp(k / base.k, 0.85, 70);
    go(d3.zoomIdentity.translate(cw / 2 - tk * (base.x + base.k * x), ch / 2 - tk * (base.y + base.k * y)).scale(tk), ms == null ? 650 : ms);
  }
  function fit(b, ms) {
    const k = Math.min((cw - 80) / (b.x1 - b.x0), (ch - 80) / (b.y1 - b.y0));
    flyTo((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, Math.min(k, 6), ms);
  }
  const toWorld = (px, py) => [(px - OX) / K, (py - OY) / K];
  const pick = ev => {
    const r = canvas.getBoundingClientRect(), [x, y] = toWorld(ev.clientX - r.left, ev.clientY - r.top);
    if (!model.inLand(x, y)) return null;
    const h = model.hexAt(x, y); return h < 0 ? null : { x, y, hex: h };
  };
  canvas.addEventListener('click', ev => { const p = pick(ev); if (hooks.onClick) hooks.onClick(p); });
  canvas.addEventListener('mousemove', ev => {
    const p = pick(ev), h = p ? p.hex : -1;
    const changed = !view || (h < 0 ? hover >= 0 : hover < 0 || model.unitOfHex[view.gran](h) !== model.unitOfHex[view.gran](hover));
    hover = h; canvas.style.cursor = p ? 'pointer' : 'grab';
    if (changed) { hoverPath = null; schedule(); }
    if (hooks.onHover) hooks.onHover(p, ev.clientX, ev.clientY);
  });
  canvas.addEventListener('mouseleave', () => { if (hover >= 0) { hover = -1; hoverPath = null; schedule(); } if (hooks.onHover) hooks.onHover(null); });

  return {
    setTheme, setView, setSelection, resize, flyTo, fit,
    zoomBy: f => (reduce() ? node : node.transition().duration(220)).call(zoom.scaleBy, f),
    reset: () => go(d3.zoomIdentity, 500),
    scale: () => K,
    toScreen: (x, y) => [OX + K * x, OY + K * y],
  };
}

root.NK = Object.assign(root.NK || {}, { createMap });
})(window);
