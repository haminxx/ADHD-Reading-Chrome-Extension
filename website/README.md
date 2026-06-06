# Focus Reader - Website

Landing / download site for the Focus Reader Chrome extension. Built with Vite +
React + TypeScript + Tailwind CSS, with `framer-motion` for the liquid header.

## Develop

```bash
cd website
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build into dist/
npm run preview  # preview the production build
```

## The liquid header

`src/components/LiquidHeader.tsx` has three modes:

- **bar** - full header pinned at the top of the page.
- **blob** - on scroll it collapses into a morphing "liquid glass" blob that
  springs toward the mouse cursor (spring physics via `useSpring`).
- **card** - clicking the blob expands it into a floating menu card that settles
  into a static header card.

The frosted "liquid glass" look is shared:

- `src/components/GlassButton.tsx` - the reusable glass button (from the provided
  reference).
- `src/lib/liquidGlass.ts` - the SVG displacement/normal map + shadow stack. It
  currently uses a compact generated SVG normal map; replace `DISPLACEMENT_MAP`
  with your `data:image/webp;base64,...` asset to use the exact reference map.
- `.liquid-surface` in `src/index.css` + the single `#liquid-global` SVG filter
  rendered in `src/App.tsx`.

The header design and menu-card contents are intentionally placeholder, ready for
the upcoming design instructions.
