import json
import numpy as np
import pytest
from tetris_ai import core
from tetris_ai.temporal import CellState, TemporalTracker, TemporalObservation
from tetris_ai.state_adapter import adapt
from tetris_ai.pieces import identify_piece
from tetris_ai.live_assistant import process_frame, recommend, export_evidence
from tetris_ai.evaluation import evaluate


def observation():
    states = np.zeros((20,10), np.int8)
    return TemporalObservation(states, np.ones((20,10), np.float32), np.zeros((20,10),bool), np.ones((20,10)), {}, True)


def test_adaptation_separates_cells():
    obs = observation(); obs.states[19,0] = CellState.LOCKED; obs.states[3:5,3:5] = CellState.ACTIVE; obs.states[18,4] = CellState.GHOST
    state = adapt(obs)
    assert state.board[19] == 1 and sum(row.bit_count() for row in state.board) == 1
    assert len(state.active) == 4 and state.ghost == ((18,4),)
    obs.states[1,1] = CellState.UNKNOWN
    with pytest.raises(ValueError): adapt(obs)


@pytest.mark.parametrize('piece', list(core.SHAPES))
def test_identify_all_rotations(piece):
    for idx, shape in enumerate(core.rotations(piece)):
        found = identify_piece([(y+3,x+2) for x,y in shape])
        assert (found.piece, found.rotation) == (piece,idx)


def test_invalid_geometry_and_confidence():
    with pytest.raises(ValueError): identify_piece([(0,0)])
    obs = observation(); obs.confidence[0,0] = .2
    assert 'confidence' in recommend(obs).reason
    obs = observation(); obs.valid = False; obs.evidence['invalid_reason'] = 'animation'
    assert 'animation' in recommend(obs).reason


def test_recommendation_legal():
    obs = observation(); obs.states[3:5,3:5] = CellState.ACTIVE
    result = recommend(obs)
    assert result.piece == 'O' and not result.reason
    move = result.move
    legal = list(core.placements((0,)*20, 'O'))
    assert any((r,x,y,board,lines) == (move['rotation'],move['x'],move['y'],move['board'],move['cleared']) for r,x,y,board,lines in legal)


def test_capture_to_recommendation():
    tracker = TemporalTracker()
    def image(y):
        img = np.zeros((200,100,3), np.uint8)
        img[y*10:(y+2)*10,30:50] = (0,0,255)
        return img
    process_frame(image(2), tracker)
    obs, result = process_frame(image(3), tracker)
    assert result.piece == 'O' and result.move and obs.valid
    with pytest.raises(ValueError): process_frame(None, tracker)


def test_export_and_evaluation(tmp_path):
    obs = observation(); obs.states[3:5,3:5] = CellState.ACTIVE
    result = recommend(obs)
    export_evidence(tmp_path, np.zeros((200,100,3),np.uint8), obs, result, {'fps':20, 'total_latency_ms':50})
    labels = [{'evidence':'evidence.json','states':obs.states.tolist(),'piece':'O'}]
    path = tmp_path / 'labels.json'; path.write_text(json.dumps(labels),encoding='utf-8')
    metrics = evaluate(path)
    assert metrics['cell_accuracy'] == metrics['piece_accuracy'] == 1 and metrics['rejection_rate'] == 0
    assert (tmp_path / 'capture.png').exists()
