import type { Panel } from '../types'

// Panel settings before the first write. Several modules declare their own `panel`
// atom, because the engine works out a module's reads and writes from the atoms named
// inside it; sharing this value keeps their starting points identical.
export const PANEL_DEFAULT: Panel = { isCompact: false, isDoneCollapsed: false, autoOpenedFor: '', isOpen: false }
