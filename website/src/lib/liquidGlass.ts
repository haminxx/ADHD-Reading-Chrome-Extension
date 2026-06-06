// Shared "liquid glass" refraction assets.
//
// The original reference embeds a ~12KB base64 WebP normal map. To keep the
// source lightweight, we instead generate an equivalent normal map as a compact
// inline SVG: a horizontal red ramp encodes the X-normal and a vertical green
// ramp encodes the Y-normal (screen-blended over a blue base). Fed through
// feDisplacementMap (xChannel=R, yChannel=G) this bends the backdrop outward at
// the edges, producing the lens/refraction look.
//
// To use the exact reference asset instead, replace DISPLACEMENT_MAP with your
// "data:image/webp;base64,...." string.
const NORMAL_MAP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <defs>
    <linearGradient id="rx" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000000"/>
      <stop offset="1" stop-color="#ff0000"/>
    </linearGradient>
    <linearGradient id="gy" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000"/>
      <stop offset="1" stop-color="#00ff00"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" fill="#0000ff"/>
  <rect width="100" height="100" fill="url(#rx)" style="mix-blend-mode:screen"/>
  <rect width="100" height="100" fill="url(#gy)" style="mix-blend-mode:screen"/>
</svg>`;

export const DISPLACEMENT_MAP =
  "data:image/svg+xml," + encodeURIComponent(NORMAL_MAP_SVG);

// Default neutral frosted tint used when no glassColor is supplied.
export const DEFAULT_GLASS_COLOR = "oklch(from var(--foreground) l c h / 5%)";

// The reusable box-shadow stack that sells the glass edges/highlights.
export const GLASS_SHADOW = [
  "inset 0 0 0 1px color-mix(in srgb, white calc(var(--glass-reflex-light) * 10%), transparent)",
  "inset 1.8px 3px 0px -2px color-mix(in srgb, white calc(var(--glass-reflex-light) * 90%), transparent)",
  "inset -2px -2px 0px -2px color-mix(in srgb, white calc(var(--glass-reflex-light) * 80%), transparent)",
  "inset -3px -8px 1px -6px color-mix(in srgb, white calc(var(--glass-reflex-light) * 60%), transparent)",
  "inset -0.3px -1px 4px 0px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 12%), transparent)",
  "inset -1.5px 2.5px 0px -2px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 20%), transparent)",
  "inset 0px 3px 4px -2px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 20%), transparent)",
  "inset 2px -6.5px 1px -4px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 10%), transparent)",
  "0px 1px 5px 0px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 10%), transparent)",
  "0px 6px 16px 0px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 8%), transparent)",
].join(", ");
