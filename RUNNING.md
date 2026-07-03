# Discover DFW — implemented app

A Next.js (App Router) implementation of the Discover DFW design bundle, built
to the **final intent** from the chat transcript: 53 cities across 8 counties,
Editor's Picks = Denton → Fort Worth → Dallas → Frisco, and the NEW BUILDS
section/tab.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
# or
npm run build && npm run start
```

## Structure

- `lib/dfw-data.ts` + `lib/dfw.data.json` — geography + city data (ported
  verbatim from the bundle's `dfw-data.js`) plus the projection/format helpers.
- `lib/theme.ts` — the parchment map palette + brand colors.
- `app/page.tsx` — homepage, composed from `components/*`:
  masthead, `Nav`, `Hero`, `Ticker`, `InteractiveMap`, `EditorsPicks`,
  `StatsBand`, `NewBuilds`, `CityIndex`, `About`, `Newsletter`, `Footer`.
- `app/city/[slug]/page.tsx` — one server-rendered report per city, with
  `generateStaticParams` (all 53 slugs prerendered) and per-city `<title>`.
  `components/city/CityNav.tsx` is the client island for the jump dropdown.
- `components/Reveals.tsx` — the scroll-reveal controller.
- `app/globals.css` — keyframes + `:hover` behaviours ported from the
  prototype's `style-hover` attributes.

The interactive map (`components/InteractiveMap.tsx`) is a client component that
reproduces the hover glow, county tint, cursor tooltip, spotlight sidebar,
county panel, and idle "blip" attract mode.

All market figures (prices, $/sqft, DOM, YoY, populations, ratings, commutes)
are **placeholders** carried over from the design — swap for live MLS data.

The original design export is preserved under `project/` and `chats/`.
