import { performance } from 'node:perf_hooks';
import { findPlacements } from '../web/src/agent.js';

function visibleStateHash(state) {
  const visible = JSON.stringify({
    board: state.board,
    current: state.current,
    queue: state.queue.slice(0, 5),
    hold: state.hold,
    canHold: state.canHold,
    incoming: state.incoming,
  });
  let hash = 2166136261;
  for (let index = 0; index < visible.length; index++) {
    hash ^= visible.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// A deterministic weak baseline: choose a pseudo-random reachable landing using only visible state.
export function planRandomVisibleMove(state) {
  const started = performance.now();
  const placements = state.current ? findPlacements(state.board, state.current, true) : [];
  if (!placements.length) {
    return { move: null, candidates: [], depth: 0, nodes: 0, decisionMs: performance.now() - started, difficulty: 'random' };
  }
  const selected = placements[visibleStateHash(state) % placements.length];
  return {
    move: { ...selected, path: [...selected.path, 'hardDrop'], useHold: false },
    candidates: [],
    candidateCount: placements.length,
    depth: 1,
    nodes: placements.length,
    decisionMs: performance.now() - started,
    difficulty: 'random',
  };
}
