import { CELLS, HEIGHT, WIDTH, applyGarbageRows, collides, rotationCandidate, ghostY } from './game.js';

export const DIFFICULTIES = {
  beginner: { label: 'PRINCIPIANTE', depth: 1, beam: 8, budgetMs: 85, nodeLimit: 2_800, counterplay: .18, weights: { aggregate: .42, holes: 3.7, bump: .32, height: .18, lines: 7.2, attack: .25, wells: .2, garbage: .6 } },
  intermediate: { label: 'INTERMEDIO', depth: 2, beam: 20, budgetMs: 150, nodeLimit: 9_000, counterplay: .32, weights: { aggregate: .40, holes: 2.8, bump: .28, height: .14, lines: 8.0, attack: .65, wells: .35, garbage: .8 } },
  advanced: { label: 'AVANZADO', depth: 3, beam: 42, budgetMs: 280, nodeLimit: 20_000, counterplay: .55, weights: { aggregate: .36, holes: 2.35, holeDepth: .12, rowTransitions: .15, columnTransitions: .18, bump: .25, height: .17, lines: 8.6, attack: 1.15, wells: .48, garbage: 1.35 } },
  extreme: { label: 'EXTREMO', depth: 6, beam: 120, budgetMs: 520, nodeLimit: 90_000, counterplay: .9, weights: { aggregate: .33, holes: 2.0, holeDepth: .2, rowTransitions: .24, columnTransitions: .3, bump: .22, height: .23, lines: 9.2, attack: 1.7, wells: .62, garbage: 2.1 } },
};

const ROW_MASK = (1 << WIDTH) - 1;
const POPCOUNT = Uint8Array.from({ length: ROW_MASK + 1 }, (_, mask) => {
  let count = 0;
  for (let bits = mask; bits; bits &= bits - 1) count++;
  return count;
});

export function estimateOpponentThreat(opponent = {}) {
  const board = opponent.board || [];
  let highest = board.length;
  for (let y = 0; y < board.length; y++) {
    if (board[y]) { highest = y; break; }
  }
  const maxHeight = highest === board.length ? 0 : board.length - highest;
  const stackThreat = Math.max(0, Math.min(1, (maxHeight - 2) / 8));
  const garbageThreat = Math.max(0, Math.min(1, (Number(opponent.incoming) || 0) / 6)) * .55;
  return Math.max(stackThreat, garbageThreat);
}

export function findPlacements(board, active, reachable = false) {
  const found = new Map();
  if (reachable) {
    const start = { x: active.x, y: active.y, rotation: active.rotation, path: [], rotated: false };
    const queue = [start], seen = new Set([`${start.x},${start.y},${start.rotation},0`]);
    const actions = [
      ['left', -1], ['right', 1], ['softDrop', 0], ['rotateCW', 2], ['rotateCCW', 3],
    ];
    for (let index = 0; index < queue.length && index < 950; index++) {
      const node = queue[index];
      const y = ghostY({ board, current: { ...active, ...node } });
      const key = `${node.x},${y},${node.rotation},${node.rotated?1:0}`;
      if (!found.has(key)) found.set(key, { x: node.x, y, rotation: node.rotation, path: node.path, spun: node.rotated });
      for (const [name, code] of actions) {
        let next;
        if (code === -1 || code === 1) {
          next = { ...node, x: node.x + code, rotated: false };
          if (collides(board, active.kind, next.rotation, next.x, next.y)) continue;
        } else if (code === 0) {
          next = { ...node, y: node.y + 1, rotated: false };
          if (collides(board, active.kind, next.rotation, next.x, next.y)) continue;
        } else {
          const rotated = rotationCandidate(board, active.kind, node.rotation, node.x, node.y, code === 2 ? 1 : -1);
          if (!rotated) continue;
          next = { ...node, ...rotated, rotated: true };
        }
        const stateKey = `${next.x},${next.y},${next.rotation},${next.rotated?1:0}`;
        if (seen.has(stateKey)) continue;
        seen.add(stateKey); next.path = [...node.path, name]; queue.push(next);
      }
    }
    return [...found.values()];
  }
  for (let rotation = 0; rotation < 4; rotation++) {
    for (let x = -2; x < WIDTH; x++) {
      const y = ghostY({ board, current: { kind: active.kind, rotation, x, y: 0 } });
      if (y === 0 && collides(board, active.kind, rotation, x, 0)) continue;
      if (collides(board, active.kind, rotation, x, y)) continue;
      const key = `${x},${y},${rotation}`;
      if (!found.has(key)) found.set(key, { x, y, rotation, path: [], spun: false });
    }
  }
  return [...found.values()];
}

function tSpinTypeAt(board, kind, placement) {
  if (kind !== 'T') return null;
  const cx = placement.x + 1, cy = placement.y + 1;
  const occupied = (x,y) => x < 0 || x >= WIDTH || y >= HEIGHT || (y >= 0 && !!(board[y] & (1 << x)));
  const corners = [[cx-1,cy-1],[cx+1,cy-1],[cx-1,cy+1],[cx+1,cy+1]];
  if (corners.filter(([x,y]) => occupied(x,y)).length < 3) return null;
  const front = placement.rotation === 0 ? [corners[0],corners[1]]
    : placement.rotation === 1 ? [corners[1],corners[3]]
    : placement.rotation === 2 ? [corners[2],corners[3]] : [corners[0],corners[2]];
  return front.every(([x,y]) => occupied(x,y)) ? 'full' : 'mini';
}

function findReachableTSpins(board) {
  const start = { kind: 'T', x: 3, y: 0, rotation: 0, rotated: false, parent: -1, action: null };
  if (collides(board, start.kind, start.rotation, start.x, start.y)) return [];
  const queue = [start], found = new Map();
  const seen = new Set([`${start.x},${start.y},${start.rotation},0`]);
  const actions = [['left',-1],['right',1],['softDrop',0],['rotateCW',2],['rotateCCW',3]];
  for (let index = 0; index < queue.length && index < 950; index++) {
    const node = queue[index];
    if (node.rotated) {
      const y = ghostY({ board, current: node });
      const placement = { x: node.x, y, rotation: node.rotation };
      const key = `${placement.x},${placement.y},${placement.rotation}`;
      if (y >= 2 && !found.has(key) && tSpinTypeAt(board, 'T', placement)) {
        const path = [];
        let cursor = node;
        while (cursor.parent >= 0) {
          path.push(cursor.action);
          cursor = queue[cursor.parent];
        }
        path.reverse();
        found.set(key, { ...placement, path, spun: true });
      }
    }
    for (const [name,code] of actions) {
      let next;
      if (code === -1 || code === 1) {
        next = { ...node, x: node.x + code, rotated: false };
        if (collides(board, 'T', next.rotation, next.x, next.y)) continue;
      } else if (code === 0) {
        next = { ...node, y: node.y + 1, rotated: false };
        if (collides(board, 'T', next.rotation, next.x, next.y)) continue;
      } else {
        const rotated = rotationCandidate(board, 'T', node.rotation, node.x, node.y, code === 2 ? 1 : -1);
        if (!rotated) continue;
        next = { ...node, ...rotated, rotated: true };
      }
      const key = `${next.x},${next.y},${next.rotation},${next.rotated?1:0}`;
      if (seen.has(key)) continue;
      seen.add(key); next.parent = index; next.action = name; queue.push(next);
    }
  }
  return [...found.values()];
}

function dropBoard(board, active, placement) {
  const next = board.slice();
  const cells = CELLS[active.kind][placement.rotation];
  const spin = placement.spun ? tSpinTypeAt(board, active.kind, placement) : null;
  for (const [dx,dy] of cells) {
    const y = placement.y + dy;
    if (y < 2 || y >= HEIGHT) return null;
    next[y] |= 1 << (placement.x + dx);
  }
  const full = (1 << WIDTH) - 1;
  const remaining = next.filter(row => row !== full);
  const cleared = HEIGHT - remaining.length;
  return { board: [...Array.from({ length: cleared }, () => 0), ...remaining], cleared, spin };
}

export function evaluateBoard(board, cleared, incoming, weights, combo = 0, spin = null, backToBack = false) {
  const heights = Array(WIDTH).fill(0);
  let holes = 0, holeDepth = 0, aggregate = 0, wells = 0, hidden = 0;
  for (let x = 0; x < WIDTH; x++) {
    let first = HEIGHT;
    for (let y = 0; y < HEIGHT; y++) if (board[y] & (1 << x)) { first = y; break; }
    heights[x] = first === HEIGHT ? 0 : HEIGHT - first;
    aggregate += heights[x];
    if (first < HEIGHT) for (let y = first; y < HEIGHT; y++) if (!(board[y] & (1 << x))) { holes++; holeDepth += y - first; }
    for (let y = 0; y < 2; y++) if (board[y] & (1 << x)) hidden++;
  }
  let rowTransitions = 0, columnTransitions = 0;
  for (let y = 0; y < HEIGHT; y++) {
    const row = board[y] & ROW_MASK;
    const leftNeighbors = ((row << 1) | 1) & ROW_MASK;
    rowTransitions += POPCOUNT[row ^ leftNeighbors] + ((row & (1 << (WIDTH - 1))) ? 0 : 1);
    const above = y ? board[y - 1] & ROW_MASK : ROW_MASK;
    columnTransitions += POPCOUNT[row ^ above];
  }
  columnTransitions += POPCOUNT[ROW_MASK ^ (board[HEIGHT - 1] & ROW_MASK)];
  let bump = 0;
  for (let x = 0; x < WIDTH - 1; x++) bump += Math.abs(heights[x] - heights[x+1]);
  for (let x = 0; x < WIDTH; x++) {
    const left = x === 0 ? HEIGHT : heights[x-1];
    const right = x === WIDTH - 1 ? HEIGHT : heights[x+1];
    const depth = Math.min(left, right) - heights[x];
    if (depth > 0) wells += depth * (depth + 1) / 2;
  }
  const attack = attackPotential(cleared, spin, backToBack, combo);
  return weights.lines * cleared + weights.attack * attack
    + weights.garbage * Math.min(incoming, attack)
    + (cleared ? Math.min(combo, 5) * .28 : 0) - weights.aggregate * aggregate - weights.holes * holes
    - (weights.holeDepth || 0) * holeDepth - (weights.rowTransitions || 0) * rowTransitions
    - (weights.columnTransitions || 0) * columnTransitions - weights.bump * bump
    - weights.height * Math.max(...heights) - weights.wells * wells - hidden * 22;
}

function attackPotential(cleared, spin, backToBack, combo) {
  const normal = [0,0,1,2,4][cleared] || 0;
  const spun = spin === 'full' ? [0,2,4,6][cleared] || 0
    : spin === 'mini' ? [0,0,1,2][cleared] || 0 : normal;
  const difficult = cleared === 4 || (spin && cleared > 0);
  const comboBonus = combo > 1 ? Math.floor((combo - 1) / 2) : 0;
  return Math.max(0, (spin ? spun : normal) + (difficult && backToBack ? 1 : 0) + comboBonus);
}

export function findFuturePlacements(board, kind, includeReachableSpins = true) {
  const active = { kind, x: 3, y: 0, rotation: 0 };
  const placements = findPlacements(board, active, false);
  if (kind !== 'T' || !includeReachableSpins) return placements;
  placements.push(...findReachableTSpins(board));
  return placements;
}

export function planMove(state, difficulty = 'intermediate', requestId = 0) {
  const config = DIFFICULTIES[difficulty] || DIFFICULTIES.intermediate;
  const opponentThreat = estimateOpponentThreat(state.opponent);
  const weights = { ...config.weights, attack: config.weights.attack * (1 + config.counterplay * 4 * opponentThreat) };
  const started = performance.now();
  const rankingReserveMs = Math.min(25, config.budgetMs * .05);
  const searchDeadline = started + config.budgetMs - rankingReserveMs;
  const current = state.current;
  const incoming = Array.isArray(state.incoming) ? state.incoming : [];
  const existingBackToBack = Boolean(state.backToBack);
  const branches = [{ kind: current.kind, useHold: false, queue: state.queue.slice(), prefix: [] }];
  if (state.canHold) {
    if (state.hold) branches.push({ kind: state.hold, useHold: true, queue: state.queue.slice(), prefix: ['hold'] });
    else if (state.queue.length) branches.push({ kind: state.queue[0], useHold: true, queue: state.queue.slice(1), prefix: ['hold'] });
  }
  const root = [];
  for (const branch of branches) {
    const active = branch.useHold ? { kind: branch.kind, rotation: 0, x: 3, y: 0 } : { ...current };
    for (const placement of findPlacements(state.board, active, true)) {
      const result = dropBoard(state.board, active, placement);
      if (!result) continue;
      const combo = result.cleared ? state.combo + 1 : -1;
      const backToBack = result.cleared ? (result.cleared === 4 || (result.spin && result.cleared > 0)) : existingBackToBack;
      const attack = attackPotential(result.cleared, result.spin, existingBackToBack, combo);
      const pendingHoles = incoming.slice(Math.min(attack, incoming.length));
      const projected = applyGarbageRows(result.board, pendingHoles);
      if (projected.topOut) continue;
      root.push({ ...result, lookahead: branch.queue,
        board: projected.board, combo, backToBack,
        score: evaluateBoard(projected.board, result.cleared, incoming.length, weights,
          combo, result.spin, existingBackToBack),
        first: { kind: branch.kind, useHold: branch.useHold, rotation: placement.rotation, x: placement.x, y: placement.y, path: [...branch.prefix, ...placement.path, 'hardDrop'] } });
    }
  }
  root.sort((a,b) => b.score - a.score);
  let nodes = root.length, depth = 1;
  let beam = config.depth > 1 ? root.slice(0, config.beam) : root.slice();
  while (depth < config.depth && beam.some(node => node.lookahead.length >= depth)
      && nodes < config.nodeLimit && performance.now() < searchDeadline) {
    const expanded = [];
    let exhausted = false;
    for (const node of beam) {
      const kind = node.lookahead[depth - 1];
      if (!kind) continue;
      const includeTSpins = config.depth >= 3 && depth === 1;
      for (const placement of findFuturePlacements(node.board, kind, includeTSpins)) {
        if (nodes >= config.nodeLimit || performance.now() >= searchDeadline) { exhausted = true; break; }
        const result = dropBoard(node.board, { kind }, placement);
        nodes++;
        if (!result) continue;
        const combo = result.cleared ? node.combo + 1 : -1;
        const backToBack = result.cleared ? (result.cleared === 4 || (result.spin && result.cleared > 0)) : node.backToBack;
        expanded.push({ ...result, lookahead: node.lookahead,
          combo, backToBack,
          score: node.score + evaluateBoard(result.board, result.cleared, 0, weights,
            combo, result.spin, node.backToBack) * (0.82 ** depth),
          first: node.first });
      }
      if (exhausted) break;
    }
    // A partial layer favors whichever parent happened to be expanded first.
    // Keep the last complete layer when a time or node limit interrupts it.
    if (exhausted || !expanded.length) break;
    expanded.sort((a,b) => b.score - a.score);
    const unique = new Set(), nextBeam = [];
    for (const item of expanded) {
      const key = item.board.join(',') + '|' + item.first.kind + '|' + item.first.useHold + '|' + item.first.rotation + '|' + item.first.x;
      if (unique.has(key)) continue;
      unique.add(key); nextBeam.push(item);
      if (nextBeam.length >= config.beam) break;
    }
    beam = nextBeam;
    depth++;
  }
  const decisionMs = performance.now() - started;
  if (!root.length) return { requestId, move: null, candidates: [], depth: 0, nodes, decisionMs, difficulty, opponentThreat, attackWeight: weights.attack, reason: 'No hay colocaciones legales' };
  const byFirst = new Map();
  for (const node of beam) {
    const key = node.first.kind + '|' + node.first.useHold + '|' + node.first.rotation + '|' + node.first.x;
    const prior = byFirst.get(key);
    if (!prior || node.score > prior.score) byFirst.set(key, { ...node.first, score: node.score, depth, nodes });
  }
  let candidates = [...byFirst.values()];
  if (!candidates.length) candidates = root.map(node => ({ ...node.first, score: node.score, depth: 1, nodes }));
  candidates.sort((a,b) => b.score - a.score);
  const best = candidates[0], shown = candidates.slice(0, 28);
  return { requestId, move: best, candidates: shown, candidateCount: root.length,
    alternativesNotShown: Math.max(0, root.length - shown.length), depth, nodes, decisionMs, difficulty,
    opponentThreat, attackWeight: weights.attack, budgetMs: config.budgetMs };
}
