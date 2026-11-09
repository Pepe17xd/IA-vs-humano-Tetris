import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
export function createStaticServer(folder) {
  folder = path.resolve(folder);
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://localhost');
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      let target = path.resolve(folder, relative || 'index.html');
      if (!target.startsWith(folder + path.sep) && target !== folder) throw new Error('Invalid path');
      try { if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html'); } catch {}
      const data = await readFile(target);
      response.writeHead(200, { 'content-type': types[path.extname(target)] || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(data);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const folder = path.resolve(root, process.argv[2] || 'web');
  const port = Number(process.argv[3] || 4173);
  createStaticServer(folder).listen(port, '127.0.0.1', () => console.log(`Tetris AI Arena: http://127.0.0.1:${port}`));
}
