# crab-crew

Watch your subagents work. crab-crew is a Claude Code mod that adds a slim
status strip over the input box and a `/crew` panel listing every subagent.
Each subagent shows up as a small pixel crab wearing the outfit of its job.

## The strip and the panel

The strip turns up on its own once the first subagent starts. It is titled
with the first line of your prompt and counts how many agents have ended out
of how many were spawned. Its crab dresses as whichever agent is busy right
now. When every agent has ended and the main loop is idle, it reads Done.

The panel groups agents under Running, Finished and Planned. A row holds the
crab, the role, the agent type (skipped for `general-purpose` and `claude`,
where the role says enough), model, effort, step progress, context use, cost
and elapsed time. Press the Finished heading to fold those rows.

| Command | Effect |
| --- | --- |
| `/crew` | toggle the panel (the `×N` count on the strip does the same) |
| `/crew open` | bring the panel to the front and give it the keyboard |
| `/crew bar` | show the strip again after closing it with ✕ |

### Terminal

Colours come from Catppuccin Mocha. Crabs are 14×8 sprites drawn with half
blocks; running ones step once a second and planned ones are dimmed. A
collapsed panel is a single line of crabs plus a `+N` tail.

The strip is a periwinkle pill that grows with progress over a dark track and
turns green when the flow finishes. Twinkling stars drift across the empty
track, and each upcoming task boundary is a small marker that glows as a star
passes it. A larger octant crab walks just ahead of the pill in the busy
agent's colour, hurrying briefly after each step. When the track has no room
or the flow is done, a smaller crab sits next to the percentage instead.

### Desktop, VS Code and mobile

The strip and each panel row are SVG drawings: a dithered pill, a dotted
background and a costumed crab per row. Text follows the system light or dark
scheme; role colours and bars match the terminal.

## Roles

The role comes from the agent type, word by word. For `general-purpose` and
`claude` agents only the first word of the task description counts, so "Fix
failing tests" is a builder. See `roleOf` in `hooks/roles.ts`.

| Role | Outfit | Picked for |
| --- | --- | --- |
| designer | beret and brush | Impeccable asset, documenter and manual-edit agents; tasks starting with design, polish, restyle, sketch, mock |
| reviewer | detective | Impeccable finish reviewer; types with review, audit, verify; tasks starting with review, audit, verify, check, inspect |
| scout | pirate | `Explore`; tasks starting with find, research, investigate, search, read, list |
| planner | hard hat | `Plan`; tasks starting with plan, spec, scope, outline |
| runner | racer | types with test, regress, runner; tasks starting with run, test, regress, lint |
| builder | chef | any other general-purpose task |
| fork | astronaut | a fork of the main session |
| other | plain crab | any other named agent |

## Tools

- `mcp__crab-crew__progress` belongs to the main session. It sets the title,
  the planned tasks and the current phase. Subagent calls are ignored. Calling
  it after a finished flow begins a fresh one.
- `mcp__crab-crew__step` is for subagents. They send `done`, `total` and a
  short `note`, shown as `3/5 reading`. An agent that never reports steps
  shows its context use instead, in a darker tint of its role colour. On a
  narrow terminal, context and then cost make way for the note.

Costs are estimated from token counts and the `PRICES` table in
`hooks/cost.ts`. They are not your bill.

## Settings

| Key | Values | Meaning |
| --- | --- | --- |
| `autoOpen` | `session` (default), `flow`, `off` | open the panel once per session (first subagent or plan), at every new flow, or never |
| `stepReports` | `on` (default), `off` | append a line to built-in subagent briefs asking for `step` calls; plugin agents are left untouched |
| `glyphs` | `nerd` (default), `plain` | Nerd Font pill caps, chevrons and an octant crab, or half blocks, ▸ ▾ and an ASCII crab |

## Development

The mod is a plugin of function hooks with `hooks/register.tsx` as its entry.
`types/index.d.ts` describes its state and tool inputs. Claude Code generates
its own API types into `.claude-plugin/types/` (ignored by git) whenever it
loads the mod, so type-checking a fresh clone needs one session first.

Run the gate from the repo root:

```sh
claude plugin validate .
npx --yes -p typescript tsc -p .
claude plugin test .
```

`scripts/` has helpers for checking the terminal drawing in Ghostty:
`shot.sh <out.png>` grabs the Ghostty window, `wins.swift` prints visible
windows, and `swift scripts/px.swift <img> x,y ...` reads pixel colours.
