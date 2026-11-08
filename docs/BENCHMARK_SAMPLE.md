# Benchmark sample

**Scheduling correction:** samples produced before the symmetric-round runner below could deliver the first seat's attack before the other seat planned. They are retained as historical output but are not valid head-to-head strength evidence. Current runs plan both moves from the pre-round state and enqueue attacks only after both locks resolve. Use the symmetric-round section at the end for current comparison evidence.

Legacy baseline before opponent-pressure scoring and alternating turn order, on 2026-11-07:

```text
node scripts/benchmark.mjs --seeds 1 --pieces 180
```

This used the old fixed agent-first schedule and ran six deterministic level matchups on seed 42. Every game reached its 180-piece cap, so all six results were recorded as draws. It is retained as historical output and is not used as fairness validation for the current alternating schedule. No agent path errors were recorded.

| Agent | Opponent | Result | Agent lines | Opponent lines | Mean decision time | Agent nodes |
|---|---|---|---:|---:|---:|---:|
| Beginner | Intermediate | Draw at cap | 73 | 77 | 6.7 ms | 12,362 |
| Intermediate | Beginner | Draw at cap | 77 | 76 | 24.0 ms | 135,790 |
| Advanced | Beginner | Draw at cap | 76 | 72 | 49.8 ms | 530,816 |
| Advanced | Intermediate | Draw at cap | 75 | 74 | 46.9 ms | 530,784 |
| Extreme | Beginner | Draw at cap | 76 | 75 | 92.3 ms | 1,323,792 |
| Extreme | Intermediate | Draw at cap | 71 | 73 | 91.8 ms | 1,324,290 |

The test confirms different search effort and functioning self-play. It does not demonstrate that Extreme is a formidable human opponent. More seeds, longer games and human-versus-agent matches are still needed to measure decisive outcomes.

## Focused longer run — Extreme depth 5, fixed-order legacy

After adding public opponent-pressure scoring, the depth-5 configuration ran three seeded matches with identical piece sequences. All three reached the cap: **0 Extreme wins, 0 Beginner wins, 3 draws**, with no agent errors. Extreme averaged 100.9–105.0 ms per decision, searched about 2.94 million nodes per game, and observed a maximum pressure score of 0.625–1.0. The agents cleared 165–171 lines and sent similar net attack counts (8–15 Extreme, 7–14 Beginner). This did not demonstrate a decisive advantage for Extreme.

## Extreme capacity check — depth 6, fixed-order legacy

After preserving both spin-capable and non-spin routes to identical landings, `node scripts/benchmark.mjs --agent extreme --opponent beginner --seeds 1 --pieces 400` produced one capped draw, with no agent errors. The agent cleared 173 lines and sent 15 net attacks; the Beginner cleared 171 and sent 16. Extreme averaged 261.4 ms per decision, peaked at 339.4 ms, searched 8.28 million nodes total, and had **zero decisions over its 520 ms budget**. The result and line totals match the preceding depth-6 run for seed 42, while the retained alternatives increased search work. This is one seed and does not establish a win rate; multi-seed evaluation is still needed.

These historical runs predate alternating first-move order in the benchmark. Use the current-schedule section below for current comparisons.

## Historical alternating-order benchmark — before garbage and B2B-state corrections

Run on 2026-11-07 with `node scripts/benchmark.mjs --agent extreme --opponent beginner --seeds 3 --pieces 400`. First move alternated by round, and the starting seat alternated by seed. All six players completed 400 placements: **0 Extreme wins, 0 Beginner wins, 3 capped draws**. No planning errors or decision-budget overruns occurred. The engine then applied newly queued garbage holes from a fresh RNG draw rather than the stored incoming sequence, and the planner did not receive the active back-to-back flag; this result is retained as historical and does not validate the corrected engine or planner below.

| Seed | Agent first | Extreme / Beginner lines | Extreme / Beginner net attacks | Extreme mean / max decision |
|---:|:---:|---:|---:|---:|
| 42 | Yes | 166 / 166 | 9 / 8 | 259.9 / 339.6 ms |
| 7961 | No | 167 / 168 | 13 / 9 | 274.5 / 339.7 ms |
| 15880 | Yes | 170 / 167 | 10 / 12 | 276.1 / 341.3 ms |

Extreme explored about 8.27 million nodes per game and stayed under its 520 ms decision budget in all 1,200 decisions. These results show comparable play against the Beginner profile, not a high win rate or strength against human players.

## Attack-weight experiment — historical, before garbage and B2B-state corrections

A paired diagnostic compared the Extreme attack weight (1.7) with an experimental weight of 5.0, using the same Beginner profile, seeds and alternating seat schedule. It predates the queued-hole and back-to-back state corrections below and is preserved for reference; it is not evidence about the current engine or planner. Repeat it with:

```powershell
npm.cmd run benchmark -- --agent extreme --opponent beginner --seeds 3 --pieces 220
npm.cmd run benchmark -- --agent extreme --opponent beginner --seeds 3 --pieces 220 --attack-weight 5
```

All six games reached the cap as draws. The override changed Extreme's attack pressure, but did not produce a decisive win or a consistent improvement across seeds, so it was not adopted as the default.

| Seed | Current lines E/B | Current E attacks | Weight 5 lines E/B | Weight 5 E attacks |
|---:|---:|---:|---:|---:|
| 42 | 89 / 91 | 4 | 96 / 95 | 9 |
| 7961 | 93 / 95 | 10 | 91 / 93 | 8 |
| 15880 | 91 / 90 | 5 | 96 / 97 | 13 |

No tested decision exceeded the 520 ms Extreme budget in that run; the highest observed time was 483.8 ms. This remains a small self-play experiment, not a human win-rate estimate.

## Superseded benchmark — before ranking reserve and B2B-state transfer

The first run after preserving the queued garbage-hole sequence and clamping gravity to its documented minimum, but before passing the back-to-back flag to search, produced **0 Extreme wins, 0 Beginner wins, 3 capped draws** and no planning errors. Three of 360 Extreme decisions exceeded the 520 ms target; the largest was 527.6 ms. A ranking-time reserve was then added and measured below.

| Seed | Extreme first | Extreme / Beginner pieces | Extreme / Beginner lines | Extreme / Beginner attacks | Extreme mean / max decision | Overruns |
|---:|:---:|---:|---:|---:|---:|---:|
| 42 | Yes | 120 / 120 | 52 / 53 | 6 / 7 | 307.2 / 371.7 ms | 0 |
| 7961 | No | 120 / 120 | 50 / 50 | 3 / 3 | 330.9 / 527.6 ms | 3 |
| 15880 | Yes | 120 / 120 | 49 / 51 | 4 / 2 | 306.4 / 390.1 ms | 0 |

This confirms deterministic, error-free planning against the Beginner profile for these seeds, not a decisive strength advantage. These timing results are superseded by the ranking-reserve run below.

## Superseded benchmark — before root garbage projection

Repeated on 2026-11-07 with `npm.cmd run benchmark -- --agent extreme --opponent beginner --seeds 3 --pieces 120`, after reserving up to 25 ms (5% of the configured budget) for candidate ranking and passing the active back-to-back state into the agent, but before projecting remaining queued garbage onto candidate boards. The result was **0 Extreme wins, 0 Beginner wins, 3 capped draws**, with no planning errors and zero of 360 decisions over 520 ms. The current post-projection result is below.

| Seed | Extreme first | Extreme / Beginner pieces | Extreme / Beginner lines | Extreme / Beginner attacks | Extreme mean / max decision |
|---:|:---:|---:|---:|---:|---:|
| 42 | Yes | 120 / 120 | 52 / 53 | 6 / 7 | 221.2 / 271.9 ms |
| 7961 | No | 120 / 120 | 50 / 50 | 3 / 3 | 256.2 / 273.1 ms |
| 15880 | Yes | 120 / 120 | 49 / 51 | 4 / 2 | 256.1 / 272.0 ms |

The reserve brought all measured decisions under the target for this sample. This sample is historical now that root candidates project queued garbage.

## Historical benchmark — root garbage projection before complete-layer preservation

Run on 2026-11-07 with `npm.cmd run benchmark -- --agent extreme --opponent beginner --seeds 3 --pieces 120`, with candidate attack cancellation and remaining queued holes projected at the root. The result was **0 Extreme wins, 0 Beginner wins, 3 capped draws**, with no planning errors and no time-budget overruns (maximum 296.3 ms).

| Seed | Extreme first | Extreme / Beginner pieces | Extreme / Beginner lines | Extreme / Beginner attacks | Extreme mean / max decision |
|---:|:---:|---:|---:|---:|---:|
| 42 | Yes | 120 / 120 | 53 / 51 | 4 / 6 | 222.5 / 281.9 ms |
| 7961 | No | 120 / 120 | 52 / 50 | 4 / 6 | 257.7 / 296.3 ms |
| 15880 | Yes | 120 / 120 | 50 / 49 | 2 / 3 | 261.0 / 280.1 ms |

Self-play still shows parity rather than a decisive strength advantage; this is not a human win-rate estimate.

Longer post-projection sample, run with `node scripts/benchmark.mjs --agent extreme --opponent beginner --seeds 3 --pieces 400`. All three games reached the 400-placement cap as draws: **0 Extreme wins, 0 Beginner wins, 3 draws**. No planning errors or 520 ms budget overruns occurred.

| Seed | Extreme first | Extreme / Beginner lines | Extreme / Beginner attacks | Extreme mean / max decision | Extreme nodes |
|---:|:---:|---:|---:|---:|---:|
| 42 | Yes | 168 / 171 | 13 / 10 | 234.0 / 280.2 ms | 8,278,409 |
| 7961 | No | 171 / 168 | 11 / 15 | 243.5 / 498.7 ms | 8,268,240 |
| 15880 | Yes | 171 / 166 | 8 / 13 | 253.7 / 300.8 ms | 8,276,386 |

This sample establishes parity against the built-in Beginner profile for these seeds, not an advantage against human players. Seed 7961 approached the decision budget, so more optimization and broader evaluation are still needed before calling Extreme a formidable rival.

## Longer horizon and aggression experiment

On seed 42, extending the default Extreme-versus-Beginner matchup to 1,000 placements per side also ended in a draw: 422 / 424 lines and 29 / 26 attacks. Extreme averaged 241.6 ms per decision, peaked at 306.0 ms, and reported no planning errors or budget overruns.

The same seed and horizon with `--attack-weight 4` remained a draw. Extreme sent 39 attacks (up from 29) but cleared 424 lines versus Beginner's 433; decision time averaged 242.9 ms, peaked at 303.8 ms, and had no planning errors or budget overruns.

The controlled 400-piece comparison with `--attack-weight 4` also produced three draws and no errors or budget overruns:

| Seed | Extreme / Beginner lines | Extreme / Beginner attacks | Extreme mean / max decision |
|---:|---:|---:|---:|
| 42 | 167 / 171 | 13 / 8 | 235.6 / 276.1 ms |
| 7961 | 170 / 174 | 18 / 12 | 256.8 / 348.2 ms |
| 15880 | 167 / 171 | 13 / 9 | 247.7 / 279.4 ms |

Across the three 400-piece seeds, weight 4 raised Extreme's attacks from 32 to 44 and reduced Beginner's from 38 to 29, but Extreme cleared six fewer lines and Beginner cleared eleven more. This did not produce decisive wins, so the experiment does not justify changing the default strategy.

## Historical four-level matchup smoke test — before root garbage projection

Run on 2026-11-07 with `npm.cmd run benchmark -- --seeds 1 --pieces 60`. This covers every configured level against Beginner and/or Intermediate, excluding same-level mirror matches. All six matchups reached the 60-piece cap as draws; there were no planner errors or time-budget overruns.

| Agent | Opponent | Lines (agent / opponent) | Attacks (agent / opponent) | Mean / max agent decision |
|---|---|---:|---:|---:|
| Beginner | Intermediate | 24 / 23 | 1 / 1 | 6.3 / 18.1 ms |
| Intermediate | Beginner | 24 / 24 | 2 / 2 | 8.5 / 10.6 ms |
| Advanced | Beginner | 24 / 24 | 1 / 1 | 20.8 / 48.4 ms |
| Advanced | Intermediate | 24 / 24 | 1 / 1 | 43.9 / 48.5 ms |
| Extreme | Beginner | 26 / 26 | 3 / 3 | 219.0 / 244.1 ms |
| Extreme | Intermediate | 24 / 23 | 2 / 1 | 216.0 / 234.3 ms |

This short run confirms every profile could finish its plans and used distinctly different computation. It was a smoke test only: one seed, a 60-piece cap and no decisive results. Current results below replace it.

## Historical four-level matchup smoke test — before complete-layer preservation

Run on 2026-11-07 with `npm.cmd run benchmark -- --seeds 1 --pieces 60`, after adding root garbage projection. This covers every configured level against Beginner and/or Intermediate, excluding same-level mirror matches. All six matchups reached the 60-piece cap as draws; there were no planner errors or time-budget overruns.

| Agent | Opponent | Lines (agent / opponent) | Attacks (agent / opponent) | Mean / max agent decision |
|---|---|---:|---:|---:|
| Beginner | Intermediate | 24 / 23 | 1 / 1 | 6.2 / 17.8 ms |
| Intermediate | Beginner | 26 / 24 | 1 / 3 | 8.8 / 13.4 ms |
| Advanced | Beginner | 24 / 24 | 1 / 1 | 19.2 / 47.7 ms |
| Advanced | Intermediate | 24 / 24 | 1 / 1 | 43.5 / 47.9 ms |
| Extreme | Beginner | 26 / 26 | 3 / 3 | 222.3 / 242.3 ms |
| Extreme | Intermediate | 24 / 23 | 2 / 1 | 218.8 / 235.6 ms |

This short run confirms every profile can finish its plans and uses distinctly different computation. It is a smoke test only: one seed, a 60-piece cap and no decisive results.

## Current smoke tests — after complete-layer preservation

Run with `node scripts/benchmark.mjs --agent extreme --opponent beginner --seeds 3 --pieces 120`: all three games drew at the cap. The agent reported no planning errors or budget overruns; mean decision times were 209.6, 247.0 and 253.6 ms, with maxima of 281.4, 276.1 and 273.1 ms.

Run with `node scripts/benchmark.mjs --seeds 1 --pieces 60`: all six configured cross-level matchups drew at the cap. Each profile completed its plans with zero errors and zero budget overruns.

| Agent | Opponent | Lines (agent / opponent) | Attacks (agent / opponent) | Mean / max agent decision |
|---|---|---:|---:|---:|
| Beginner | Intermediate | 24 / 23 | 1 / 1 | 6.4 / 18.3 ms |
| Intermediate | Beginner | 26 / 24 | 1 / 3 | 8.8 / 14.1 ms |
| Advanced | Beginner | 24 / 24 | 1 / 1 | 20.3 / 47.3 ms |
| Advanced | Intermediate | 24 / 24 | 1 / 1 | 43.5 / 49.1 ms |
| Extreme | Beginner | 26 / 26 | 3 / 3 | 224.7 / 265.1 ms |
| Extreme | Intermediate | 24 / 23 | 2 / 1 | 217.0 / 235.4 ms |

## Latest smoke run — 2026-11-08

Fresh run after the browser renderer fix: `node scripts/benchmark.mjs --seeds 1 --pieces 60`. All six cross-level matchups reached the 60-round cap: **0 wins, 0 losses, 6 draws**. Both agents completed all 60 placements in every matchup; there were zero planner errors and zero decision-budget overruns.

| Agent | Opponent | Lines (agent / opponent) | Mean / max agent decision | Errors / overruns |
|---|---|---:|---:|---:|
| Beginner | Intermediate | 24 / 23 | 12.9 / 35.9 ms | 0 / 0 |
| Intermediate | Beginner | 26 / 24 | 21.0 / 30.2 ms | 0 / 0 |
| Advanced | Beginner | 24 / 24 | 46.3 / 52.0 ms | 0 / 0 |
| Advanced | Intermediate | 24 / 24 | 45.3 / 54.7 ms | 0 / 0 |
| Extreme | Beginner | 26 / 26 | 231.0 / 256.3 ms | 0 / 0 |
| Extreme | Intermediate | 24 / 23 | 230.2 / 265.8 ms | 0 / 0 |

This is a functional smoke sample on one seed with a 60-round cap. It confirms the profiles complete bounded plans; it does not establish a win rate or a strength advantage.

## Extreme board-shape evaluation experiment — 2026-11-08

Advanced and Extreme gained hole-depth and row/column transition terms, calculated with a precomputed popcount table. Beginner and Intermediate retained the previous scoring terms. A three-seed Extreme-versus-Beginner run used:

```powershell
npm.cmd run benchmark -- --agent extreme --opponent beginner --seeds 3 --pieces 120
```

All three games reached the 120-round cap as draws, with no planner errors or budget overruns. Extreme cleared five more lines across the sample, but sent five attacks versus Beginner's ten. Mean decision times were 260.2–290.1 ms, with a maximum of 365.5 ms.

| Seed | Extreme / Beginner lines | Extreme / Beginner attacks | Extreme mean / max decision |
|---:|---:|---:|---:|
| 42 | 51 / 46 | 1 / 6 | 260.2 / 330.9 ms |
| 7961 | 49 / 50 | 3 / 2 | 262.7 / 365.5 ms |
| 15880 | 49 / 48 | 1 / 2 | 290.1 / 358.2 ms |

The same seeds and horizon with `--attack-weight 4` also drew all three games without errors or budget overruns. Extreme sent 19 attacks to Beginner's 12, but cleared one fewer line overall; decision means were 290.6–316.6 ms and the maximum was 348.8 ms. Neither sample produced a decisive result, so the default attack weight remains 1.7. These short runs do not establish a higher win rate; the added signals increase search cost and need broader evaluation before being treated as a strength gain.

## Symmetric-round benchmark - 2026-11-08

The benchmark now calculates both plans from the same pre-round states, executes both placements, then enqueues attacks for both sides. This follows the live coordinator's simultaneous-lock behavior and removes the earlier first-seat delivery advantage.

Run:

```powershell
node scripts/benchmark.mjs --agent extreme --opponent beginner --seeds 3 --pieces 120
```

All three seeds reached the 120-round cap as draws. Each side completed 120 pieces per seed. Extreme cleared 149 lines across the sample versus Beginner's 146, and sent 8 attacks versus 10. Extreme recorded zero planner errors and zero budget overruns; decision means were 257.9-301.1 ms and the maximum was 387.1 ms.

| Seed | Result | Extreme / Beginner lines | Extreme / Beginner attacks | Extreme mean / max decision |
|---:|---|---:|---:|---:|
| 42 | Draw | 51 / 46 | 1 / 6 | 257.9 / 317.7 ms |
| 7961 | Draw | 49 / 50 | 3 / 2 | 301.1 / 327.0 ms |
| 15880 | Draw | 49 / 50 | 4 / 2 | 294.6 / 387.1 ms |

This corrected sample does not establish a win-rate advantage. It confirms that the symmetric benchmark completes all planned decisions within budget for these seeds and horizon.

## Random-policy baseline - 2026-11-08

Command:

```powershell
node scripts/benchmark.mjs --agent extreme --opponent random --seeds 3 --pieces 120
```

The baseline selects a pseudo-random reachable landing from the current board, active piece and five visible previews. The hash is deterministic and does not inspect hidden future pieces. Both sides plan from the same pre-round snapshot and attacks are enqueued after both locks.

Extreme won all three seeds: 24/23, 15/14 and 19/18 placements before the random baseline topped out. Extreme cleared 9, 5 and 6 lines respectively; Random cleared none. There were zero agent/opponent planning errors and zero Extreme budget overruns. Extreme mean/max decision times were 128.2/240.5 ms, 278.1/318.5 ms and 316.7/366.8 ms.

This confirms performance against a deliberately weak random-placement baseline. It does not establish strength against humans or competitive Tetris agents, and the three-seed sample is small.

## Ten-seed level check against Random - 2026-11-08

Command pattern:

```powershell
node scripts/benchmark.mjs --agent LEVEL --opponent random --seeds 10 --pieces 300
```

All four levels won all 10 seeds against the deterministic random-placement baseline. Random cleared zero lines in every game and topped out after an average of 20-22 placements. The matchups had zero planner errors and zero agent budget overruns.

| Level | Wins | Mean placements to result | Mean lines | Mean attacks | Mean / max decision time |
|---|---:|---:|---:|---:|---:|
| Beginner | 10 / 10 | 21.1 | 6.8 | 0.4 | 8.1 / 29.9 ms |
| Intermediate | 10 / 10 | 21.8 | 7.7 | 0.6 | 12.1 / 45.4 ms |
| Advanced | 10 / 10 | 21.3 | 7.6 | 0.6 | 26.4 / 59.6 ms |
| Extreme | 10 / 10 | 20.0 | 6.9 | 0.7 | 239.5 / 329.6 ms |

This is a useful sanity check that every profile beats a weak legal baseline. It does not distinguish skill between the four levels: the random baseline loses quickly, and the sample says nothing about performance against humans or stronger agents.

## Offensive-weight experiment with symmetric rounds - 2026-11-08

Using the same three seeds and 120-round cap for Extreme vs Beginner, the default attack weight (1.7) drew 3/3 with 149/146 total lines and 8/10 total attacks (Extreme/Beginner). Weight 4 drew 3/3 with 152/156 lines and 20/11 attacks; weight 8 drew 3/3 with 153/155 lines and 19/13 attacks. All runs had zero planner errors and budget overruns; the highest Extreme decision time was 431.9 ms, within the 520 ms target.

Higher weights increased outgoing attacks but did not create wins, reduce the opponent's lines or consistently improve survival in this short sample. The default remains 1.7 pending broader tournament evidence.

## Cross-level symmetric smoke - 2026-11-08

Command:

```powershell
node scripts/benchmark.mjs --seeds 1 --pieces 60
```

All six configured pairings ran with the corrected simultaneous round scheduling. Every matchup reached the 60-round cap as a draw, with zero planner errors and zero Extreme budget overruns.

| Agent | Opponent | Result | Lines | Attacks | Agent mean / max |
|---|---|---|---:|---:|---:|
| Beginner | Intermediate | Draw | 24 / 23 | 1 / 1 | 11.6 / 37.2 ms |
| Intermediate | Beginner | Draw | 23 / 24 | 1 / 1 | 18.8 / 30.7 ms |
| Advanced | Beginner | Draw | 24 / 24 | 1 / 1 | 57.0 / 65.9 ms |
| Advanced | Intermediate | Draw | 24 / 24 | 2 / 1 | 47.5 / 59.9 ms |
| Extreme | Beginner | Draw | 24 / 23 | 0 / 3 | 259.0 / 325.5 ms |
| Extreme | Intermediate | Draw | 23 / 23 | 0 / 0 | 266.6 / 301.7 ms |

This is a one-seed functional cross-level smoke, not a strength estimate. The longer three-seed Extreme/Beginner run is reported above.

## First-future T-spin lookahead with parent-pointer BFS - 2026-11-08

Advanced and Extreme add physically reachable SRS T-spin landings for the first future T piece; later future placements keep the geometric hard-drop approximation. The T-spin BFS now stores parent indices and reconstructs action paths only for valid spin landings, avoiding a path-array copy for every visited state. A test executes a generated route through the engine and confirms its T-spin classification.

The optimized version ran the same three 120-round Extreme-vs-Beginner seeds. All games drew, with zero planning errors and zero budget overruns. Extreme cleared 149 lines versus Beginner's 147 and sent 9 attacks versus 10.

| Seed | Result | Extreme / Beginner lines | Extreme / Beginner attacks | Extreme mean / max decision |
|---:|---|---:|---:|---:|
| 42 | Draw | 51 / 46 | 1 / 6 | 175.9 / 495.1 ms |
| 7961 | Draw | 49 / 51 | 4 / 2 | 174.3 / 496.0 ms |
| 15880 | Draw | 49 / 50 | 4 / 2 | 165.8 / 484.7 ms |

Mean Extreme decision time was 172.0 ms, down from 316.7 ms in the earlier path-copying run on the same host. The maximum was 496.0 ms under the 520 ms budget. It retained similar lines and attacks and did not change the outcome: these samples do not show a win-rate gain.

## Repeat verification - 2026-11-08

Re-ran `node scripts/benchmark.mjs --agent extreme --opponent beginner --seeds 3 --pieces 120` after the final local build and test pass. The corrected symmetric schedule again produced **three capped draws**, zero planner errors and zero reported budget overruns. Extreme cleared 152 lines to Beginner's 141 and sent 2 attacks to 12. Mean Extreme decision time was 233.0 ms; the slowest decision was 511.9 ms against the 520 ms target.

| Seed | Result | Extreme / Beginner lines | Extreme / Beginner attacks | Extreme mean / max decision |
|---:|---|---:|---:|---:|
| 42 | Draw | 52 / 47 | 0 / 6 | 181.4 / 500.2 ms |
| 7961 | Draw | 51 / 46 | 1 / 4 | 269.0 / 501.5 ms |
| 15880 | Draw | 49 / 48 | 1 / 2 | 248.6 / 511.9 ms |

The slightly different decisions and aggregate from the previous run are expected: seeds reproduce piece and garbage streams, while wall-clock search cutoffs can change plans with system load. This remains a small self-play sample and shows parity through the piece cap, not a decisive Extreme advantage.
