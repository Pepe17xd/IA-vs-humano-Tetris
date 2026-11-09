import { action, ghostY, tick, cellsAt, CELLS, WIDTH, VISIBLE_ROWS, HIDDEN_ROWS, rngNext, visibleRows } from './game.js';
import { createTouchControls } from './input.js';
import { drawCandidateOutlines } from './lab-render.js';
import { DIFFICULTIES } from './agent.js';
import { executePlanStep } from './agent-executor.js';
import { createMatch, generateMatchSeed, isCompetitiveResult, resolveMatchEvent, resolveMatchEvents, simulatedWinner, snapshotMatchSettings } from './match.js';
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
let latestDecision = null, lastHumanoEvent = null, lastAiEvent = null;
let compareWorker = null, compareRequestId = 0, comparisonResults = null, comparisonMeta = null;
let mobileControls = null;
let aiWatchdog = 0, aiProgressWatchdog = 0, aiDropAnimation = null, aiRequestSignature = null;

function safeRead(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function safeWrite(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function esc(value) { return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function saveSettings() { safeWrite('tia.settings', settings); }
function formatTime(ms) { const sec = Math.floor(ms / 1000); return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`; }
function difficultyLabel(value = settings.difficulty) { return DIFFICULTIES[value]?.label || 'INTERMEDIO'; }
function candidateWidth(score,candidates){const values=candidates.map(item=>item.score),low=Math.min(...values),high=Math.max(...values);return `${Math.round(8+(high===low?1:(score-low)/(high-low))*92)}%`;}

function shell(content, active = '') {
  document.body.classList.toggle('playing', screen === 'game');
  app.innerHTML = `<div class="ambient ambient-one"></div><div class="ambient ambient-two"></div>
    <header class="topbar"><a class="brand" href="#home" data-screen="home" aria-label="Inicio de Tetris IA Arena"><span class="brand-mark"><i></i><i></i><i></i><i></i></span><span>TETRIS<span class="brand-accent">AI</span><small>ARENA</small></span></a>
      <nav class="nav-links" aria-label="Navegación principal"><button class="nav-link ${active==='lab'?'selected':''}" data-screen="lab">IAoratorio de IA</button><button class="nav-link ${active==='stats'?'selected':''}" data-screen="stats">Estadísticas</button><button class="nav-link ${active==='howto'?'selected':''}" data-screen="howto">Cómo jugar</button></nav>
      <div class="top-actions"><span class="status-pill"><span></span> ARENA EN LÍNEA</span><button class="icon-button" data-screen="settings" aria-label="Configuración">⚙</button></div></header>
    <main>${content}</main><footer class="footer"><span>CADA JUGADA CUENTA</span><span>JUEGA · APRENDE · SUPÉRATE</span></footer>`;
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
  shell(`<section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="eyebrow-line"></span> UN DUELO PARA PENSAR EN GRANDE</div>
    <h1>¿Podrás superar a<br/><span>la máquina?</span></h1><p class="hero-lede">Un tablero, un rival y miles de posibilidades. Entra en la arena y enfrenta tu ingenio a la inteligencia artificial.</p>
    <div class="hero-actions"><button class="button button-primary" id="start-match">Jugar contra la IA ${icons.arrow}</button><button class="button button-quiet" data-screen="lab">Explorar el laboratorio</button></div>
    <div class="hero-proof"><div class="avatar-stack"><span>H</span><span class="bot-avatar">AI</span></div><span>Mismas reglas. Distintas mentes.</span><span class="proof-sep"></span><span class="mono">v1.0 · EN LÍNEA</span></div></div>
    <div class="hero-art" aria-label="Ilustración de un tablero de juego"><div class="orbit orbit-a"></div><div class="orbit orbit-b"></div><div class="art-glow"></div><div class="mini-board"><div class="mini-top"><span>ARENA 01</span><span class="live-dot">● EN VIVO</span></div><div class="mini-grid">${Array.from({length:160},(_,i)=>{const row=Math.floor(i/10),col=i%10;let c=''; if(row>13 && (row===19||((row===18||row===17)&&col!==4&&col!==7)|| (row===16&&col!==4&&col!==5&&col!==7)))c='filled';if((row===12&&(col===2||col===3||col===4||col===3+1)) || (row===11&&col===3)) c='active';return `<i class="${c} ${c==='filled'&&((row+col)%7===0)?'alt':''}"></i>`;}).join('')}</div><div class="mini-readout"><span><b>AI</b> está pensando</span><span class="thinking"><i></i><i></i><i></i></span></div></div><div class="float-tag tag-left"><span>◈</span> BÚSQUEDA INTELIGENTE</div><div class="float-tag tag-right"><span>⌁</span> 7-BAG RNG</div><div class="art-caption"><span>01</span> CADA JUGADA TIENE UNA RAZÓN</div></div>
  </section><section class="feature-strip"><div><span class="feature-icon cyan">${icons.bolt}</span><span><b>4 niveles de dificultad</b><small>Desde principiante hasta experto</small></span></div><div><span class="feature-icon violet">⌘</span><span><b>Reglas compartidas</b><small>Las mismas oportunidades para ambos</small></span></div><div><span class="feature-icon magenta">◉</span><span><b>Descubre cómo piensa</b><small>Explora cada decisión de la IA</small></span></div><button class="feature-link" data-screen="howto">APRENDE A JUGAR ${icons.arrow}</button></section>`);
  app.querySelector('#start-match').addEventListener('click', () => showSetup());
}

function showSetup() {
  const values = Object.entries(DIFFICULTIES).map(([key,item]) => `<option value="${key}" ${settings.difficulty===key?'selected':''}>${item.label} · profundidad ${item.depth}</option>`).join('');
  const modal = document.createElement('div'); modal.className = 'modal-backdrop'; modal.innerHTML = `<section class="setup-card"><button class="modal-close" aria-label="Cerrar">×</button><div class="eyebrow">CONFIGURACIÓN DE PARTIDA</div><h2>Prepara la partida.</h2><p>Elige tu rival y configura las reglas de la partida.</p>
    <label>NIVEL DE LA IA<select id="setup-difficulty">${values}</select></label>
    <p>Ambos jugadores reciben la misma secuencia de piezas.</p>
    <label class="check-row"><input id="setup-experimental" type="checkbox" ${settings.experimental?'checked':''}/><span><b>Simulación de victoria humana</b><small>Resultado experimental excluido de las estadísticas competitivas.</small></span></label>
    <label id="probability-row" class="probability-row">PROBABILIDAD DE VICTORIA SIMULADA <span><input id="setup-probability" type="range" min="0" max="100" value="${settings.probability}"/><b id="probability-value">${settings.probability}%</b></span></label>
    <button class="button button-primary setup-start" id="confirm-start">Entrar a la arena ${icons.arrow}</button></section>`;
  app.append(modal);
  const experimental = modal.querySelector('#setup-experimental'), row = modal.querySelector('#probability-row');
  row.classList.toggle('disabled', !experimental.checked); experimental.addEventListener('change', () => row.classList.toggle('disabled', !experimental.checked));
  modal.querySelector('#setup-probability').addEventListener('input', event => modal.querySelector('#probability-value').textContent = `${event.target.value}%`);
  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#confirm-start').addEventListener('click', () => {
    settings.difficulty = modal.querySelector('#setup-difficulty').value;
    settings.identical = true;
    settings.experimental = modal.querySelector('#setup-experimental').checked;
    settings.probability = Number(modal.querySelector('#setup-probability').value);
    saveSettings(); modal.remove(); startMatch(generateMatchSeed(), settings);
  });
}

function startMatch(seed = 42, matchSettings = settings) {
  stopMatch();
  const config = snapshotMatchSettings({ ...matchSettings, identical:true });
  game = { ...createMatch(seed,config.identical), config, paused:false, finished:null };
  document.documentElement.style.setProperty('--landscape', `url("https://images.unsplash.com/${['photo-1464822759023-fed622ff2c3b','photo-1500530855697-b586d89ba3ee','photo-1470770841072-f978cf4d019e','photo-1501785888041-af3ef285b470'][Math.floor(Math.random()*4)]}?auto=format&fit=crop&w=2000&q=80")`);
  screen='game'; ended=false; latestDecision=null; lastHumanoEvent=null; lastAiEvent=null; matchStarted=performance.now(); matchElapsed=0; aiRequestId=0;
  renderGame();
  try { worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type:'module' }); }
  catch (error) { pauseOnPlannerError(error.message); return; }
  const match=game, matchWorker=worker;
  bindCurrentWorker(matchWorker,match,(candidateGame,candidateWorker)=>game===candidateGame&&worker===candidateWorker,
    onPlan,pauseOnPlannerError);
  watchAIProgress(); requestAI(); gameTimer=window.setInterval(gameStep, 16);
}

function stopMatch() {
  if (gameTimer) clearInterval(gameTimer); gameTimer=0;
  if (aiPathTimer) clearTimeout(aiPathTimer); aiPathTimer=0;
  if (aiWatchdog) clearTimeout(aiWatchdog); aiWatchdog=0; aiDropAnimation=null;
  if (aiProgressWatchdog) clearTimeout(aiProgressWatchdog); aiProgressWatchdog=0;
  mobileControls?.cancel(); mobileControls=null;
  if (worker) worker.terminate(); worker=null;
  if (rafId) cancelAnimationFrame(rafId); rafId=0;
}

function statusMessage(message) { const node=app.querySelector('#match-status'); if(node) node.textContent=message; }

function watchAIProgress() {
  if (aiProgressWatchdog) clearTimeout(aiProgressWatchdog);
  aiProgressWatchdog=setTimeout(()=>pauseOnPlannerError('La IA no pudo colocar una pieza a tiempo'), 20000);
}

function pauseOnPlannerError(message) {
  if (!game || ended) return;
  game.plannerFailed=true;
  worker?.terminate(); worker=null;
  if (!game.paused) pauseMatch(true);
  const notice=`Falló el cálculo de la IA; la partida se pausó y no se guardó el resultado: ${message}`;
  statusMessage(notice);
  const pauseMessage=app.querySelector('#pause-message');
  if (pauseMessage) pauseMessage.textContent=notice;
  const resume=app.querySelector('#resume-overlay');
  if (resume) resume.textContent='Reiniciar match';
  const pauseButton=app.querySelector('#pause-match');
  if (pauseButton) pauseButton.textContent='↻ Reiniciar';
}

function requestAI() {
  if (aiPathTimer) clearTimeout(aiPathTimer); aiPathTimer=0;
  if (!game || game.paused || ended || !game.ai.alive || !game.ai.current || !worker) return;
  const requestId=++aiRequestId, state=snapshotAIState();
  aiRequestSignature=pieceSignature(game.ai);
  if (aiWatchdog) clearTimeout(aiWatchdog);
  aiWatchdog=setTimeout(()=>pauseOnPlannerError('La IA no respondió a tiempo'), 10000);
  try { worker.postMessage({state,difficulty:game.config.difficulty,requestId}); }
  catch (error) { pauseOnPlannerError(error.message); }
}

function pieceSignature(state) {
  const p=state.current;
  return p ? `${state.pieces}:${p.kind}:${p.x}:${p.y}:${p.rotation}` : '';
}

function snapshotAIState() {
  return {board:game.ai.board.slice(),current:{...game.ai.current},queue:game.ai.queue.slice(0,5),hold:game.ai.hold,canHold:game.ai.canHold,incoming:game.ai.incoming.slice(),combo:game.ai.combo,backToBack:game.ai.backToBack,opponent:{board:visibleRows(game.human),incoming:game.human.incoming.length}};
}

function runLevelComparison() {
  if (!game?.ai?.alive || !game.ai.current) return;
  compareWorker?.terminate();
  const requestId=++compareRequestId;
  comparisonMeta={pieces:game.ai.pieces};
  comparisonResults=null;
  const target=app.querySelector('#lab-comparison-results');
  const button=app.querySelector('#lab-compare');
  if(button)button.disabled=true;
  if(target)target.innerHTML='<div class="empty-state" role="status">Calculando los cuatro niveles con el mismo tablero…</div>';
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
    if(target)target.innerHTML='<div class="empty-state" role="status">No se pudo completar la comparación. Inténtalo de nuevo.</div>';
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
  target.innerHTML=`<div class="comparison-snapshot">Estado · piezas fijadas por la IA ${comparisonMeta?.pieces??'—'}</div><div class="comparison-table" role="table" aria-label="Comparación de niveles de IA"><div class="comparison-row comparison-head" role="row"><span>NIVEL</span><span>POSICIÓN ELEGIDA</span><span>ANTICIPACIÓN</span><span>NODOS</span><span>TIEMPO</span></div>${comparisonResults.map(result=>{
    if(result.error)return `<div class="comparison-row" role="row"><b>${difficultyLabel(result.difficulty)}</b><span class="comparison-error" role="cell">Error de cálculo: ${esc(result.error)}</span><span>—</span><span>—</span><span>—</span></div>`;
    const move=result.move;
    return `<div class="comparison-row" role="row"><b>${difficultyLabel(result.difficulty)}</b><span role="cell">${move?`${move.useHold?'GUARDAR · ':''}${move.kind} · columna ${move.x+1} · rotación ${move.rotation}`:'Sin jugadas válidas'}</span><span role="cell">${result.depth} / ${DIFFICULTIES[result.difficulty].depth} niveles</span><span role="cell">${result.nodes.toLocaleString()}</span><span role="cell">${result.decisionMs.toFixed(1)} ms</span></div>`;
  }).join('')}</div><p class="comparison-footnote">Los cuatro niveles analizan el mismo tablero, con distintos tiempos y parámetros de búsqueda. Compara sus jugadas y esfuerzo de cálculo.</p>`;
}

function onPlan(plan) {
  if (!game || game.paused || ended || plan?.requestId !== aiRequestId) return;
  if (aiWatchdog) clearTimeout(aiWatchdog); aiWatchdog=0;
  if (plan.error) {
    pauseOnPlannerError(plan.error);
    return;
  }
  if (pieceSignature(game.ai)!==aiRequestSignature) { requestAI(); return; }
  if (!plan.move || !Array.isArray(plan.move.path) || plan.move.path.at(-1)!=='hardDrop') {
    pauseOnPlannerError('La IA no encontró una jugada ejecutable'); return;
  }
  latestDecision=plan; game.ai.totalThinkMs+=plan.decisionMs||0; game.ai.decisionCount++;
  statusMessage(`Búsqueda de IA ${plan.depth} niveles · ${plan.nodes.toLocaleString()} nodos · ${(plan.decisionMs||0).toFixed(1)} ms`);
  const signature=pieceSignature(game.ai);
  const path=[...plan.move.path]; let index=0;
  const runNext=()=>{
    try { runPlanStep(); }
    catch (error) { pauseOnPlannerError(error.message); }
  };
  const runPlanStep=()=>{
    aiPathTimer=0;
    if (!game || game.paused || ended) return;
    const p=game.ai.current;
    if (!p) { requestAI(); return; }
    if (index===0 && pieceSignature(game.ai)!==signature) { requestAI(); return; }
    const command=path[index];
    if (command==='hardDrop' && !aiDropAnimation) {
      aiDropAnimation={ from:p.y, to:ghostY(game.ai), started:performance.now() };
      aiPathTimer=setTimeout(runNext,240);
      return;
    }
    aiDropAnimation=null;
    const step=executePlanStep(game.ai,plan.move,command);
    if(step.retry){requestAI();return;}
    index++;
    const result=step.result;
    routeResult('ai',result);
    if (screen==='game') updateGameUI();
    if (index<path.length && !ended) aiPathTimer=setTimeout(runNext,120);
    else if (!ended) { aiPathTimer=setTimeout(requestAI,60); }
  };
  aiPathTimer=setTimeout(runNext, Math.min(90, plan.decisionMs||0));
  updateLabPanel(); refreshLabScreen();
}

function routeResult(side, result) {
  if (result?.locked) {
    if (side==='human') lastHumanoEvent=result;
    else { lastAiEvent=result; game.aiPlannedPlacements=(game.aiPlannedPlacements||0)+1; watchAIProgress(); }
  }
  if (resolveMatchEvent(game,side,result)) finishMatch();
}

function gameStep() {
  if (!game || ended || game.paused) return;
  const now=performance.now(); const delta=Math.min(50,Math.max(0,now-(game.lastTick||now))); game.lastTick=now;
  const humanResult=tick(game.human,delta,game.softDrop,game.config.gravityScale);
  const aiResult=aiDropAnimation ? null : tick(game.ai,delta,false,game.config.gravityScale);
  if(humanResult?.locked)lastHumanoEvent=humanResult;
  if(aiResult?.locked)lastAiEvent=aiResult;
  if(resolveMatchEvents(game,humanResult,aiResult)){finishMatch();return;}
  if(aiResult?.locked) requestAI();
  if (ended) return;
  const held=game.keys?.right?'right':game.keys?.left?'left':null;
  if(held&&now>=(game.nextRepeatAt||0)){action(game.human,held);game.nextRepeatAt=now+43;}
  matchElapsed=now-matchStarted-(game.pausedAt||0);
  if (now-lastUiAt>70) { lastUiAt=now; updateGameUI(); updateLabPanel(); if(screen==='lab')drawLabBoard(app.querySelector('#lab-board'),game.ai,latestDecision); }
}

function finishMatch() {
  if (!game || ended || game.plannerFailed) return;
  if (game.winner==='ai' && !game.aiPlannedPlacements) {
    pauseOnPlannerError('La IA no completó ninguna jugada'); return;
  }
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
  if (toggle && game.paused && game.plannerFailed) { startMatch(generateMatchSeed(),game.config); return; }
  if (toggle) game.paused=!game.paused;
  if(game.paused) { mobileControls?.cancel(); game.softDrop=false; game.pausedAt=performance.now(); if(aiPathTimer)clearTimeout(aiPathTimer); if(aiWatchdog)clearTimeout(aiWatchdog); if(aiProgressWatchdog)clearTimeout(aiProgressWatchdog); aiWatchdog=0; aiProgressWatchdog=0; aiDropAnimation=null; }
  else { if(game.pausedAt) matchStarted+=performance.now()-game.pausedAt; game.pausedAt=0; watchAIProgress(); requestAI(); }
  const button=app.querySelector('#pause-match'); if(button) button.innerHTML=game.paused?'▶ Continuar':'Ⅱ Pausar';
  const overlay=app.querySelector('#pause-overlay'); if(overlay) overlay.classList.toggle('hidden',!game.paused);
}

function renderGame() {
  if(!game) return renderHome();
  const experiment=game.config.experimental?'<span class="mode-tag experimental-tag">SIMULACIÓN EXPERIMENTAL</span>':'';
  shell(`<section class="match-head"><div><div class="eyebrow"><span class="eyebrow-line"></span> PARTIDA EN CURSO ${experiment}</div><h1>Humano <span>vs</span> máquina</h1></div><div class="match-controls"><button id="pause-match" class="button button-outline">Ⅱ Pausar</button><button id="restart-match" class="button button-quiet">↻ Reiniciar</button></div></section>
    <section class="match-layout"><article class="player-column human-column"><div class="player-head"><div class="player-name"><span class="player-symbol human-symbol">H</span><span><b>TÚ</b><small>JUGADOR HUMANO</small></span></div><span class="playing-tag">${game.human.alive?'● JUGANDO':'FUERA'}</span></div><div class="game-top-row"><div class="mini-slot"><small>GUARDAR <kbd>C</kbd></small><canvas id="human-hold" class="mini-canvas"></canvas></div><div class="stat-chips"><span>NIVEL <b id="human-level">1</b></span><span>TIEMPO <b id="match-time">00:00</b></span></div></div><div class="canvas-wrap human-board"><canvas id="human-board" class="board-canvas" aria-label="Tu tablero de Tetris"></canvas><span class="board-edge edge-top"></span><span class="board-edge edge-bottom"></span></div><div class="game-bottom-row"><span>LÍNEAS <b id="human-lines">0</b></span><span>PUNTOS <b id="human-score">0</b></span><span>ATAQUE <b id="human-attack">0</b></span></div><div class="next-row"><small>SIGUIENTE</small><canvas id="human-next" class="next-canvas"></canvas></div></article>
    <div class="versus-column"><div class="versus-line"></div><div class="versus-mark">VS</div><div class="versus-line"></div><div class="timer-orb"><span id="versus-time">00:00</span><small>TRANSCURRIDO</small></div><div class="versus-seed">MISMA SECUENCIA</div></div>
    <article class="player-column ai-column"><div class="player-head"><div class="player-name"><span class="player-symbol ai-symbol">AI</span><span><b>LA MÁQUINA</b><small>${difficultyLabel(game.config.difficulty)} RAZONAMIENTO</small></span></div><span id="ai-state-tag" class="ai-thinking"><i></i> ${game.ai.alive?'PENSANDO':'FUERA'}</span></div><div class="game-top-row"><div class="mini-slot"><small>GUARDAR</small><canvas id="ai-hold" class="mini-canvas"></canvas></div><div class="stat-chips"><span>NIVEL <b id="ai-level">1</b></span><span>BÚSQUEDA <b id="ai-profundidad">—</b></span></div></div><div class="canvas-wrap ai-board"><canvas id="ai-board" class="board-canvas" aria-label="Tablero de la IA"></canvas><span class="board-edge edge-top"></span><span class="board-edge edge-bottom"></span></div><div class="game-bottom-row"><span>LÍNEAS <b id="ai-lines">0</b></span><span>PUNTOS <b id="ai-score">0</b></span><span>ATAQUE <b id="ai-attack">0</b></span></div><div class="next-row"><small>SIGUIENTE</small><canvas id="ai-next" class="next-canvas"></canvas></div></article></section>
    <section class="match-lower"><div class="control-guide"><span>MOVER <kbd>←</kbd><kbd>→</kbd></span><span>GIRAR <kbd>↑</kbd><kbd>X</kbd></span><span>BAJAR <kbd>↓</kbd></span><span>CAÍDA DIRECTA <kbd>ESPACIO</kbd></span><span>GUARDAR <kbd>C</kbd></span></div><div class="attack-feed" id="match-status" role="status" aria-live="polite">${latestDecision?`Buscando ${latestDecision.nodes.toLocaleString()} nodos…`:'Preparando el cálculo…'}</div></section><div class="mobile-controls" aria-label="Controles táctiles"><button data-command="left" aria-label="Mover a la izquierda">←</button><button data-command="right" aria-label="Mover a la derecha">→</button><button data-command="rotateCCW" aria-label="Girar a la izquierda">↶</button><button data-command="rotateCW" aria-label="Girar a la derecha">↷</button><button data-command="softDrop" aria-label="Bajar">↓</button><button data-command="hardDrop" aria-label="Caída directa">BAJAR</button><button data-command="hold" aria-label="Guardar pieza">GUARDAR</button></div>
    <section class="lab-dock"><div class="lab-dock-head"><span class="eyebrow">ANÁLISIS DE LA IA EN VIVO</span><button class="text-link" data-screen="lab">ABRIR LABORATORIO ${icons.arrow}</button></div><div id="lab-inline" class="lab-inline"><span class="trace-placeholder"><i></i> Esperando la primera jugada calculada…</span></div></section>
    <div id="pause-overlay" class="pause-overlay hidden"><div><span class="pause-glyph">Ⅱ</span><h2>Partida en pausa</h2><p id="pause-message" role="status" aria-live="polite">Tu tablero y la IA están en pausa.</p><button class="button button-primary" id="resume-overlay">Continuar partida ${icons.arrow}</button></div></div>`,'');
  app.querySelector('#pause-match').addEventListener('click',()=>pauseMatch(true));
  app.querySelector('#restart-match').addEventListener('click',()=>startMatch(generateMatchSeed(),game.config));
  app.querySelector('#resume-overlay').addEventListener('click',()=>game.plannerFailed?startMatch(generateMatchSeed(),game.config):pauseMatch(true));
  if(game.paused){app.querySelector('#pause-match').innerHTML='▶ Continuar';app.querySelector('#pause-overlay').classList.remove('hidden');}
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
  const cw=rect.width/WIDTH,ch=rect.height/VISIBLE_ROWS; ctx.clearRect(0,0,rect.width,rect.height);
  for(let y=0;y<VISIBLE_ROWS;y++)for(let x=0;x<WIDTH;x++){
    const occupied=(state.board[y+HIDDEN_ROWS]&(1<<x))!==0;
    cell(ctx,x*cw,y*ch,cw,ch,occupied?(colors[state.colorBoard?.[y+HIDDEN_ROWS]?.[x]] || '#7487a6'):null,occupied?'#fff':null);
  }
  if(showGhost&&state.current){const p=state.current,gy=ghostY(state);for(const [x,y]of cellsAt(p.kind,p.rotation,p.x,gy))if(y>=2)cell(ctx,x*cw,(y-2)*ch,cw,ch,null,colors[p.kind],true);}
  if(state.current){const p=state===game?.ai && aiDropAnimation ? {...state.current,y:aiDropAnimation.from+(aiDropAnimation.to-aiDropAnimation.from)*Math.min(1,(performance.now()-aiDropAnimation.started)/240)} : state.current;for(const [x,y]of cellsAt(p.kind,p.rotation,p.x,p.y))if(y>=2)cell(ctx,x*cw,(y-2)*ch,cw,ch,colors[p.kind],colors[p.kind]);}
  if(state.incoming.length){ctx.fillStyle='#ff5c88';ctx.fillRect(0,rect.height-3,rect.width*Math.min(1,state.incoming.length/12),3);}
}
function cell(ctx,x,y,w,h,fill,stroke,ghost=false){const pad=Math.max(1,w*.07);if(fill){ctx.fillStyle=fill;ctx.fillRect(x+pad,y+pad,w-2*pad,h-2*pad);ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(x+pad,y+pad,w-2*pad,Math.max(1,h*.09));}if(stroke){ctx.strokeStyle=ghost?stroke:fill;ctx.globalAlpha=ghost?.48:.78;ctx.lineWidth=ghost?1.4:1;ctx.strokeRect(x+pad+1,y+pad+1,w-2*pad-2,h-2*pad-2);ctx.globalAlpha=1;}}
function drawMini(canvas,piece){if(!canvas)return;const rect=canvas.getBoundingClientRect();if(!rect.width)return;const dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,rect.width,rect.height);if(!piece)return;const cells=CELLS[piece]?.[0]||[];const maxX=Math.max(...cells.map(c=>c[0])),maxY=Math.max(...cells.map(c=>c[1]));const size=Math.min(rect.width/(maxX+1),rect.height/(maxY+1));const offsetX=(rect.width-size*(maxX+1))/2,offsetY=(rect.height-size*(maxY+1))/2;for(const[x,y]of cells)cell(ctx,offsetX+x*size,offsetY+y*size,size,size,colors[piece],colors[piece]);}
function drawQueue(canvas,queue){if(!canvas)return;const rect=canvas.getBoundingClientRect();if(!rect.width)return;const dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,rect.width,rect.height);queue.slice(0,5).forEach((piece,index)=>{const width=rect.width/5,cells=CELLS[piece][0],size=Math.min(14,rect.height/3,width/4),maxX=Math.max(...cells.map(c=>c[0])),maxY=Math.max(...cells.map(c=>c[1]));const sx=index*width+(width-size*(maxX+1))/2,sy=(rect.height-size*(maxY+1))/2;for(const[x,y]of cells)cell(ctx,sx+x*size,sy+y*size,size,size,colors[piece],colors[piece]);});}

function updateGameUI(){if(!game)return;for(const [prefix,state]of [['human',game.human],['ai',game.ai]]){const q=id=>app.querySelector(`#${prefix}-${id}`);if(q('level'))q('level').textContent=state.level;if(q('lines'))q('lines').textContent=state.lines;if(q('score'))q('score').textContent=state.score.toLocaleString();if(q('attack'))q('attack').textContent=state.attacksSent;if(q('board'))drawBoard(q('board'),state,prefix==='human');if(q('hold'))drawMini(q('hold'),state.hold);if(q('next'))drawQueue(q('next'),state.queue);}
  const time=app.querySelector('#match-time');if(time)time.textContent=formatTime(matchElapsed);const vt=app.querySelector('#versus-time');if(vt)vt.textContent=formatTime(matchElapsed);const profundidad=app.querySelector('#ai-profundidad');if(profundidad)profundidad.textContent=latestDecision?`${latestDecision.depth} PLY`:'…';const tag=app.querySelector('#ai-state-tag');if(tag)tag.innerHTML=game.ai.alive?`<i></i> ${aiPathTimer?'EJECUTANDO':'PENSANDO'}`:'FUERA';}

function updateLabPanel(){const target=app.querySelector('#lab-inline');if(!target)return;if(!latestDecision){target.innerHTML='<span class="trace-placeholder"><i></i> Esperando la primera jugada calculada…</span>';return;}const m=latestDecision.move;const candidates=latestDecision.candidates||[];target.innerHTML=`<div class="trace-choice"><span class="trace-piece" style="--piece:${colors[m.kind]}">${m.kind}</span><span><small>JUGADA ELEGIDA</small><b>${m.useHold?'GUARDAR · ':''}COL ${m.x+1} · ROT ${m.rotation}</b></span></div><div class="trace-metric"><b>${latestDecision.nodes.toLocaleString()}</b><small>NODOS</small></div><div class="trace-metric"><b>${latestDecision.depth} niveles</b><small>PROFUNDIDAD</small></div><div class="trace-metric"><b>${latestDecision.decisionMs.toFixed(1)}<em> ms</em></b><small>TIEMPO DE ANÁLISIS</small></div><div class="trace-metric"><b>${Math.round((latestDecision.opponentThreat||0)*100)}%</b><small>RIESGO DEL RIVAL</small></div><div class="trace-bars">${candidates.slice(0,5).map((c,i)=>`<span title="Candidata ${i+1}: puntuación ${c.score.toFixed(2)}" style="--bar:${candidateWidth(c.score,candidates)};--bar-color:${i===0?'#45e8ef':'#564b74'}"></span>`).join('')}</div>`;}

function performHumanAction(command){if(!game||game.paused||ended)return;if(command==='softDrop'){game.softDrop=true;return;}const result=action(game.human,command);routeResult('human',result);if(command==='hold'&&result.held)statusMessage(`Guardada ${game.human.hold||'pieza'} · ${game.human.current?.kind} activa`);if(result.locked&&result.attack)statusMessage(`${result.cleared} líneas eliminadas · ${result.attack} ataques enviados · ${result.canceled||0} cancelados`);updateGameUI();}
function onKeyDown(event){if(screen!=='game'||!game||game.paused||ended||event.altKey||event.ctrlKey||event.metaKey)return;const map={ArrowLeft:'left',ArrowRight:'right',ArrowDown:'softDrop',ArrowUp:'rotateCW',KeyX:'rotateCW',KeyZ:'rotateCCW',KeyC:'hold',Space:'hardDrop'};const command=map[event.code];if(!command)return;event.preventDefault();if(event.repeat)return;if(command==='left'||command==='right'){game.keys=game.keys||{};game.keys[command]=true;game.nextRepeatAt=performance.now()+155;}performHumanAction(command);}
function onKeyUp(event){if(!game)return;if(event.code==='ArrowDown')game.softDrop=false;if(event.code==='ArrowLeft'||event.code==='ArrowRight'){const key=event.code==='ArrowLeft'?'left':'right';if(game.keys)delete game.keys[key];game.nextRepeatAt=performance.now()+45;}}

function renderResult(record){
  const humanWon=record.winner==='human',draw=record.winner==='draw';
  const title=draw?'¡Empate!':humanWon?'¡Has vencido a la máquina!':'La máquina ganó esta vez.';
  shell(`<section class="result-screen ${humanWon?'result-win':'result-loss'}"><div class="result-radial"></div><div class="result-kicker">${record.simulated?'<span class="mode-tag experimental-tag">RESULTADO SIMULADO</span>':'PARTIDA TERMINADA'}</div><div class="result-symbol">${humanWon?'✦':draw?'◇':'⌁'}</div><h1>${title}</h1><p>${record.simulated?'Simulación experimental de victoria · No es un resultado competitivo':`${difficultyLabel(record.difficulty)} IA · secuencia idéntica`}</p>
    <div class="result-scoreboard"><div><small>TÚ</small><strong>${record.humanScore.toLocaleString()}</strong><span>${record.humanLines} líneas · ${record.humanAttacks} ataques</span></div><div class="score-divider">VS</div><div><small>AI</small><strong>${record.aiScore.toLocaleString()}</strong><span>${record.aiLines} líneas · ${record.aiAttacks} ataques</span></div></div><div class="result-time">DURACIÓN <b>${formatTime(record.elapsed)}</b></div><div class="result-actions"><button class="button button-primary" id="rematch">Jugar de nuevo ${icons.arrow}</button><button class="button button-outline" id="to-home">Volver al inicio</button><button class="button button-quiet" data-screen="lab">Explorar decisiones de la IA</button></div></section>`);
  app.querySelector('#rematch').addEventListener('click',()=>startMatch(generateMatchSeed(),record.config||settings));
  app.querySelector('#to-home').addEventListener('click',()=>navigate('home'));
}

function renderLab(){
  const state=game?.ai, d=latestDecision;
  const activeDifficulty=game?.config.difficulty||settings.difficulty;
  const candidates=d?.candidates||[];const top=candidates[0]?.score||0;
  const candidatesHtml=candidates.slice(0,12).map((c,i)=>`<div class="candidate-row ${i===0?'candidate-best':''}"><span class="candidate-rank">${String(i+1).padStart(2,'0')}</span><span class="candidate-piece" style="--piece:${colors[c.kind]}">${c.kind}</span><span class="candidate-info"><b>${c.useHold?'Guardar → ':''}Columna ${c.x+1} <small>· rotación ${c.rotation}</small></b><span class="candidate-bar"><i style="width:${candidateWidth(c.score,candidates)}"></i></span></span><b class="candidate-score">${c.score.toFixed(2)}</b></div>`).join('');
  shell(`<section class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> MODO INVESTIGACIÓN</div><h1>El laboratorio de <span>IA</span></h1><p>Cada opción se calcula a partir del estado real de la partida.</p></div>${game&&!ended?'<button class="button button-outline" data-screen="game">← Volver a la partida</button>':'<button class="button button-primary" id="lab-start">Iniciar partida '+icons.arrow+'</button>'}</section>
    <section class="lab-summary"><div class="lab-board-panel"><div class="panel-label"><span>TABLERO EN VIVO</span><span>${state?'PARTIDA ACTIVA':'ESPERANDO PARTIDA'}</span></div><canvas id="lab-board" class="lab-board-canvas"></canvas><div class="board-legend"><span><i class="legend-fixed"></i> Bloques fijados</span><span><i class="legend-active"></i> Pieza activa</span><span><i class="legend-ghost"></i> Posición prevista</span><span><i class="legend-ghost" style="border-color:#b998ff"></i> Posiciones candidatas</span></div></div><div class="decision-panel"><div class="panel-label"><span>JUGADA ELEGIDA</span><span class="decision-live"><i></i> ${d?'CALCULADA':'ESPERANDO'}</span></div><div id="lab-choice" class="lab-choice">${d?`<div class="choice-piece" style="--piece:${colors[d.move.kind]}">${d.move.kind}</div><div><small>${d.move.useHold?'GUARDAR + ':''}CAÍDA DIRECTA</small><b>Columna ${d.move.x+1} · Rotación ${d.move.rotation}</b><span>Puntuación prevista ${d.move.score.toFixed(2)}</span></div>`:'<div class="trace-placeholder">Inicia una partida para analizar las decisiones de la IA.</div>'}</div><div class="decision-metrics"><div><strong id="lab-stat-profundidad">${d?d.depth:'—'}</strong><small>PROFUNDIDAD</small></div><div><strong id="lab-stat-nodos">${d?d.nodes.toLocaleString():'—'}</strong><small>NODOS EXPLORADOS</small></div><div><strong id="lab-stat-time">${d?d.decisionMs.toFixed(1)+' ms':'—'}</strong><small>TIEMPO DE CÁLCULO</small></div></div><div class="search-budget" id="lab-budget"><span>PRESUPUESTO DE BÚSQUEDA</span><b>${d?Math.min(100,d.decisionMs/d.budgetMs*100).toFixed(0)+'%':'—'}</b><div><i style="width:${d?Math.min(100,d.decisionMs/d.budgetMs*100):0}%"></i></div></div></div></section>
    <section class="lab-lower"><div class="candidates-panel"><div class="panel-title"><span><small>ALTERNATIVAS</small><b>Jugadas candidatas</b></span><span id="lab-candidate-count">${d?`${d.candidateCount} posiciones posibles · top ${candidates.length} mostradas`:'0 evaluadas'}</span></div>${candidates.length?`<div id="lab-candidates" class="candidate-list">${candidatesHtml}</div>`:'<div id="lab-candidates" class="empty-state">Las puntuaciones aparecerán cuando la IA calcule su siguiente jugada.</div>'}</div><aside class="reasoning-panel"><div class="panel-title"><span><small>CÓMO PIENSA</small><b>Entender la búsqueda</b></span><span class="info-mark">i</span></div><div class="reasoning-step"><span>01</span><div><b>Generar posiciones válidas</b><p>Para la pieza activa se comprueban movimientos y rotaciones SRS.</p></div></div><div class="reasoning-step"><span>02</span><div><b>Evaluar cada tablero</b><p>La altura, los huecos, las líneas y los ataques influyen en la puntuación.</p></div></div><div class="reasoning-step"><span>03</span><div><b>Anticipar las siguientes jugadas</b><p>${d?`${difficultyLabel(d.difficulty)} analizó ${d.depth} niveles y exploró ${d.nodes.toLocaleString()} nodos.`:'El nivel determina la profundidad y el tiempo de búsqueda.'} Solo se consideran las piezas visibles.</p></div></div><div class="level-note"><span>CONFIGURACIÓN ACTIVA</span><b>${difficultyLabel(activeDifficulty)} <small>${DIFFICULTIES[activeDifficulty].depth} NIVELES · AMPLITUD ${DIFFICULTIES[activeDifficulty].beam}</small></b></div><p class="advantage-note">La IA analiza el tablero más rápido que una persona, pero solo recibe la misma cola visible de piezas.</p></aside></section>`,'lab');
  if(state) drawLabBoard(app.querySelector('#lab-board'),state,d);
  const summary=app.querySelector('.lab-summary');
  summary?.insertAdjacentHTML('afterend',`<section class="level-comparison"><div class="comparison-heading"><div><div class="eyebrow">MISMO TABLERO · CUATRO NIVELES</div><h2>Comparar niveles de razonamiento</h2><p>Compara los niveles a partir del mismo estado de la partida.</p></div><button id="lab-compare" class="button button-outline" ${state&&state.alive?'':'disabled'}>Comparar todos los niveles</button></div><div id="lab-comparison-results">${comparisonResults?'<div class="empty-state">Hay una comparación anterior; vuelve a calcular para actualizarla.</div>':state?'Aún no se ha calculado una comparación para este tablero.':'Inicia una partida para comparar todos los niveles.'}</div></section>`);
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
function refreshLabScreen(){if(screen!=='lab'||!app.querySelector('#lab-board'))return;if(game)drawLabBoard(app.querySelector('#lab-board'),game.ai,latestDecision);if(!latestDecision)return;const d=latestDecision,m=d.move,choice=app.querySelector('#lab-choice');if(choice)choice.innerHTML=`<div class="choice-piece" style="--piece:${colors[m.kind]}">${m.kind}</div><div><small>${m.useHold?'GUARDAR + ':''}CAÍDA DIRECTA</small><b>Columna ${m.x+1} · Rotación ${m.rotation}</b><span>Puntuación prevista ${m.score.toFixed(2)}</span></div>`;app.querySelector('#lab-stat-profundidad').textContent=d.depth;app.querySelector('#lab-stat-nodos').textContent=d.nodes.toLocaleString();app.querySelector('#lab-stat-time').textContent=`${d.decisionMs.toFixed(1)} ms`;const ratio=Math.min(100,d.decisionMs/d.budgetMs*100);app.querySelector('#lab-budget b').textContent=`${ratio.toFixed(0)}%`;app.querySelector('#lab-budget i').style.width=`${ratio}%`;const candidates=d.candidates||[],top=Math.max(...candidates.map(c=>c.score),1);const count=app.querySelector('#lab-candidate-count');if(count)count.textContent=`${d.candidateCount} posiciones posibles · top ${Math.min(12,candidates.length)} mostradas`;const target=app.querySelector('#lab-candidates');if(target)target.outerHTML=candidates.length?`<div id="lab-candidates" class="candidate-list">${candidates.slice(0,12).map((c,i)=>`<div class="candidate-row ${i===0?'candidate-best':''}"><span class="candidate-rank">${String(i+1).padStart(2,'0')}</span><span class="candidate-piece" style="--piece:${colors[c.kind]}">${c.kind}</span><span class="candidate-info"><b>${c.useHold?'Guardar → ':''}Columna ${c.x+1} <small>· rotación ${c.rotation}</small></b><span class="candidate-bar"><i style="width:${candidateWidth(c.score,candidates)}"></i></span></span><b class="candidate-score">${c.score.toFixed(2)}</b></div>`).join('')}</div>`:'<div id="lab-candidates" class="empty-state">Las puntuaciones aparecerán cuando la IA calcule su siguiente jugada.</div>';}

function renderStats(){const records=safeRead('tia.matches',[]);const wins=records.filter(x=>x.winner==='human').length,losses=records.filter(x=>x.winner==='ai').length,draws=records.filter(x=>x.winner==='draw').length,total=records.length,avgLines=total?records.reduce((sum,x)=>sum+x.humanLines,0)/total:0;const recent=records.slice(0,10).map(x=>`<div class="history-row"><span class="history-result ${x.winner==='human'?'win':x.winner==='draw'?'draw':'loss'}">${x.winner==='human'?'VICTORIA':x.winner==='draw'?'EMPATE':'DERROTA'}</span><b>${x.humanScore.toLocaleString()} <small>vs</small> ${x.aiScore.toLocaleString()}</b><span>${difficultyLabel(x.difficulty)}</span><span>COMPETITIVA</span><span>${formatTime(x.elapsed)}</span></div>`).join('');shell(`<section class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> TU HISTORIAL</div><h1>Lleva la <span>cuenta.</span></h1><p>Las partidas competitivas se guardan en este navegador. Los resultados experimentales se excluyen.</p></div><button class="button button-primary" id="stats-play">Jugar una partida ${icons.arrow}</button></section><section class="stats-grid"><article><small>PARTIDAS COMPETITIVAS</small><strong>${total}</strong><span>HISTORIAL</span></article><article><small>VICTORIAS / DERROTAS</small><strong>${wins}<i> / </i>${losses}</strong><span>${draws} EMPATES</span></article><article><small>PORCENTAJE DE VICTORIAS</small><strong>${total?Math.round(wins/total*100):0}<i>%</i></strong><span>DE TODAS LAS PARTIDAS</span></article><article><small>PROMEDIO DE LÍNEAS</small><strong>${avgLines.toFixed(1)}</strong><span>POR PARTIDA</span></article></section><section class="history-panel"><div class="panel-title"><span><small>HISTORIAL DE PARTIDAS</small><b>Resultados recientes</b></span><button id="clear-stats" class="text-link">BORRAR HISTORIAL</button></div>${recent?`<div class="history-list">${recent}</div>`:'<div class="empty-state">Tu primer resultado competitivo aparecerá aquí.</div>'}</section>`,'stats');app.querySelector('#stats-play').addEventListener('click',showSetup);app.querySelector('#clear-stats').addEventListener('click',()=>{safeWrite('tia.matches',[]);renderStats();});}

function renderSettings(){shell(`<section class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> PREFERENCIAS</div><h1>A tu <span>manera.</span></h1><p>Configura tus próximas partidas.</p></div></section><section class="settings-panel"><label>NIVEL PREDETERMINADO DE IA<select id="setting-difficulty">${Object.entries(DIFFICULTIES).map(([key,d])=>`<option value="${key}" ${settings.difficulty===key?'selected':''}>${d.label} · ${d.depth} niveles · ${d.beam} amplitud</option>`).join('')}</select></label><label class="setting-slider">VELOCIDAD DE CAÍDA <span><input id="setting-gravity" type="range" min="0.7" max="1.35" step="0.05" value="${settings.gravityScale}"/><b id="gravity-value">${settings.gravityScale.toFixed(2)}×</b></span><small>Se aplica por igual a ambos tableros.</small></label><button class="button button-primary" id="save-settings">Guardar preferencias ${icons.arrow}</button><div class="settings-footnote">Las preferencias y los resultados se guardan en este navegador.</div></section>`,'');app.querySelector('#setting-difficulty').addEventListener('change',e=>settings.difficulty=e.target.value);app.querySelector('#setting-gravity').addEventListener('input',e=>{settings.gravityScale=Number(e.target.value);app.querySelector('#gravity-value').textContent=`${settings.gravityScale.toFixed(2)}×`;});app.querySelector('#save-settings').addEventListener('click',()=>{saveSettings();navigate('home');});}

function renderHowTo(){shell(`<section class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> REGLAS DE LA ARENA</div><h1>Aprende a <span>jugar.</span></h1><p>Ambos tableros comparten las mismas reglas.</p></div><button class="button button-primary" id="howto-play">Listo para jugar ${icons.arrow}</button></section><section class="rules-grid"><article><span>01</span><h2>Mueve con estrategia.</h2><p>Usa las flechas para mover y girar. X gira a la derecha y Z a la izquierda. Guarda con C, baja con ↓ y deja caer con Espacio.</p></article><article><span>02</span><h2>Elimina líneas y ataca.</h2><p>Eliminar dos líneas envía una al rival; tres envían dos y un Tetris envía cuatro. Los combos aumentan el ataque.</p></article><article><span>03</span><h2>Mantén el tablero despejado.</h2><p>Cada tablero tiene 10 × 20 casillas visibles, dos filas ocultas, rotaciones SRS, pieza guardada y posición prevista.</p></article><article><span>04</span><h2>Conoce a tu rival.</h2><p>La IA ve la pieza actual y las cinco siguientes. Los niveles superiores analizan más posibilidades.</p></article></section><section class="rules-note"><div class="eyebrow">REGLAS DE LA ARENA</div><h2>Reglas claras para jugar y aprender.</h2><p>Esta arena utiliza rotaciones SRS y reglas propias de puntuación, combos, T-spin y ataques. No reproduce necesariamente todas las reglas de otros juegos. Los tableros vacíos no otorgan ataques adicionales.</p><button class="text-link" data-screen="lab">Explorar el laboratorio de IA ${icons.arrow}</button></section>`);app.querySelector('#howto-play').addEventListener('click',showSetup);}

function boot(){renderHome();window.addEventListener('keydown',onKeyDown);window.addEventListener('keyup',onKeyUp);window.addEventListener('resize',()=>{if(screen==='game')renderBoards();if(screen==='lab'&&game)drawLabBoard(app.querySelector('#lab-board'),game.ai,latestDecision);});window.addEventListener('pagehide',stopMatch);}
boot();
