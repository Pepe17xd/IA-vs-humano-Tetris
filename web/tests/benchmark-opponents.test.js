import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, action } from '../src/game.js';
import { planRandomVisibleMove } from '../../scripts/benchmark-opponents.mjs';

test('random benchmark baseline is deterministic and returns a reachable legal route', () => {
  const game = createGame(404);
  const state = {
    board: game.board.slice(), current: { ...game.current }, queue: game.queue.slice(0, 5),
    hold: game.hold, canHold: game.canHold, incoming: game.incoming.slice(),
  };
  const first = planRandomVisibleMove(state), second = planRandomVisibleMove(state);
  assert.deepEqual(first.move, second.move);
  assert.ok(first.candidateCount > 0);
  for (const command of first.move.path) {
    const result = action(game, command);
    assert.ok(result.moved || result.locked, `${command} must be legal`);
  }
  assert.equal(game.pieces, 1);
});
