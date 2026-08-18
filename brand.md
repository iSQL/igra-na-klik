# zabari.net — Brand Guide

**Direction 03 · Sunrise Hill**

A frog perched on a hill crest with the sun rising behind it — the chosen identity for **zabari.net**, the community network of Opština Žabari ("Žabari" sharing its root with *žaba*, frog). The mark reads as a new day breaking over the village: warmth, optimism, and a quiet sense of home.

---

## 0. Asset Files

| File | Use |
|------|-----|
| `assets/ink-mark-color.svg` | Primary mark, full color, on cream |
| `assets/ink-mark-mono-navy.svg` | Single-ink navy version, transparent background |
| `assets/ink-mark-mono-cream.svg` | Single-ink cream version, for dark surfaces |
| `assets/ink-mark-reverse.svg` | Reverse version, cream frame on navy, for dark surfaces |
| `assets/ink-mark-512.png` | High-res PNG of the primary mark, transparent background |
| `assets/favicon.svg` | Favicon, scalable (copy of the primary mark) |
| `assets/favicon.ico` | Favicon, 16/32/48px, for browsers that need .ico |
| `assets/favicon-16.png`, `favicon-32.png`, `favicon-48.png` | Favicon PNG fallbacks; 16px is the mono cut |
| `assets/apple-touch-icon.png` | 180×180 iOS home-screen icon, cream background |
| `packages/controller/public/icons/icon-192.png`, `icon-512.png` | Maskable PWA icons, mark at 74% on cream |

Everything except the four source SVGs is generated — run
`node scripts/build-brand-icons.mjs` after changing the mark. It rasterizes
through headless Chrome (no image library in the dependency tree), packs the
`.ico`, and copies the results into the three directories the apps serve from:
`packages/server/assets/brand/`, `packages/host/public/`,
`packages/controller/public/`. The landing page in
`packages/server/src/index.ts` inlines the same mark by hand and must be
updated with it.

Suggested `<head>` tags:
```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

---

## 1. The Mark

A circular emblem. Inside: a rising **sun** glows behind a navy **hill crest**, and a small front-facing **frog** sits at the top of the crest. A thin **river** line runs across the base. A clean ring frames the whole.

The frog is drawn **in pixels** — an 8-bit raster on a 3.2-unit grid, gold pixels for the eyes and mouth. Circle, sun, crest and river are unchanged from the zabari.net Sunrise Hill mark, so the app reads as part of the parent brand while the pixel cut is the one thing that says *game*.

**Construction notes**
- Built on a 100×100 circle, ring stroke 2.5.
- The sun sits low and centered; the crest is a single sweeping curve; the frog is centered on the crest.
- Frog pixels are 3.2 units square and snap to that grid — no half-pixels, no curves, no rotation.
- Keep all elements inside the ring — nothing should touch or break the frame.

**Variants**
- **Primary** — full color on cream (gold sun, navy hill and frog, gold eye and mouth pixels, cream river).
- **Reverse** — for navy / dark backgrounds; frame and river go cream, the frog's inner pixels go cream.
- **Mono** — single-ink version (navy or cream); sun drops to a soft 16% tint, river and inner pixels are omitted.

---

## 2. Logo Lockups

- **Combination** — mark + wordmark side by side, with comfortable space between.
- **Wordmark** — `zabari` set in Marcellus with `.net` in gold; the eyebrow tag and motto stack with a hairline rule.
- **Favicon / app icon** — the mark alone, on cream, navy, or a solid gold circle.

**Clear space** — keep margin equal to the frog's height on all sides.
**Minimum size** — 24px (digital). Below that, switch to the mono app-icon version.

---

## 3. Color

| Role | Name | Hex |
|------|------|-----|
| Primary | Navy | `#1D3557` |
| Primary deep | Navy Deep | `#162E4E` |
| Accent | Gold | `#C29B47` |
| Accent deep | Gold Deep | `#B89040` |
| Surface | Cream | `#F5EBE0` |
| Surface bright | Cream Hi | `#FAF6F0` |
| Surface warm | Beige | `#E6DCD2` |
| Ink | Charcoal | `#2B2B2B` |

Navy is the voice of the brand; gold is the sunrise — used as accent, never as a flood. Cream is the default canvas.

---

## 4. Typography

The **Igra Na Klik** party-game app uses a friendlier, rounded pairing than the
classical brand default — the serifs read too stiff and narrow at play sizes, so
the app ships with:

- **Fredoka** — display, headlines, wordmark, eyebrows and labels. Rounded and
  warm; carries the playful "vibe" of the game. Weights 500/600/700.
- **Manrope** — body copy, buttons and inputs. Clean, wide, highly legible on
  phones and TVs. Weights 400/500/700/800.

For static, print, or civic-brand contexts outside the game the original
classical pairing still applies:

- **Marcellus** — display & headlines. Calm, classical, the name itself.
- **Marcellus SC** (small caps) — eyebrows and labels; uppercase with wide letter-spacing (~0.28em).
- **Cormorant Garamond** — body copy and the motto; 500/600 weights.

Set headings in navy, body in charcoal, eyebrows in gold-deep.

---

## 5. Voice

The municipal network of Žabari, in its own language:

- **Tag** — Opština Žabari
- **Motto** — *Mreža naše varoši* ("The network of our town")

Warm, civic, rooted. The sunrise is the promise; the frog is the place. Speak plainly and proudly of community.

---

## 6. Do & Don't

**Do**
- Keep the mark inside its ring and give it room.
- Use gold sparingly, as light.
- Reach for the mono version at small sizes and on busy backgrounds.

**Don't**
- Recolor the frog or sun outside the palette.
- Stretch, rotate, or add shadow to the mark.
- Crowd the lockup or set the wordmark in another typeface.
