export const WIDTH = 10;
export const VISIBLE_ROWS = 20;
export const HIDDEN_ROWS = 2;
export const HEIGHT = VISIBLE_ROWS + HIDDEN_ROWS;
export const PIECES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
export const EMPTY_BOARD = () => Array.from({ length: HEIGHT }, () => 0);

// SRS spawn matrices in a 4x4 box. Board y increases downward.
export const SHAPES = {
  I: [[0,1],[1,1],[2,1],[3,1]], O: [[1,0],[2,0],[1,1],[2,1]],
  T: [[1,0],[0,1],[1,1],[2,1]], S: [[1,0],[2,0],[0,1],[1,1]],
  Z: [[0,0],[1,0],[1,1],[2,1]], J: [[0,0],[0,1],[1,1],[2,1]], L: [[2,0],[0,1],[1,1],[2,1]],
};
export const CELLS = Object.fromEntries(PIECES.map(piece => [piece, Array.from({ length: 4 }, (_, rotation) => {
  if (piece === 'O') return SHAPES.O.map(([x,y]) => [x,y]);
  let cells = SHAPES[piece].map(([x,y]) => [x,y]);
  for (let turn = 0; turn < rotation; turn++) cells = cells.map(([x,y]) => [3-y,x]);
  return cells;
})]));

const JLSTZ = {
  '0>1': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]], '1>0': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '1>2': [[0,0],[1,0],[1,1],[0,-2],[1,-2]], '2>1': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '2>3': [[0,0],[1,0],[1,-1],[0,2],[1,2]], '3>2': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '3>0': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]], '0>3': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
};
const I_KICKS = {
  '0>1': [[0,0],[-2,0],[1,0],[-2,1],[1,-2]], '1>0': [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
  '1>2': [[0,0],[-1,0],[2,0],[-1,-2],[2,1]], '2>1': [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
  '2>3': [[0,0],[2,0],[-1,0],[2,-1],[-1,2]], '3>2': [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  '3>0': [[0,0],[1,0],[-2,0],[1,2],[-2,-1]], '0>3': [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
};
const cloneBoard = board => board.map(row => row >>> 0);

export function rngNext(state) {
  let x = state >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return x >>> 0 || 0x6d2b79f5;
}

export function makeRandom(seed) {
  return { state: (Number(seed) >>> 0) || 0x6d2b79f5, bag: [] };
}

export function drawPiece(random) {
  if (!random.bag.length) {
    random.bag = [...PIECES];
    for (let i = random.bag.length - 1; i > 0; i--) {
      random.state = rngNext(random.state);
      const j = random.state % (i + 1);
      [random.bag[i], random.bag[j]] = [random.bag[j], random.bag[i]];
    }
  }
  return random.bag.pop();
}

export function createGame(seed = 42) {
  const random = makeRandom(seed);
  const garbageRandom = makeRandom((Number(seed) ^ 0xa511e9b3) >>> 0);
  const queue = Array.from({ length: 6 }, () => drawPiece(random));
  const state = {
    board: EMPTY_BOARD(), colorBoard: Array.from({length: HEIGHT}, () => Array(WIDTH).fill(null)), random, garbageRandom, queue, current: null, hold: null, canHold: true,
    incoming: [], score: 0, lines: 0, pieces: 0, combo: -1, backToBack: false, attacksSent: 0,
    level: 1, alive: true, lastAction: 'spawn', gravityClock: 0, lockClock: 0, lockResets: 0,
    totalThinkMs: 0, decisionCount: 0,
  };
  spawn(state);
  return state;
}

export function spawn(state, piece = null) {
  const kind = piece || state.queue.shift();
  if (!piece) state.queue.push(drawPiece(state.random));
  state.current = { kind, rotation: 0, x: 3, y: 0 };
  state.canHold = true;
  state.lastAction = 'spawn'; state.gravityClock = 0; state.lockClock = 0; state.lockResets = 0;
  if (collides(state.board, kind, 0, 3, 0)) state.alive = false;
  return state.alive;
}

export function cellsAt(kind, rotation, x, y) {
  return CELLS[kind][rotation].map(([dx,dy]) => [x + dx, y + dy]);
}

export function collides(board, kind, rotation, x, y) {
  for (const [cx, cy] of cellsAt(kind, rotation, x, y)) {
    if (cx < 0 || cx >= WIDTH || cy >= HEIGHT) return true;
    if (cy >= 0 && (board[cy] & (1 << cx))) return true;
  }
  return false;
}

export function rotationCandidate(board, kind, rotation, x, y, direction) {
  const next = (rotation + (direction > 0 ? 1 : 3)) % 4;
  if (kind === 'O') return { rotation: next, x, y };
  const table = kind === 'I' ? I_KICKS : JLSTZ;
  for (const [dx,dyUp] of table[`${rotation}>${next}`]) {
    const candidate = { rotation: next, x: x + dx, y: y - dyUp };
    if (!collides(board, kind, next, candidate.x, candidate.y)) return candidate;
  }
  return null;
}

export function ghostY(state) {
  const p = state.current;
  if (!p) return 0;
  let y = p.y;
  while (!collides(state.board, p.kind, p.rotation, p.x, y + 1)) y++;
  return y;
}

export function rotatePiece(state, direction) {
  const p = state.current;
  if (!p || !state.alive) return false;
  const candidate = rotationCandidate(state.board, p.kind, p.rotation, p.x, p.y, direction);
  if (!candidate) return false;
  Object.assign(p, candidate); state.lastAction = 'rotate'; resetLock(state); return true;
}

function resetLock(state) {
  if (isGrounded(state) && state.lockResets < 15) {
    state.lockClock = 0; state.lockResets++;
  }
}

export function isGrounded(state) {
  const p = state.current;
  return !p || collides(state.board, p.kind, p.rotation, p.x, p.y + 1);
}

function tSpinType(state, p) {
  if (p.kind !== 'T' || state.lastAction !== 'rotate') return null;
  const cx = p.x + 1, cy = p.y + 1;
  const occupied = (x, y) => x < 0 || x >= WIDTH || y >= HEIGHT || (y >= 0 && !!(state.board[y] & (1 << x)));
  const corners = [[cx-1,cy-1],[cx+1,cy-1],[cx-1,cy+1],[cx+1,cy+1]];
  if (corners.filter(([x,y]) => occupied(x,y)).length < 3) return null;
  const front = p.rotation === 0 ? [corners[0],corners[1]] : p.rotation === 1 ? [corners[1],corners[3]] : p.rotation === 2 ? [corners[2],corners[3]] : [corners[0],corners[2]];
  return front.every(([x,y]) => occupied(x,y)) ? 'full' : 'mini';
}

function attackFor(cleared, spin, combo, backToBack) {
  const normal = [0,0,1,2,4][cleared] || Math.max(0, cleared - 1);
  const tspin = spin === 'full' ? [0,2,4,6][cleared] || 0 : spin === 'mini' ? [0,0,1,2][cleared] || 0 : normal;
  const difficult = cleared === 4 || (spin && cleared > 0);
  const comboBonus = combo > 1 ? Math.floor((combo - 1) / 2) : 0;
  return Math.max(0, (spin ? tspin : normal) + (difficult && backToBack ? 1 : 0) + comboBonus);
}

export function applyGarbageRows(board, holes) {
  const next = board.slice();
  let pushed = 0;
  // Apply the oldest queued hole first so it remains the lowest inserted row.
  for (let i = holes.length - 1; i >= 0; i--) {
    const hole = holes[i];
    if (next[0] !== 0) return { board: next, pushed, topOut: true };
    next.shift();
    next.push(((1 << WIDTH) - 1) ^ (1 << hole));
    pushed++;
  }
  return { board: next, pushed, topOut: false };
}

function pushGarbage(state, holes) {
  const result = applyGarbageRows(state.board, holes);
  state.board = result.board;
  if (state.colorBoard) for (let i = holes.length - 1; i >= holes.length - result.pushed; i--) { state.colorBoard.shift(); state.colorBoard.push(Array.from({length: WIDTH}, (_, x) => x === holes[i] ? null : 'garbage')); }
  if (result.topOut) state.alive = false;
  return result.pushed;
}

export function lockPiece(state) {
  if (!state.alive || !state.current) return { attack: 0, cleared: 0, locked: false };
  const p = state.current;
  const spin = tSpinType(state, p);
  const board = cloneBoard(state.board);
  const colorBoard = state.colorBoard?.map(row => row.slice());
  for (const [x,y] of cellsAt(p.kind, p.rotation, p.x, p.y)) {
    if (y < HIDDEN_ROWS || y < 0) { state.alive = false; return { attack: 0, cleared: 0, locked: false, topOut: true }; }
    board[y] |= 1 << x;
    if (colorBoard) colorBoard[y][x] = p.kind;
  }
  const full = (1 << WIDTH) - 1;
  const remaining = board.filter(row => row !== full);
  const cleared = HEIGHT - remaining.length;
  if (colorBoard) state.colorBoard = [...Array.from({length: cleared}, () => Array(WIDTH).fill(null)), ...colorBoard.filter((_, y) => board[y] !== full)];
  state.board = [...Array.from({ length: cleared }, () => 0), ...remaining];
  state.pieces++;
  const scoringLevel = state.level;
  const linePoints = [0,100,300,500,800][cleared] || cleared * 250;
  const spinPoints = spin === 'full' ? (cleared === 1 ? 800 : cleared === 2 ? 1200 : cleared >= 3 ? 1600 : 400)
    : spin === 'mini' ? (cleared === 1 ? 200 : 100) : 0;
  state.score += (linePoints + spinPoints) * scoringLevel;
  state.lines += cleared;
  state.level = 1 + Math.floor(state.lines / 10);
  state.combo = cleared ? state.combo + 1 : -1;
  if (cleared && state.combo > 0) state.score += 50 * state.combo * scoringLevel;
  const difficult = cleared === 4 || (spin && cleared > 0);
  const attack = attackFor(cleared, spin, state.combo, state.backToBack);
  if (difficult) state.backToBack = true;
  else if (cleared > 0) state.backToBack = false;
  let remainingAttack = attack;
  const canceled = Math.min(remainingAttack, state.incoming.length);
  state.incoming.splice(0, canceled); remainingAttack -= canceled;
  const receivedHoles = state.incoming.splice(0);
  const received = receivedHoles.length;
  if (received) pushGarbage(state, receivedHoles);
  state.attacksSent += remainingAttack;
  state.current = null;
  const spawned = state.alive && spawn(state);
  return { attack: remainingAttack, canceled, received, cleared, spin, perfectClear: state.board.every(row => row === 0), locked: true, spawned, topOut: !state.alive };
}

export function enqueueGarbage(state, count) {
  if (!state.alive) return;
  for (let i = 0; i < count; i++) {
    state.garbageRandom.state = rngNext(state.garbageRandom.state);
    state.incoming.push(state.garbageRandom.state % WIDTH);
  }
}

export function action(state, command) {
  if (!state.alive || !state.current) return { moved: false };
  const p = state.current;
  if (command === 'left' || command === 'right') {
    const dx = command === 'left' ? -1 : 1;
    if (collides(state.board, p.kind, p.rotation, p.x + dx, p.y)) return { moved: false };
    p.x += dx; state.lastAction = 'move'; resetLock(state); return { moved: true };
  }
  if (command === 'rotateCW' || command === 'rotateCCW') return { moved: rotatePiece(state, command === 'rotateCW' ? 1 : -1) };
  if (command === 'softDrop') {
    if (collides(state.board, p.kind, p.rotation, p.x, p.y + 1)) return { moved: false };
    p.y++; state.score++; state.lastAction = 'drop'; state.lockClock = 0; return { moved: true };
  }
  if (command === 'hardDrop') {
    const from = p.y; p.y = ghostY(state); state.score += (p.y - from) * 2;
    const result = lockPiece(state); result.moved = true; return result;
  }
  if (command === 'hold') {
    if (!state.canHold) return { moved: false };
    const held = state.hold; state.hold = p.kind; state.current = null; state.canHold = false;
    const piece = held || state.queue.shift();
    if (!held) state.queue.push(drawPiece(state.random));
    const ok = spawn(state, piece);
    state.canHold = false;
    return { moved: ok, held: true, topOut: !ok };
  }
  return { moved: false };
}

export function gravityInterval(level, gravityScale = 1) {
  const safeLevel = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  const scale = Number.isFinite(gravityScale) && gravityScale > 0 ? gravityScale : 1;
  return Math.max(65, 820 * (0.78 ** (safeLevel - 1)) / scale);
}

export function tick(state, deltaMs, softDrop = false, gravityScale = 1) {
  if (!state.alive || !state.current) return null;
  const p = state.current;
  state.gravityClock += deltaMs;
  const gravity = gravityInterval(state.level, gravityScale);
  while (state.gravityClock >= (softDrop ? 38 : gravity)) {
    state.gravityClock -= softDrop ? 38 : gravity;
    if (collides(state.board, p.kind, p.rotation, p.x, p.y + 1)) break;
    p.y++; state.lastAction = 'fall';
    if (softDrop) state.score++;
  }
  if (isGrounded(state)) {
    state.lockClock += deltaMs;
    if (state.lockClock >= 500) return lockPiece(state);
  } else state.lockClock = 0;
  return null;
}

export function serializeGame(state) {
  return structuredClone(state);
}

export function visibleRows(state) { return state.board.slice(HIDDEN_ROWS); }
