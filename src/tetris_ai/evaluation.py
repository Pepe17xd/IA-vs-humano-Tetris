"""Compare exported evidence with manually labeled board and piece."""
import json
from pathlib import Path
import numpy as np
from .temporal import CellState


def evaluate(path):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    if not isinstance(data, list) or not data:
        raise ValueError('Expected a non-empty list of labeled evidence files')
    correct = total = piece_correct = piece_total = rejected = 0
    latencies, fps = [], []
    for item in data:
        evidence = json.loads((Path(path).parent / item['evidence']).read_text(encoding='utf-8'))
        predicted = np.asarray(evidence['states'])
        labels = np.asarray(item['states'])
        if labels.shape != (20,10) or predicted.shape != (20,10) or not np.all(np.isin(labels, [s.value for s in CellState])):
            raise ValueError('Labels and prediction must be valid 20 x 10 state matrices')
        correct += int(np.count_nonzero(predicted == labels)); total += 200
        if item.get('piece') is not None:
            if item['piece'] not in 'IOTSZJL' or len(item['piece']) != 1:
                raise ValueError('Invalid labeled piece')
            piece_total += 1; piece_correct += evidence['recommendation']['piece'] == item['piece']
        rejected += bool(evidence['recommendation']['reason'])
        latencies.append(evidence['metrics']['total_latency_ms']); fps.append(evidence['metrics']['fps'])
    return {'samples': len(data), 'cell_accuracy': correct/total, 'piece_accuracy': piece_correct/piece_total if piece_total else None, 'piece_samples': piece_total, 'rejection_rate': rejected/len(data), 'mean_latency_ms': sum(latencies)/len(latencies), 'mean_fps': sum(fps)/len(fps)}
