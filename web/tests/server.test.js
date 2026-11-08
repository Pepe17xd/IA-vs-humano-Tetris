import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from '../../scripts/serve.mjs';

test('static server serves the app shell and JavaScript modules',async()=>{
  const webRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const server=createStaticServer(webRoot);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const port=server.address().port;
    const page=await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status,200);assert.match(page.headers.get('content-type'),/text\/html/);
    const html=await page.text();
    assert.match(html,/Tetris AI Arena/);
    assert.match(html,/\.\/src\/lab\.css/);
    for(const asset of ['/src/app.js','/src/game.js','/src/agent.js','/src/agent-executor.js','/src/worker-guard.js','/src/ai-worker.js','/src/ai-compare-worker.js','/src/match.js','/src/input.js','/src/lab-render.js','/src/style.css','/src/lab.css','/favicon.svg']){
      const response=await fetch(`http://127.0.0.1:${port}${asset}`);
      assert.equal(response.status,200,asset);
      const mime=asset.endsWith('.css')?'text/css':asset.endsWith('.svg')?'image/svg+xml':'text/javascript';
      assert.ok(response.headers.get('content-type').includes(mime),asset);
      assert.ok((await response.text()).length>0,asset);
    }
    assert.equal((await fetch(`http://127.0.0.1:${port}/missing`)).status,404);
  }finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
