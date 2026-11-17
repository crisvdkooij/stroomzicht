# Herkomst van de geodata

Deze scripts zijn het logboek van hoe `src/data/nl-geo.json` is gemaakt. Ze draaien niet vanuit deze map: ze verwachten een werkmap met
`npm i datamaps all-the-cities world-atlas topojson-client d3` en een Python-omgeving met `basemap`, `basemap-data-hires` en `shapely`.

1. `1-kustlijn.py f` haalt de kustlijn op volle resolutie uit GSHHG.
2. `2-grenzen.mjs` haalt landsgrenzen en provinciegrenzen uit Natural Earth.
3. `3-nederland.py` knipt Nederland uit de kustlijn en vereenvoudigt het resultaat.
4. `4-samenvoegen.mjs` voegt land, buurlanden, provinciegrenzen en plaatsnamen samen tot één compact bestand.
