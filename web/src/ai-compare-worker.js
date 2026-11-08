import { planMove } from './agent.js';

const LEVELS = ['beginner', 'intermediate', 'advanced', 'extreme'];

self.onmessage = event => {
  const { state, requestId } = event.data;
  const results = [];
  for (const difficulty of LEVELS) {
    try {
      results.push(planMove(state, difficulty, requestId));
    } catch (error) {
      results.push({ difficulty, error: error instanceof Error ? error.message : String(error) });
    }
  }
  self.postMessage({ requestId, results });
};
