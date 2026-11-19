import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
const root = new URL('../',import.meta.url);
const dist = new URL('dist/',root);
await rm(dist,{recursive:true,force:true});
await mkdir(dist,{recursive:true});
await cp(new URL('public/',root),dist,{recursive:true});
const page = new URL('index.html',dist);
const html=await readFile(page,'utf8');
await writeFile(page,html.replace('<title>','<meta name="mesa-edicao" content="navegador"><title>'));
