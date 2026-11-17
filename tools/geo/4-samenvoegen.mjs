import fs from 'fs';
import cities from 'all-the-cities';
const raw = JSON.parse(fs.readFileSync('geo_raw.json','utf8'));
const pv = JSON.parse(fs.readFileSync('ne_prov.json','utf8'));
const Q = 10000;
const enc = ring => { const o=[]; let px=0,py=0; for (const [x,y] of ring){ const qx=Math.round(x*Q), qy=Math.round(y*Q); if (o.length && qx===px && qy===py) continue; o.push(qx-px, qy-py); px=qx; py=qy; } return o; };
const polys = g => (g.type==='MultiPolygon'?g.coordinates:[g.coordinates]).map(p=>p.map(enc));
const PROV = {'01':'Drenthe','02':'Friesland','03':'Gelderland','04':'Groningen','05':'Limburg','06':'Noord-Brabant','07':'Noord-Holland','09':'Utrecht','10':'Zeeland','11':'Zuid-Holland','15':'Overijssel','16':'Flevoland'};
const provNames = Object.values(PROV);
const rename = {'The Hague':'Den Haag','Almere Stad':'Almere'};
const drop = new Set(['Amsterdam-Zuidoost','Tuindorp Oostzaan','Oostelijk Havengebied','Binnenstad','Velsen-Zuid']);
const places = cities.filter(c=>c.country==='NL' && PROV[c.adminCode] && !drop.has(c.name))
  .sort((a,b)=>b.population-a.population)
  .map(c=>[rename[c.name]||c.name, Math.round(c.loc.coordinates[0]*1000), Math.round(c.loc.coordinates[1]*1000), Math.round(c.population/100), provNames.indexOf(PROV[c.adminCode])]);
const out = { q: Q, land: polys(raw.nl), nb: polys(raw.nb), borders: pv.mesh.coordinates.map(enc), provs: provNames, places };
const s = JSON.stringify(out);
fs.writeFileSync('nl-geo.json', s);
console.log('bytes', s.length, 'places', places.length, 'land polys', out.land.length, 'first places', places.slice(0,6).map(p=>p[0]).join(', '));
console.log('others in adminCodes:', [...new Set(cities.filter(c=>c.country==='NL').map(c=>c.adminCode))].join(','));
