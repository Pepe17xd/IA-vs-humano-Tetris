import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import { executePlanStep } from '../src/agent-executor.js';

test('stale target is rejected before a planned hard drop can lock the wrong placement',()=>{
  const game=createGame(71),piece={...game.current},move={kind:piece.kind,x:piece.x+1,rotation:piece.rotation};
  const step=executePlanStep(game,move,'hardDrop');
  assert.equal(step.retry,true);assert.equal(step.result,null);assert.deepEqual(game.current,piece);assert.equal(game.pieces,0);
});

test('an unreachable route step requests a fresh plan and a matching hard drop locks',()=>{
  const game=createGame(72);game.current={kind:'O',rotation:0,x:3,y:20};
  const move={kind:'O',x:3,rotation:0};
  const invalid=executePlanStep(game,move,'softDrop');
  assert.equal(invalid.retry,true);assert.equal(invalid.result.moved,false);assert.equal(game.pieces,0);
  const landing=executePlanStep(game,move,'hardDrop');
  assert.equal(landing.retry,false);assert.equal(landing.result.locked,true);assert.equal(game.pieces,1);
});
