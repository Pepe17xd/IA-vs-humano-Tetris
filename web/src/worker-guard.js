export function bindCurrentWorker(worker, match, isCurrent, onMessage, onError) {
  worker.onmessage = ({ data }) => {
    if (isCurrent(match, worker)) onMessage(data);
  };
  worker.onerror = event => {
    if (isCurrent(match, worker)) onError(event.message || 'Worker terminated unexpectedly');
  };
}
