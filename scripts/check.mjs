import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
const files=[];
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const target=path.join(dir,entry.name);if(entry.isDirectory())await walk(target);else if(/\.(js|mjs)$/.test(entry.name))files.push(target);}}
await walk('web'); await walk('scripts');
const {spawnSync}=await import('node:child_process');
for(const file of files){
  const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
  const source=(await readFile(file,'utf8')).replace(/\r\n/g,'\n');
  if(source.split('\n').some(line=>line!==line.trimEnd()))throw new Error(`${file} has trailing whitespace`);
  for(const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){
    const specifier=match[1];
    if(!specifier.startsWith('.'))continue;
    const imported=path.resolve(path.dirname(file),specifier);
    try{if(!(await stat(imported)).isFile())throw new Error(`${file}: import is not a file: ${specifier}`);}
    catch{throw new Error(`${file}: missing relative import ${specifier}`);}
  }
}
console.log(`Lint and syntax checks passed for ${files.length} JavaScript modules.`);
