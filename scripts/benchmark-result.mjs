export function classifyBenchmarkWinner(agentAlive, opponentAlive, agentErrors = 0, opponentErrors = 0) {
  if (agentErrors || opponentErrors) return 'error';
  if (agentAlive === opponentAlive) return 'draw';
  return agentAlive ? 'agent' : 'opponent';
}
