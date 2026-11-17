// Klikt door alle weergaven en bedieningen heen en meldt scriptfouten.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const d3 = fs.readFileSync(path.join(root, 'node_modules/d3/dist/d3.min.js'), 'utf8');
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file:')) return r.continue(); if (u.includes('d3.min.js')) return r.fulfill({ body: d3, contentType: 'text/javascript' }); return r.abort(); });
await page.goto('file://' + path.join(root, 'index.html'));
await page.waitForFunction(() => window.NK_APP);
const click = async sel => { await page.click(sel); await page.waitForTimeout(40); };
const log = [];
for (const v of ['thuis', 'bedrijf', 'opwek', 'regio', 'expert']) {
  await click(`[data-act="view"][data-v="${v}"]`);
  for (const sel of await page.$$eval('#ask [data-act]', els => els.map(e => `#ask [data-act="${e.dataset.act}"][data-v="${e.dataset.v}"]`))) {
    await click(sel);
    log.push(v + ' ' + sel.slice(5) + ' → ' + await page.$eval('#maptitle b', e => e.textContent) + ' | ' + await page.$eval('#legend .lbl', e => e.textContent));
  }
  if (await page.$('#pw')) for (const val of ['0', '300', '620', '900', '1000']) { await page.fill('#pw', val).catch(async () => { await page.$eval('#pw', (e, x) => { e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); }, val); }); log.push(v + ' pw ' + val + ' → ' + await page.$eval('#conn', e => e.textContent)); }
  for (const lv of ['ehs', 'hs', 'ms', 'ls', 'keten']) await click(`[data-act="level"][data-v="${lv}"]`);
  for (const y of ['2029', '2033', '2026']) await page.$eval('#year', (e, x) => { e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); }, y);
  for (const id of ['l-lines', 'l-stations', 'l-projects', 'l-queue', 'l-operators', 'l-labels']) await click('#' + id);
  await click('#legend [data-act="hide"][data-v="0"]'); await click('#legend [data-act="hide"][data-v="0"]');
  if (await page.$('#pat')) { await click('#pat'); await click('#pat'); }
  await page.mouse.move(720, 500); await page.mouse.click(720, 500); await page.waitForTimeout(60);
  log.push(v + ' klik → ' + await page.$eval('#panel h2', e => e.textContent) + ' | ' + (await page.$eval('#panel .verdict h3', e => e.textContent).catch(() => 'geen oordeel')));
  for (const sel of ['#panel [data-act="year"][data-v="2031"]', '#panel [data-act="goto"]', '#panel [data-act="unsel"]', '#panel tr[data-act]', '#panel [data-act="sort"][data-v="q"]', '#panel [data-act="more"]']) if (await page.$(sel)) await click(sel);
}
await click('[data-act="view"][data-v="expert"]'); await click('#ask [data-act="metric"][data-v="belasting"]');
for (const h of ['3', '13', '19']) { await page.$eval('#hour', (e, x) => { e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); }, h); log.push('uur ' + h + ' → ' + await page.$eval('#legend', e => e.textContent.replace(/\s+/g, ' ').slice(0, 90))); }
await page.selectOption('#cat', 'hs');
await page.fill('#q', 'zwol'); await page.waitForTimeout(60); await page.keyboard.press('Enter'); await page.waitForTimeout(900);
log.push('zoek → ' + await page.$eval('#panel h2', e => e.textContent));
await click('#play'); await page.waitForTimeout(2200); await click('#play');
await click('[data-act="zoom"][data-v="1.6"]'); await click('[data-act="fit"]');
console.log(log.join('\n'));
console.log(errs.length ? 'FOUTEN:\n' + errs.join('\n') : '\ngeen scriptfouten');
await b.close();
