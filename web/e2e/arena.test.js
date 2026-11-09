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
    await page.locator('#start-match').click();
    await page.locator('#setup-difficulty').selectOption('extreme');
    assert.equal(await page.locator('#setup-seed, #setup-experimental, #setup-probability').count(),0);
    await page.locator('#confirm-start').click();
    await page.locator('#human-board').waitFor({state:'visible'});
    await page.locator('#ai-board').waitFor({state:'visible'});
    const boardSize=await page.locator('#ai-board').boundingBox();
    assert.ok(Math.abs(boardSize.height/boardSize.width-2)<0.05,'board cells retain their square proportions');
    await page.waitForFunction(()=>Number(document.querySelector('#ai-score')?.textContent.replace(/\D/g,''))>=60,null,{timeout:30000});
    assert.ok(workers.some(url=>url.endsWith('/src/ai-worker.js')),'module worker was created');
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
  } finally {
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
});
