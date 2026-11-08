# Tetris AI Arena rules, version 1

This is the exact custom ruleset implemented by `web/src/game.js`. It is intended for local human-versus-agent research. It does not claim complete TETR.IO or Tetris Guideline parity.

## Board and pieces

- 10 columns, 20 visible rows and 2 hidden rows above them.
- Pieces are I, O, T, S, Z, J and L. A seeded xorshift32 generator shuffles a seven-piece bag using Fisher–Yates. A fixed seed produces the same sequence. The two players have separate copies of the random generator.
- Pieces spawn in a 4 × 4 SRS box at x = 3, y = 0. A colliding spawn loses.
- Movement is one cell per action. Rotation uses clockwise/counter-clockwise SRS kick tables converted to the screen coordinate system. O rotation changes orientation without a kick.
- Hold is available once per piece; swapping resets the held piece to spawn orientation. The queue maintains five visible upcoming pieces.
- The ghost piece is the current piece's hard-drop position.

## Timing and top-out

- Gravity begins at 820 ms per row, multiplied by `0.78` each 10-line level, with a 65 ms minimum after the shared preference scale is applied. The preferences screen scales both players' gravity equally.
- Soft drop advances at a 38 ms interval. Hard drop immediately locks.
- Ground contact starts a 500 ms lock timer. A successful horizontal move or rotation while grounded may reset it, up to 15 resets per piece. Downward movement clears the lock timer.
- Locking any cell into either hidden row tops out. Garbage insertion also tops out if a block must be pushed off the top.

## Score, spins and attacks

- Normal line-clear score is 100, 300, 500 or 800 for one to four lines, multiplied by the current level. Soft drop adds 1 per row; hard drop adds 2 per row.
- Full T-spin adds 400 points for zero lines, 800 for one, 1,200 for two and 1,600 for three or more. Mini T-spin adds 100 for zero or two-plus lines and 200 for one line. T-spin bonuses use the level at the start of the lock.
- The combo counter starts at zero on the first consecutive line clear and resets to -1 on a placement with no line clear. From the second consecutive clear onward, the score bonus is 50 × combo counter × level.
- A T-spin is recognized when the last action was a rotation and at least three of the four diagonal cells around the T pivot are occupied or outside the board. It is “full” when both corners in front of the T are occupied; otherwise it is “mini.”
- Normal attack table by cleared lines is 0, 0, 1, 2, 4. Full T-spin attacks are 0, 2, 4, 6 for zero through three lines; mini T-spin attacks are 0, 0, 1, 2. In this implementation, zero-line T-spins send zero attack.
- Tetrises and line-clearing T-spins are difficult clears. A difficult clear while back-to-back adds 1 attack; a non-difficult line clear breaks back-to-back. A no-line placement preserves it.
- Each consecutive line-clear combo adds `floor((combo counter - 1) / 2)` attack once the combo counter is above 1.
- On lock, outgoing attack first cancels the sender's queued incoming garbage. Remaining attack is queued for the opponent, including one deterministic hole per incoming row. Gravity locks produced in the same update are resolved together: each player cancels only garbage already queued before that update, then both outgoing attacks are queued symmetrically. At the receiver's next lock, the oldest queued hole becomes the lowest inserted row and later queued rows stack above it. Garbage rows do not count as line clears.
- Perfect clears are reported as an event but have no special score or attack bonus.

## Victory and fairness

The surviving player wins when the other board tops out. If both players top out during the same update, the result is a draw. Both engines use the same movement, rotation, gravity, scoring, attack, cancellation and garbage-insertion code. Identical-sequence mode uses the same seed for both independent board states.

The agent sees its current piece, hold state and five-piece preview. It cannot read future pieces beyond that queue or the opponent's hidden rows. It also receives the opponent's visible stack and pending garbage count, both public match information used to scale offensive scoring. Its first placement is found by a breadth-first search over left, right, soft drop and SRS rotations; its action path is replayed through the engine. At that lock, the search applies attack cancellation and projects the remaining queued garbage holes through the shared engine routine, including top-out risk. Future lookahead uses geometric hard-drop placements from the projected board. Advanced and Extreme also search reachable SRS T-spin landings for the first future T. The beam does not model future piece timing, new opponent attacks, or opponent responses. The agent has more computation than a human; per-level node and time budgets are exposed in the Lab.
