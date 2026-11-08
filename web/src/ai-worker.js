import { planMove } from './agent.js';

self.onmessage = event => {
  const { state, difficulty, requestId } = event.data;
  try { self.postMessage(planMove(state, difficulty, requestId)); }
  catch (error) { self.postMessage({ requestId, error: error instanceof Error ? error.message : String(error) }); }
};
