// Voegt de bronbestanden samen tot één pagina.
//   index.html         zelfstandige pagina, opent in elke browser
//   dist/artifact.html dezelfde pagina zonder documentomhulsel, voor publicatie als artifact
import fs from 'node:fs';
const rd = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const js = [
  'window.NK_GEO = ' + rd('src/data/nl-geo.json').trim() + ';',
  rd('src/model.js'), rd('src/map.js'), rd('src/app.js'),
].join('\n');
const page = rd('src/page.html').replace('/*__CSS__*/', () => rd('src/style.css')).replace('/*__JS__*/', () => js);
const [head, body] = page.split('<!--body-->');
fs.mkdirSync(new URL('dist/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('dist/artifact.html', import.meta.url), head + body);
fs.writeFileSync(new URL('index.html', import.meta.url),
  `<!doctype html>\n<html lang="nl">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n` +
  `<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n${head}</head>\n<body>\n${body}</body>\n</html>\n`);
console.log(`gebouwd: index.html en dist/artifact.html (${Math.round((head.length + body.length) / 1024)} kB)`);
