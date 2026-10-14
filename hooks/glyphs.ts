import type { PluginOptions } from 'claude-code'

// The terminal glyphs the `glyphs` option picks between: `nerd` for a Nerd Font (its
// powerline ends and chevrons, and the band crab's Unicode 16 octants), `plain` for
// a font without them. The crab's own frames are term-crab.ts's, by the same key.
export type Glyphs = 'nerd' | 'plain'
export const glyphsOf = (options: PluginOptions): Glyphs => (options.glyphs === 'plain' ? 'plain' : 'nerd')

// The bar's ends, left then right: rounded from the powerline set, or half blocks.
export const CAPS = { nerd: [0xe0b6, 0xe0b4], plain: [0x2590, 0x258c] } as const satisfies Record<Glyphs, readonly number[]>

// The Finished heading's caret, closed then open: a Nerd Font's chevrons sit mid-line
// in the heading's own weight, where ▸ ▾ ride high. The desktop's font has no Nerd
// glyphs, so it always takes the triangles. CARETS is exported for the tests alone;
// the pane draws with `caretOf`.
export const CARETS = { nerd: ['\ueab6', '\ueab4'], plain: ['▸', '▾'] } as const satisfies Record<Glyphs, readonly string[]>
export const caretOf = (glyphs: Glyphs, isCollapsed: boolean): string => CARETS[glyphs][isCollapsed ? 0 : 1]
