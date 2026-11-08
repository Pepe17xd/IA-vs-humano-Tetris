"""Offline human-performance modeling; does not generate browser inputs."""
import math
import random
import statistics

def sample_latencies(n=100, median_ms=180, log_sigma=0.25, seed=42):
    if n<1 or median_ms<=0 or log_sigma<0: raise ValueError('invalid parameters')
    rng=random.Random(seed)
    return [rng.lognormvariate(math.log(median_ms),log_sigma) for _ in range(n)]

def summary(values):
    if not values: raise ValueError('empty sample')
    return {'n':len(values),'mean_ms':statistics.mean(values),'median_ms':statistics.median(values),'std_ms':statistics.pstdev(values)}
