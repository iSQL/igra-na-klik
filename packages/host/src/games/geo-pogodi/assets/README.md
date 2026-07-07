# Serbia map asset

`serbia-map.png` (1901×2386) is the visual map used by the **Pogodi gde je**
game on both the host (TV) and controller (phone) screens. It is a UN-style
reference map of Serbia with a degree graticule labeled along the frame
(18°–23°E across the top/bottom, 42°–46°N down the sides).

The same file is duplicated at
`packages/controller/src/games/geo-pogodi/assets/serbia-map.png` so the
controller's Vite bundle has its own local copy. Keep the two in sync
when updating. The original source file lives at `assets/SerbiaMap.png`
in the repo root.

## Hard contract

The image dimensions and the calibration constants in
[`packages/shared/src/games/serbia-projection.ts`](../../../../../shared/src/games/serbia-projection.ts)
must match. The source map uses a conic-style projection: latitude is
linear in y (514.875 px per degree, 46°N at y=190.25), but meridians
converge northward, so longitude maps through per-row linear coefficients
(fitted along the top and bottom graticule tick rows) interpolated in y.
The constants were measured programmatically from the graticule tick pixels
and validated against known city positions (residuals ≈ 1–2 km).

If you swap the map image, update **all three** of:

1. The calibration constants and `SVG_VIEWBOX` in `serbia-projection.ts`
   (re-measure the new image's graticule).
2. `SVG_W`/`SVG_H` in both
   `packages/host/src/games/geo-pogodi/components/SerbiaMap.tsx` and
   `packages/controller/src/games/geo-pogodi/components/SerbiaMap.tsx`.
3. Both copies of the asset file.

These are kept in lockstep so pin overlays line up perfectly with the
rendered map (no letterboxing, no projection skew).

## Why this approach

The map is rendered as a plain `<img>` overlaid with absolutely-positioned
pin elements. We don't parse any vector data at runtime. Future
okrug-aware features (e.g. bonus points for guessing the right district)
would require a separate GeoJSON polygon set.
