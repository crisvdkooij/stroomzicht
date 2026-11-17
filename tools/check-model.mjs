// Draait het datamodel in Node en print kengetallen, om de fictieve data te ijken.
import fs from 'node:fs';
import * as d3 from 'd3';
const src = fs.readFileSync(new URL('../src/model.js', import.meta.url), 'utf8');
new Function(src).call(globalThis);
const NK = globalThis.NK;
const GEO = JSON.parse(fs.readFileSync(new URL('../src/data/nl-geo.json', import.meta.url), 'utf8'));
const t0 = performance.now();
const m = NK.buildModel(GEO, d3);
console.log(`model in ${(performance.now() - t0).toFixed(0)} ms — cellen ${m.hex.n}, onderstations ${m.stations.length}, deelnetten ${m.deelnets.length}, projecten ${m.projects.length}`);
console.log('huishoudens totaal', Math.round(m.hex.hh.reduce((a, b) => a + b, 0) / 1000) + 'k', 'lege deelnetten:', m.deelnets.filter(d => !d.stations.length).map(d => d.name).join(',') || '-');
const pct = a => a.map(v => String(Math.round(v * 100)).padStart(3) + '%').join(' ');
const show = (label, o, w) => console.log(label.padEnd(34), pct(m.distribution(m.computeUnits(o), w)));
console.log('\n' + 'verdeling [ruimte beperkt flex geen]'.padEnd(34), '2026');
for (const dir of ['A', 'I']) {
  for (const [k, lv] of Object.entries(NK.LEVELS)) show(`netvlak ${k} ${dir}`, { gran: lv.gran, els: lv.els, dir, yi: 0, metric: 'status' }, 'area');
  for (const c of NK.CATS) show(`keten ${c.key} ${dir}`, { gran: c.gran, els: c.els, dir, yi: 0, metric: 'status' }, c.key === 'ls' ? 'hh' : 'area');
}
console.log('\nketen ms A per jaar');
for (let yi = 0; yi < NK.NY; yi += 3) show('  ' + NK.YEARS[yi], { gran: 'station', els: NK.CATS[2].els, dir: 'A', yi, metric: 'status' }, 'area');
console.log('keten ls A per jaar (huishoudens)');
for (let yi = 0; yi < NK.NY; yi += 3) show('  ' + NK.YEARS[yi], { gran: 'hex', els: NK.CATS[0].els, dir: 'A', yi, metric: 'status' }, 'hh');
console.log('\nEHS-regio status 2026 A/I:', m.regions.map(r => `${r.name.slice(0, 10)} ${r.ehs.A.s[0]}/${r.ehs.I.s[0]}`).join(' | '));
