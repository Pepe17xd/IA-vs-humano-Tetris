import test from 'node:test';
import assert from 'node:assert/strict';
import { planMove } from '../src/agent.js';

test('match executes real worker plans, updates score, and hides the seed', async () => {
  let now=0, nextId=0;
  const jobs=new Map(), instances=[];
  const schedule=(fn,delay=0)=>{const id=++nextId;jobs.set(id,{fn,at:now+delay});return id;};
  const advance=ms=>{
    const end=now+ms;
    while(true){
      const due=[...jobs].filter(([,job])=>job.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!due)break;
      jobs.delete(due[0]);now=due[1].at;due[1].fn();
    }
    now=end;
  };
  class Element {
    constructor(){this.handlers={};this.nodes=new Map();this.classList={toggle(){},add(){},remove(){}};this.value='';this.checked=false;this.textContent='';this.innerHTML='';}
    addEventListener(type,fn){this.handlers[type]=fn;}
    querySelector(selector){if(!this.nodes.has(selector))this.nodes.set(selector,new Element());return this.nodes.get(selector);}
    querySelectorAll(){return [];}
    append(child){this.child=child;}
    remove(){}
    getBoundingClientRect(){return {width:0,height:0};}
    click(){this.handlers.click?.({target:this});}
  }
  const app=new Element();
  class TestWorker {
    constructor(url,options){this.url=url;this.options=options;instances.push(this);}
    postMessage(message){this.request=message;schedule(()=>this.onmessage({data:planMove(message.state,message.difficulty,message.requestId)}),1);}
    terminate(){}
  }
  const original={document:globalThis.document,window:globalThis.window,localStorage:globalThis.localStorage,Worker:globalThis.Worker,performance:globalThis.performance,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
  globalThis.document={querySelector:()=>app,createElement:()=>new Element(),body:{classList:{toggle(){}}},documentElement:{style:{setProperty(){}}}};
  globalThis.window={addEventListener(){},setInterval(){return 1;},devicePixelRatio:1};
  globalThis.localStorage={getItem:()=>null,setItem(){}};
  globalThis.Worker=TestWorker;
  globalThis.performance={now:()=>now};
  globalThis.setTimeout=schedule;
  globalThis.clearTimeout=id=>jobs.delete(id);
  try {
    await import('../src/app.js?match-test');
    app.querySelector('#start-match').click();
    const modal=app.child;
    assert.doesNotMatch(modal.innerHTML,/semilla/i);
    modal.querySelector('#setup-difficulty').value='beginner';
    modal.querySelector('#setup-probability').value='35';
    modal.querySelector('#confirm-start').click();
    assert.match(app.innerHTML,/id="human-board"/);
    assert.match(app.innerHTML,/id="ai-board"/);
    assert.doesNotMatch(app.innerHTML,/semilla/i);
    assert.match(instances[0].url.pathname,/\/src\/ai-worker\.js$/);
    assert.equal(instances[0].options.type,'module');
    assert.ok(instances[0].request.state.current);
    advance(5000);
    assert.ok(Number(app.querySelector('#ai-score').textContent)>0,'real placements update the AI score');
    assert.ok(instances[0].request.requestId>1,'new decisions are requested after a placement');
  } finally {
    for(const [name,value] of Object.entries(original))globalThis[name]=value;
  }
});
