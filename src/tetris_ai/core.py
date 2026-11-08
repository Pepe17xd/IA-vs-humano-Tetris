"""Deterministic, simplified Tetris research environment (not TETR.IO rules parity)."""
import random
from dataclasses import dataclass

SHAPES = {
 'I': ((0,1),(1,1),(2,1),(3,1)), 'O': ((1,0),(2,0),(1,1),(2,1)),
 'T': ((1,0),(0,1),(1,1),(2,1)), 'S': ((1,0),(2,0),(0,1),(1,1)),
 'Z': ((0,0),(1,0),(1,1),(2,1)), 'J': ((0,0),(0,1),(1,1),(2,1)),
 'L': ((2,0),(0,1),(1,1),(2,1)),
}
WIDTH, HEIGHT = 10, 20

def rotate(cells):
    out = [(y, -x) for x,y in cells]
    minx, miny = min(x for x,y in out), min(y for x,y in out)
    return tuple(sorted((x-minx,y-miny) for x,y in out))

def rotations(piece):
    result=[]; original=SHAPES[piece]
    minx,miny=min(x for x,y in original),min(y for x,y in original)
    cells=tuple(sorted((x-minx,y-miny) for x,y in original))
    for _ in range(4):
        if cells not in result: result.append(cells)
        cells=rotate(cells)
    return result

def valid(board, cells, x, y):
    return all(0<=x+dx<WIDTH and y+dy<HEIGHT and (y+dy<0 or not(board[y+dy] & (1<<(x+dx)))) for dx,dy in cells)

def place(board, cells, x, y):
    if any(y+dy<0 for dx,dy in cells): return None
    rows=list(board)
    for dx,dy in cells: rows[y+dy] |= 1<<(x+dx)
    full=(1<<WIDTH)-1
    kept=[r for r in rows if r!=full]
    lines=HEIGHT-len(kept)
    return tuple([0]*lines+kept), lines

def placements(board, piece):
    """Hard-drop placements only; excludes tucks, spins, kicks and hold."""
    for ridx,cells in enumerate(rotations(piece)):
        maxx=max(x for x,y in cells)
        for x in range(WIDTH-maxx):
            y=-max(dy for dx,dy in cells)-1
            if not valid(board,cells,x,y): continue
            while valid(board,cells,x,y+1): y+=1
            result=place(board,cells,x,y)
            if result is not None: yield ridx,x,y,*result

def features(board):
    heights=[]; holes=0
    for x in range(WIDTH):
        occupied=[y for y in range(HEIGHT) if board[y] & (1<<x)]
        heights.append(HEIGHT-min(occupied) if occupied else 0)
        if occupied: holes+=sum(not (board[y] & (1<<x)) for y in range(min(occupied),HEIGHT))
    return sum(heights),holes,sum(abs(a-b) for a,b in zip(heights,heights[1:])),max(heights)

def score(board,lines):
    agg,holes,bump,maximum=features(board)
    return 7.0*lines-0.40*agg-2.8*holes-0.28*bump-0.12*maximum

@dataclass(frozen=True)
class Move:
    rotation:int
    x:int
    y:int
    board:tuple
    cleared:int

class Bag:
    def __init__(self,seed=42): self.rng=random.Random(seed); self.items=[]
    def next(self):
        if not self.items:
            self.items=list(SHAPES); self.rng.shuffle(self.items)
        return self.items.pop()

def search(board, queue, width=16):
    """Beam search with deterministic tie-breaking and future queue lookahead."""
    if not queue: raise ValueError('queue cannot be empty')
    beam=[(0.0,board,None)]
    for depth,piece in enumerate(queue):
        expanded={}
        for cumulative,b,first in beam:
            for rid,x,y,next_board,lines in placements(b,piece):
                move=first if first is not None else Move(rid,x,y,next_board,lines)
                value=cumulative + (0.88**depth)*score(next_board,lines)
                key=(next_board,move.rotation,move.x) if depth==0 else next_board
                prev=expanded.get(key)
                if prev is None or value>prev[0]: expanded[key]=(value,next_board,move)
        if not expanded: break
        beam=sorted(expanded.values(),key=lambda item:(-item[0],item[2].rotation,item[2].x))[:width]
    return beam[0][2] if beam else None

def play(seed=42, turns=100, depth=2, width=16):
    bag=Bag(seed); queue=[bag.next() for _ in range(depth)]
    board=(0,)*HEIGHT; lines=0; placed=0; log=[]
    for _ in range(turns):
        move=search(board,queue,width)
        if move is None: break
        board=move.board; lines+=move.cleared; placed+=1
        log.append({'piece':queue[0],'rotation':move.rotation,'x':move.x,'y':move.y,'cleared':move.cleared})
        queue=queue[1:]+[bag.next()]
    return {'seed':seed,'pieces':placed,'lines':lines,'top_out':placed<turns,'board':board,'moves':log}
