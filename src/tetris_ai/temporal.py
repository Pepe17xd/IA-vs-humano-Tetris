"""Conservative temporal interpretation of visual board observations."""
from collections import deque
from dataclasses import dataclass
from enum import IntEnum
import numpy as np
from .vision import ROWS, COLS, OCCUPIED, UNCERTAIN


class CellState(IntEnum):
    UNKNOWN = -1
    EMPTY = 0
    LOCKED = 1
    ACTIVE = 2
    GHOST = 3


@dataclass
class TemporalObservation:
    states: np.ndarray
    confidence: np.ndarray
    changes: np.ndarray
    persistence: np.ndarray
    evidence: dict
    valid: bool

    def planner_rows(self):
        if not self.valid or np.any(np.isin(self.states, [CellState.UNKNOWN, CellState.ACTIVE, CellState.GHOST])):
            raise ValueError('Temporal observation is not a validated locked board')
        return tuple(sum(int(self.states[y, x] == CellState.LOCKED) << x for x in range(COLS)) for y in range(ROWS))


def components(mask):
    remaining = set(map(tuple, np.argwhere(mask)))
    groups = []
    while remaining:
        todo = [remaining.pop()]
        group = set(todo)
        while todo:
            y, x = todo.pop()
            for point in ((y-1,x), (y+1,x), (y,x-1), (y,x+1)):
                if point in remaining:
                    remaining.remove(point); group.add(point); todo.append(point)
        groups.append(group)
    return groups


class TemporalTracker:
    def __init__(self, history=5, min_confidence=0.7, max_changes=32):
        if history < 2 or not 0 <= min_confidence <= 1 or max_changes < 1:
            raise ValueError('Invalid temporal configuration')
        self.history = deque(maxlen=history)
        self.min_confidence = min_confidence
        self.max_changes = max_changes
        self.active = set()
        self.locked = set()
        self.persistence = np.zeros((ROWS, COLS), dtype=np.uint16)

    def update(self, observation, ghost_hint=None):
        raw = np.asarray(observation.states)
        conf = np.asarray(observation.confidence)
        if raw.shape != (ROWS, COLS) or conf.shape != (ROWS, COLS) or not np.all(np.isin(raw, [-1, 0, 1])) or not np.all(np.isfinite(conf)) or np.any((conf < 0) | (conf > 1)):
            raise ValueError('Invalid observation')
        if ghost_hint is not None and (np.asarray(ghost_hint).shape != (ROWS, COLS) or np.asarray(ghost_hint).dtype != bool):
            raise ValueError('Invalid ghost evidence')
        reliable = (raw != UNCERTAIN) & (conf >= self.min_confidence)
        current = np.where(reliable, raw, UNCERTAIN).astype(np.int8)
        previous = self.history[-1] if self.history else None
        changes = np.zeros((ROWS, COLS), bool) if previous is None else (current != previous) & (current != UNCERTAIN) & (previous != UNCERTAIN)
        ambiguous = np.count_nonzero(~reliable) > 8 or np.count_nonzero(changes) > self.max_changes
        self.persistence = np.where((previous == current) & reliable if previous is not None else reliable, np.minimum(self.persistence.astype(np.uint32)+1, 65535), 0).astype(np.uint16)
        states = np.full((ROWS, COLS), CellState.UNKNOWN, dtype=np.int8)
        states[current == 0] = CellState.EMPTY
        evidence = {'motion': None, 'invalid_reason': None, 'ghost_hint': ghost_hint is not None}
        if ambiguous:
            evidence['invalid_reason'] = 'ambiguous or excessive changes'
            self.active.clear(); self.locked.clear(); self.history.clear(); self.persistence.fill(0)
            self._prior_active = set()
            return TemporalObservation(states * 0 + CellState.UNKNOWN, np.zeros((ROWS, COLS), np.float32), changes, self.persistence.copy(), evidence, False)
        occupied = set(map(tuple, np.argwhere(current == OCCUPIED)))
        # Invalidate lock evidence when cells vanish, including line clears.
        vanished_locked = self.locked - occupied
        if vanished_locked:
            self.locked.clear()
            self.active.clear()
            self._prior_active = set()
            evidence['invalid_reason'] = 'previously locked cells disappeared'
        motion = None
        if previous is not None:
            old = set(map(tuple, np.argwhere(previous == OCCUPIED))) - self.locked
            new = occupied - self.locked
            for a in components(np.isin(np.arange(ROWS*COLS).reshape(ROWS,COLS), [y*COLS+x for y,x in old])):
                if len(a) != 4: continue
                for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                    moved = {(y+dy,x+dx) for y,x in a}
                    if moved != a and moved <= new and (a - moved).isdisjoint(new):
                        motion = (moved, (dy,dx)); break
                if motion: break
        if motion:
            self.active = motion[0]
            evidence['motion'] = list(motion[1])
        elif self.active and not self.active <= occupied:
            self.active.clear()
        # A tracked piece becoming stationary is not proof of a lock. A separate
        # newly moving group provides tentative lock evidence if the old group remains.
        if motion and hasattr(self, '_prior_active') and self._prior_active and self._prior_active.isdisjoint(motion[0]) and self._prior_active <= occupied:
            self.locked |= self._prior_active
            evidence['lock'] = 'tracked group remained when another group moved'
        self._prior_active = set(self.active)
        for point in self.locked & occupied: states[point] = CellState.LOCKED
        for point in self.active & occupied: states[point] = CellState.ACTIVE
        if ghost_hint is not None:
            hint = np.asarray(ghost_hint) & reliable & (current != OCCUPIED)
            states[hint] = CellState.GHOST
        confidence = np.where(states == CellState.UNKNOWN, 0, conf).astype(np.float32)
        self.history.append(current.copy())
        return TemporalObservation(states, confidence, changes, self.persistence.copy(), evidence, evidence['invalid_reason'] is None)
