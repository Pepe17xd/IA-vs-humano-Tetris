import test from 'node:test';
import assert from 'node:assert/strict';
import { action, createGame } from '../src/game.js';
import { bindCurrentWorker } from '../src/worker-guard.js';

test('AI worker returns its calculated plan with the original request id', async () => {
  const messages = [];
  globalThis.self = { postMessage: message => messages.push(message), onmessage: null };
  await import('../src/ai-worker.js?error-test');
  const game = createGame(81);
  self.onmessage({ data: {
    state: { board: game.board, current: game.current, queue: game.queue.slice(0, 5), hold: game.hold,
      canHold: game.canHold, incoming: game.incoming, combo: game.combo, backToBack: true },
    difficulty: 'beginner', requestId: 902,
  } });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].requestId, 902);
  assert.ok(messages[0].move);
  assert.equal(messages[0].difficulty, 'beginner');
  const simulated = createGame(81);
  for (const command of messages[0].move.path) {
    const result = action(simulated, command);
    assert.ok(result.moved || result.locked, `${command} should be legal`);
  }
  assert.equal(simulated.pieces, 1);
  delete globalThis.self;
});

test('AI worker reports planner exceptions with the matching request id', async () => {
  const messages = [];
  globalThis.self = { postMessage: message => messages.push(message), onmessage: null };
  await import('../src/ai-worker.js?exception-test');
  self.onmessage({ data: { state: { current: null, queue: [] }, difficulty: 'extreme', requestId: 903 } });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].requestId, 903);
  assert.match(messages[0].error, /kind/);
  assert.equal(messages[0].move, undefined);
  delete globalThis.self;
});

test('late worker messages and failures from a prior match are ignored', () => {
  const oldWorker = {}, currentWorker = {}, oldMatch = {}, currentMatch = {};
  const effects = [];
  bindCurrentWorker(oldWorker,oldMatch,(match,w)=>match===currentMatch&&w===currentWorker,
    data=>effects.push(data),error=>effects.push(error));
  oldWorker.onmessage({data:{requestId:1,move:{}}});
  oldWorker.onerror({message:'late failure'});
  assert.deepEqual(effects,[]);
});

test('message processing and deserialization failures reach the recovery handler', () => {
  const worker={}, match={}, errors=[];
  bindCurrentWorker(worker,match,()=>true,()=>{throw new ReferenceError('active is not defined');},error=>errors.push(error));
  worker.onmessage({data:{requestId:1}});
  worker.onmessageerror();
  assert.match(errors[0],/active is not defined/);
  assert.match(errors[1],/respuesta/);
});
