import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBenchmarkWinner } from '../../scripts/benchmark-result.mjs';

test('benchmark errors are not counted as competitive results',()=>{
  assert.equal(classifyBenchmarkWinner(false,true,1,0),'error');
  assert.equal(classifyBenchmarkWinner(true,false,0,1),'error');
});

test('benchmark classifies ordinary wins and simultaneous survival correctly',()=>{
  assert.equal(classifyBenchmarkWinner(true,false),'agent');
  assert.equal(classifyBenchmarkWinner(false,true),'opponent');
  assert.equal(classifyBenchmarkWinner(true,true),'draw');
});
