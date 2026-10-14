// Catppuccin Mocha, the palette of the terminal this mod is drawn in.
export const M = {
  rosewater: '#f5e0dc',
  pink: '#f5c2e7',
  mauve: '#cba6f7',
  red: '#f38ba8',
  peach: '#fab387',
  yellow: '#f9e2af',
  green: '#a6e3a1',
  teal: '#94e2d5',
  sky: '#89dceb',
  blue: '#89b4fa',
  lavender: '#b4befe',
  text: '#cdd6f4',
  subtext0: '#a6adc8',
  overlay1: '#7f849c',
  overlay0: '#6c7086',
  surface2: '#585b70',
  surface1: '#45475a',
  surface0: '#313244',
  base: '#1e1e2e',
  crust: '#11111b',
} as const

export type Rgb = [r: number, g: number, b: number]

export const rgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// `k` of the way from `a` to `b`.
export const blend = (a: Rgb, b: Rgb, k: number): Rgb => [0, 1, 2].map(i => Math.round(a[i]! * (1 - k) + b[i]! * k)) as Rgb

export const word = ([r, g, b]: Rgb): number => (r << 16) | (g << 8) | b

export const hex = (c: Rgb): string => '#' + word(c).toString(16).padStart(6, '0')

// WCAG contrast between two colors, 1 to 21.
const luminance = (c: Rgb): number => {
  const [r, g, b] = c.map(v => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)) as Rgb
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const contrast = (a: string, b: string): number => {
  const [x = 0, y = 0] = [luminance(rgb(a)), luminance(rgb(b))].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

// The band's colours, the terminal's pill and Raster and the desktop's row alike.
// A Raster paints 12-bit color, each channel taken to the nearest multiple of 0x11,
// where Text keeps all 24 bits: #3b3c4f came out #334455 beside it. So every colour
// the Text and the Raster share sits on that grid, and the two match.
const STAR = '#aaaacc'
export const BAND = {
  // Between Mocha's lavender and mauve; once the flow is done, Mocha's green.
  fill: '#aaaaee',
  done: '#aadd99',
  // The label on the pill.
  ink: M.crust,
  // Between Mocha's surface0 and surface1. The head and the crab are drawn on it
  // too: the crab's eyes and the gaps between its legs show the track.
  track: '#444455',
  // Mocha's subtext0 (overlay1 barely stood off the track): a star twinkles from it
  // toward the track.
  star: STAR,
  // A task boundary still ahead: halfway from the track to the pill, so it reads as
  // one of the pill's milestones and never as a star.
  mark: '#7777aa',
  // A milestone while a star passes behind it: lit in the star's own tone, as bright
  // as a star at its peak.
  markLit: STAR,
} as const

// The crab's own colour, Anthropic's clay, in both its drawings.
export const CLAY = '#D97757'

// Gold for the props some sprites carry (term-sprite.ts); the desktop paints the
// same sprites, so it gets these through them.
export const PROP = {
  gold: '#F5C542',
  goldDark: '#C99A1E',
} as const

// The desktop's type: its own UI font.
export const FONT = "system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',sans-serif"

// The desktop's SVG ink by CSS class, light then dark: `t` text, `s` secondary, `m`
// muted, `k` an empty track, `tk` the band's ticks, `ln` a rule, `tile` the pane's
// stat tiles, `d` the grid's dots.
type Ink = Record<string, string>
const rules = (ink: Ink): string => Object.entries(ink).map(([c, v]) => `.${c}{${c === 'ln' ? 'stroke' : 'fill'}:${v}}`).join('')
const deskCss = (light: Ink, dark: Ink): string => `${rules(light)}\n@media (prefers-color-scheme: dark){${rules(dark)}}`
export const DESK = {
  band: deskCss({ t: '#1f1f1f', m: '#8a8a8a', k: '#e4e4e2', tk: '#b4b4b0' }, { t: '#ececec', m: '#9a9a9a', k: '#2c2c2c', tk: '#5a5a5a' }),
  pane: deskCss(
    { t: '#1f1f1f', s: '#6b6b68', m: '#9a9a96', k: '#ecebe8', ln: '#e4e4e1', tile: '#f4f3f0' },
    { t: '#ececec', s: '#a8a8a4', m: '#7d7d79', k: '#2c2c2b', ln: '#333331', tile: '#262625' },
  ),
  grid: deskCss({ d: '#d9d8d4' }, { d: '#3a3a38' }),
  // A pane row's status mark: a check once done, a cross once failed, a clock while planned.
  done: '#3B9C5F',
  failed: '#D0453F',
  planned: '#9a9a96',
} as const
