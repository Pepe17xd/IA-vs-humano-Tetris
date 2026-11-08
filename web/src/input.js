const REPEAT_COMMANDS = new Set(['left', 'right', 'softDrop']);

export function createTouchControls({ perform, canPlay, onRelease, schedule = setInterval, unschedule = clearInterval }) {
  let pointerId = null;
  let timer = null;

  function cancel() {
    if (pointerId === null) return;
    if (timer !== null) unschedule(timer);
    pointerId = null;
    timer = null;
    onRelease();
  }

  function start(event, command) {
    event.preventDefault?.();
    if (pointerId !== null || !canPlay()) return false;
    pointerId = event.pointerId ?? 0;
    perform(command);
    if (REPEAT_COMMANDS.has(command)) {
      timer = schedule(() => {
        if (pointerId === null) return;
        if (!canPlay()) return cancel();
        perform(command);
      }, 75);
    }
    return true;
  }

  function end(event) {
    if (pointerId === null) return;
    if (event?.pointerId != null && event.pointerId !== pointerId) return;
    cancel();
  }

  return { start, end, cancel };
}
