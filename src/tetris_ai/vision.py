"""Read-only board calibration and conservative visual reconstruction."""
from dataclasses import dataclass, asdict
import json
from pathlib import Path
import time
import tracemalloc

import cv2
import numpy as np

ROWS, COLS = 20, 10
EMPTY, OCCUPIED, UNCERTAIN = 0, 1, -1

@dataclass(frozen=True)
class Region:
    left: int
    top: int
    width: int
    height: int

    def __post_init__(self):
        if any(type(getattr(self, k)) is not int for k in ('left', 'top', 'width', 'height')):
            raise ValueError('Region values must be integers')
        if self.width < COLS or self.height < ROWS:
            raise ValueError('Region must be at least 10 by 20 pixels')

    def validate_screen(self, monitor):
        if (self.left < monitor['left'] or self.top < monitor['top'] or
            self.left + self.width > monitor['left'] + monitor['width'] or
            self.top + self.height > monitor['top'] + monitor['height']):
            raise ValueError('Calibration is outside the current desktop; recalibrate')


def save_region(region, path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(asdict(region), indent=2) + '\n', encoding='utf-8')


def load_region(path):
    try:
        data = json.loads(Path(path).read_text(encoding='utf-8'))
        return Region(**{k: data[k] for k in ('left', 'top', 'width', 'height')})
    except (OSError, ValueError, TypeError, KeyError) as exc:
        raise ValueError(f'Invalid calibration {path}: {exc}') from exc


def validate_frame(frame):
    if not isinstance(frame, np.ndarray) or frame.dtype != np.uint8 or frame.ndim != 3 or frame.shape[2] not in (3, 4) or frame.shape[0] < ROWS or frame.shape[1] < COLS:
        raise ValueError('Frame must be a uint8 BGR/BGRA image of at least 10x20 pixels')
    return frame[:, :, :3]


def extract_cells(frame):
    frame = validate_frame(frame)
    h, w = frame.shape[:2]
    ys = np.linspace(0, h, ROWS + 1, dtype=int)
    xs = np.linspace(0, w, COLS + 1, dtype=int)
    return [[frame[ys[y]:ys[y+1], xs[x]:xs[x+1]] for x in range(COLS)] for y in range(ROWS)]

@dataclass(frozen=True)
class Thresholds:
    empty_value: int = 40
    occupied_value: int = 90
    occupied_saturation: int = 80
    fraction: float = 0.70
    margin: float = 0.15

    def __post_init__(self):
        if not (0 <= self.empty_value < self.occupied_value <= 255 and 0 <= self.occupied_saturation <= 255 and 0.5 < self.fraction <= 1 and 0 <= self.margin < 0.5):
            raise ValueError('Invalid HSV thresholds')


def classify_cell(cell, thresholds=Thresholds()):
    if not isinstance(cell, np.ndarray) or cell.dtype != np.uint8 or cell.ndim != 3 or cell.shape[2] != 3 or not cell.size:
        raise ValueError('Invalid cell image')
    h, w = cell.shape[:2]
    my, mx = int(h * thresholds.margin), int(w * thresholds.margin)
    hsv = cv2.cvtColor(cell[my:h-my or h, mx:w-mx or w], cv2.COLOR_BGR2HSV)
    dark = float(np.mean(hsv[:, :, 2] <= thresholds.empty_value))
    colored = float(np.mean((hsv[:, :, 2] >= thresholds.occupied_value) & (hsv[:, :, 1] >= thresholds.occupied_saturation)))
    if dark >= thresholds.fraction:
        return EMPTY, dark
    if colored >= thresholds.fraction:
        return OCCUPIED, colored
    return UNCERTAIN, max(dark, colored)

@dataclass
class BoardObservation:
    states: np.ndarray
    confidence: np.ndarray
    reconstruction_ms: float

    def planner_rows(self):
        """Return bit rows only if every cell has a definite classification."""
        if self.states.shape != (ROWS, COLS) or np.any(~np.isin(self.states, (EMPTY, OCCUPIED))):
            raise ValueError('Observation contains uncertain or invalid cells')
        return tuple(sum(int(self.states[y, x]) << x for x in range(COLS)) for y in range(ROWS))


def reconstruct(frame, thresholds=Thresholds()):
    start = time.perf_counter()
    cells = extract_cells(frame)
    states = np.empty((ROWS, COLS), dtype=np.int8)
    confidence = np.empty((ROWS, COLS), dtype=np.float32)
    for y, row in enumerate(cells):
        for x, cell in enumerate(row):
            states[y, x], confidence[y, x] = classify_cell(cell, thresholds)
    return BoardObservation(states, confidence, (time.perf_counter() - start) * 1000)


def grid(frame):
    image = validate_frame(frame).copy()
    h, w = image.shape[:2]
    for x in np.minimum(np.linspace(0, w, COLS + 1, dtype=int), w - 1):
        cv2.line(image, (x, 0), (x, h-1), (0, 255, 0), 1)
    for y in np.minimum(np.linspace(0, h, ROWS + 1, dtype=int), h - 1):
        cv2.line(image, (0, y), (w-1, y), (0, 255, 0), 1)
    return image


def render_board(observation, size=20):
    colors = np.zeros((ROWS, COLS, 3), dtype=np.uint8)
    colors[observation.states == OCCUPIED] = (40, 200, 40)
    colors[observation.states == UNCERTAIN] = (0, 165, 255)
    return grid(cv2.resize(colors, (COLS*size, ROWS*size), interpolation=cv2.INTER_NEAREST))


def export_result(directory, frame, observation):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    frame = validate_frame(frame)
    if not cv2.imwrite(str(directory / 'capture.png'), frame):
        raise OSError('Could not write capture')
    np.save(directory / 'states.npy', observation.states)
    np.save(directory / 'confidence.npy', observation.confidence)
    (directory / 'observation.json').write_text(json.dumps({'states': observation.states.tolist(), 'confidence': observation.confidence.tolist(), 'reconstruction_ms': observation.reconstruction_ms}, indent=2), encoding='utf-8')


def calibrate(path, delay=5):
    """Capture the virtual desktop once after a countdown, then select the board."""
    import mss
    if type(delay) is not int or delay < 0:
        raise ValueError('Delay must be a non-negative integer')
    print('Switch to Chrome and make the board visible.', flush=True)
    for remaining in range(delay, 0, -1):
        print(f'Capturing in {remaining}...', flush=True)
        time.sleep(1)
    print('Capturing screen...', flush=True)
    with mss.mss() as screen:
        monitor = screen.monitors[0]
        image = cv2.cvtColor(np.asarray(screen.grab(monitor)), cv2.COLOR_BGRA2BGR)
    try:
        while True:
            x, y, w, h = cv2.selectROI('Select board, Enter to confirm, Esc to cancel', image, False, False)
            cv2.destroyAllWindows()
            if w == 0 or h == 0:
                print('Calibration cancelled; existing file preserved.')
                return
            region = Region(int(x + monitor['left']), int(y + monitor['top']), int(w), int(h))
            region.validate_screen(monitor)
            crop = image[y:y+h, x:x+w]
            while True:
                cv2.imshow('Grid: Enter saves, R reselects, Esc cancels', grid(crop))
                key = cv2.waitKey(0) & 0xff
                cv2.destroyAllWindows()
                if key in (13, 10):
                    save_region(region, path)
                    print(f'Calibration saved: {path}')
                    return
                if key == 27:
                    print('Calibration cancelled; existing file preserved.')
                    return
                if key in (ord('r'), ord('R')):
                    break
    finally:
        cv2.destroyAllWindows()


def preview(region_path, thresholds=Thresholds(), export_dir=None):
    import mss
    region = load_region(region_path)
    tracemalloc.start()
    try:
        with mss.mss() as screen:
            region.validate_screen(screen.monitors[0])
            previous = time.perf_counter()
            while True:
                start = time.perf_counter()
                frame = cv2.cvtColor(np.asarray(screen.grab(asdict(region))), cv2.COLOR_BGRA2BGR)
                captured = time.perf_counter()
                observation = reconstruct(frame, thresholds)
                end = time.perf_counter()
                fps = 1 / max(captured - previous, 1e-9)
                previous = captured
                memory = tracemalloc.get_traced_memory()[0] / 1024**2
                status = f'FPS {fps:.1f} | capture {(captured-start)*1000:.1f} ms | process {(end-captured)*1000:.1f} ms | reconstruct {observation.reconstruction_ms:.1f} ms | uncertain {np.mean(observation.states == UNCERTAIN)*100:.1f}% | Python memory {memory:.1f} MiB | calibration errors 0'
                print(status, end='\r', flush=True)
                cv2.imshow('Board grid - Q quit, E export', grid(frame))
                cv2.imshow('Reconstruction - orange uncertain', render_board(observation))
                key = cv2.waitKey(1) & 0xff
                if key in (ord('q'), 27): break
                if key == ord('e'):
                    export_result(export_dir or 'results/vision', frame, observation)
                    print(f'\nExported to {export_dir or "results/vision"}')
    finally:
        tracemalloc.stop()
        cv2.destroyAllWindows()
        print()
