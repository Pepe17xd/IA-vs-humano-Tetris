export function bindCurrentWorker(worker, match, isCurrent, onMessage, onError) {
  worker.onmessage = ({ data }) => {
    if (!isCurrent(match, worker)) return;
    try { onMessage(data); }
    catch (error) { onError(error instanceof Error ? error.message : String(error)); }
  };
  worker.onerror = event => {
    if (isCurrent(match, worker)) onError(event.message || 'Worker terminated unexpectedly');
  };
  worker.onmessageerror = () => {
    if (isCurrent(match, worker)) onError('No se pudo leer la respuesta de la IA');
  };
}
