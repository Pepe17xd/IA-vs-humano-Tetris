# Tetris AI Arena

**Can you outthink the machine?** Tetris AI Arena is a local, browser-based head-to-head Tetris game and a transparent search lab. The human and agent play on separate boards with the same engine, scoring, piece generator, gravity and garbage rules. The agent reads the game state directly and searches in a Web Worker; it does not use screenshots, computer vision or browser automation.

The web app is dependency-free JavaScript and ships as static files. The repository also retains the Python research simulator, screen-vision experiments, temporal tracker and public TETRA CHANNEL reader as separate tools.

## Play locally

Requirements: Node.js 20 or newer. No package installation is needed.

```powershell
npm.cmd run dev
```

Open http://127.0.0.1:4173. Select an AI level and seed, then start a match. Settings, results and statistics stay in this browser's local storage.

## Commands

```powershell
npm.cmd test                     # browser engine and agent tests
npm.cmd run lint                 # syntax, imports and whitespace
npm.cmd run check                # JavaScript syntax checks
npm.cmd run build                # prepare the static site in dist/
npm.cmd run preview              # serve dist/ locally on port 4173
npm.cmd run benchmark -- --seeds 3 --pieces 180
npm.cmd run benchmark -- --agent extreme --opponent beginner --seeds 3 --pieces 400
npm.cmd run benchmark -- --agent extreme --opponent random --seeds 10 --pieces 300
```

The optional `--agent` and `--opponent` flags select one matchup; agent levels are `beginner`, `intermediate`, `advanced`, and `extreme`. Opponents can also be `random`, a deterministic weak baseline that chooses a pseudo-random reachable landing using only visible game state. For a controlled heuristic experiment, `--attack-weight N` overrides that agent's attack weight and requires `--agent`.

Each benchmark round calculates both moves from the same pre-round snapshot, then resolves their locks and queues attacks symmetrically, matching the live match's simultaneous-lock rule.

The Python research tools remain available separately:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m pip install -e .
$env:TEMP = (Join-Path (Get-Location) '.test-tmp')
$env:TMP = $env:TEMP
python -m pytest -q -p no:cacheprovider

python -m tetris_ai benchmark --turns 100 --depth 2 --width 16
python -m tetris_ai calibrate
python -m tetris_ai vision
python -m tetris_ai temporal
python -m tetris_ai assist
```

The Python assistant is an experimental read-only screen analyzer. It is not used by the Arena agent.

## Match modes and fairness

- Both players use the same `web/src/game.js` engine and configurable gravity.
- The seeded 7-bag generator is deterministic. Identical-sequence mode gives both players the same piece sequence; each board still has its own stack and attacks.
- Seeds reproduce the piece and garbage streams. AI decisions use wall-clock search budgets, so exact plans can vary across devices or system load even with the same seed.
- The agent sees the active piece, hold slot and the same five-piece preview shown to the human. Each level searches only within that visible queue; Extreme is capped at six plies (current piece plus five previews).
- SRS movement, wall kicks, lock delay and hard-drop commands are applied by the game engine. The agent plans a path of legal moves and plays that path through the same engine.
- The worker has per-level node and time budgets, so planning does not freeze rendering. The player can continue moving while a decision is being calculated.
- “Human victory simulation” is a separate opt-in experiment. A seeded draw decides whether the displayed outcome is a human win; the match is labeled simulated and is excluded from competitive statistics.
- Match outcomes and settings are stored in browser local storage only. No server, account or database is used.

## AI levels

The levels change both search capacity and evaluation weights. Search explores possible piece placements with a beam; only the first move must have a reachable action path from the current position. Future placements mostly use geometric hard drops; Advanced and Extreme also search SRS-reachable spin landings for the first future T.

| Level | Lookahead | Beam width | Time budget | Node limit |
|---|---:|---:|---:|---:|
| Beginner | 1 ply | 8 | 85 ms | 2,800 |
| Intermediate | 2 plies | 20 | 150 ms | 9,000 |
| Advanced | 3 plies | 42 | 280 ms | 20,000 |
| Extreme | 6 plies | 120 | 520 ms | 90,000 |

The Lab displays calculated candidates, scores, lookahead depth, nodes and decision time. It can also run all four planners against the same frozen live state and compare their chosen landings and search effort. These are results from live searches, not prefilled examples. The level-specific heuristic scores use different weights and should not be compared as one shared scale. Higher levels spend more computation and use different weights for stack height, hole count and depth, row/column transitions, line clears, combos, back-to-back clears, attack potential, wells and incoming garbage. No win rate is promised; use the benchmark command to measure outcomes over chosen seeds.

Configured lookahead is a maximum. A decision can finish at a lower measured depth when its beam runs out of visible previews (including after an empty hold consumes one) or a time/node budget interrupts a layer. The Lab shows the depth actually completed for each move.

## Arena rules

The game uses a custom, documented ruleset: 10 columns, 20 visible rows plus 2 hidden rows, seven-bag pieces, SRS kick tables, hold, ghost piece, 500 ms lock delay, and gravity starting at 820 ms per row with a 65 ms floor. Clearing lines increases the level every 10 lines. Horizontal moves and rotations can reset a grounded lock timer up to 15 times. Locking a piece in a hidden row tops out.

Line-clear scoring is 100 / 300 / 500 / 800 points for one through four lines, multiplied by the current level. Soft drops add 1 point per row and hard drops add 2. Combos award 50 × combo index × level starting with the second consecutive clear. T-spin attacks, back-to-back bonuses, garbage cancellation, and garbage timing are specified in [the rules](docs/ARENA_RULES.md).

The custom game is **not claimed to match TETR.IO or every Tetris Guideline detail**. In particular, perfect clears are detected and reported but do not grant a bonus attack; mini T-spin classification and kick edge cases are covered only by this implementation's own tests. See [architecture and limits](docs/ARCHITECTURE.md).

## Architecture

```text
web/src/game.js       deterministic, shared game engine
web/src/agent.js      reachable-move enumeration and beam search
web/src/agent-executor.js validates and re-plans live AI action paths
web/src/worker-guard.js ignores stale Worker callbacks from finished matches
web/src/ai-worker.js  isolated search worker
web/src/app.js        match loop, screens, canvas rendering and local stats
web/src/style.css     responsive arcade interface
web/src/input.js      pointer-aware touch controls
web/src/lab-render.js candidate placement overlays for the AI Lab
web/tests/            Node tests for engine, match, agent execution, worker, Lab rendering and input
scripts/              static server, build, checks and self-play benchmark
src/tetris_ai/        retained Python research and vision tools
```

See [architecture](docs/ARCHITECTURE.md) and [AI behavior](docs/AI_LEVELS.md) for details and limits.

The delivery phase checklist is in [the implementation plan](docs/IMPLEMENTATION_PLAN.md).

The measured sample currently in the repository is summarized in [benchmark results](docs/BENCHMARK_SAMPLE.md). It is a capped self-play smoke run, not evidence of a strong human win rate.

## Build and deploy

`npm run build` copies the self-contained `web/` site to `dist/`. This folder can be served by any static host. For Cloudflare Pages, use build command `npm run build` and output directory `dist`. For Vercel, use the same build command and output directory.

For GitHub Pages, select **Settings → Pages → Build and deployment → Source → GitHub Actions**. The **Deploy to GitHub Pages** workflow builds and publishes `dist/` on pushes to `main`, and can also be started manually from the Actions tab. The game is available at `https://pepe17xd.github.io/IA-vs-humano-Tetris/` after the deployment succeeds. This is a static JavaScript project, not a Vite application; its relative asset paths work under the repository URL.

Continuous integration runs the JavaScript test suite, syntax checks, static build and existing Python tests. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## License

MIT. See [LICENSE](LICENSE).
