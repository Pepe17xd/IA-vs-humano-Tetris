import { createGame, enqueueGarbage, rngNext } from './game.js';

const AI_LEVELS = new Set(['beginner', 'intermediate', 'advanced', 'extreme']);

export function generateMatchSeed(random = Math.random) {
  return Math.floor(random() * 0x100000000) >>> 0;
}

export function snapshotMatchSettings(value = {}) {
  const probability = Number(value.probability);
  const gravityScale = Number(value.gravityScale);
  return Object.freeze({
    difficulty: AI_LEVELS.has(value.difficulty) ? value.difficulty : 'intermediate',
    identical: Boolean(value.identical),
    experimental: Boolean(value.experimental),
    probability: Number.isFinite(probability) ? Math.min(100, Math.max(0, probability)) : 35,
    gravityScale: Number.isFinite(gravityScale) ? Math.min(1.35, Math.max(0.7, gravityScale)) : 1,
  });
}

export function createMatch(seed, identicalSequence = true) {
  const normalizedSeed = Number(seed) >>> 0;
  const aiSeed = identicalSequence ? normalizedSeed : (normalizedSeed ^ 0x9e3779b9) >>> 0;
  return { seed: normalizedSeed, aiSeed, human: createGame(normalizedSeed), ai: createGame(aiSeed), winner: null };
}

export function matchWinner(human, ai) {
  if (human.alive && ai.alive) return null;
  if (human.alive === ai.alive) return 'draw';
  return human.alive ? 'human' : 'ai';
}

export function resolveMatchEvent(match, side, result) {
  return resolveMatchEvents(match, side === 'human' ? result : null, side === 'ai' ? result : null);
}

export function resolveMatchEvents(match, humanResult, aiResult) {
  if (humanResult?.locked && humanResult.attack > 0) enqueueGarbage(match.ai, humanResult.attack);
  if (aiResult?.locked && aiResult.attack > 0) enqueueGarbage(match.human, aiResult.attack);
  match.winner = matchWinner(match.human, match.ai);
  return match.winner;
}

export function simulatedWinner(seed, humanProbability) {
  if (typeof humanProbability !== 'number' || humanProbability < 0 || humanProbability > 100) {
    throw new RangeError('Human win probability must be between 0 and 100');
  }
  const roll = rngNext(((Number(seed) >>> 0) ^ 0xd1b54a35) >>> 0) % 10000;
  return roll < humanProbability * 100 ? 'human' : 'ai';
}

export function isCompetitiveResult(record) {
  return record?.simulated !== true;
}
