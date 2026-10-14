// A fixed pseudo-random value in [0, 1) for each input, so star positions and
// twinkle timings come out the same on every redraw: per lane, on both the
// desktop band and the terminal band. `k` picks an independent sequence.
const frac = (v: number): number => v - Math.floor(v)
export const noise = (x: number, y = 0, k = 0): number => frac(Math.sin(x * 12.9898 + y * 78.233 + k) * 43758.5453)
