import json
import numpy as np
import pytest
from tetris_ai.vision import (Region, Thresholds, EMPTY, OCCUPIED, UNCERTAIN,
    classify_cell, extract_cells, reconstruct, save_region, load_region, export_result)


def test_dimensions_and_extraction():
    frame = np.zeros((203, 103, 3), np.uint8)
    cells = extract_cells(frame)
    assert len(cells) == 20 and all(len(row) == 10 for row in cells)
    assert sum(cell.shape[0] * cell.shape[1] for row in cells for cell in row) == 203 * 103
    assert reconstruct(frame).states.shape == (20, 10)


def test_colors_and_low_confidence():
    assert classify_cell(np.zeros((10, 10, 3), np.uint8))[0] == EMPTY
    assert classify_cell(np.full((10, 10, 3), (0, 0, 255), np.uint8))[0] == OCCUPIED
    assert classify_cell(np.full((10, 10, 3), 70, np.uint8))[0] == UNCERTAIN
    frame = np.full((200, 100, 3), 70, np.uint8)
    observation = reconstruct(frame)
    assert np.all(observation.states == UNCERTAIN)
    with pytest.raises(ValueError): observation.planner_rows()


def test_calibration_roundtrip(tmp_path):
    region = Region(-100, 0, 100, 200)
    path = tmp_path / 'config' / 'region.json'
    save_region(region, path)
    assert load_region(path) == region
    with pytest.raises(ValueError): Region(0, 0, 9, 200)
    with pytest.raises(ValueError): load_region(tmp_path / 'missing')
    with pytest.raises(ValueError): region.validate_screen(dict(left=0, top=0, width=1920, height=1080))


@pytest.mark.parametrize('frame', [None, np.zeros((1, 1, 3), np.uint8), np.zeros((20, 10), np.uint8), np.zeros((20, 10, 3), float)])
def test_invalid_frame(frame):
    with pytest.raises(ValueError): reconstruct(frame)


def test_export(tmp_path):
    frame = np.zeros((200, 100, 3), np.uint8)
    observation = reconstruct(frame)
    export_result(tmp_path, frame, observation)
    assert (tmp_path / 'capture.png').exists()
    assert np.array_equal(np.load(tmp_path / 'states.npy'), observation.states)
    assert np.array_equal(np.load(tmp_path / 'confidence.npy'), observation.confidence)
    assert len(json.loads((tmp_path / 'observation.json').read_text())['states']) == 20
    assert observation.planner_rows() == (0,) * 20


def test_threshold_validation():
    with pytest.raises(ValueError): Thresholds(empty_value=100, occupied_value=90)


def test_calibrate_countdown_absolute_coordinates_and_reselection(tmp_path, monkeypatch, capsys):
    import mss
    import tetris_ai.vision as vision
    events = []
    class Screen:
        monitors = [{'left': -200, 'top': -100, 'width': 400, 'height': 300}]
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def grab(self, monitor):
            events.append('grab')
            return np.zeros((300, 400, 4), np.uint8)
    selections = iter([(5, 10, 100, 200), (20, 30, 100, 200)])
    keys = iter([ord('r'), 13])
    monkeypatch.setattr(mss, 'mss', Screen)
    monkeypatch.setattr(vision.time, 'sleep', lambda n: events.append(('sleep', n)))
    monkeypatch.setattr(vision.cv2, 'selectROI', lambda *args: next(selections))
    monkeypatch.setattr(vision.cv2, 'imshow', lambda *args: None)
    monkeypatch.setattr(vision.cv2, 'waitKey', lambda *args: next(keys))
    monkeypatch.setattr(vision.cv2, 'destroyAllWindows', lambda: None)
    path = tmp_path / 'region.json'
    vision.calibrate(path, delay=2)
    assert events == [('sleep', 1), ('sleep', 1), 'grab']
    assert vision.load_region(path) == Region(-180, -70, 100, 200)
    assert 'Capturing in 2' in capsys.readouterr().out


@pytest.mark.parametrize('selection,key', [((0, 0, 0, 0), None), ((10, 10, 100, 200), 27)])
def test_calibrate_cancel_preserves_previous(tmp_path, monkeypatch, selection, key):
    import mss
    import tetris_ai.vision as vision
    class Screen:
        monitors = [{'left': 0, 'top': 0, 'width': 400, 'height': 300}]
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def grab(self, monitor): return np.zeros((300,400,4), np.uint8)
    monkeypatch.setattr(mss, 'mss', Screen)
    monkeypatch.setattr(vision.cv2, 'selectROI', lambda *args: selection)
    monkeypatch.setattr(vision.cv2, 'imshow', lambda *args: None)
    monkeypatch.setattr(vision.cv2, 'waitKey', lambda *args: key)
    monkeypatch.setattr(vision.cv2, 'destroyAllWindows', lambda: None)
    path = tmp_path / 'region.json'
    original = Region(0, 0, 100, 200)
    save_region(original, path)
    vision.calibrate(path, delay=0)
    assert load_region(path) == original


def test_calibrate_invalid_bounds_preserves_previous(tmp_path, monkeypatch):
    import mss
    import tetris_ai.vision as vision
    class Screen:
        monitors = [{'left': 0, 'top': 0, 'width': 400, 'height': 300}]
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def grab(self, monitor): return np.zeros((300,400,4), np.uint8)
    monkeypatch.setattr(mss, 'mss', Screen)
    monkeypatch.setattr(vision.cv2, 'selectROI', lambda *args: (350, 0, 100, 200))
    monkeypatch.setattr(vision.cv2, 'destroyAllWindows', lambda: None)
    path = tmp_path / 'region.json'
    save_region(Region(0, 0, 100, 200), path)
    with pytest.raises(ValueError): vision.calibrate(path, delay=0)
    assert load_region(path) == Region(0, 0, 100, 200)
    with pytest.raises(ValueError): vision.calibrate(path, delay=-1)
