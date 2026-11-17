// Voegt de bronbestanden samen.
//   index.html         het prototype als zelfstandige pagina, opent in elke browser
//   film.html          de kijkpagina van de promofilm, voor dezelfde website als index.html
//   dist/artifact.html het prototype zonder documentomhulsel, voor publicatie als artifact
import fs from 'node:fs';
const rd = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const wr = (f, s) => fs.writeFileSync(new URL(f, import.meta.url), s);
const doc = (head, body) =>
  `<!doctype html>\n<html lang="nl">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n` +
  `<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n${head}</head>\n<body>\n${body}</body>\n</html>\n`;

const js = [
  'window.NK_GEO = ' + rd('src/data/nl-geo.json').trim() + ';',
  rd('src/model.js'), rd('src/map.js'), rd('src/app.js'),
].join('\n');
const page = rd('src/page.html').replace('/*__CSS__*/', () => rd('src/style.css')).replace('/*__JS__*/', () => js);
const [head, body] = page.split('<!--body-->');
fs.mkdirSync(new URL('dist/', import.meta.url), { recursive: true });
wr('dist/artifact.html', head + body);
wr('index.html', doc(head, body));

// filmpagina: dezelfde bron als het artifact, met paden voor de website
const film = rd('promo/pagina.html')
  .replace('src="capaciteitskaart-promo.mp4"', 'src="promo/capaciteitskaart-promo.mp4"')
  .replace('poster="poster.jpg"', 'poster="promo/poster.jpg"')
  .replace(/href="https:\/\/claude\.ai\/artifact\/[^"]+"/, 'href="./"');
const cut = film.indexOf('</style>') + '</style>'.length;
wr('film.html', doc(film.slice(0, cut) + '\n', film.slice(cut)));

console.log(`gebouwd: index.html, film.html en dist/artifact.html (prototype ${Math.round((head.length + body.length) / 1024)} kB)`);
