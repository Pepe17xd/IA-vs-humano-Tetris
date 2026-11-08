import { createGame } from '../web/src/game.js';
import { DIFFICULTIES, planMove } from '../web/src/agent.js';
import { classifyBenchmarkWinner } from './benchmark-result.mjs';
import { playBenchmarkRound } from './benchmark-game.mjs';
import { planRandomVisibleMove } from './benchmark-opponents.mjs';

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : Number(args[index + 1]);
};
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const seeds = value('--seeds', 3), maxPieces = value('--pieces', 180);
const allLevels = ['beginner', 'intermediate', 'advanced', 'extreme'];
const allOpponents = [...allLevels, 'random'];
const agentLevel = option('--agent', null), opponentLevel = option('--opponent', null);
const attackWeightArg = args.indexOf('--attack-weight');
const attackWeight = attackWeightArg < 0 ? null : Number(args[attackWeightArg + 1]);
if (!Number.isInteger(seeds) || seeds < 1 || !Number.isInteger(maxPieces) || maxPieces < 1
    || (agentLevel && !allLevels.includes(agentLevel)) || (opponentLevel && !allOpponents.includes(opponentLevel))
    || (agentLevel && opponentLevel && agentLevel === opponentLevel)
    || (attackWeightArg >= 0 && (!agentLevel || !Number.isFinite(attackWeight) || attackWeight < 0))) {
  throw new Error('Usage: npm run benchmark -- --seeds 3 --pieces 180 [--agent LEVEL --opponent LEVEL|random] [--attack-weight NUMBER (requires --agent)]');
}

if (attackWeight !== null) DIFFICULTIES[agentLevel].weights.attack = attackWeight;

function recordAgentDecision(metrics, result) {
  const plan = result.plan;
  metrics.nodes += plan.nodes || 0;
  metrics.decisionMs += plan.decisionMs || 0;
  metrics.decisions++;
  metrics.maxOpponentThreat = Math.max(metrics.maxOpponentThreat, plan.opponentThreat || 0);
  metrics.maxDecisionMs = Math.max(metrics.maxDecisionMs, plan.decisionMs || 0);
  if (plan.budgetMs && plan.decisionMs > plan.budgetMs) metrics.budgetOverruns++;
  if (plan.error) metrics.agentErrors++;
}

const plannerFor = level => level === 'random' ? planRandomVisibleMove : planMove;

const levels = agentLevel ? [agentLevel] : allLevels;
const opponents = opponentLevel ? [opponentLevel] : ['beginner', 'intermediate'];
const output = {
  kind: 'seeded time-bounded self-play benchmark',
  rules: 'Tetris AI Arena custom rules v1',
  scheduling: 'Both agents plan from a pre-round snapshot; attacks enqueue only after both locks resolve; execution order alternates.',
  reproducibility: 'Seeds reproduce piece and garbage streams. Wall-clock search cutoffs can change exact AI plans across runtimes or system load.',
  seeds, maxPieces, agents: levels, opponents, matchups: [],
  overrides: attackWeight === null ? {} : { attackWeight },
};

for (const level of levels) {
  for (const opponentLevel of opponents.filter(candidate => candidate !== level)) {
    const rows = [];
    for (let index = 0; index < seeds; index++) {
      const seed = (42 + index * 7919) >>> 0;
      const agent = createGame(seed), opponent = createGame(seed);
      const metrics = { nodes: 0, decisionMs: 0, decisions: 0, agentErrors: 0, opponentErrors: 0,
        maxOpponentThreat: 0, maxDecisionMs: 0, budgetOverruns: 0 };
      let rounds = 0, agentFirst = index % 2 === 0;

      while (agent.alive && opponent.alive && rounds < maxPieces) {
        const round = agentFirst
          ? playBenchmarkRound(agent, opponent, level, opponentLevel, plannerFor(level), plannerFor(opponentLevel))
          : playBenchmarkRound(opponent, agent, opponentLevel, level, plannerFor(opponentLevel), plannerFor(level));
        const agentResult = agentFirst ? round.first : round.second;
        const opponentResult = agentFirst ? round.second : round.first;
        recordAgentDecision(metrics, agentResult);
        if (opponentResult.plan.error) metrics.opponentErrors++;
        rounds++;
        agentFirst = !agentFirst;
      }

      const winner = classifyBenchmarkWinner(agent.alive, opponent.alive, metrics.agentErrors, metrics.opponentErrors);
      rows.push({
        seed, agentStarted: index % 2 === 0, winner, rounds,
        agentPieces: agent.pieces, opponentPieces: opponent.pieces,
        agentLines: agent.lines, opponentLines: opponent.lines,
        agentScore: agent.score, opponentScore: opponent.score,
        agentAttacks: agent.attacksSent, opponentAttacks: opponent.attacksSent,
        maxOpponentThreat: metrics.maxOpponentThreat,
        agentMeanDecisionMs: metrics.decisions ? metrics.decisionMs / metrics.decisions : 0,
        agentMaxDecisionMs: metrics.maxDecisionMs, agentBudgetOverruns: metrics.budgetOverruns,
        agentNodes: metrics.nodes, decisions: metrics.decisions,
        agentErrors: metrics.agentErrors, opponentErrors: metrics.opponentErrors,
      });
    }
    output.matchups.push({
      agent: level, opponent: opponentLevel,
      agentWins: rows.filter(row => row.winner === 'agent').length,
      opponentWins: rows.filter(row => row.winner === 'opponent').length,
      draws: rows.filter(row => row.winner === 'draw').length,
      errors: rows.filter(row => row.winner === 'error').length,
      winRate: rows.length ? rows.filter(row => row.winner === 'agent').length / rows.length : 0,
      games: rows,
    });
  }
}

console.log(JSON.stringify(output, null, 2));
