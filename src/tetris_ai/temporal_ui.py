"""Interactive read-only temporal debugging and sequence export."""
from collections import deque
from dataclasses import asdict
import json
from pathlib import Path
import time
import cv2
import numpy as np
from .vision import load_region, reconstruct, grid
from .temporal import TemporalTracker, CellState


def panel(frame, obs, fps, latency):
    size = 20
    colors = np.zeros((20, 10, 3), np.uint8)
    for state, color in ((CellState.UNKNOWN, (0,165,255)), (CellState.LOCKED, (60,200,60)), (CellState.ACTIVE, (255,160,0)), (CellState.GHOST, (200,100,200))):
        colors[obs.states == state] = color
    def enlarge(image):
        return cv2.resize(image, (200,400), interpolation=cv2.INTER_NEAREST)
    original = cv2.resize(frame, (200,400))
    overlay = cv2.resize(grid(frame), (200,400))
    classified = grid(enlarge(colors))
    confidence = grid(enlarge(cv2.applyColorMap((obs.confidence*255).astype(np.uint8), cv2.COLORMAP_VIRIDIS)))
    changes = np.zeros((20,10,3), np.uint8); changes[obs.changes] = (255,255,255)
    changes = grid(enlarge(changes))
    header = np.zeros((55, 1000, 3), np.uint8)
    for x, label in enumerate(('Capture','Grid','States','Confidence','Changes')):
        cv2.putText(header, label, (x*200+5,20), cv2.FONT_HERSHEY_SIMPLEX, .5, (255,255,255), 1)
    cv2.putText(header, f'FPS {fps:.1f}  latency {latency:.1f} ms  valid {obs.valid}', (5,46), cv2.FONT_HERSHEY_SIMPLEX, .5, (255,255,255), 1)
    return np.vstack((header, np.hstack((original,overlay,classified,confidence,changes))))


def export_sequence(directory, records):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    manifest = []
    for index, (frame, obs, timestamp) in enumerate(records):
        name = f'frame_{index:04d}'
        if not cv2.imwrite(str(directory / (name + '.png')), frame):
            raise OSError('Could not write sequence frame')
        np.savez_compressed(directory / (name + '.npz'), states=obs.states, confidence=obs.confidence, changes=obs.changes, persistence=obs.persistence)
        manifest.append({'frame': name, 'timestamp_perf_counter': timestamp, 'valid': obs.valid, 'evidence': obs.evidence})
    (directory / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')


def run(region_path, history=5, sequence=30, export_dir='results/sequence'):
    import mss
    if sequence < 1 or sequence > 300:
        raise ValueError('Sequence length must be between 1 and 300')
    region = load_region(region_path)
    tracker = TemporalTracker(history=history)
    records = deque(maxlen=sequence)
    previous = time.perf_counter()
    try:
        with mss.mss() as screen:
            region.validate_screen(screen.monitors[0])
            while True:
                start = time.perf_counter()
                frame = cv2.cvtColor(np.asarray(screen.grab(asdict(region))), cv2.COLOR_BGRA2BGR)
                captured = time.perf_counter()
                obs = tracker.update(reconstruct(frame))
                end = time.perf_counter()
                records.append((frame.copy(), obs, captured))
                cv2.imshow('Temporal perception - E export, Q quit', panel(frame, obs, 1/max(captured-previous, 1e-9), (end-start)*1000))
                previous = captured
                key = cv2.waitKey(1) & 0xff
                if key in (ord('q'), 27): break
                if key == ord('e'):
                    export_sequence(export_dir, records)
                    print(f'Exported {len(records)} frames to {export_dir}')
    finally:
        cv2.destroyAllWindows()
