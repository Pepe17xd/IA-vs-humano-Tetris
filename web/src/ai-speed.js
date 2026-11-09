// Execution pacing is separate from the search budget and the shared gravity rules.
export const AI_SPEEDS = Object.freeze({
  beginner: Object.freeze({ stepMs:650, dropMs:360, betweenMs:200, firstMs:100, waitForVisible:true }),
  intermediate: Object.freeze({ stepMs:300, dropMs:240, betweenMs:100, firstMs:50, waitForVisible:true }),
  advanced: Object.freeze({ stepMs:110, dropMs:140, betweenMs:40, firstMs:25, waitForVisible:true }),
  extreme: Object.freeze({ stepMs:15, dropMs:65, betweenMs:0, firstMs:0, waitForVisible:false }),
});

export function aiSpeed(difficulty) {
  return AI_SPEEDS[difficulty] || AI_SPEEDS.intermediate;
}
