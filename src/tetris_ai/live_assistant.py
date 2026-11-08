"""Read-only live observation and conservative single-piece recommendations."""
from dataclasses import asdict, dataclass
import json
from pathlib import Path
import time
import cv2
import numpy as np
from . import core
from .vision import load_region, reconstruct, validate_frame
from .temporal import TemporalTracker, TemporalObservation, CellState
from .temporal_ui import panel
from .state_adapter import adapt
from .pieces import identify_piece
from .window_visibility import check_visibility


@dataclass
class Recommendation:
    reason: str
    piece: str = None
    piece_rotation: int = None
    confidence: float = 0.0
    move: dict = None
    score: float = None
    legal_count: int = 0
    planning_ms: float = 0.0


def recommend(observation):
    start = time.perf_counter()
    result = Recommendation(reason='NO RECOMMENDATION')
    try:
        state = adapt(observation)
        piece = identify_piece(state.active, state.confidence)
        result.piece, result.piece_rotation, result.confidence = piece.piece, piece.rotation, piece.confidence
        candidates = list(core.placements(state.board, piece.piece))
        result.legal_count = len(candidates)
        if not candidates:
            raise ValueError('No legal hard-drop placements')
        move = core.search(state.board, [piece.piece])
        if move is None:
            raise ValueError('Search found no placement')
        result.move = asdict(move)
        result.score = core.score(move.board, move.cleared)
        result.reason = ''
    except ValueError as exc:
        result.reason = str(exc)
    result.planning_ms = (time.perf_counter() - start) * 1000
    return result


def process_frame(frame, tracker):
    visual = reconstruct(validate_frame(frame))
    temporal = tracker.update(visual)
    return temporal, recommend(temporal)


def export_evidence(directory, frame, observation, recommendation, metrics):
    directory = Path(directory); directory.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(directory / 'capture.png'), validate_frame(frame)):
        raise OSError('Could not export capture')
    data = {'states': observation.states.tolist(), 'confidence': observation.confidence.tolist(),
            'changes': observation.changes.tolist(), 'persistence': observation.persistence.tolist(),
            'valid': observation.valid, 'evidence': observation.evidence,
            'recommendation': asdict(recommendation), 'metrics': metrics}
    (directory / 'evidence.json').write_text(json.dumps(data, indent=2), encoding='utf-8')


def render(frame, observation, recommendation, fps, latency):
    image = panel(frame, observation, fps, latency)
    if recommendation.move:
        move = recommendation.move
        for dx, dy in core.rotations(recommendation.piece)[move['rotation']]:
            x, y = move['x'] + dx, move['y'] + dy
            cv2.rectangle(image, (400+x*20+2,55+y*20+2), (400+(x+1)*20-3,55+(y+1)*20-3), (255,255,255), 2)
        message = f"{recommendation.piece} -> x={move['x']} y={move['y']} rot={move['rotation']} score={recommendation.score:.2f}"
    else:
        message = 'NO RECOMMENDATION: ' + recommendation.reason
    bottom = np.zeros((55, image.shape[1], 3), np.uint8)
    cv2.putText(bottom, message[:115], (5, 20), cv2.FONT_HERSHEY_SIMPLEX, .43, (255,255,255), 1)
    cv2.putText(bottom, f'confidence {recommendation.confidence:.2f} | planning {recommendation.planning_ms:.2f} ms | legal {recommendation.legal_count}', (5,45), cv2.FONT_HERSHEY_SIMPLEX, .45, (255,255,255), 1)
    return np.vstack((image,bottom))


DEBUG_TITLE = 'Read-only assistant - E export, Q quit'


def blocked_observation(reason):
    shape = (20, 10)
    return TemporalObservation(np.full(shape, CellState.UNKNOWN, np.int8),
        np.zeros(shape, np.float32), np.zeros(shape, bool),
        np.zeros(shape, np.uint16), {'invalid_reason': reason}, False)


def run(region_path, history=5, export_dir='results/assist', delay=5,
        debug=False, debug_position=None, export_every=30, max_frames=None,
        visibility_check=None):
    """Capture only visible desktop pixels; reset tracking when coverage is detected."""
    import mss
    if delay < 0 or export_every < 1 or (max_frames is not None and max_frames < 1):
        raise ValueError('Delay must be non-negative; frame counts must be positive')
    region = load_region(region_path)
    tracker = TemporalTracker(history)
    check = visibility_check or check_visibility
    previous = None
    count = rejected = 0
    obstructed = False
    print('Switch to Chrome and keep the calibrated board visible.', flush=True)
    for remaining in range(delay, 0, -1):
        print(f'Capturing in {remaining}...', flush=True)
        time.sleep(1)
    try:
        with mss.mss() as screen:
            region.validate_screen(screen.monitors[0])
            if debug:
                cv2.namedWindow(DEBUG_TITLE, cv2.WINDOW_NORMAL)
                if debug_position is not None:
                    cv2.moveWindow(DEBUG_TITLE, *debug_position)
            while max_frames is None or count < max_frames:
                start = time.perf_counter()
                try:
                    visible, reason = check(region, DEBUG_TITLE if debug else None)
                    captured_frame = np.asarray(screen.grab(asdict(region)))
                    frame = cv2.cvtColor(captured_frame, cv2.COLOR_BGRA2BGR)
                    captured = time.perf_counter()
                    # An overlapping window can appear during the capture.
                    visible_after, after_reason = check(region, DEBUG_TITLE if debug else None)
                    if not visible or not visible_after:
                        reason = reason if not visible else after_reason
                        if not obstructed:
                            print(f'WARNING: capture obstructed: {reason}', flush=True)
                        tracker = TemporalTracker(history)
                        obstructed = True
                        observation = blocked_observation(reason)
                        result = Recommendation(reason='Capture obstructed: ' + reason)
                    else:
                        if obstructed:
                            print('Capture visible again; temporal tracking restarted.', flush=True)
                        obstructed = False
                        observation, result = process_frame(frame, tracker)
                except (ValueError, cv2.error, mss.exception.ScreenShotError) as exc:
                    raise ValueError(f'Capture or processing failed: {exc}') from exc
                elapsed = (time.perf_counter()-start)*1000
                fps = 0.0 if previous is None else 1/max(captured-previous, 1e-9)
                previous = captured; count += 1; rejected += bool(result.reason)
                metrics = {'fps': fps, 'total_latency_ms': elapsed, 'planning_ms': result.planning_ms,
                           'observations': count, 'rejection_rate': rejected/count,
                           'capture_obstructed': obstructed, 'visibility_reason': reason if obstructed else ''}
                if count == 1 or count % export_every == 0:
                    export_evidence(export_dir, frame, observation, result, metrics)
                    status = 'NO RECOMMENDATION: ' + result.reason if result.reason else f"{result.piece} {result.move}"
                    print(f'{status} | FPS {fps:.1f} | latency {elapsed:.1f} ms', flush=True)
                if debug:
                    cv2.imshow(DEBUG_TITLE, render(frame, observation, result, fps, elapsed))
                    key = cv2.waitKey(1) & 0xff
                    if key in (ord('q'), 27): break
                    if key == ord('e'):
                        export_evidence(export_dir, frame, observation, result, metrics)
                        print(f'Evidence exported to {export_dir}', flush=True)
    except KeyboardInterrupt:
        print('Assistant stopped.', flush=True)
    finally:
        if debug:
            cv2.destroyAllWindows()
