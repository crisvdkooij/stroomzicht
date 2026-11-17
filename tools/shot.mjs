// Maakt schermafbeeldingen van index.html. d3 komt lokaal uit node_modules, zodat het zonder internet werkt.
//   node tools/shot.mjs <uitvoermap> [scenario ...]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.resolve(process.argv[2] || 'dist/shots'); fs.mkdirSync(out, { recursive: true });
const want = process.argv.slice(3);
const d3 = fs.readFileSync(path.join(root, 'node_modules/d3/dist/d3.min.js'), 'utf8');
const SCEN = {
  bedrijf:   { w: 1440, h: 900, hash: 'bedrijf' },
  thuis:     { w: 1440, h: 900, hash: 'thuis' },
  opwek:     { w: 1440, h: 900, hash: 'opwek', run: () => { document.querySelector('[data-act="tech"][data-v="batterij"]').click(); } },
  regio:     { w: 1440, h: 900, hash: 'regio', run: () => { NK_APP.state.sel = null; NK_APP.map.setSelection(null); NK_APP.refresh(); } },
  expert:    { w: 1440, h: 900, hash: 'expert', run: () => { NK_APP.state.sel = null; NK_APP.map.setSelection(null); NK_APP.refresh(); } },
  dark:      { w: 1440, h: 900, hash: 'bedrijf', scheme: 'dark' },
  zoom:      { w: 1440, h: 900, hash: 'bedrijf', run: () => { const s = NK_APP.state.sel; NK_APP.map.flyTo(s.x, s.y, 5, 0); } },
  phone:     { w: 400, h: 860, hash: 'thuis', full: true },
  phonedark: { w: 400, h: 860, hash: 'bedrijf', full: true, scheme: 'dark' },
};
const b = await chromium.launch();
for (const [name, s] of Object.entries(SCEN)) {
  if (want.length && !want.includes(name)) continue;
  const ctx = await b.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1, colorScheme: s.scheme || 'light' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file:')) return r.continue(); if (u.includes('d3.min.js')) return r.fulfill({ body: d3, contentType: 'text/javascript' }); return r.abort(); });
  await page.goto('file://' + path.join(root, 'index.html') + '#' + s.hash);
  await page.waitForFunction(() => window.NK_APP, null, { timeout: 15000 }).catch(() => {});
  if (s.run) await page.evaluate(s.run);
  await page.waitForTimeout(500);
  const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  await page.screenshot({ path: path.join(out, name + '.png'), fullPage: !!s.full });
  console.log(name, ov.sw > ov.cw ? `HORIZONTALE SCROLL ${ov.sw}>${ov.cw}` : 'ok', errs.filter(e => !/ERR_FAILED|net::/.test(e)).join(' | ') || '');
  await ctx.close();
}
await b.close();
