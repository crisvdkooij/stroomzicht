import json, sys
from shapely.geometry import shape, box, mapping, MultiPolygon, Polygon
from shapely.ops import unary_union
from shapely import make_valid
L = make_valid(shape(json.load(open('gshhg_f.json'))['land']))
ne = json.load(open('ne_countries.json'))
NL = make_valid(shape(ne['Netherlands'])); DE = make_valid(shape(ne['Germany'])); BE = make_valid(shape(ne['Belgium']))
boxes = unary_union([box(2.0, 50.0, 3.358, 51.6), box(7.232, 50.0, 9.0, 55.0), box(6.98, 53.345, 9.0, 55.0), box(2.0, 50.0, 9.0, 50.74)])
foreign = unary_union([DE, BE, boxes])
raw = L.difference(foreign)
parts = list(raw.geoms) if raw.geom_type == 'MultiPolygon' else [raw]
nlb = NL.buffer(0.04)
keep = []
for p in parts:
    if p.area < 2e-6: continue
    c = p.centroid
    if c.y > 53.45 and c.x > 6.62: continue          # Duitse Waddeneilanden
    frac = p.intersection(nlb).area / p.area
    if frac < 0.5: continue
    keep.append(p)
nl = unary_union(keep)
# kleine binnenwateren (gaten) weglaten, grote houden
def clean(poly, min_hole=4e-5):
    return Polygon(poly.exterior, [i for i in poly.interiors if Polygon(i).area >= min_hole])
nl = MultiPolygon([clean(p) for p in (nl.geoms if nl.geom_type=='MultiPolygon' else [nl])])
nl_s = nl.simplify(0.0009, preserve_topology=True)
nb = L.intersection(unary_union([DE, BE, boxes]).buffer(0.012)).difference(box(2.0,50.0,9.0,50.3))
nb = nb.simplify(0.003, preserve_topology=True)
def npts(g):
    gs = g.geoms if g.geom_type=='MultiPolygon' else [g]
    return sum(len(p.exterior.coords)+sum(len(i.coords) for i in p.interiors) for p in gs), len(list(gs))
print('NL pts/polys', npts(nl_s), 'area', round(nl_s.area,4), 'NB', npts(nb), file=sys.stderr)
json.dump({'nl': mapping(nl_s), 'nb': mapping(nb)}, open('geo_raw.json','w'))
