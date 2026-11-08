import test from 'node:test';
import assert from 'node:assert/strict';
import { action, createGame } from '../src/game.js';

test('comparison worker calculates every level from the same request and returns real diagnostics', async () => {
  const messages=[];
  globalThis.self={postMessage:message=>messages.push(message),onmessage:null};
  await import('../src/ai-compare-worker.js?comparison-test');
  const game=createGame(3301);
  const state={board:game.board.slice(),current:{...game.current},queue:game.queue.slice(0,5),hold:game.hold,canHold:game.canHold,incoming:[],combo:game.combo,backToBack:game.backToBack,opponent:{board:Array.from({length:20},()=>0),incoming:0}};
  const frozenSnapshot=structuredClone(state);
  self.onmessage({data:{requestId:721,state}});
  assert.equal(messages.length,1);
  assert.equal(messages[0].requestId,721);
  assert.deepEqual(messages[0].results.map(result=>result.difficulty),['beginner','intermediate','advanced','extreme']);
  assert.deepEqual(state,frozenSnapshot,'planner evaluation must not mutate the shared snapshot');
  for(const result of messages[0].results){
    assert.ok(result.move,`${result.difficulty} finds a move`);
    assert.ok(result.nodes>0);
    assert.ok(result.depth>0);
    assert.ok(result.decisionMs>=0);
    const replay=createGame(3301);
    for(const command of result.move.path){
      const step=action(replay,command);
      assert.ok(step.moved||step.locked,`${result.difficulty} route command ${command} must be legal`);
    }
    assert.equal(replay.pieces,1,`${result.difficulty} route must complete one legal placement`);
  }
  delete globalThis.self;
});
