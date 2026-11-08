"""Validate temporal observations and isolate settled cells for the engine."""
from dataclasses import dataclass
import numpy as np
from .temporal import CellState
from .vision import ROWS, COLS


@dataclass(frozen=True)
class AdaptedState:
    board: tuple
    active: tuple
    ghost: tuple
    confidence: float


def adapt(observation, min_confidence=0.7):
    states = np.asarray(observation.states)
    confidence = np.asarray(observation.confidence)
    if states.shape != (ROWS, COLS) or confidence.shape != (ROWS, COLS):
        raise ValueError('Board and confidence must be 20 x 10')
    if not 0 <= min_confidence <= 1 or not np.all(np.isfinite(confidence)) or np.any((confidence < 0) | (confidence > 1)):
        raise ValueError('Invalid confidence')
    if not np.all(np.isin(states, [s.value for s in CellState])):
        raise ValueError('Invalid cell state')
    if not observation.valid:
        raise ValueError('Temporal observation invalid: ' + str(observation.evidence.get('invalid_reason', 'unknown')))
    if np.any(states == CellState.UNKNOWN):
        raise ValueError('Board contains UNKNOWN cells')
    if np.any(confidence < min_confidence):
        raise ValueError('Cell confidence below threshold')
    active = tuple(map(tuple, np.argwhere(states == CellState.ACTIVE)))
    ghost = tuple(map(tuple, np.argwhere(states == CellState.GHOST)))
    board = tuple(sum((1 << x) for x in range(COLS) if states[y,x] == CellState.LOCKED) for y in range(ROWS))
    return AdaptedState(board, active, ghost, float(confidence.min()))
