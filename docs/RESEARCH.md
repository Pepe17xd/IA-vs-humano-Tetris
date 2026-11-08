# Research notes — evidence versus hypothesis

## Officially documented
- TETRA CHANNEL REST API: https://tetr.io/about/api/ — public read-only data, respect cache headers, moderate request rate, `X-Session-ID` when appropriate. The **main game API is not permitted without explicit written consent**.
- Game rules: https://tetr.io/about/rules/ — consult before testing.

## Public research references (not integrated code)
- https://github.com/MinusKelvin/cold-clear — modern Tetris engine, MPL-2.0.
- https://github.com/RIKU0804/tetris-ai — Rust beam search + Python reference, MIT.
- https://github.com/Moriz82/tetriov2 — community description of screen/engine architecture; no input or bypass code reused.

## Mathematical model
Beam search approximates the best future sequence: maximize sum(gamma^t * heuristic(board_t, clears_t)). The heuristic uses aggregate column heights, holes, roughness, peak height and line clears. The reference implementation is intentionally simplified: no SRS kicks, hold, T-spins, garbage, combo or exact TETR.IO mechanics. It cannot claim expert play.

For human latency experiments, log(T) ~ Normal(log(median), sigma^2). This is a **synthetic illustrative model**, not a calibrated human baseline or an anticheat bypass. A research classifier requires appropriately consented, labeled data, held-out participants, confidence intervals and false-positive assessment. Public aggregate PPS/APM/VS alone cannot reveal private detection logic.

## Boundaries
Read-only TETR.IO capture; no injected code, automated game inputs, process tampering, evasion or hidden endpoint requests. Offline autonomous play is supported.
