import { action, visibleRows } from '../web/src/game.js';
import { planMove } from '../web/src/agent.js';
import { resolveMatchEvents } from '../web/src/match.js';

function planFor(player, opponent, level, planner) {
  return planner({
    board: player.board,
    current: player.current,
    queue: player.queue.slice(0, 5),
    hold: player.hold,
    canHold: player.canHold,
    incoming: player.incoming.slice(),
    combo: player.combo,
    backToBack: player.backToBack,
    opponent: { board: visibleRows(opponent), incoming: opponent.incoming.length },
  }, level);
}

function executePlan(player, plan) {
  if (!plan.move) {
    player.alive = false;
    return { plan, lock: null };
  }
  let lock = null;
  for (const command of plan.move.path) {
    const result = action(player, command);
    if (result.locked) { lock = result; break; }
    if (!result.moved) { player.alive = false; break; }
  }
  if (!lock) player.alive = false;
  return { plan, lock };
}

// Both searches read the same pre-round state; attacks arrive only after both locks resolve.
export function playBenchmarkRound(first, second, firstLevel, secondLevel, firstPlanner = planMove, secondPlanner = firstPlanner) {
  const firstPlan = planFor(first, second, firstLevel, firstPlanner);
  const secondPlan = planFor(second, first, secondLevel, secondPlanner);
  const firstResult = executePlan(first, firstPlan);
  const secondResult = executePlan(second, secondPlan);
  const match = { human: first, ai: second, winner: null };
  resolveMatchEvents(match, firstResult.lock, secondResult.lock);
  return { first: firstResult, second: secondResult, winner: match.winner };
}
