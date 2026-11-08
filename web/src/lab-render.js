import { cellsAt } from './game.js';

export function drawCandidateOutlines(ctx, candidates, cellWidth, cellHeight) {
  let cellsDrawn = 0;
  for (const [index, candidate] of candidates.slice(0, 12).entries()) {
    for (const [x, y] of cellsAt(candidate.kind, candidate.rotation, candidate.x, candidate.y)) {
      if (y < 2) continue;
      ctx.strokeStyle = index === 0 ? '#ffffff' : '#b998ff';
      ctx.globalAlpha = index === 0 ? .95 : .34;
      ctx.lineWidth = index === 0 ? 1.6 : 1;
      ctx.strokeRect(x * cellWidth + 3, (y - 2) * cellHeight + 3, cellWidth - 6, cellHeight - 6);
      cellsDrawn++;
    }
  }
  ctx.globalAlpha = 1;
  return cellsDrawn;
}
