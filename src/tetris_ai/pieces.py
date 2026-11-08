"""Match complete tetromino geometry to the engine's rotation conventions."""
from dataclasses import dataclass
from .core import SHAPES, rotations


@dataclass(frozen=True)
class PieceDetection:
    piece: str
    rotation: int
    confidence: float


def identify_piece(cells, confidence=1.0):
    points = set(cells)
    if len(points) != 4 or len(points) != len(cells):
        raise ValueError('Active piece must contain exactly four distinct visible cells')
    if not 0 <= confidence <= 1:
        raise ValueError('Invalid piece confidence')
    miny = min(y for y,x in points); minx = min(x for y,x in points)
    normalized = tuple(sorted((x-minx, y-miny) for y,x in points))
    matches = [(piece, idx) for piece in SHAPES for idx, shape in enumerate(rotations(piece)) if shape == normalized]
    if len(matches) != 1:
        raise ValueError('Active geometry is unknown or ambiguous')
    return PieceDetection(*matches[0], float(confidence))
