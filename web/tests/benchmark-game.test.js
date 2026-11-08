import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, visibleRows } from '../src/game.js';
import { playBenchmarkRound } from '../../scripts/benchmark-game.mjs';

function setupTSpinSingle(game) {
  game.board[19] = 1023 ^ (0b111 << 3);
  game.board[18] = (1 << 3) | (1 << 5);
  game.board[20] = 1 << 3;
  game.current = { kind: 'T', rotation: 0, x: 3, y: 18 };
  game.lastAction = 'rotate';
}

test('benchmark plans both sides from the same pre-round state and queues attacks symmetrically', () => {
  const first = createGame(101), second = createGame(202);
  setupTSpinSingle(first); setupTSpinSingle(second);
  const firstBoard = visibleRows(first), secondBoard = visibleRows(second);
  const inputs = [];
  const planner = state => {
    inputs.push(state);
    return { move: { path: ['hardDrop'] } };
  };

  const round = playBenchmarkRound(first, second, 'beginner', 'beginner', planner);

  assert.deepEqual(inputs[0].opponent.board, secondBoard);
  assert.deepEqual(inputs[1].opponent.board, firstBoard);
  assert.deepEqual(inputs.map(input => input.incoming), [[], []]);
  assert.equal(round.first.lock.attack, 2);
  assert.equal(round.second.lock.attack, 2);
  assert.equal(first.incoming.length, 2);
  assert.equal(second.incoming.length, 2);
  assert.equal(round.winner, null);
});
