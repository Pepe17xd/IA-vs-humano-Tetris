# Architecture and implementation limits

## Browser application

The Arena is plain ECMAScript modules with no runtime packages, build-time framework or backend. `web/src/game.js` is the shared deterministic engine. `web/src/agent.js` enumerates reachable first-piece placements and performs bounded beam search. `web/src/ai-worker.js` runs the search off the UI thread, while `web/src/worker-guard.js` rejects late messages and errors from Workers belonging to an earlier match. `web/src/input.js` owns pointer-aware touch repeat and release behavior. `web/src/lab-render.js` draws the top candidate landing positions. `web/src/app.js` manages two engine instances, keyboard input, attacks, the match clock, local statistics, Canvas rendering and screens. `web/src/style.css` provides the responsive presentation. The static build copies `web/` into `dist/`; the development server and preview server use Node's built-in HTTP module.

The engine state is serializable and contains both PRNG states and bag contents. The human and AI are separate game states, but use the same functions. Match settings are validated, copied and frozen at match start; settings changes apply to later matches, and restart/rematch reuse the recorded configuration. Each turn communicates the active board, active piece, hold, visible queue, incoming garbage, combo and opponent's public visible-board pressure summary to the worker. The worker never sees screenshots, hidden opponent rows or DOM state. `agent-executor.js` checks each timed action against the live state, abandons rejected commands and replans if the final target drifted during gravity. Gravity locks within one UI update are collected before attacks and winner status resolve, so JavaScript's human-first tick order grants neither board an advantage.

## Search

The agent starts from the active position and uses BFS over left, right, soft drop, and both SRS rotations. It records hard-drop destinations along these reachable paths. When hold is available, it searches a second root branch using either the held piece or the first visible upcoming piece. At the root, each candidate's attack cancels the matching oldest queued garbage rows, then the remaining stored holes are projected onto the board using the engine's garbage insertion routine; candidates that top out are discarded. The resulting board is scored using aggregate column height, hole count and depth, row/column transitions, bumpiness, maximum height, wells, cleared lines, combo/back-to-back potential and outgoing attack. Advanced and Extreme enable the extra hole-depth and transition weights; the lower levels retain the simpler evaluation. It retains the best states at each future ply (beam search).

The Lab can run the four configured planners in a separate module Worker against one frozen snapshot of the current AI and opponent-visible state. It displays each selected landing, measured depth, node count and elapsed time. This is a same-position comparison, not a head-to-head simulation. Scores are omitted because each level uses different heuristic weights and those values do not share a calibrated scale.

Per-level depth, beam width, time limit, node limit and weights live in `DIFFICULTIES`. Search state includes the current combo and back-to-back chain; Advanced and Extreme scale attack valuation more strongly when the visible opponent stack or pending garbage indicates danger. The worker posts back the selected path, candidate scores, depth, node count, opponent-pressure estimate and measured decision time. The game executes the path with ordinary engine actions; if a timed path step fails or its final landing no longer matches the current piece position, the planner recomputes from the live state. If no legal candidate exists, the AI board loses; the engine does not substitute a fabricated move.

## Static hosting and privacy

The app needs no API keys, network service or server-side state. Vercel and Cloudflare Pages can serve the `dist/` directory. Google Fonts are an optional visual enhancement; system fonts are used as fallback. Browser settings and competitive match records use local storage. The Pages deployment workflow is manually triggered.

## Current limits

- This project uses its own scoring and timing choices; it does not establish full Guideline or TETR.IO compatibility.
- T-spin recognition uses corner occupancy plus the last action being a rotation. It does not inspect SRS kick index, so mini/full edge cases can differ from other games.
- Lock-out in hidden rows is deliberately strict. Perfect clears have no attack bonus.
- Future beam plies mostly assume geometric hard drops and omit opponent-response search, garbage timing, and full movement reachability. Advanced and Extreme additionally find reachable SRS T-spin landings for the first future T; only the immediate action path is fully checked by BFS.
- Decision budgets are targets enforced inside expansion loops; one expansion can exceed the target slightly. The worker keeps the UI responsive but does not guarantee a particular hardware-independent decision time.
- Root search projects the current queued garbage after attack cancellation; future beam plies do not model additional opponent attacks or garbage arrivals.
- A seeded “human victory simulation” deliberately overrides the displayed winner according to its configured probability. It is labeled as simulated and is excluded from match history.
- Python screen vision remains experimental and has not been shown to be accurate on arbitrary real game footage. It is not part of the Arena controller.
