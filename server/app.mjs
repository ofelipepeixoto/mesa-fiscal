import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateRegular } from './regular.mjs';
import { calculateSimples, listSimplesActivities } from './simples.mjs';
import { generateDanfse, MAX_XML_BYTES } from './danfse.mjs';

const publicDir=fileURLToPath(new URL('../public/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.xml':'application/xml','.pdf':'application/pdf','.wasm':'application/wasm','.gz':'application/gzip','.txt':'text/plain; charset=utf-8','.woff2':'font/woff2'};
const localNames=new Set(['localhost','127.0.0.1','[::1]']);
function fail(status,message){return Object.assign(new Error(message),{status})}
function json(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data))}
async function body(req,max){
  if(Number(req.headers['content-length'])>max) throw fail(413,'O arquivo ou formulário excedeu o tamanho permitido.');
  const chunks=[];let length=0;
  for await(const part of req){
    length+=part.length;if(length>max)throw fail(413,'O arquivo ou formulário excedeu o tamanho permitido.');chunks.push(part);
  }
  return Buffer.concat(chunks,length);
}
async function readJson(req){
  const bytes=await body(req,32*1024);
  try{const data=JSON.parse(bytes.toString('utf8'));if(!data||Array.isArray(data)||typeof data!=='object')throw new Error();return data}
  catch{throw fail(400,'Confira os campos enviados e tente novamente.')}
}
function checkType(req,allowed){const type=(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();if(!allowed.includes(type)) throw fail(415,'O formato dos dados enviados é incompatível com esta ferramenta.')}
async function available(url,engine,path,fetchImpl){
  if(!url)return false;
  try{
    const base=new URL(url);
    if(!['http:','https:'].includes(base.protocol)||(!localNames.has(base.hostname)&&base.hostname!==engine)||base.username||base.password||base.search||base.hash)return false;
    const response=await fetchImpl(new URL(path,base),{redirect:'error',signal:AbortSignal.timeout(2500)});
    const ready=response.ok;await response.body?.cancel();return ready;
  }catch{return false}
}
export function createMesaServer({
  regularUrl=process.env.REGULAR_URL,simplesUrl=process.env.SIMPLES_URL,danfseUrl=process.env.DANFSE_URL,fetchImpl=fetch
}={}){
  return createServer({requestTimeout:65_000,headersTimeout:15_000},async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; worker-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try{
      const url=new URL(req.url,'http://localhost');
      if(url.pathname.startsWith('/api/')){
        const host=new URL('http://'+req.headers.host);
        if(!localNames.has(host.hostname)) throw fail(403,'Abra a aplicação pelo endereço local indicado.');
        const origin=req.headers.origin;
        if(origin && origin!==host.origin)throw fail(403,'Use a ferramenta na mesma aba da aplicação.');
        res.setHeader('Cache-Control','no-store');
        if(req.method==='GET' && url.pathname==='/api/status'){
          const [regular,simples,danfse]=await Promise.all([available(regularUrl,'regular','/api/api-docs',fetchImpl),available(simplesUrl,'simples','/api/api-docs',fetchImpl),available(danfseUrl,'danfse','/health/ready',fetchImpl)]);
          return json(res,200,{regular,simples,danfse});
        }
        if(req.method==='GET' && url.pathname==='/api/atividades')return json(res,200,await listSimplesActivities(Object.fromEntries(url.searchParams),{baseUrl:simplesUrl,fetchImpl}));
        if(req.method==='POST' && ['/api/regular','/api/simples'].includes(url.pathname)){
          checkType(req,['application/json']);const data=await readJson(req);
          const result=url.pathname==='/api/regular' ? await calculateRegular(data,{baseUrl:regularUrl,fetchImpl}):await calculateSimples(data,{baseUrl:simplesUrl,fetchImpl});
          return json(res,200,result);
        }
        if(req.method==='POST' && url.pathname==='/api/danfse'){
          checkType(req,['application/xml','text/xml']);const result=await generateDanfse(await body(req,MAX_XML_BYTES),{
            status:url.searchParams.get('stc')??'0',receipt:url.searchParams.get('canhoto')??'false',baseUrl:danfseUrl,fetchImpl
          });
          res.writeHead(200,{'content-type':'application/pdf','content-length':result.length,'content-disposition':'attachment; filename="danfse.pdf"'});return res.end(result)
        }
        throw fail(404,'Essa operação não está disponível.');
      }
      if(!['GET','HEAD'].includes(req.method))throw fail(405,'Método indisponível.');
      let pathname;try{pathname=decodeURIComponent(url.pathname)}catch{throw fail(400,'Endereço inválido.')}
      const asset=resolve(publicDir,'.'+(pathname==='/'?'/index.html':pathname));
      if(!asset.startsWith(resolve(publicDir)+sep)||pathname.split('/').some(v=>v.startsWith('.')))throw fail(404,'Arquivo não encontrado.');
      const info=await stat(asset).catch(()=>null);
      if(!info?.isFile())throw fail(404,'Arquivo não encontrado.');
      res.writeHead(200,{'content-type':types[extname(asset)]||'application/octet-stream','content-length':info.size,'cache-control':'no-cache'});
      if(req.method==='HEAD')return res.end();
      createReadStream(asset).on('error',()=>res.destroy()).pipe(res);
    }catch(err){
      if(!res.headersSent && !res.destroyed)json(res,Number.isInteger(err.status)?err.status:500,{error:Number.isInteger(err.status)?err.message:'Não foi possível concluir a operação.'});
    }
  });
}
