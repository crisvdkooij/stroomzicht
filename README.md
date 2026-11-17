# Capaciteitskaart — prototype

Een prototype van een betere capaciteitskaart van het Nederlandse stroomnet. **Alle netdata is verzonnen**; het gaat om de vorm, niet om de cijfers.

Open `index.html` in een browser. Er is geen server nodig, wel internet voor d3 en de lettertypen.

## Wat het laat zien

- **Netvlakken als keten.** Van het landelijke net tot de straat: EHS-net → koppelstation → HS-net → onderstation → MS-net → wijkstation → LS-net. Netten zijn lijnen, stations zijn transformatoren. Elke schakel heeft een eigen status, wachtrij en uitbreiding.
- **De zwakste schakel.** Uw vermogen bepaalt op welk netvlak u aansluit en dus welke schakels meetellen. De kaart kleurt op de zwakste daarvan en zegt welke dat is.
- **Vier statussen in plaats van rood of niet-rood.** Ruimte, beperkte ruimte, alleen buiten de piek, geen ruimte. De derde is nieuw: vol op piekuren, maar met een tijdgebonden contract wel aan te sluiten.
- **Tijd.** Een peiljaar van 2026 tot 2035 waarin geplande uitbreidingen meetellen, en per plek een dagprofiel dat laat zien op welke uren er lucht is.

## Vijf weergaven

| Weergave | Vraag | Kaart |
|---|---|---|
| Thuis | Kan mijn warmtepomp, laadpaal of zonnedak erbij? | Per buurt, alleen laagspanning en wijkstation |
| Bedrijf | Is er ruimte voor mijn aansluiting van X MW? | Zwakste schakel voor dat vermogen, met lijnen en stations |
| Opwek & opslag | Waar kan ik invoeden of een batterij plaatsen? | Invoeding; voor batterijen beide richtingen |
| Regio & beleid | Waar knelt het, en tot wanneer? | Uitbreidingen, wachtrijen, grenzen netbeheerders, tabel per provincie |
| Netexpert | Hoe staat elk netvlak ervoor? | Elk netvlak apart, vijf kleuringen, belasting per uur, sorteerbare lijst |

Elke weergave is een voorinstelling. Netvlak, peiljaar en kaartlagen blijven in elke weergave vrij te kiezen.

## Opbouw

```
src/model.js      fictieve netdata en de statuslogica (vaste seed, dus elke keer hetzelfde)
src/map.js        de kaart op canvas
src/app.js        toestand, de vijf weergaven, panelen
src/style.css     opmaak, licht en donker
src/page.html     de pagina
src/data/         kustlijn, provinciegrenzen en plaatsnamen
build.mjs         voegt alles samen tot index.html
tools/            ijken van de data, schermafbeeldingen, kliktest, herkomst geodata
```

```
npm install
npm run build          # schrijft index.html en dist/artifact.html
npm run check          # print de verdeling van statussen per netvlak
node tools/smoke.mjs   # klikt door alle bedieningen en meldt scriptfouten
```

## Wat echt is en wat niet

Echt: de kustlijn (GSHHG, LGPL), de provinciegrenzen (Natural Earth, publiek domein) en de plaatsnamen (GeoNames, CC BY 4.0). De namen van netbeheerders staan er per provincie bij als grove benadering van hun werkgebied.

Verzonnen: alle stations, lijnen, capaciteiten, belastingen, wachtrijen en uitbreidingen. De koppelstations liggen ongeveer waar het landelijke net knooppunten heeft, maar de lijnen ertussen en alles daaronder zijn gegenereerd. Gebruik niets hiervan als netinformatie.
