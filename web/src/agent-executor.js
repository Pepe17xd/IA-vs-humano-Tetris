import { action } from './game.js';

export function executePlanStep(game, move, command) {
  const piece = game.current;
  if (command === 'hardDrop'
      && (!piece || piece.kind !== move.kind || piece.x !== move.x || piece.rotation !== move.rotation)) {
    return { retry: true, result: null };
  }

  const result = action(game, command);
  return {
    retry: !result.moved && !result.locked && !result.topOut,
    result,
  };
}
