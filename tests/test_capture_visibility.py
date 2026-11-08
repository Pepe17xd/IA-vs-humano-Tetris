import json
import numpy as np
import pytest
import mss
from tetris_ai import live_assistant as assistant
from tetris_ai.vision import Region, save_region
from tetris_ai.window_visibility import intersects


def test_rectangle_overlap():
    assert intersects((0, 0, 10, 10), (9, 9, 20, 20))
    assert not intersects((0, 0, 10, 10), (10, 0, 20, 10))
    assert intersects((-100, -100, 0, 0), (-20, -20, 20, 20))


def test_headless_countdown_evidence_and_recovery(tmp_path, monkeypatch, capsys):
    events = []
    class Screen:
        monitors = [{'left': 0, 'top': 0, 'width': 200, 'height': 300}]
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def grab(self, region):
            events.append('grab')
            return np.zeros((200, 100, 4), np.uint8)
    monkeypatch.setattr(mss, 'mss', Screen)
    monkeypatch.setattr(assistant.time, 'sleep', lambda n: events.append(('sleep', n)))
    monkeypatch.setattr(assistant.cv2, 'imshow', lambda *args: pytest.fail('headless opened a window'))
    monkeypatch.setattr(assistant.cv2, 'namedWindow', lambda *args: pytest.fail('headless opened a window'))
    values = iter([(True, ''), (True, ''), (False, 'overlay'), (False, 'overlay'), (True, ''), (True, '')])
    def visibility(region, title):
        assert region == Region(10, 20, 100, 200) and title is None
        return next(values)
    seen = []
    original = assistant.export_evidence
    def capture(directory, frame, observation, result, metrics):
        seen.append((observation.valid, result.reason, dict(metrics)))
        original(directory, frame, observation, result, metrics)
    monkeypatch.setattr(assistant, 'export_evidence', capture)
    path = tmp_path / 'region.json'; save_region(Region(10, 20, 100, 200), path)
    assistant.run(path, delay=2, export_every=1, max_frames=3, export_dir=tmp_path / 'out', visibility_check=visibility)
    assert events[:2] == [('sleep', 1), ('sleep', 1)] and events.count('grab') == 3
    assert seen[1][0] is False and 'overlay' in seen[1][1] and seen[1][2]['capture_obstructed']
    assert seen[2][0] is True and not seen[2][2]['capture_obstructed']
    evidence = json.loads((tmp_path / 'out' / 'evidence.json').read_text(encoding='utf-8'))
    assert evidence['metrics']['observations'] == 3
    assert (tmp_path / 'out' / 'capture.png').exists()
    assert 'tracking restarted' in capsys.readouterr().out


def test_visibility_change_during_capture_blocks(tmp_path, monkeypatch):
    class Screen:
        monitors = [{'left': 0, 'top': 0, 'width': 100, 'height': 200}]
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def grab(self, region): return np.zeros((200,100,4), np.uint8)
    monkeypatch.setattr(mss, 'mss', Screen)
    path = tmp_path / 'region.json'; save_region(Region(0,0,100,200), path)
    checks = iter([(True,''), (False,'covered after capture')])
    assistant.run(path, delay=0, max_frames=1, export_dir=tmp_path / 'out', visibility_check=lambda *args: next(checks))
    result = json.loads((tmp_path / 'out' / 'evidence.json').read_text(encoding='utf-8'))
    assert result['metrics']['capture_obstructed'] and result['recommendation']['move'] is None
    assert 'covered after capture' in result['recommendation']['reason']
