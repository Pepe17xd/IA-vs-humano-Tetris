import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { createStaticServer } from '../../scripts/serve.mjs';

test('production arena plays with a real browser and module worker under Pages prefix', { timeout:90000 }, async () => {
  const basePath='/IA-vs-humano-Tetris/';
  const staticServer=createStaticServer('dist');
  const server=createServer((req,res)=>{
    if(!req.url.startsWith(basePath)){res.writeHead(404).end();return;}
    req.url='/'+req.url.slice(basePath.length);
    staticServer.emit('request',req,res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[], badResponses=[], workers=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    page.on('response',response=>{if(response.url().includes(basePath)&&response.status()>=400)badResponses.push(response.url());});
    page.on('worker',worker=>workers.push(worker.url()));
    await page.goto(`http://127.0.0.1:${server.address().port}${basePath}`,{waitUntil:'load'});
    assert.equal(await page.evaluate(async()=>{const image=new Image();image.src=new URL('assets/alpine-lake.jpg',location.href);await image.decode();return image.naturalWidth>0;}),true);
    await page.locator('#start-match').click();
    await page.locator('#setup-difficulty').selectOption('extreme');
    assert.equal(await page.locator('#setup-seed, #setup-experimental, #setup-probability').count(),0);
    await page.locator('#confirm-start').click();
    await page.locator('#human-board').waitFor({state:'visible'});
    await page.locator('#ai-board').waitFor({state:'visible'});
    assert.match(await page.locator('.execution-note').innerText(),/ventaja de velocidad/);
    assert.equal(await page.evaluate(async()=>{const image=new Image();image.src=new URL('assets/forest-road.jpg',location.href);await image.decode();return image.naturalWidth>0;}),true);
    const boardSize=await page.locator('#ai-board').boundingBox();
    assert.ok(Math.abs(boardSize.height/boardSize.width-2)<0.05,'board cells retain their square proportions');
    await page.waitForFunction(()=>Number(document.querySelector('#ai-score')?.textContent.replace(/\D/g,''))>=60,null,{timeout:30000});
    assert.ok(workers.some(url=>url.endsWith('/src/ai-worker.js')),'module worker was created');
    const timerDelay=await page.evaluate(()=>new Promise(resolve=>{const start=performance.now();setTimeout(()=>resolve(performance.now()-start),50);}));
    assert.ok(timerDelay<2000,`main thread remained responsive: ${timerDelay} ms`);
    const before=await page.locator('#ai-board').evaluate(canvas=>canvas.toDataURL());
    await page.waitForTimeout(1200);
    const after=await page.locator('#ai-board').evaluate(canvas=>canvas.toDataURL());
    assert.notEqual(before,after,'AI board changes as pieces move or lock');
    if(process.env.ARENA_SCREENSHOT) await page.screenshot({path:process.env.ARENA_SCREENSHOT,fullPage:true});
    await page.keyboard.press('Space');
    assert.ok(Number((await page.locator('#human-score').textContent()).replace(/\D/g,''))>0);
    await page.locator('.lab-dock [data-screen="lab"]').click();
    await page.locator('#lab-choice .choice-piece').waitFor();
    assert.ok(await page.locator('#lab-candidates .candidate-row').count()>0);
    assert.match(await page.locator('#lab-choice').innerText(),/Puntuación prevista/);
    await page.locator('[data-screen="game"]').last().click();
    for(let i=0;i<25 && await page.locator('#human-board').count();i++) await page.keyboard.press('Space');
    await page.locator('.result-screen').waitFor({timeout:10000});
    assert.ok(await page.locator('.result-scoreboard strong').count()===2);
    assert.deepEqual(errors,[]);
    assert.deepEqual(badResponses,[]);

    const failurePage=await browser.newPage();
    await failurePage.route('**/src/ai-worker.js',route=>route.abort());
    await failurePage.goto(`http://127.0.0.1:${server.address().port}${basePath}`);
    await failurePage.locator('#start-match').click();
    await failurePage.locator('#confirm-start').click();
    await failurePage.locator('#pause-overlay:not(.hidden)').waitFor({timeout:10000});
    assert.match(await failurePage.locator('#pause-message').innerText(),/no se guardó el resultado/i);
    assert.equal(await failurePage.locator('.result-screen').count(),0);

    const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true});
    await mobile.goto(`http://127.0.0.1:${server.address().port}${basePath}`);
    await mobile.locator('#start-match').click();
    await mobile.locator('#confirm-start').click();
    assert.ok(await mobile.locator('#human-board').isVisible());
    assert.ok(await mobile.locator('#ai-board').isVisible());
    assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  } finally {
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
});

test('all levels execute real plans and extreme responds sooner than beginner', { timeout:90000 }, async () => {
  const prefix='/IA-vs-humano-Tetris/';
  const staticServer=createStaticServer('dist');
  const server=createServer((req,res)=>{
    if(!req.url.startsWith(prefix)){res.writeHead(404).end();return;}
    req.url='/'+req.url.slice(prefix.length);staticServer.emit('request',req,res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({headless:true});
    const elapsed={};
    for(const level of ['beginner','intermediate','advanced','extreme']) {
      const page=await browser.newPage();
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
      await page.addInitScript(()=>{
        Math.random=()=>0.12345;
        const NativeWorker=window.Worker;
        window.__aiRequests=0;
        window.__aiBoardAdvanced=false;
        window.Worker=class extends NativeWorker {
          postMessage(message,...args){window.__aiRequests++;if(message.state?.board?.some(row=>row!==0))window.__aiBoardAdvanced=true;return super.postMessage(message,...args);}
        };
      });
      await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
      await page.locator('#start-match').click();
      await page.locator('#setup-difficulty').selectOption(level);
      const start=Date.now();
      await page.locator('#confirm-start').click();
      await page.waitForFunction(()=>window.__aiBoardAdvanced && Number(document.querySelector('#ai-score')?.textContent.replace(/\D/g,''))>0,null,{timeout:20000});
      elapsed[level]=Date.now()-start;
      assert.equal(await page.locator('#pause-overlay:not(.hidden)').count(),0,level);
      assert.deepEqual(errors,[],level);
      await page.close();
    }
    console.log('Time until a later AI request includes placed blocks (ms):',JSON.stringify(elapsed));
    assert.ok(elapsed.extreme<elapsed.beginner,JSON.stringify(elapsed));
  } finally {
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
});
