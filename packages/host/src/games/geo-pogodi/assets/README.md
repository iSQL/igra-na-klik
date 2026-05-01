# Serbia map asset

`serbia.svg` is the visual map used by the **Pogodi gde je** game on both the
host (TV) and controller (phone) screens.

## Source / attribution

The shipped file is **`Serbia_adm_location_map.svg`** from Wikimedia Commons:
https://commons.wikimedia.org/wiki/File:Serbia_adm_location_map.svg

License: **CC BY-SA 3.0 DE** (Creative Commons Attribution-ShareAlike 3.0
Germany). Original author: NordNordWest, derivative work by various
contributors. When publishing or redistributing, you must keep this
attribution + license notice.

The same file is duplicated at
`packages/controller/src/games/geo-pogodi/assets/serbia.svg` so the
controller's Vite bundle has its own local copy. Keep the two in sync
(or symlink them) when updating.

## Hard contract

The SVG `viewBox` (`0 0 724.531 1036.962`) and the bbox of the projection
in [`packages/shared/src/games/serbia-projection.ts`](../../../../../shared/src/games/serbia-projection.ts)
must match. The projection assumes the Wikipedia
`Module:Location_map/data/Serbia` parameters:

```
top    = 46.3
bottom = 41.7
left   = 18.7
right  = 23.2
```

If you swap the SVG, update **all three** of:

1. The SVG file's `viewBox`.
2. `SERBIA_BBOX` and `SVG_VIEWBOX` in `serbia-projection.ts`.
3. The wrapper `aspectRatio` in both
   `packages/host/src/games/geo-pogodi/components/SerbiaMap.tsx` and
   `packages/controller/src/games/geo-pogodi/components/SerbiaMap.tsx`.

These three are kept in lockstep so pin overlays line up perfectly with the
rendered map (no letterboxing, no projection skew).

## Why this approach

The map is rendered as a plain `<img>` overlaid with absolutely-positioned
pin elements. We don't parse the SVG's path data at runtime. Future
okrug-aware features (e.g. bonus points for guessing the right district)
would require either inline SVG with hit-testing or a separate GeoJSON
polygon set.
