// Neemt de promofilm op: laadt het prototype, legt de regielaag erover en schiet frame voor frame,
// met een stilgezette klok zodat elke beweging exact op de frame-tijd staat.
//   node promo/render.mjs --out promo/build/beeld.mp4            hele film
//   node promo/render.mjs --stills promo/build/stills --every 1   een still per seconde
//   opties: --fps 30 --from 0 --to 102 --events promo/build/events.json
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(new URL(import.meta.url).pathname), root = path.resolve(here, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const fps = +arg('fps', 30), from = +arg('from', 0), out = arg('out'), stills = arg('stills'), every = +arg('every', 1), evOut = arg('events');
const d3 = fs.readFileSync(path.join(root, 'node_modules/d3/dist/d3.min.js'), 'utf8');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2, colorScheme: 'light', reducedMotion: 'no-preference' });
await ctx.addInitScript(() => Object.defineProperty(window, 'devicePixelRatio', { get: () => 2, configurable: true }));
const page = await ctx.newPage();
page.on('pageerror', e => console.error('paginafout:', e.message));
await page.route('**/*', r => {
  const u = r.request().url();
  if (u.startsWith('file:') || u.startsWith('data:') || u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return r.continue();
  if (u.includes('d3.min.js')) return r.fulfill({ body: d3, contentType: 'text/javascript' });
  return r.abort();
});
await page.clock.install({ time: new Date('2026-11-17T09:00:00Z') });
await page.clock.pauseAt(new Date('2026-11-17T09:00:05Z'));
await page.goto('file://' + path.join(root, 'index.html') + '#bedrijf');
await page.evaluate(() => Promise.all([document.fonts.load('700 116px "Barlow Semi Condensed"'), document.fonts.load('600 16px "Barlow Semi Condensed"'), document.fonts.load('400 20px Inter'), document.fonts.load('500 16px Inter')]));
await page.addStyleTag({ path: path.join(here, 'film.css') });
await page.addScriptTag({ path: path.join(here, 'film.js') });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => FILM.init());
const dur = await page.evaluate(() => FILM.duration), to = +arg('to', dur);
if (evOut) { fs.mkdirSync(path.dirname(evOut), { recursive: true }); fs.writeFileSync(evOut, JSON.stringify(await page.evaluate(() => FILM.events()), null, 1)); }

let ff = null;
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
}
if (stills) fs.mkdirSync(stills, { recursive: true });
const N = Math.round(to * fps), t0 = Date.now();
let lastMs = 0;
for (let f = 0; f < N; f++) {
  const t = f / fps;
  await page.evaluate(t => FILM.frame(t), t);
  const ms = Math.round((f + 1) * 1000 / fps);
  await page.clock.runFor(ms - lastMs); lastMs = ms;
  if (t < from - 1e-9) continue;
  const wantStill = stills && Math.abs(t / every - Math.round(t / every)) < 0.5 / fps / every;
  if (!ff && !wantStill) continue;
  const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
  if (ff && !ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (wantStill) fs.writeFileSync(path.join(stills, `t${t.toFixed(1).padStart(5, '0')}.jpg`), buf);
  if (wantStill && arg('probe')) console.log(t.toFixed(2), await page.evaluate(arg('probe')));
  if (f % (fps * 5) === 0) process.stdout.write(`  ${t.toFixed(0)} s  (${((Date.now() - t0) / 1000).toFixed(0)} s verstreken)\n`);
}
if (ff) { ff.stdin.end(); await new Promise(r => ff.on('close', r)); }
await browser.close();
console.log(`klaar in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
