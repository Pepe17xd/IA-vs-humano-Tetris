import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_SPEEDS, aiSpeed } from '../src/ai-speed.js';

test('execution pacing accelerates with difficulty without changing search settings',()=>{
  const ordered=['beginner','intermediate','advanced','extreme'].map(aiSpeed);
  assert.deepEqual(ordered.map(speed=>speed.stepMs),[650,300,110,15]);
  for(let i=1;i<ordered.length;i++) assert.ok(ordered[i].dropMs<ordered[i-1].dropMs);
  assert.equal(aiSpeed('unknown'),AI_SPEEDS.intermediate);
});
