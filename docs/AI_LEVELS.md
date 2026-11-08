# AI levels and research measurements

| Level | Plies | Beam | Budget | Nodes | Search intent |
|---|---:|---:|---:|---:|---|
| Beginner | 1 | 8 | 85 ms | 2,800 | Lower computation and basic surface/holes scoring. |
| Intermediate | 2 | 20 | 150 ms | 9,000 | One future piece of lookahead and moderate attack value. |
| Advanced | 3 | 42 | 280 ms | 20,000 | More lookahead, attack potential, garbage awareness, transition and hole-depth evaluation. |
| Extreme | 6 | 120 | 520 ms | 90,000 | Full visible queue lookahead and strongest survival/attack/board-shape terms. |

The agent uses its current piece, hold and five visible upcoming pieces, plus public opponent stack/garbage pressure. Root placements come from reachable BFS paths. Later plies use geometric hard-drop placements, with Advanced and Extreme adding SRS-reachable T-spin landings for the first future T. Advanced and Extreme additionally penalize hole depth and row/column transitions; these add board-shape signals beyond surface height and hole count. Offensive scoring adapts to opponent pressure, with stronger counterplay scaling at the higher levels. Node limits are enforced during expansion. Search stops with reserved headroom for candidate ranking; the reported decision time still includes ranking, and final ranking can exceed the target slightly under system load. The worker keeps that computation off the rendering thread. The heuristic has no learned policy or human gameplay dataset.

The configured depth is a ceiling, not a promise that every decision reaches it. The search reports the deepest complete layer it evaluated; a line can end earlier when the selected beam has no further visible pieces (for example, using an empty hold consumes one preview), or when a time/node limit interrupts expansion. The Lab reports the measured depth for each decision.

Seeds reproduce the piece and garbage streams. Since search also stops at a wall-clock deadline, exact AI plans and match outcomes are not guaranteed to match across different devices or system load.

Run a deterministic self-play comparison:

```powershell
npm.cmd run benchmark -- --seeds 3 --pieces 180
```

The JSON report includes the seed and winner per match, lines, score, attacks, agent decision time, nodes, decision count and agent errors, plus aggregate wins, losses, draws and planner-error matches by matchup. A planner error is reported as `winner: "error"`, never counted as a legitimate win or draw. The benchmark compares search levels against one another using the custom Arena engine. It does not establish a human win rate or strength against other Tetris implementations. Use more seeds for more stable estimates.
