import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'web');
const output = path.join(root, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(source, 'index.html'), path.join(output, 'index.html'));
await cp(path.join(source, 'favicon.svg'), path.join(output, 'favicon.svg'));
await cp(path.join(source, 'assets'), path.join(output, 'assets'), { recursive: true });
await cp(path.join(source, 'src'), path.join(output, 'src'), { recursive: true });
console.log(`Static app copied to ${path.relative(root, output)}/`);
