// Where the band and the pane draw SVG: every surface but the terminal has an
// `Svg` (the terminal's table is completed with one that draws nothing, so the
// surface is tested too). One rule for both, so vscode and mobile look like the
// desktop, never half like the terminal.
export const svgSurface = <U extends object>(surface: string, ui: U): ui is Extract<U, { Svg: unknown }> => surface !== 'terminal' && 'Svg' in ui
