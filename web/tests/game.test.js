import test from 'node:test';
import assert from 'node:assert/strict';
import { action, CELLS, createGame, drawPiece, enqueueGarbage, lockPiece, makeRandom, PIECES, rotatePiece, serializeGame, tick, visibleRows } from '../src/game.js';
import { DIFFICULTIES, estimateOpponentThreat, evaluateBoard, findFuturePlacements, findPlacements, planMove } from '../src/agent.js';
import { drawCandidateOutlines } from '../src/lab-render.js';
import { createMatch, isCompetitiveResult, matchWinner, resolveMatchEvent, resolveMatchEvents, simulatedWinner, snapshotMatchSettings } from '../src/match.js';

test('7-bag produces every piece once and the same seed replays', () => {
  const a=makeRandom(41), b=makeRandom(41), sequenceA=[...Array(35)].map(()=>drawPiece(a)), sequenceB=[...Array(35)].map(()=>drawPiece(b));
  const first=sequenceA.slice(0,7);
  assert.deepEqual(new Set(first),new Set(['I','O','T','S','Z','J','L']));
  assert.deepEqual(sequenceA,sequenceB);
});

test('SRS rotation applies an I-piece wall kick at the left edge', () => {
  const game=createGame(12); game.current={kind:'I',rotation:1,x:-2,y:8};
  assert.equal(rotatePiece(game,-1),true);
  assert.equal(game.current.rotation,0); assert.equal(game.current.x,0);
});

test('SRS JLSTZ rotation kicks a T piece away from the left wall',()=>{
  const game=createGame(18);game.current={kind:'T',rotation:1,x:-1,y:8};
  assert.equal(rotatePiece(game,-1),true);
  assert.equal(game.current.rotation,0);assert.equal(game.current.x,0);assert.equal(game.current.y,8);
});

test('SRS I-piece floor kick moves the rotated piece upward',()=>{
  const game=createGame(19);game.current={kind:'I',rotation:0,x:0,y:19};
  assert.equal(rotatePiece(game,-1),true);
  assert.deepEqual(game.current,{kind:'I',rotation:3,x:2,y:18});
});

test('every tetromino rotates through a complete orientation cycle',()=>{
  for(const kind of PIECES){const game=createGame(2);game.current={kind,rotation:0,x:3,y:5};for(let i=0;i<4;i++)assert.equal(rotatePiece(game,1),true,kind);assert.equal(game.current.rotation,0,kind);}
  assert.deepEqual(CELLS.O[0],CELLS.O[1]);
});

test('collision checks walls, floor and occupied cells', () => {
  const game=createGame(4);
  game.current={kind:'T',rotation:0,x:3,y:10};
  assert.equal(action(game,'left').moved,true);
  game.board[12] |= 1 << 3;
  game.current={kind:'T',rotation:0,x:3,y:10};
  assert.equal(action(game,'softDrop').moved,false);
  game.current={kind:'I',rotation:0,x:-1,y:6};
  assert.equal(rotatePiece(game,1),true); // SRS finds a legal position.
});

test('hold is available once per piece and resets the held piece rotation', () => {
  const game=createGame(17); const first=game.current.kind, next=game.queue[0];
  assert.equal(action(game,'hold').held,true); assert.equal(game.hold,first); assert.equal(game.current.kind,next);
  assert.equal(game.canHold,false); assert.equal(action(game,'hold').moved,false);
  action(game,'hardDrop'); assert.equal(game.canHold,true);
  game.current.rotation=2; action(game,'hold'); assert.equal(game.current.rotation,0);
});

test('a completed row clears and updates score, level, and combo', () => {
  const game=createGame(7); game.board[20]=1023 ^ (0b1111 << 3);
  game.current={kind:'I',rotation:0,x:3,y:19}; game.lastAction='drop';
  const result=lockPiece(game);
  assert.equal(result.cleared,1); assert.equal(game.lines,1); assert.equal(game.score,100);
  assert.equal(game.combo,0); assert.equal(game.board[2],0); assert.equal(result.perfectClear,true);
});

test('line-clear points use the level at the start of the lock',()=>{
  const game=createGame(8);game.lines=9;game.level=1;
  for(let i=0;i<2;i++){game.board=Array(22).fill(0);game.board[20]=1023 ^ (0b1111<<3);game.current={kind:'I',rotation:0,x:3,y:19};game.lastAction='drop';game.combo=-1;lockPiece(game);}
  assert.equal(game.level,2);assert.equal(game.score,300);
});

test('rotated T in three occupied corners scores a T-spin single and attack', () => {
  const game=createGame(31);
  game.board[19]=1023 ^ (0b111 << 3);
  game.board[18]=(1<<3)|(1<<5); game.board[20]=1<<3;
  game.current={kind:'T',rotation:0,x:3,y:18}; game.lastAction='rotate';
  const result=lockPiece(game);
  assert.equal(result.spin,'full'); assert.equal(result.cleared,1); assert.equal(result.attack,2); assert.equal(game.score,900);
  game.board=Array(22).fill(0);game.board[19]=1023 ^ (0b111 << 3);game.board[18]=(1<<3)|(1<<5);game.board[20]=1<<3;
  game.current={kind:'T',rotation:0,x:3,y:18};game.lastAction='rotate';
  assert.equal(lockPiece(game).attack,3); // Back-to-back difficult-clear bonus.
});

test('a T-spin mini is recognized separately from a full spin',()=>{
  const game=createGame(33);
  game.board[18]|=1<<3;
  game.board[20]|=(1<<3)|(1<<5);
  game.current={kind:'T',rotation:0,x:3,y:18};game.lastAction='rotate';
  const result=lockPiece(game);
  assert.equal(result.spin,'mini');
  assert.equal(result.cleared,0);
  assert.equal(result.attack,0);
  assert.equal(game.score,100);
});

test('consecutive line clears award combo score and attack bonuses',()=>{
  const game=createGame(14);
  for(let index=0;index<4;index++){
    game.board=Array(22).fill(0);game.board[20]=1023 ^ (0b1111<<3);
    game.current={kind:'I',rotation:0,x:3,y:19};game.lastAction='drop';
    const result=lockPiece(game);
    assert.equal(game.combo,index);
    if(index===3)assert.equal(result.attack,1);
  }
  assert.equal(game.attacksSent,1);assert.equal(game.score,700);
});

test('AI scoring values the extra attack for continuing back-to-back clears',()=>{
  const board=Array(22).fill(0),weights={aggregate:0,holes:0,bump:0,height:0,lines:0,attack:2,wells:0,garbage:0};
  const ordinary=evaluateBoard(board,4,0,weights,0,null,false);
  const continued=evaluateBoard(board,4,0,weights,0,null,true);
  const emptyPlacement=evaluateBoard(board,0,0,weights,0,null,false);
  const emptyBackToBack=evaluateBoard(board,0,0,weights,0,null,true);
  assert.equal(continued-ordinary,2);
  assert.equal(emptyBackToBack,emptyPlacement);
});

test('advanced evaluation penalizes deeper holes beyond their hole count',()=>{
  const weights={aggregate:0,holes:0,holeDepth:1,rowTransitions:0,columnTransitions:0,bump:0,height:0,lines:0,attack:0,wells:0,garbage:0};
  const shallow=Array(22).fill(0),deep=Array(22).fill(0),column=1<<4;
  shallow[19]=column;shallow[21]=column;
  deep[18]=column;deep[21]=column;
  assert.ok(evaluateBoard(shallow,0,0,weights)>evaluateBoard(deep,0,0,weights));
});

test('advanced evaluation penalizes row and column transitions',()=>{
  const base={aggregate:0,holes:0,holeDepth:0,rowTransitions:0,columnTransitions:0,bump:0,height:0,lines:0,attack:0,wells:0,garbage:0};
  const flat=Array(22).fill(0),gappy=Array(22).fill(0);
  flat[21]=0b0000111111;gappy[21]=0b0001010101;
  assert.ok(evaluateBoard(flat,0,0,{...base,rowTransitions:1})>evaluateBoard(gappy,0,0,{...base,rowTransitions:1}));
  const compact=Array(22).fill(0),verticalHole=Array(22).fill(0),column=1<<4;
  for(let y=18;y<22;y++)compact[y]=column;
  verticalHole[18]=column;verticalHole[20]=column;verticalHole[21]=column;
  assert.ok(evaluateBoard(compact,0,0,{...base,columnTransitions:1})>evaluateBoard(verticalHole,0,0,{...base,columnTransitions:1}));
});

test('attack cancels incoming garbage before sending the remainder', () => {
  const game=createGame(32); enqueueGarbage(game,3);
  game.board[19]=1023 ^ (0b111 << 3); game.board[18]=(1<<3)|(1<<5); game.board[20]=1<<3;
  game.current={kind:'T',rotation:0,x:3,y:18}; game.lastAction='rotate';
  const result=lockPiece(game);
  assert.equal(result.attack,0); assert.equal(result.canceled,2); assert.equal(result.received,1);
  assert.equal(game.incoming.length,0); assert.equal(game.board[21].toString(2).replaceAll('0','').length,9);
});

test('uncancelled garbage tops out when it would push occupied hidden rows off the board',()=>{
  const game=createGame(34);enqueueGarbage(game,4);game.board[0]=1;
  game.board[19]=1023 ^ (0b111<<3);game.board[18]=(1<<3)|(1<<5);game.board[20]=1<<3;
  game.current={kind:'T',rotation:0,x:3,y:18};game.lastAction='rotate';
  const result=lockPiece(game);
  assert.equal(result.canceled,2);
  assert.equal(result.received,2);
  assert.equal(result.topOut,true);
  assert.equal(game.alive,false);
});

test('queued garbage holes are applied in order after attack cancellation',()=>{
  const game=createGame(64);enqueueGarbage(game,3);const holes=game.incoming.slice();
  const twin=createGame(64);enqueueGarbage(twin,3);
  game.board[19]=1023 ^ (0b111 << 3);game.board[18]=(1<<3)|(1<<5);game.board[20]=1<<3;
  game.current={kind:'T',rotation:0,x:3,y:18};game.lastAction='rotate';
  const result=lockPiece(game);
  twin.board[19]=1023 ^ (0b111 << 3);twin.board[18]=(1<<3)|(1<<5);twin.board[20]=1<<3;
  twin.current={kind:'T',rotation:0,x:3,y:18};twin.lastAction='rotate';
  lockPiece(twin);
  assert.deepEqual(twin.board,game.board);
  assert.equal(result.canceled,2);assert.equal(result.received,1);
  assert.equal(game.board[21],1023 ^ (1<<holes[2]));
  assert.equal(game.incoming.length,0);

  const stack=createGame(66);enqueueGarbage(stack,3);const sequence=stack.incoming.slice();
  stack.current={kind:'O',rotation:0,x:3,y:5};
  const stackResult=lockPiece(stack);
  assert.equal(stackResult.received,3);
  for(let i=0;i<sequence.length;i++)assert.equal(stack.board[21-i],1023 ^ (1<<sequence[i]));
});

test('gravity scaling cannot exceed the documented 65 ms minimum interval',()=>{
  const game=createGame(65);game.level=20;
  tick(game,64,false,1.35);assert.equal(game.current.y,0);
  tick(game,1,false,1.35);assert.equal(game.current.y,1);
});

test('gravity, hard drop, ghost and deterministic games behave consistently', () => {
  const a=createGame(99), b=createGame(99);
  assert.deepEqual(a.queue,b.queue); assert.deepEqual(a.board,b.board);
  assert.equal(action(a,'hardDrop').locked,true);
  assert.equal(a.pieces,1); assert.ok(a.score>=0);
  const y=b.current.y; tick(b,900); assert.ok(b.current.y>y);
  assert.equal(CELLS.O[0].length,4);
});

test('a seed and identical action/garbage sequence reproduce the complete engine state',()=>{
  const a=createGame(991),b=createGame(991);
  enqueueGarbage(a,3);enqueueGarbage(b,3);
  for(const command of ['left','rotateCW','hardDrop','hold','right','rotateCCW','hardDrop','hardDrop']){
    const resultA=action(a,command),resultB=action(b,command);
    assert.deepEqual(resultA,resultB,command);
    assert.deepEqual(serializeGame(a),serializeGame(b),`state after ${command}`);
  }
  assert.equal(a.incoming.length,b.incoming.length);
  assert.deepEqual(a.board,b.board);
});

test('a grounded piece locks only after the configured delay',()=>{
  const game=createGame(100);
  game.board[12]=(1<<4)|(1<<5);
  game.current={kind:'O',rotation:0,x:3,y:10};
  assert.equal(tick(game,499),null);
  assert.equal(game.pieces,0);
  const result=tick(game,1);
  assert.equal(result.locked,true);
  assert.equal(game.pieces,1);
});

test('grounded movement resets lock delay at most fifteen times per piece',()=>{
  const game=createGame(101);game.current={kind:'O',rotation:0,x:3,y:20};game.lockClock=430;
  assert.equal(action(game,'left').moved,true);assert.equal(game.lockClock,0);assert.equal(game.lockResets,1);
  game.lockClock=430;game.lockResets=15;
  assert.equal(action(game,'right').moved,true);assert.equal(game.lockClock,430);assert.equal(game.lockResets,15);
});

test('locking into the hidden rows ends the game',()=>{
  const game=createGame(23);game.current={kind:'O',rotation:0,x:3,y:0};
  const result=lockPiece(game);assert.equal(result.topOut,true);assert.equal(game.alive,false);
});

test('head-to-head match routes attacks and records a legitimate winner',()=>{
  const match=createMatch(53,true);
  assert.deepEqual(match.human.queue,match.ai.queue);
  assert.equal(matchWinner(match.human,match.ai),null);
  assert.equal(resolveMatchEvent(match,'human',{locked:true,attack:2}),null);
  assert.equal(match.ai.incoming.length,2);
  match.ai.alive=false;
  assert.equal(resolveMatchEvent(match,'ai',{topOut:true}),'human');
  assert.equal(match.winner,'human');
});

test('opponent garbage is inserted in the receiver board on its next lock',()=>{
  const match=createMatch(67,true);
  assert.equal(resolveMatchEvent(match,'human',{locked:true,attack:4}),null);
  const queuedHoles=match.ai.incoming.slice();
  assert.equal(queuedHoles.length,4);
  const result=action(match.ai,'hardDrop');
  assert.equal(result.locked,true);
  assert.equal(result.received,4);
  assert.equal(match.ai.incoming.length,0);
  const full=(1<<10)-1;
  assert.deepEqual(match.ai.board.slice(-4),queuedHoles.slice().reverse().map(hole=>full^(1<<hole)));
  assert.equal(match.ai.alive,true);
});

test('simultaneous locks queue attacks after both players resolve their current pieces',()=>{
  const match=createMatch(59,true);
  assert.equal(resolveMatchEvents(match,{locked:true,attack:2},{locked:true,attack:1}),null);
  assert.equal(match.ai.incoming.length,2);
  assert.equal(match.human.incoming.length,1);
  match.human.alive=false;match.ai.alive=false;
  assert.equal(resolveMatchEvents(match,{topOut:true},{topOut:true}),'draw');
});

test('human actions and worker-style AI plans advance separate boards in one shared match',()=>{
  const match=createMatch(111,true);
  for(let turn=0;turn<4;turn++){
    const humanResult=action(match.human,'hardDrop');
    assert.equal(humanResult.locked,true);
    assert.equal(resolveMatchEvent(match,'human',humanResult),null);
    const ai=match.ai;
    const plan=planMove({board:ai.board,current:ai.current,queue:ai.queue.slice(0,5),hold:ai.hold,canHold:ai.canHold,incoming:ai.incoming.slice(),combo:ai.combo,opponent:{board:visibleRows(match.human),incoming:match.human.incoming.length}},'beginner',turn+1);
    assert.ok(plan.move);
    let aiResult;
    for(const command of plan.move.path){
      aiResult=action(ai,command);
      assert.ok(aiResult.moved||aiResult.locked,`${command} must be legal`);
      if(aiResult.locked)break;
    }
    assert.equal(aiResult?.locked,true);
    assert.equal(resolveMatchEvent(match,'ai',aiResult),null);
  }
  assert.equal(match.human.pieces,4);
  assert.equal(match.ai.pieces,4);
  assert.equal(match.human.alive,true);
  assert.equal(match.ai.alive,true);
});

test('experimental human outcomes are reproducible and stay in configured bounds',()=>{
  assert.equal(simulatedWinner(42,100),'human');assert.equal(simulatedWinner(42,0),'ai');
  assert.equal(simulatedWinner(42,35),simulatedWinner(42,35));
  assert.equal(isCompetitiveResult({simulated:true,winner:'human'}),false);
  assert.equal(isCompetitiveResult({simulated:false,winner:'ai'}),true);
  assert.throws(()=>simulatedWinner(42,101),RangeError);
});

test('match settings are validated, copied and frozen for the lifetime of a match',()=>{
  const preferences={difficulty:'extreme',identical:true,experimental:true,probability:70,gravityScale:1.2};
  const config=snapshotMatchSettings(preferences);
  preferences.difficulty='beginner';preferences.identical=false;preferences.probability=0;preferences.gravityScale=.8;
  assert.deepEqual(config,{difficulty:'extreme',identical:true,experimental:true,probability:70,gravityScale:1.2});
  assert.equal(Object.isFrozen(config),true);
  assert.throws(()=>{config.difficulty='beginner';},TypeError);
  assert.deepEqual(snapshotMatchSettings({difficulty:'invalid',probability:140,gravityScale:0}),{
    difficulty:'intermediate',identical:false,experimental:false,probability:100,gravityScale:.7,
  });
});

test('each AI level produces a legal, reachable first move with increasing search capacity', () => {
  assert.equal(DIFFICULTIES.extreme.depth,6);
  assert.ok(DIFFICULTIES.extreme.nodeLimit>DIFFICULTIES.advanced.nodeLimit);
  const game=createGame(13);
  const results=Object.keys(DIFFICULTIES).map(difficulty=>planMove({board:game.board,current:game.current,queue:game.queue,hold:game.hold,canHold:true,incoming:[],combo:-1},difficulty));
  for(const result of results){
    assert.ok(result.move,`${result.difficulty} should return a move`);
    assert.ok(result.move.path.at(-1)==='hardDrop');
    assert.ok(result.nodes>0); assert.ok(result.decisionMs>=0);
    const clone=createGame(13); clone.current={...game.current};
    for(const command of result.move.path){const outcome=action(clone,command);assert.ok(outcome.moved||outcome.locked,`${command} must be legal`);}
    assert.equal(clone.pieces,1);
  }
  assert.ok(results.at(-1).depth>=results[0].depth);
  assert.ok(results.at(-1).nodes>=results[0].nodes);
});

test('an interrupted search layer preserves the last complete set of alternatives',()=>{
  const game=createGame(13);
  const state={board:game.board,current:game.current,queue:game.queue,hold:game.hold,canHold:true,incoming:[],combo:-1};
  const baseline=planMove(state,'beginner');
  const config=DIFFICULTIES.intermediate, original=config.nodeLimit;
  try {
    config.nodeLimit=baseline.candidateCount+1;
    const interrupted=planMove(state,'intermediate');
    assert.equal(interrupted.depth,1);
    assert.ok(interrupted.nodes>baseline.candidateCount);
    assert.ok(interrupted.candidates.length>1);
  } finally { config.nodeLimit=original; }
});

test('AI rejects placements that top out on pending garbage and selects a clearing defense',()=>{
  const game=createGame(91);game.board=Array(22).fill(0);game.board[0]=1;
  for(let y=18;y<22;y++)game.board[y]=1023 ^ (1<<5);
  game.current={kind:'I',rotation:0,x:3,y:0};game.incoming=[4];game.canHold=false;game.combo=-1;game.backToBack=false;
  const plan=planMove({board:game.board,current:{...game.current},queue:[],hold:null,canHold:false,incoming:game.incoming.slice(),combo:game.combo,backToBack:game.backToBack},'beginner');
  assert.ok(plan.move);
  let result;
  for(const command of plan.move.path){result=action(game,command);assert.ok(result.moved||result.locked,command);if(result.locked)break;}
  assert.equal(result.cleared,4);assert.equal(result.canceled,1);assert.equal(result.received,0);assert.equal(result.topOut,false);assert.equal(game.alive,true);
});

test('reachable search preserves rotated and non-rotated routes to the same T landing',()=>{
  const board=Array.from({length:22},()=>0);
  const placements=findPlacements(board,{kind:'T',rotation:0,x:3,y:0},true);
  const sameLanding=placements.filter(item=>item.x===3&&item.rotation===0);
  assert.ok(sameLanding.some(item=>!item.spun));
  assert.ok(sameLanding.some(item=>item.spun));
  assert.equal(new Set(sameLanding.map(item=>item.y)).size,1);
});

test('future-piece lookahead includes rotation-ending T routes recognized as spins by the engine',()=>{
  const board=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,110,495,11,845,767,1015,410,712];
  let spinResult=null;
  for(const candidate of findFuturePlacements(board,'T').filter(item=>item.spun)){
    const game=createGame(72);game.board=board.slice();game.current={kind:'T',rotation:0,x:3,y:0};
    let reachable=true;
    for(const command of candidate.path){const result=action(game,command);if(!result.moved&&!result.locked){reachable=false;break;}}
    if(!reachable)continue;
    const result=action(game,'hardDrop');
    if(result.spin){spinResult=result;break;}
  }
  assert.ok(spinResult,'at least one future spin candidate should execute as a real engine spin');
  assert.equal(spinResult.spin,'mini');
});

test('AI can choose an empty hold slot and execute its reachable route',()=>{
  const game=createGame(2);
  const plan=planMove({board:game.board,current:game.current,queue:game.queue.slice(0,5),hold:game.hold,canHold:game.canHold,incoming:[],combo:-1},'beginner');
  assert.equal(plan.move.useHold,true);assert.equal(plan.move.path[0],'hold');
  for(const command of plan.move.path){const result=action(game,command);assert.ok(result.moved||result.locked,command);}
  assert.equal(game.pieces,1);assert.equal(game.hold,'T');
});

test('advanced AI increases offensive weight when the visible opponent is under pressure',()=>{
  const game=createGame(73), empty=Array(20).fill(0), pressured=Array(20).fill(0);
  const moderate=Array(20).fill(0); moderate[14]=1;
  pressured[2]=1; // Visible stack height 18.
  assert.equal(estimateOpponentThreat({board:empty,incoming:0}),0);
  assert.equal(estimateOpponentThreat({board:empty,incoming:6}),.55);
  assert.equal(estimateOpponentThreat({board:moderate,incoming:0}),.5);
  assert.equal(estimateOpponentThreat({board:pressured,incoming:0}),1);
  const input={board:game.board,current:game.current,queue:game.queue.slice(0,5),hold:game.hold,canHold:game.canHold,incoming:[],combo:-1};
  const safe=planMove({...input,opponent:{board:empty,incoming:0}},'extreme');
  const underPressure=planMove({...input,opponent:{board:pressured,incoming:0}},'extreme');
  const beginnerPressure=planMove({...input,opponent:{board:pressured,incoming:0}},'beginner');
  assert.ok(underPressure.attackWeight>safe.attackWeight);
  assert.ok(underPressure.attackWeight-safe.attackWeight>beginnerPressure.attackWeight-DIFFICULTIES.beginner.weights.attack);
  assert.equal(underPressure.opponentThreat,1);
  assert.ok(underPressure.move);
});

test('Lab draws the chosen and alternative candidate cells at their computed landings',()=>{
  const strokes=[];
  const context={strokeRect(...rect){strokes.push({rect,color:this.strokeStyle,alpha:this.globalAlpha});}};
  const count=drawCandidateOutlines(context,[
    {kind:'T',rotation:0,x:3,y:18},
    {kind:'I',rotation:1,x:5,y:17},
  ],20,18);
  assert.equal(count,8);
  assert.equal(strokes[0].color,'#ffffff');
  assert.equal(strokes[0].alpha,.95);
  assert.equal(strokes[4].color,'#b998ff');
  assert.equal(strokes[4].alpha,.34);
  assert.equal(context.globalAlpha,1);
});
