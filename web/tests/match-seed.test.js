import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, generateMatchSeed, matchWinner } from '../src/match.js';

test('generated seeds are valid and initialize equal, reproducible sequences', () => {
  for (const value of [0,0.12345,0.999999999]) {
    const seed=generateMatchSeed(()=>value);
    assert.ok(Number.isInteger(seed) && seed>=0 && seed<=0xffffffff);
    const match=createMatch(seed), replay=createMatch(seed);
    assert.equal(match.seed,match.aiSeed);
    assert.equal(match.human.current.kind,match.ai.current.kind);
    assert.deepEqual(match.human.queue,match.ai.queue);
    assert.deepEqual(match.human.queue,replay.human.queue);
  }
});

test('winner follows survival rather than score and handles draws', () => {
  assert.equal(matchWinner({alive:true,score:0},{alive:true,score:500}),null);
  assert.equal(matchWinner({alive:false,score:500},{alive:true,score:0}),'ai');
  assert.equal(matchWinner({alive:true},{alive:false}),'human');
  assert.equal(matchWinner({alive:false},{alive:false}),'draw');
});
