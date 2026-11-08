from tetris_ai.core import Bag,HEIGHT,rotations,placements,play,place,WIDTH
from tetris_ai.human_lab import sample_latencies,summary

def test_bag(): assert len(set(Bag(4).next() for _ in range(1)))==1

def test_rotations():
    assert len(rotations('O'))==1
    assert len(rotations('I'))==2

def test_clear():
    b=[0]*HEIGHT;b[-1]=((1<<WIDTH)-1) ^ 0b1111
    result=place(tuple(b),((0,0),(1,0),(2,0),(3,0)),0,HEIGHT-1)
    assert result[1]==1

def test_reproducible():
    a=play(seed=8,turns=12); b=play(seed=8,turns=12)
    assert a==b and a['pieces']>0

def test_latency():
    assert sample_latencies(5)==sample_latencies(5)
    assert summary([100,200])['mean_ms']==150
