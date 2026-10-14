import { FONT } from './theme'

// The desktop's SVG, written one element at a time. Attributes come out in the order
// given and an `undefined` or `false` one is left out; the body is markup already,
// so text the user typed is escaped (format.ts's `xml`) before it gets here.
type Value = string | number | undefined | false

export const tag = (name: string, attrs: Record<string, Value>, ...body: string[]): string => {
  let open = `<${name}`
  for (const [key, value] of Object.entries(attrs)) if (value !== undefined && value !== false) open += ` ${key}="${value}"`
  const inner = body.join('')
  return inner ? `${open}>${inner}</${name}>` : `${open}/>`
}

const SVG_NS = 'http://www.w3.org/2000/svg'

// A drawing `w` by `h` px, one unit a px.
export const drawing = (w: number, h: number, ...body: string[]): string =>
  tag('svg', { xmlns: SVG_NS, viewBox: [0, 0, w, h].join(' '), width: w, height: h }, ...body)

// Words in the desktop's own font. `ink` is a class of the drawing's style; `more`
// adds the anchor, the weight or a fill.
type Words = { ink?: string; size: number; more?: Record<string, Value> }
export const words = (x: number, y: number, { ink, size, more = {} }: Words, ...body: string[]): string =>
  tag('text', { class: ink, x, y, ...more, 'font-family': FONT, 'font-size': size }, ...body)

// Figures that should not jiggle as they count: every digit the same width.
export const FIGURES = { 'font-variant-numeric': 'tabular-nums' } as const
