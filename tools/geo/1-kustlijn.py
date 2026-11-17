import json, sys
from mpl_toolkits.basemap import Basemap
from shapely.geometry import Polygon, MultiPolygon, shape, box, mapping
from shapely.ops import unary_union
from shapely import make_valid
res = sys.argv[1] if len(sys.argv) > 1 else 'h'
W,S,E,N = 2.6, 50.3, 7.9, 54.0
m = Basemap(projection='cyl', llcrnrlon=W, llcrnrlat=S, urcrnrlon=E, urcrnrlat=N, resolution=res, area_thresh=0.05)
land, lakes = [], []
for (xs, ys), t in zip(m.coastpolygons, m.coastpolygontypes):
    if len(xs) < 4: continue
    p = make_valid(Polygon(list(zip(xs, ys))))
    (land if t in (1,3) else lakes).append(p)
print('land polys', len(land), 'lake polys', len(lakes), file=sys.stderr)
L = unary_union(land).difference(unary_union(lakes)) if lakes else unary_union(land)
for lk in sorted(lakes, key=lambda p:-p.area)[:8]:
    c = lk.centroid; print('  lake area %.4f at %.2f,%.2f' % (lk.area, c.x, c.y), file=sys.stderr)
json.dump({'land': mapping(L)}, open('gshhg_%s.json' % res, 'w'))
print('land type', L.geom_type, 'npts', sum(len(g.exterior.coords)+sum(len(i.coords) for i in g.interiors) for g in (L.geoms if L.geom_type=='MultiPolygon' else [L])), file=sys.stderr)
