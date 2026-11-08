import { action, ghostY, tick, cellsAt, CELLS, WIDTH, VISIBLE_ROWS, HIDDEN_ROWS, rngNext, visibleRows } from './game.js';
import { createTouchControls } from './input.js';
import { drawCandidateOutlines } from './lab-render.js';
import { DIFFICULTIES } from './agent.js';
import { executePlanStep } from './agent-executor.js';
import { createMatch, isCompetitiveResult, resolveMatchEvent, resolveMatchEvents, simulatedWinner, snapshotMatchSettings } from './match.js';
import { bindCurrentWorker } from './worker-guard.js';

const app = document.querySelector('#app');
const icons = {
  bolt: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
const colors = { I:'#52e9ef', O:'#f7d96b', T:'#bd88ff', S:'#6be7aa', Z:'#ff6d94', J:'#729aff', L:'#ffa466' };
const settings = Object.assign({ difficulty:'intermediate', identical:true, experimental:false, probability:35, gravityScale:1 }, safeRead('tia.settings', {}));
let screen = 'home', game = null, worker = null, gameTimer = 0, rafId = 0;
let aiRequestId = 0, aiPathTimer = 0, lastUiAt = 0, matchStarted = 0, matchElapsed = 0, ended = false;
let latestDecision = null, lastHumanEvent = null, lastAiEvent = null;
let compareWorker = null, compareRequestId = 0, comparisonResults = null, comparisonMeta = null;
let mobileControls = null;

function safeRead(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function safeWrite(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function esc(value) { return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function saveSettings() { safeWrite('tia.settings', settings); }
function formatTime(ms) { const sec = Math.floor(ms / 1000); return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`; }
function difficultyLabel(value = settings.difficulty) { return DIFFICULTIES[value]?.label || 'INTERMEDIO'; }
function candidateWidth(score,candidates){const values=candidates.map(item=>item.score),low=Math.min(...values),high=Math.max(...values);return `${Math.round(8+(high===low?1:(score-low)/(high-low))*92)}%`;}

function shell(content, active = '') {
  app.innerHTML = `<div class="ambient ambient-one"></div><div class="ambient ambient-two"></div>
    <header class="topbar"><a class="brand" href="#home" data-screen="home" aria-label="Tetris AI Arena home"><span class="brand-mark"><i></i><i></i><i></i><i></i></span><span>TETRIS<span class="brand-accent">AI</span><small>ARENA</small></span></a>
      <nav class="nav-links" aria-label="Main navigation"><button class="nav-link ${active==='lab'?'selected':''}" data-screen="lab">AI Lab</button><button class="nav-link ${active==='stats'?'selected':''}" data-screen="stats">Statistics</button><button class="nav-link ${active==='howto'?'selected':''}" data-screen="howto">How to play</button></nav>
      <div class="top-actions"><span class="status-pill"><span></span> LOCAL ARENA</span><button class="icon-button" data-screen="settings" aria-label="Settings">⚙</button></div></header>
    <main>${content}</main><footer class="footer"><span>BUILT FOR THE NEXT MOVE</span><span>LOCAL · REPRODUCIBLE · OPEN</span></footer>`;
  app.querySelectorAll('[data-screen]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.screen)));
}

function navigate(target) {
  if (game && !ended && !game.paused && ['game','lab'].includes(screen) && !['game','lab'].includes(target)) pauseMatch(true);
  screen = target;
  if (target === 'home') renderHome();
  else if (target === 'game' && game) renderGame();
  else if (target === 'lab') renderLab();
  else if (target === 'stats') renderStats();
  else if (target === 'settings') renderSettings();
  else renderHowTo();
}

function renderHome() {
  shell(`<section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="eyebrow-line"></span> A NEW KIND OF HEAD TO HEAD</div>
    <h1>Can you outthink<br/><span>the machine?</span></h1><p class="hero-lede">One board. One rival. A thousand ways to think ahead. Step into a competitive Tetris arena built for humans and AI.</p>
    <div class="hero-actions"><button class="button button-primary" id="start-match">Play against AI ${icons.arrow}</button><button class="button button-quiet" data-screen="lab">Explore AI Lab</button></div>
    <div class="hero-proof"><div class="avatar-stack"><span>H</span><span class="bot-avatar">AI</span></div><span>Same rules. Different minds.</span><span class="proof-sep"></span><span class="mono">v1.0 · LOCAL PLAY</span></div></div>
    <div class="hero-art" aria-label="Abstract arcade board artwork"><div class="orbit orbit-a"></div><div class="orbit orbit-b"></div><div class="art-glow"></div><div class="mini-board"><div class="mini-top"><span>ARENA 01</span><span class="live-dot">● LIVE</span></div><div class="mini-grid">${Array.from({length:160},(_,i)=>{const row=Math.floor(i/10),col=i%10;let c=''; if(row>13 && (row===19||((row===18||row===17)&&col!==4&&col!==7)|| (row===16&&col!==4&&col!==5&&col!==7)))c='filled';if((row===12&&(col===2||col===3||col===4||col===3+1)) || (row===11&&col===3)) c='active';return `<i class="${c} ${c==='filled'&&((row+col)%7===0)?'alt':''}"></i>`;}).join('')}</div><div class="mini-readout"><span><b>AI</b> is thinking</span><span class="thinking"><i></i><i></i><i></i></span></div></div><div class="float-tag tag-left"><span>◈</span> BEAM SEARCH</div><div class="float-tag tag-right"><span>⌁</span> 7-BAG RNG</div><div class="art-caption"><span>01</span> EVERY MOVE HAS A REASON</div></div>
  </section><section class="feature-strip"><div><span class="feature-icon cyan">${icons.bolt}</span><span><b>4 levels of reasoning</b><small>From first steps to deep search</small></span></div><div><span class="feature-icon violet">⌘</span><span><b>Fair by design</b><small>Shared rules, seeded pieces</small></span></div><div><span class="feature-icon magenta">◉</span><span><b>See how it thinks</b><small>Every search, out in the open</small></span></div><button class="feature-link" data-screen="howto">LEARN THE RULES ${icons.arrow}</button></section>`);
  app.querySelector('#start-match').addEventListener('click', () => showSetup());
}

function showSetup() {
  const values = Object.entries(DIFFICULTIES).map(([key,item]) => `<option value="${key}" ${settings.difficulty===key?'selected':''}>${item.label} · depth ${item.depth}</option>`).join('');
  const modal = document.createElement('div'); modal.className = 'modal-backdrop'; modal.innerHTML = `<section class="setup-card"><button class="modal-close" aria-label="Close">×</button><div class="eyebrow">MATCH CONFIGURATION</div><h2>Set the arena.</h2><p>Choose a rival and lock in the rules for this match.</p>
    <label>AI REASONING<select id="setup-difficulty">${values}</select></label><label>SEED <input id="setup-seed" type="number" value="${Math.floor(Math.random()*999999)+1}" min="0" max="4294967295"/></label>
    <label class="check-row"><input id="setup-identical" type="checkbox" ${settings.identical?'checked':''}/><span><b>Identical piece sequences</b><small>Both boards draw from the same seeded 7-bag.</small></span></label>
    <label class="check-row"><input id="setup-experimental" type="checkbox" ${settings.experimental?'checked':''}/><span><b>Human victory simulation</b><small>Seeded experimental outcome; excluded from competitive stats.</small></span></label>
    <label id="probability-row" class="probability-row">SIMULATED HUMAN WIN CHANCE <span><input id="setup-probability" type="range" min="0" max="100" value="${settings.probability}"/><b id="probability-value">${settings.probability}%</b></span></label>
    <button class="button button-primary setup-start" id="confirm-start">Enter the arena ${icons.arrow}</button></section>`;
  app.append(modal);
  const experimental = modal.querySelector('#setup-experimental'), row = modal.querySelector('#probability-row');
  row.classList.toggle('disabled', !experimental.checked); experimental.addEventListener('change', () => row.classList.toggle('disabled', !experimental.checked));
  modal.querySelector('#setup-probability').addEventListener('input', event => modal.querySelector('#probability-value').textContent = `${event.target.value}%`);
  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#confirm-start').addEventListener('click', () => {
    settings.difficulty = modal.querySelector('#setup-difficulty').value;
    settings.identical = modal.querySelector('#setup-identical').checked;
    settings.experimental = modal.querySelector('#setup-experimental').checked;
    settings.probability = Number(modal.querySelector('#setup-probability').value);
    const seed = Number(modal.querySelector('#setup-seed').value) >>> 0;
    saveSettings(); modal.remove(); startMatch(seed, settings);
  });
}

function startMatch(seed = 42, matchSettings = settings) {
  stopMatch();
  const config = snapshotMatchSettings(matchSettings);
  game = { ...createMatch(seed,config.identical), config, paused:false, finished:null };
  screen='game'; ended=false; latestDecision=null; lastHumanEvent=null; lastAiEvent=null; matchStarted=performance.now(); matchElapsed=0; aiRequestId=0;
  worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type:'module' });
  const match=game, matchWorker=worker;
  bindCurrentWorker(matchWorker,match,(candidateGame,candidateWorker)=>game===candidateGame&&worker===candidateWorker,
    onPlan,pauseOnPlannerError);
  renderGame(); requestAI(); gameTimer=window.setInterval(gameStep, 16);
}

function stopMatch() {
  if (gameTimer) clearInterval(gameTimer); gameTimer=0;
  if (aiPathTimer) clearTimeout(aiPathTimer); aiPathTimer=0;
  mobileControls?.cancel(); mobileControls=null;
  if (worker) worker.terminate(); worker=null;
  if (rafId) cancelAnimationFrame(rafId); rafId=0;
}

function statusMessage(message) { const node=app.querySelector('#match-status'); if(node) node.textContent=message; }

function pauseOnPlannerError(message) {
  if (!game || ended) return;
  game.plannerFailed=true;
  worker?.terminate(); worker=null;
  if (!game.paused) pauseMatch(true);
  const notice=`AI calculation failed; match paused and no result recorded: ${message}`;
  statusMessage(notice);
  const pauseMessage=app.querySelector('#pause-message');
  if (pauseMessage) pauseMessage.textContent=notice;
  const resume=app.querySelector('#resume-overlay');
  if (resume) resume.textContent='Restart match';
  const pauseButton=app.querySelector('#pause-match');
  if (pauseButton) pauseButton.textContent='↻ Restart';
}

function requestAI() {
  if (aiPathTimer) clearTimeout(aiPathTimer); aiPathTimer=0;
  if (!game || game.paused || ended || !game.ai.alive || !game.ai.current || !worker) return;
  const requestId=++aiRequestId, state=snapshotAIState();
  worker.postMessage({state,difficulty:game.config.difficulty,requestId});
}

function snapshotAIState() {
  return {board:game.ai.board.slice(),current:{...game.ai.current},queue:game.ai.queue.slice(0,5),hold:game.ai.hold,canHold:game.ai.canHold,incoming:game.ai.incoming.slice(),combo:game.ai.combo,backToBack:game.ai.backToBack,opponent:{board:visibleRows(game.human),incoming:game.human.incoming.length}};
}

function runLevelComparison() {
  if (!game?.ai?.alive || !game.ai.current) return;
  compareWorker?.terminate();
  const requestId=++compareRequestId;
  comparisonMeta={seed:game.seed,pieces:game.ai.pieces};
  comparisonResults=null;
  const target=app.querySelector('#lab-comparison-results');
  const button=app.querySelector('#lab-compare');
  if(button)button.disabled=true;
  if(target)target.innerHTML='<div class="empty-state" role="status">Calculating all four levels from one frozen game snapshot…</div>';
  compareWorker=new Worker(new URL('./ai-compare-worker.js',import.meta.url),{type:'module'});
  compareWorker.onmessage=event=>{
    if(event.data.requestId!==compareRequestId)return;
    comparisonResults=event.data.results;
    compareWorker?.terminate();compareWorker=null;
    renderLevelComparison();
  };
  compareWorker.onerror=event=>{
    if(requestId!==compareRequestId)return;
    compareWorker?.terminate();compareWorker=null;
    if(target)target.innerHTML='<div class="empty-state" role="status">Level comparison failed. Start a new comparison to retry.</div>';
    if(button)button.disabled=false;
    event.preventDefault();
  };
  compareWorker.postMessage({state:snapshotAIState(),requestId});
}

function renderLevelComparison() {
  const target=app.querySelector('#lab-comparison-results');
  const button=app.querySelector('#lab-compare');
  if(button)button.disabled=false;
  if(!target||!comparisonResults)return;
  target.innerHTML=`<div class="comparison-snapshot">Snapshot · seed ${comparisonMeta?.seed??'—'} · AI pieces locked ${comparisonMeta?.pieces??'—'}</div><div class="comparison-table" role="table" aria-label="Calculated AI level comparison"><div class="comparison-row comparison-head" role="row"><span>LEVEL</span><span>SELECTED LANDING</span><span>LOOKAHEAD</span><span>NODES</span><span>TIME</span></div>${comparisonResults.map(result=>{
    if(result.error)return `<div class="comparison-row" role="row"><b>${difficultyLabel(result.difficulty)}</b><span class="comparison-error" role="cell">Planner error: ${esc(result.error)}</span><span>—</span><span>—</span><span>—</span></div>`;
    const move=result.move;
    return `<div class="comparison-row" role="row"><b>${difficultyLabel(result.difficulty)}</b><span role="cell">${move?`${move.useHold?'HOLD · ':''}${move.kind} · column ${move.x+1} · rotation ${move.rotation}`:'No legal move'}</span><span role="cell">${result.depth} / ${DIFFICULTIES[result.difficulty].depth} ply</span><span role="cell">${result.nodes.toLocaleString()}</span><span role="cell">${result.decisionMs.toFixed(1)} ms</span></div>`;
  }).join('')}</div><p class="comparison-footnote">All four planners read the same frozen visible state. Search budgets differ by level. Heuristic scores use level-specific weights, so compare moves and search effort rather than raw score values.</p>`;
}

function onPlan(plan) {
  if (!game || game.paused || ended || plan.requestId !== aiRequestId) return;
  if (plan.error) {
    pauseOnPlannerError(plan.error);
    return;
  }
  latestDecision=plan; game.ai.totalThinkMs+=plan.decisionMs||0; game.ai.decisionCount++;
  statusMessage(`AI search ${plan.depth} ply · ${plan.nodes.toLocaleString()} nodes · ${(plan.decisionMs||0).toFixed(1)} ms`);
  const active=game.ai.current;
  if (!active || !plan.move) { if (!plan.move && game.ai.alive) { game.ai.alive=false; routeResult('ai',{topOut:true}); } return; }
  const signature=`${game.ai.pieces}:${active.kind}:${active.x}:${active.rotation}`;
  const path=[...plan.move.path]; let index=0;
  const runNext=()=>{
    aiPathTimer=0;
    if (!game || game.paused || ended) return;
    const p=game.ai.current;
    if (!p) { requestAI(); return; }
    if (index===0 && `${game.ai.pieces}:${p.kind}:${p.x}:${p.rotation}`!==signature) { requestAI(); return; }
    const command=path[index];
    const step=executePlanStep(game.ai,plan.move,command);
    if(step.retry){requestAI();return;}
    index++;
    const result=step.result;
    routeResult('ai',result);
    if (index<path.length && !ended) aiPathTimer=setTimeout(runNext,38);
    else if (!ended) { aiPathTimer=setTimeout(requestAI,60); }
  };
  aiPathTimer=setTimeout(runNext, Math.min(90, plan.decisionMs||0));
  updateLabPanel(); refreshLabScreen();
}

function routeResult(side, result) {
  if (result?.locked) {
    if (side==='human') lastHumanEvent=result;
    else lastAiEvent=result;
  }
  if (resolveMatchEvent(game,side,result)) finishMatch();
}

function gameStep() {
  if (!game || ended || game.paused) return;
  const now=performance.now(); const delta=Math.min(50,Math.max(0,now-(game.lastTick||now))); game.lastTick=now;
  const humanResult=tick(game.human,delta,game.softDrop,game.config.gravityScale);
  const aiResult=tick(game.ai,delta,false,game.config.gravityScale);
  if(humanResult?.locked)lastHumanEvent=humanResult;
  if(aiResult?.locked)lastAiEvent=aiResult;
  if(resolveMatchEvents(game,humanResult,aiResult)){finishMatch();return;}
  if (ended) return;
  const held=game.keys?.right?'right':game.keys?.left?'left':null;
  if(held&&now>=(game.nextRepeatAt||0)){action(game.human,held);game.nextRepeatAt=now+43;}
  matchElapsed=now-matchStarted-(game.pausedAt||0);
  if (now-lastUiAt>70) { lastUiAt=now; updateGameUI(); updateLabPanel(); if(screen==='lab')drawLabBoard(app.querySelector('#lab-board'),game.ai,latestDecision); }
}

function finishMatch() {
  if (!game || ended) return;
  ended=true; game.finished=performance.now(); stopMatch();
  const natural=game.winner;
  let winner=natural, simulated=false;
  if (game.config.experimental) {
    winner=simulatedWinner(game.seed,game.config.probability); simulated=true;
  }
  const elapsed=performance.now()-matchStarted;
  const record={winner,seed:game.seed,difficulty:game.config.difficulty,identical:game.config.identical,simulated,config:game.config,elapsed,humanScore:game.human.score,aiScore:game.ai.score,humanLines:game.human.lines,aiLines:game.ai.lines,humanAttacks:game.human.attacksSent,aiAttacks:game.ai.attacksSent,at:new Date().toISOString()};
  game.result=record;
  const records=safeRead('tia.matches',[]);
  if (isCompetitiveResult(record)) { records.unshift(record); safeWrite('tia.matches',records.slice(0,100)); }
  renderResult(record);
}

function pauseMatch(toggle) {
  if (!game || ended) return;
  if (toggle && game.paused && game.plannerFailed) { startMatch(game.seed,game.config); return; }
  if (toggle) game.paused=!game.paused;
  if(game.paused) { mobileControls?.cancel(); game.softDrop=false; game.pausedAt=performance.now(); if(aiPathTimer)clearTimeout(aiPathTimer); }
  else { if(game.pausedAt) matchStarted+=performance.now()-game.pausedAt; game.pausedAt=0; requestAI(); }
  const button=app.querySelector('#pause-match'); if(button) button.innerHTML=game.paused?'▶ Resume':'Ⅱ Pause';
  const overlay=app.querySelector('#pause-overlay'); if(overlay) overlay.classList.toggle('hidden',!game.paused);
}

function renderGame() {
  if(!game) return renderHome();
  const experiment=game.config.experimental?'<span class="mode-tag experimental-tag">EXPERIMENTAL SIMULATION</span>':'';
  shell(`<section class="match-head"><div><div class="eyebrow"><span class="eyebrow-line"></span> MATCH IN PROGRESS ${experiment}</div><h1>Human <span>vs</span> machine</h1></div><div class="match-controls"><div class="seed-label">SEED <b>${game.seed}</b></div><button id="pause-match" class="button button-outline">Ⅱ Pause</button><button id="restart-match" class="button button-quiet">↻ Restart</button></div></section>
    <section class="match-layout"><article class="player-column human-column"><div class="player-head"><div class="player-name"><span class="player-symbol human-symbol">H</span><span><b>YOU</b><small>THE HUMAN PLAYER</small></span></div><span class="playing-tag">${game.human.alive?'● PLAYING':'OUT'}</span></div><div class="game-top-row"><div class="mini-slot"><small>HOLD <kbd>C</kbd></small><canvas id="human-hold" class="mini-canvas"></canvas></div><div class="stat-chips"><span>LEVEL <b id="human-level">1</b></span><span>TIME <b id="match-time">00:00</b></span></div></div><div class="canvas-wrap human-board"><canvas id="human-board" class="board-canvas" aria-label="Your Tetris board"></canvas><span class="board-edge edge-top"></span><span class="board-edge edge-bottom"></span></div><div class="game-bottom-row"><span>LINES <b id="human-lines">0</b></span><span>SCORE <b id="human-score">0</b></span><span>ATTACK <b id="human-attack">0</b></span></div><div class="next-row"><small>NEXT</small><canvas id="human-next" class="next-canvas"></canvas></div></article>
    <div class="versus-column"><div class="versus-line"></div><div class="versus-mark">VS</div><div class="versus-line"></div><div class="timer-orb"><span id="versus-time">00:00</span><small>ELAPSED</small></div><div class="versus-seed">${game.config.identical?'SAME SEQUENCE':'INDEPENDENT 7-BAG'}</div></div>
    <article class="player-column ai-column"><div class="player-head"><div class="player-name"><span class="player-symbol ai-symbol">AI</span><span><b>THE MACHINE</b><small>${difficultyLabel(game.config.difficulty)} REASONING</small></span></div><span id="ai-state-tag" class="ai-thinking"><i></i> ${game.ai.alive?'THINKING':'OUT'}</span></div><div class="game-top-row"><div class="mini-slot"><small>HOLD</small><canvas id="ai-hold" class="mini-canvas"></canvas></div><div class="stat-chips"><span>LEVEL <b id="ai-level">1</b></span><span>SEARCH <b id="ai-depth">—</b></span></div></div><div class="canvas-wrap ai-board"><canvas id="ai-board" class="board-canvas" aria-label="AI Tetris board"></canvas><span class="board-edge edge-top"></span><span class="board-edge edge-bottom"></span></div><div class="game-bottom-row"><span>LINES <b id="ai-lines">0</b></span><span>SCORE <b id="ai-score">0</b></span><span>ATTACK <b id="ai-attack">0</b></span></div><div class="next-row"><small>NEXT</small><canvas id="ai-next" class="next-canvas"></canvas></div></article></section>
    <section class="match-lower"><div class="control-guide"><span>MOVE <kbd>←</kbd><kbd>→</kbd></span><span>ROTATE <kbd>↑</kbd><kbd>X</kbd></span><span>SOFT DROP <kbd>↓</kbd></span><span>HARD DROP <kbd>SPACE</kbd></span><span>HOLD <kbd>C</kbd></span></div><div class="attack-feed" id="match-status" role="status" aria-live="polite">${latestDecision?`Searching ${latestDecision.nodes.toLocaleString()} nodes…`:'Warming up the search worker…'}</div></section><div class="mobile-controls" aria-label="Touch controls"><button data-command="left" aria-label="Move left">←</button><button data-command="right" aria-label="Move right">→</button><button data-command="rotateCCW" aria-label="Rotate counterclockwise">↶</button><button data-command="rotateCW" aria-label="Rotate clockwise">↷</button><button data-command="softDrop" aria-label="Soft drop">↓</button><button data-command="hardDrop" aria-label="Hard drop">DROP</button><button data-command="hold" aria-label="Hold piece">HOLD</button></div>
    <section class="lab-dock"><div class="lab-dock-head"><span class="eyebrow">LIVE AI TRACE</span><button class="text-link" data-screen="lab">OPEN FULL LAB ${icons.arrow}</button></div><div id="lab-inline" class="lab-inline"><span class="trace-placeholder"><i></i> Waiting for first calculated move…</span></div></section>
    <div id="pause-overlay" class="pause-overlay hidden"><div><span class="pause-glyph">Ⅱ</span><h2>Match paused</h2><p id="pause-message" role="status" aria-live="polite">Your board is waiting. The AI is paused too.</p><button class="button button-primary" id="resume-overlay">Resume match ${icons.arrow}</button></div></div>`,'');
  app.querySelector('#pause-match').addEventListener('click',()=>pauseMatch(true));
  app.querySelector('#restart-match').addEventListener('click',()=>startMatch(game.seed,game.config));
  app.querySelector('#resume-overlay').addEventListener('click',()=>game.plannerFailed?startMatch(game.seed,game.config):pauseMatch(true));
  if(game.paused){app.querySelector('#pause-match').innerHTML='▶ Resume';app.querySelector('#pause-overlay').classList.remove('hidden');}
  mobileControls=createTouchControls({perform:performHumanAction,canPlay:()=>!!game&&!game.paused&&!ended,onRelease:()=>{if(game)game.softDrop=false;}});
  app.querySelectorAll('.mobile-controls [data-command]').forEach(button=>{
    button.addEventListener('pointerdown',event=>{if(mobileControls.start(event,button.dataset.command))button.setPointerCapture?.(event.pointerId);});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,event=>mobileControls?.end(event));
  });
  renderBoards(); updateGameUI(); updateLabPanel();
}

function renderBoards() {
  drawBoard(app.querySelector('#human-board'),game.human,true);
  drawBoard(app.querySelector('#ai-board'),game.ai,false);
  drawMini(app.querySelector('#human-hold'),game.human.hold);
  drawMini(app.querySelector('#ai-hold'),game.ai.hold);
  drawQueue(app.querySelector('#human-next'),game.human.queue);
  drawQueue(app.querySelector('#ai-next'),game.ai.queue);
}

function drawBoard(canvas,state,showGhost) {
  if(!canvas)return;
  const rect=canvas.getBoundingClientRect(); if(!rect.width)return;
  const dpr=Math.min(2,window.devicePixelRatio||1); canvas.width=Math.round(rect.width*dpr); canvas.height=Math.round(rect.height*dpr);
  const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);
  const cw=rect.width/WIDTH,ch=rect.height/VISIBLE_ROWS; ctx.fillStyle='#080c14';ctx.fillRect(0,0,rect.width,rect.height);
  for(let y=0;y<VISIBLE_ROWS;y++)for(let x=0;x<WIDTH;x++){
    const occupied=(state.board[y+HIDDEN_ROWS]&(1<<x))!==0;
    cell(ctx,x*cw,y*ch,cw,ch,occupied?'#546179':null,occupied?'#a2adc0':null);
  }
  if(showGhost&&state.current){const p=state.current,gy=ghostY(state);for(const [x,y]of cellsAt(p.kind,p.rotation,p.x,gy))if(y>=2)cell(ctx,x*cw,(y-2)*ch,cw,ch,null,colors[p.kind],true);}
  if(state.current){const p=state.current;for(const [x,y]of cellsAt(p.kind,p.rotation,p.x,p.y))if(y>=2)cell(ctx,x*cw,(y-2)*ch,cw,ch,colors[p.kind],colors[p.kind]);}
  if(state.incoming.length){ctx.fillStyle='#ff5c88';ctx.fillRect(0,rect.height-3,rect.width*Math.min(1,state.incoming.length/12),3);}
}
function cell(ctx,x,y,w,h,fill,stroke,ghost=false){const pad=Math.max(1,w*.07);if(fill){ctx.fillStyle=fill;ctx.fillRect(x+pad,y+pad,w-2*pad,h-2*pad);ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(x+pad,y+pad,w-2*pad,Math.max(1,h*.09));}if(stroke){ctx.strokeStyle=ghost?stroke:fill;ctx.globalAlpha=ghost?.48:.78;ctx.lineWidth=ghost?1.4:1;ctx.strokeRect(x+pad+1,y+pad+1,w-2*pad-2,h-2*pad-2);ctx.globalAlpha=1;}}
function drawMini(canvas,piece){if(!canvas)return;const rect=canvas.getBoundingClientRect();if(!rect.width)return;const dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,rect.width,rect.height);if(!piece)return;const cells=CELLS[piece]?.[0]||[];const maxX=Math.max(...cells.map(c=>c[0])),maxY=Math.max(...cells.map(c=>c[1]));const size=Math.min(rect.width/(maxX+1),rect.height/(maxY+1));const offsetX=(rect.width-size*(maxX+1))/2,offsetY=(rect.height-size*(maxY+1))/2;for(const[x,y]of cells)cell(ctx,offsetX+x*size,offsetY+y*size,size,size,colors[piece],colors[piece]);}
function drawQueue(canvas,queue){if(!canvas)return;const rect=canvas.getBoundingClientRect();if(!rect.width)return;const dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,rect.width,rect.height);queue.slice(0,5).forEach((piece,index)=>{const width=rect.width/5,cells=CELLS[piece][0],size=Math.min(14,rect.height/3,width/4),maxX=Math.max(...cells.map(c=>c[0])),maxY=Math.max(...cells.map(c=>c[1]));const sx=index*width+(width-size*(maxX+1))/2,sy=(rect.height-size*(maxY+1))/2;for(const[x,y]of cells)cell(ctx,sx+x*size,sy+y*size,size,size,colors[piece],colors[piece]);});}

function updateGameUI(){if(!game)return;for(const [prefix,state]of [['human',game.human],['ai',game.ai]]){const q=id=>app.querySelector(`#${prefix}-${id}`);if(q('level'))q('level').textContent=state.level;if(q('lines'))q('lines').textContent=state.lines;if(q('score'))q('score').textContent=state.score.toLocaleString();if(q('attack'))q('attack').textContent=state.attacksSent;if(q('board'))drawBoard(q('board'),state,prefix==='human');if(q('hold'))drawMini(q('hold'),state.hold);if(q('next'))drawQueue(q('next'),state.queue);}
  const time=app.querySelector('#match-time');if(time)time.textContent=formatTime(matchElapsed);const vt=app.querySelector('#versus-time');if(vt)vt.textContent=formatTime(matchElapsed);const depth=app.querySelector('#ai-depth');if(depth)depth.textContent=latestDecision?`${latestDecision.depth} PLY`:'…';const tag=app.querySelector('#ai-state-tag');if(tag)tag.innerHTML=game.ai.alive?`<i></i> ${aiPathTimer?'EXECUTING':'THINKING'}`:'OUT';}

function updateLabPanel(){const target=app.querySelector('#lab-inline');if(!target)return;if(!latestDecision){target.innerHTML='<span class="trace-placeholder"><i></i> Waiting for first calculated move…</span>';return;}const m=latestDecision.move;const candidates=latestDecision.candidates||[];target.innerHTML=`<div class="trace-choice"><span class="trace-piece" style="--piece:${colors[m.kind]}">${m.kind}</span><span><small>SELECTED MOVE</small><b>${m.useHold?'HOLD · ':''}COL ${m.x+1} · ROT ${m.rotation}</b></span></div><div class="trace-metric"><b>${latestDecision.nodes.toLocaleString()}</b><small>NODES</small></div><div class="trace-metric"><b>${latestDecision.depth} ply</b><small>DEPTH</small></div><div class="trace-metric"><b>${latestDecision.decisionMs.toFixed(1)}<em> ms</em></b><small>THINK TIME</small></div><div class="trace-metric"><b>${Math.round((latestDecision.opponentThreat||0)*100)}%</b><small>OPPONENT RISK</small></div><div class="trace-bars">${candidates.slice(0,5).map((c,i)=>`<span title="Candidate ${i+1}: score ${c.score.toFixed(2)}" style="--bar:${candidateWidth(c.score,candidates)};--bar-color:${i===0?'#45e8ef':'#564b74'}"></span>`).join('')}</div>`;}

function performHumanAction(command){if(!game||game.paused||ended)return;if(command==='softDrop'){game.softDrop=true;return;}const result=action(game.human,command);routeResult('human',result);if(command==='hold'&&result.held)statusMessage(`Held ${game.human.hold||'piece'} · ${game.human.current?.kind} active`);if(result.locked&&result.attack)statusMessage(`${result.cleared} line${result.cleared===1?'':'s'} cleared · ${result.attack} attack sent · ${result.canceled||0} canceled`);updateGameUI();}
function onKeyDown(event){if(screen!=='game'||!game||game.paused||ended||event.altKey||event.ctrlKey||event.metaKey)return;const map={ArrowLeft:'left',ArrowRight:'right',ArrowDown:'softDrop',ArrowUp:'rotateCW',KeyX:'rotateCW',KeyZ:'rotateCCW',KeyC:'hold',Space:'hardDrop'};const command=map[event.code];if(!command)return;event.preventDefault();if(event.repeat)return;if(command==='left'||command==='right'){game.keys=game.keys||{};game.keys[command]=true;game.nextRepeatAt=performance.now()+155;}performHumanAction(command);}
function onKeyUp(event){if(!game)return;if(event.code==='ArrowDown')game.softDrop=false;if(event.code==='ArrowLeft'||event.code==='ArrowRight'){const key=event.code==='ArrowLeft'?'left':'right';if(game.keys)delete game.keys[key];game.nextRepeatAt=performance.now()+45;}}

function renderResult(record){
  const humanWon=record.winner==='human',draw=record.winner==='draw';
  const title=draw?'Dead heat.':humanWon?'You outthought the machine.':'The machine found its line.';
  shell(`<section class="result-screen ${humanWon?'result-win':'result-loss'}"><div class="result-radial"></div><div class="result-kicker">${record.simulated?'<span class="mode-tag experimental-tag">SIMULATED RESULT</span>':'MATCH COMPLETE'}</div><div class="result-symbol">${humanWon?'✦':draw?'◇':'⌁'}</div><h1>${title}</h1><p>${record.simulated?'Experimental victory simulation · Seeded outcome · Not a competitive result':`${difficultyLabel(record.difficulty)} AI · seed ${record.seed} · ${record.identical?'identical sequence':'separate 7-bags'}`}</p>
    <div class="result-scoreboard"><div><small>YOU</small><strong>${record.humanScore.toLocaleString()}</strong><span>${record.humanLines} lines · ${record.humanAttacks} attacks</span></div><div class="score-divider">VS</div><div><small>AI</small><strong>${record.aiScore.toLocaleString()}</strong><span>${record.aiLines} lines · ${record.aiAttacks} attacks</span></div></div><div class="result-time">MATCH TIME <b>${formatTime(record.elapsed)}</b></div><div class="result-actions"><button class="button button-primary" id="rematch">Run it back ${icons.arrow}</button><button class="button button-outline" id="to-home">Arena home</button><button class="button button-quiet" data-screen="lab">Inspect AI decisions</button></div></section>`);
  app.querySelector('#rematch').addEventListener('click',()=>startMatch(record.seed,record.config||settings));
  app.querySelector('#to-home').addEventListener('click',()=>navigate('home'));
}

function renderLab(){
  const state=game?.ai, d=latestDecision;
  const activeDifficulty=game?.config.difficulty||settings.difficulty;
  const candidates=d?.candidates||[];const top=candidates[0]?.score||0;
  const candidatesHtml=candidates.slice(0,12).map((c,i)=>`<div class="candidate-row ${i===0?'candidate-best':''}"><span class="candidate-rank">${String(i+1).padStart(2,'0')}</span><span class="candidate-piece" style="--piece:${colors[c.kind]}">${c.kind}</span><span class="candidate-info"><b>${c.useHold?'Hold → ':''}Column ${c.x+1} <small>· rotation ${c.rotation}</small></b><span class="candidate-bar"><i style="width:${candidateWidth(c.score,candidates)}"></i></span></span><b class="candidate-score">${c.score.toFixed(2)}</b></div>`).join('');
  shell(`<section class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> RESEARCH MODE</div><h1>The AI <span>Lab</span></h1><p>Every candidate is calculated from the live game state. Nothing here is simulated for display.</p></div>${game&&!ended?'<button class="button button-outline" data-screen="game">← Back to match</button>':'<button class="button button-primary" id="lab-start">Start a live match '+icons.arrow+'</button>'}</section>
    <section class="lab-summary"><div class="lab-board-panel"><div class="panel-label"><span>LIVE BOARD STATE</span><span>${state?`SEED ${game.seed}`:'AWAITING MATCH'}</span></div><canvas id="lab-board" class="lab-board-canvas"></canvas><div class="board-legend"><span><i class="legend-fixed"></i> Locked blocks</span><span><i class="legend-active"></i> Active piece</span><span><i class="legend-ghost"></i> Ghost landing</span><span><i class="legend-ghost" style="border-color:#b998ff"></i> Candidate landings</span></div></div><div class="decision-panel"><div class="panel-label"><span>CHOSEN MOVE</span><span class="decision-live"><i></i> ${d?'CALCULATED':'WAITING'}</span></div><div id="lab-choice" class="lab-choice">${d?`<div class="choice-piece" style="--piece:${colors[d.move.kind]}">${d.move.kind}</div><div><small>${d.move.useHold?'HOLD + ':''}HARD DROP</small><b>Column ${d.move.x+1} · Rotation ${d.move.rotation}</b><span>Projected score ${d.move.score.toFixed(2)}</span></div>`:'<div class="trace-placeholder">Start a match to inspect a real search decision.</div>'}</div><div class="decision-metrics"><div><strong id="lab-stat-depth">${d?d.depth:'—'}</strong><small>LOOKAHEAD PLY</small></div><div><strong id="lab-stat-nodes">${d?d.nodes.toLocaleString():'—'}</strong><small>NODES EXPLORED</small></div><div><strong id="lab-stat-time">${d?d.decisionMs.toFixed(1)+' ms':'—'}</strong><small>WORKER TIME</small></div></div><div class="search-budget" id="lab-budget"><span>SEARCH BUDGET</span><b>${d?Math.min(100,d.decisionMs/d.budgetMs*100).toFixed(0)+'%':'—'}</b><div><i style="width:${d?Math.min(100,d.decisionMs/d.budgetMs*100):0}%"></i></div></div></div></section>
    <section class="lab-lower"><div class="candidates-panel"><div class="panel-title"><span><small>ALTERNATIVES</small><b>Candidate placements</b></span><span id="lab-candidate-count">${d?`${d.candidateCount} legal landings · top ${candidates.length} shown`:'0 evaluated'}</span></div>${candidates.length?`<div id="lab-candidates" class="candidate-list">${candidatesHtml}</div>`:'<div id="lab-candidates" class="empty-state">Candidate scores appear here after the AI calculates its next move.</div>'}</div><aside class="reasoning-panel"><div class="panel-title"><span><small>HOW IT THINKS</small><b>Reading the search</b></span><span class="info-mark">i</span></div><div class="reasoning-step"><span>01</span><div><b>Generate legal landings</b><p>For the active piece, the worker checks paths through movement and SRS rotations.</p></div></div><div class="reasoning-step"><span>02</span><div><b>Score each resulting board</b><p>Height, holes, surface roughness, line clears, attack potential and incoming garbage contribute to the score.</p></div></div><div class="reasoning-step"><span>03</span><div><b>Look ahead within budget</b><p>${d?`${difficultyLabel(d.difficulty)} searched ${d.depth} plies and explored ${d.nodes.toLocaleString()} nodes.`:'The selected level sets search depth, beam width and a time budget.'} Only the visible piece queue enters the search.</p></div></div><div class="level-note"><span>ACTIVE CONFIGURATION</span><b>${difficultyLabel(activeDifficulty)} <small>${DIFFICULTIES[activeDifficulty].depth} PLY · BEAM ${DIFFICULTIES[activeDifficulty].beam}</small></b></div><p class="advantage-note">The agent can inspect the game state and search faster than a human can. That is its computational advantage. It receives only the same visible queue of upcoming pieces.</p></aside></section>`,'lab');
  if(state) drawLabBoard(app.querySelector('#lab-board'),state,d);
  const summary=app.querySelector('.lab-summary');
  summary?.insertAdjacentHTML('afterend',`<section class="level-comparison"><div class="comparison-heading"><div><div class="eyebrow">SAME STATE · FOUR SEARCH PROFILES</div><h2>Compare reasoning levels</h2><p>Calculate each planner from one frozen snapshot of the current match.</p></div><button id="lab-compare" class="button button-outline" ${state&&state.alive?'':'disabled'}>Compare all levels</button></div><div id="lab-comparison-results">${comparisonResults?'<div class="empty-state">Previous comparison is available; run again to compare a fresh state.</div>':state?'No comparison has been calculated for this state yet.':'Start a live match to create an identical state snapshot for every level.'}</div></section>`);
  app.querySelector('#lab-compare')?.addEventListener('click',runLevelComparison);
  renderLevelComparison();
  app.querySelector('#lab-start')?.addEventListener('click',showSetup);
}

function drawLabBoard(canvas,state,decision){
  if(!canvas)return;
  const rect=canvas.getBoundingClientRect();if(!rect.width)return;
  const dpr=Math.min(2,devicePixelRatio||1);canvas.width=rect.width*dpr;canvas.height=rect.height*dpr;
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);const cw=rect.width/10,ch=rect.height/20;
  ctx.fillStyle='#080c14';ctx.fillRect(0,0,rect.width,rect.height);
  for(let y=0;y<20;y++)for(let x=0;x<10;x++){const filled=state.board[y+2]&(1<<x);cell(ctx,x*cw,y*ch,cw,ch,filled?'#526079':null,filled?'#8391a8':null);}
  if(state.current){const p=state.current,gy=ghostY(state);for(const[x,y]of cellsAt(p.kind,p.rotation,p.x,gy))if(y>=2)cell(ctx,x*cw,(y-2)*ch,cw,ch,null,colors[p.kind],true);for(const[x,y]of cellsAt(p.kind,p.rotation,p.x,p.y))if(y>=2)cell(ctx,x*cw,(y-2)*ch,cw,ch,colors[p.kind],colors[p.kind]);}
  if(decision?.candidates?.length)drawCandidateOutlines(ctx,decision.candidates,cw,ch);
}
function refreshLabScreen(){if(screen!=='lab'||!app.querySelector('#lab-board'))return;if(game)drawLabBoard(app.querySelector('#lab-board'),game.ai,latestDecision);if(!latestDecision)return;const d=latestDecision,m=d.move,choice=app.querySelector('#lab-choice');if(choice)choice.innerHTML=`<div class="choice-piece" style="--piece:${colors[m.kind]}">${m.kind}</div><div><small>${m.useHold?'HOLD + ':''}HARD DROP</small><b>Column ${m.x+1} · Rotation ${m.rotation}</b><span>Projected score ${m.score.toFixed(2)}</span></div>`;app.querySelector('#lab-stat-depth').textContent=d.depth;app.querySelector('#lab-stat-nodes').textContent=d.nodes.toLocaleString();app.querySelector('#lab-stat-time').textContent=`${d.decisionMs.toFixed(1)} ms`;const ratio=Math.min(100,d.decisionMs/d.budgetMs*100);app.querySelector('#lab-budget b').textContent=`${ratio.toFixed(0)}%`;app.querySelector('#lab-budget i').style.width=`${ratio}%`;const candidates=d.candidates||[],top=Math.max(...candidates.map(c=>c.score),1);const count=app.querySelector('#lab-candidate-count');if(count)count.textContent=`${d.candidateCount} legal landings · top ${Math.min(12,candidates.length)} shown`;const target=app.querySelector('#lab-candidates');if(target)target.outerHTML=candidates.length?`<div id="lab-candidates" class="candidate-list">${candidates.slice(0,12).map((c,i)=>`<div class="candidate-row ${i===0?'candidate-best':''}"><span class="candidate-rank">${String(i+1).padStart(2,'0')}</span><span class="candidate-piece" style="--piece:${colors[c.kind]}">${c.kind}</span><span class="candidate-info"><b>${c.useHold?'Hold → ':''}Column ${c.x+1} <small>· rotation ${c.rotation}</small></b><span class="candidate-bar"><i style="width:${candidateWidth(c.score,candidates)}"></i></span></span><b class="candidate-score">${c.score.toFixed(2)}</b></div>`).join('')}</div>`:'<div id="lab-candidates" class="empty-state">Candidate scores appear here after the AI calculates its next move.</div>';}

function renderStats(){const records=safeRead('tia.matches',[]);const wins=records.filter(x=>x.winner==='human').length,losses=records.filter(x=>x.winner==='ai').length,draws=records.filter(x=>x.winner==='draw').length,total=records.length,avgLines=total?records.reduce((sum,x)=>sum+x.humanLines,0)/total:0;const recent=records.slice(0,10).map(x=>`<div class="history-row"><span class="history-result ${x.winner==='human'?'win':x.winner==='draw'?'draw':'loss'}">${x.winner==='human'?'WIN':x.winner==='draw'?'DRAW':'LOSS'}</span><b>${x.humanScore.toLocaleString()} <small>vs</small> ${x.aiScore.toLocaleString()}</b><span>${difficultyLabel(x.difficulty)}</span><span>SEED ${x.seed}</span><span>${formatTime(x.elapsed)}</span></div>`).join('');shell(`<section class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> YOUR ARENA RECORD</div><h1>Keep <span>score.</span></h1><p>Competitive matches saved on this device. Experimental results are excluded.</p></div><button class="button button-primary" id="stats-play">Play a match ${icons.arrow}</button></section><section class="stats-grid"><article><small>COMPETITIVE MATCHES</small><strong>${total}</strong><span>LOCAL RECORD</span></article><article><small>WINS / LOSSES</small><strong>${wins}<i> / </i>${losses}</strong><span>${draws} DRAWS</span></article><article><small>WIN RATE</small><strong>${total?Math.round(wins/total*100):0}<i>%</i></strong><span>OF ALL MATCHES</span></article><article><small>AVG. LINES CLEARED</small><strong>${avgLines.toFixed(1)}</strong><span>PER MATCH</span></article></section><section class="history-panel"><div class="panel-title"><span><small>MATCH HISTORY</small><b>Recent results</b></span><button id="clear-stats" class="text-link">CLEAR LOCAL RECORD</button></div>${recent?`<div class="history-list">${recent}</div>`:'<div class="empty-state">Your first competitive result will show up here. Experimental simulations never enter this record.</div>'}</section>`,'stats');app.querySelector('#stats-play').addEventListener('click',showSetup);app.querySelector('#clear-stats').addEventListener('click',()=>{safeWrite('tia.matches',[]);renderStats();});}

function renderSettings(){shell(`<section class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> PREFERENCES</div><h1>Make it <span>yours.</span></h1><p>Local settings for new matches and the arena experience.</p></div></section><section class="settings-panel"><label>DEFAULT AI LEVEL<select id="setting-difficulty">${Object.entries(DIFFICULTIES).map(([key,d])=>`<option value="${key}" ${settings.difficulty===key?'selected':''}>${d.label} · ${d.depth} ply · ${d.beam} beam</option>`).join('')}</select></label><label class="setting-slider">GAME GRAVITY <span><input id="setting-gravity" type="range" min="0.7" max="1.35" step="0.05" value="${settings.gravityScale}"/><b id="gravity-value">${settings.gravityScale.toFixed(2)}×</b></span><small>Applied equally to both boards.</small></label><label class="check-row"><input id="setting-identical" type="checkbox" ${settings.identical?'checked':''}/><span><b>Identical piece sequences by default</b><small>Useful for controlled comparisons.</small></span></label><button class="button button-primary" id="save-settings">Save preferences ${icons.arrow}</button><div class="settings-footnote">Preferences are stored locally in this browser. Match outcomes do not leave this device.</div></section>`,'');app.querySelector('#setting-difficulty').addEventListener('change',e=>settings.difficulty=e.target.value);app.querySelector('#setting-gravity').addEventListener('input',e=>{settings.gravityScale=Number(e.target.value);app.querySelector('#gravity-value').textContent=`${settings.gravityScale.toFixed(2)}×`;});app.querySelector('#setting-identical').addEventListener('change',e=>settings.identical=e.target.checked);app.querySelector('#save-settings').addEventListener('click',()=>{saveSettings();navigate('home');});}

function renderHowTo(){shell(`<section class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> THE RULES OF THE ARENA</div><h1>Learn the <span>flow.</span></h1><p>One shared ruleset for both boards. Here is what this arena counts.</p></div><button class="button button-primary" id="howto-play">Ready to play ${icons.arrow}</button></section><section class="rules-grid"><article><span>01</span><h2>Move with intent.</h2><p>Arrow keys move and rotate. X rotates clockwise; Z counter-clockwise. Hold a piece with C, soft drop with ↓ and hard drop with Space.</p></article><article><span>02</span><h2>Clear for pressure.</h2><p>A double sends 1 line, a triple sends 2 and a Tetris sends 4. Combos add pressure. Difficult clears can extend back-to-back attacks.</p></article><article><span>03</span><h2>Survive the stack.</h2><p>Both boards use a 10 × 20 visible field with 2 hidden spawn rows, seeded 7-bags, SRS wall kicks, hold, ghost piece and lock delay.</p></article><article><span>04</span><h2>Know your rival.</h2><p>The AI sees the same current piece and five upcoming pieces. Higher levels search deeper and explore wider beams in a Web Worker.</p></article></section><section class="rules-note"><div class="eyebrow">CUSTOM ARENA RULESET</div><h2>Built for research, with the rules in the open.</h2><p>This implementation uses SRS kick data and original scoring, combo, T-spin, attack and garbage timing rules. It is a self-contained competitive ruleset and does not claim complete TETR.IO or Guideline parity. Perfect clears are recorded in the engine event; this ruleset does not grant bonus attacks for them.</p><button class="text-link" data-screen="lab">Explore the AI Lab ${icons.arrow}</button></section>`);app.querySelector('#howto-play').addEventListener('click',showSetup);}

function boot(){renderHome();window.addEventListener('keydown',onKeyDown);window.addEventListener('keyup',onKeyUp);window.addEventListener('resize',()=>{if(screen==='game')renderBoards();if(screen==='lab'&&game)drawLabBoard(app.querySelector('#lab-board'),game.ai,latestDecision);});window.addEventListener('pagehide',stopMatch);}
boot();
