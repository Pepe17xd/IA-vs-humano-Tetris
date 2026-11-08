# Production static preview smoke

Build the static artifact with `npm.cmd run build`, then serve only `dist/`:

```powershell
node scripts/serve.mjs dist 4174
```

On 2026-11-08, Chrome opened `http://127.0.0.1:4174/`, loaded the built app and engine modules with HTTP 200, started a seeded Beginner match, and received a live one-ply/132-node Worker decision. Five Space hard-drop inputs increased the human score from 40 to 128 while the match continued. No failed network requests or uncaught JavaScript exceptions were observed.

This confirms the built static artifact can start and play a live match locally. It does not verify deployment through a remote CDN or GitHub Pages.

After the first-future T-spin change, the rebuilt static artifact was rechecked in Chrome on an Extreme match with seed 42. The Worker returned a live six-ply/20,772-node plan in 72.6 ms; two board canvases rendered, and no failed requests or uncaught exceptions were observed. This is one browser decision, not a hardware-independent timing guarantee.

After the parent-pointer BFS optimization, the built Extreme Worker returned a live 5-ply, 16,452-node decision in 130.5 ms on seed 42; both canvases rendered, with no uncaught exceptions or failed requests. The selected move used the empty hold branch, so the measured search completed five plies.
