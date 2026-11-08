import numpy as np
import pytest
from tetris_ai.vision import BoardObservation
from tetris_ai.temporal import TemporalTracker, CellState
from tetris_ai.temporal_ui import export_sequence


def frame(points=(), uncertain=()):
    a = np.zeros((20,10), np.int8)
    for p in points: a[p] = 1
    for p in uncertain: a[p] = -1
    return BoardObservation(a, np.ones((20,10), np.float32), 0)


def square(y,x): return {(y,x),(y,x+1),(y+1,x),(y+1,x+1)}


@pytest.mark.parametrize('offset', [(1,0),(0,1)])
def test_moving_piece(offset):
    t = TemporalTracker()
    t.update(frame(square(3,3)))
    result = t.update(frame(square(3+offset[0],3+offset[1])))
    assert result.evidence['motion'] == list(offset)
    assert all(result.states[p] == CellState.ACTIVE for p in square(3+offset[0],3+offset[1]))
    assert result.changes.any()


def test_stationary_is_not_locked():
    t = TemporalTracker()
    for _ in range(8): result = t.update(frame(square(5,3)))
    assert all(result.states[p] == CellState.UNKNOWN for p in square(5,3))
    assert result.persistence[5,3] > 1
    with pytest.raises(ValueError): result.planner_rows()


def test_lock_with_new_moving_piece_and_clear():
    t = TemporalTracker()
    t.update(frame(square(15,3)))
    t.update(frame(square(16,3)))
    t.update(frame(square(16,3) | square(2,0)))
    result = t.update(frame(square(16,3) | square(3,0)))
    assert all(result.states[p] == CellState.LOCKED for p in square(16,3))
    result = t.update(frame(square(3,0)))
    assert not result.valid
    assert not np.any(result.states == CellState.LOCKED)


def test_ghost_requires_explicit_evidence():
    t = TemporalTracker()
    hint = np.zeros((20,10), bool); hint[18,3] = True
    result = t.update(frame(), ghost_hint=hint)
    assert result.states[18,3] == CellState.GHOST
    assert t.update(frame()).states[18,3] == CellState.EMPTY


def test_ambiguity_and_recovery():
    t = TemporalTracker()
    t.update(frame())
    result = t.update(frame(uncertain=[(y,0) for y in range(10)]))
    assert not result.valid and np.all(result.states == CellState.UNKNOWN)
    result = t.update(frame())
    assert result.valid and np.all(result.states == CellState.EMPTY)
    t.update(frame(square(2,2)))
    result = t.update(frame())
    assert not np.any(result.states == CellState.LOCKED)


def test_export_sequence(tmp_path):
    obs = TemporalTracker().update(frame())
    export_sequence(tmp_path, [(np.zeros((200,100,3), np.uint8), obs, 1.0)])
    assert (tmp_path / 'manifest.json').exists()
    assert np.load(tmp_path / 'frame_0000.npz')['states'].shape == (20,10)
