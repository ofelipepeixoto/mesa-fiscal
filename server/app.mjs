import { createServer } from 'node:http';
import { createReadStream, realpathSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import { resolve, extname, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateRegular, serviceAddress as regularAddress } from './regular.mjs';
import { calculateSimples, listSimplesActivities, serviceUrl as simplesAddress, SIMPLES_PATH } from './simples.mjs';
import { generateDanfse, serviceAddress as danfseAddress, MAX_XML_BYTES } from './danfse.mjs';
import { readLocalJson } from './local-json.mjs';
import { calculationVersions } from '../public/calculation-versions.mjs';

const defaultStaticRoot = new URL('../public/', import.meta.url);
// Dois PDFs simultâneos podem ocupar 64 MiB só nas respostas, além do XML e do motor.
const maxActiveDocuments = 2;
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.xml': 'application/xml', '.pdf': 'application/pdf',
  '.wasm': 'application/wasm', '.gz': 'application/gzip', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};
const localNames = new Set(['localhost', '127.0.0.1', '[::1]']);
const csp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; worker-src 'self' blob:; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

export function isPublicAsset(directory, path) {
  if (!path?.startsWith(directory + sep)) return false;
  const parts = path.slice(directory.length + 1).split(sep);
  return parts.every(part => part.length > 0 && !part.startsWith('.'));
}

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

function checkLocalRequest(req) {
  const authority = req.headers.host;
  let host;
  try {
    if (typeof authority !== 'string' || /[/\\?#@]/.test(authority)) throw new Error();
    host = new URL('http://' + authority);
  } catch {
    throw fail(403, 'Abra a aplicação pelo endereço local indicado.');
  }
  if (!localNames.has(host.hostname)) throw fail(403, 'Abra a aplicação pelo endereço local indicado.');
  const site = req.headers['sec-fetch-site'];
  if ((site && site !== 'same-origin' && site !== 'none') ||
      (req.headers.origin && req.headers.origin !== host.origin)) {
    throw fail(403, 'Use a ferramenta na mesma aba da aplicação.');
  }
}

async function body(req, max) {
  const tooLarge = () => fail(413, 'O arquivo ou formulário excedeu o tamanho permitido.');
  if (Number(req.headers['content-length']) > max) throw tooLarge();
  const chunks = [];
  let length = 0;
  for await (const part of req.iterator({ destroyOnReturn: false })) {
    length += part.length;
    if (length > max) {
      req.resume();
      throw tooLarge();
    }
    chunks.push(part);
  }
  return Buffer.concat(chunks, length);
}

async function readJson(req) {
  const bytes = await body(req, 32 * 1024);
  try {
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error();
    return data;
  } catch {
    throw fail(400, 'Confira os campos enviados e tente novamente.');
  }
}

function checkType(req, allowed) {
  const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!allowed.includes(type)) throw fail(415, 'O formato dos dados enviados é incompatível com esta ferramenta.');
}

async function available(address, fetchImpl, swagger) {
  try {
    const endpoint = new URL(address());
    const path = swagger ? '/api/api-docs' : '/health/ready';
    const response = await fetchImpl(new URL(path, endpoint), { redirect: 'error', signal: AbortSignal.timeout(2500) });
    if (!response.ok) {
      await response.body?.cancel();
      return false;
    }
    const doc = await readLocalJson(response, () => new Error('Formato de resposta incompatível.'));
    if (!swagger) return doc?.status === 'ok';
    // Os dois projetos Spring têm o context-path /api, ausente em paths no OpenAPI.
    const operation = doc?.paths?.[endpoint.pathname.slice('/api'.length)]?.post;
    return typeof doc?.openapi === 'string' && doc.openapi.startsWith('3.') &&
      operation !== null && typeof operation === 'object' && !Array.isArray(operation);
  } catch {
    return false;
  }
}

export function createMesaServer({
  regularUrl = process.env.REGULAR_URL, simplesUrl = process.env.SIMPLES_URL,
  danfseUrl = process.env.DANFSE_URL, fetchImpl = fetch, staticRoot = defaultStaticRoot,
} = {}) {
  const configuredRoot = staticRoot instanceof URL ? fileURLToPath(staticRoot) : staticRoot;
  if (typeof configuredRoot !== 'string' || !isAbsolute(configuredRoot)) {
    throw new TypeError('A pasta de arquivos públicos precisa ser um caminho absoluto.');
  }
  const publicDir = realpathSync(configuredRoot);
  let activeDocuments = 0;
  let statusInProgress;

  function readStatus() {
    // Abas abertas juntas compartilham a leitura dos catálogos, sem guardar estado após a resposta.
    if (!statusInProgress) {
      statusInProgress = Promise.all([
        available(() => regularAddress(regularUrl), fetchImpl, true),
        available(() => simplesAddress(simplesUrl, SIMPLES_PATH), fetchImpl, true),
        available(() => danfseAddress(danfseUrl), fetchImpl, false),
      ]).then(([regular, simples, danfse]) => ({ regular, simples, danfse }))
        .finally(() => { statusInProgress = undefined; });
    }
    return statusInProgress;
  }

  return createServer({ requestTimeout: 65_000, headersTimeout: 15_000 }, async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        checkLocalRequest(req);
        res.setHeader('Cache-Control', 'no-store');
        if (req.method === 'GET' && url.pathname === '/api/status') {
          return json(res, 200, await readStatus());
        }
        if (req.method === 'GET' && url.pathname === '/api/atividades') {
          const result = await listSimplesActivities(Object.fromEntries(url.searchParams), { baseUrl: simplesUrl, fetchImpl });
          return json(res, 200, result);
        }
        if (req.method === 'POST' && ['/api/regular', '/api/simples'].includes(url.pathname)) {
          checkType(req, ['application/json']);
          const data = await readJson(req);
          const result = url.pathname === '/api/regular'
            ? await calculateRegular(data, { baseUrl: regularUrl, fetchImpl })
            : await calculateSimples(data, { baseUrl: simplesUrl, fetchImpl });
          const kind = url.pathname === '/api/regular' ? 'regular' : 'simples';
          return json(res, 200, { ...result, calculationVersion: calculationVersions.engine[kind] });
        }
        if (req.method === 'POST' && url.pathname === '/api/danfse') {
          checkType(req, ['application/xml', 'text/xml']);
          if (activeDocuments >= maxActiveDocuments) {
            res.setHeader('Retry-After', '2');
            throw fail(429, 'O gerador está preparando outros documentos. Tente novamente em instantes.');
          }
          activeDocuments++;
          try {
            const result = await generateDanfse(await body(req, MAX_XML_BYTES), {
              status: url.searchParams.get('stc') ?? '0', receipt: url.searchParams.get('canhoto') ?? 'false',
              baseUrl: danfseUrl, fetchImpl,
            });
            if (res.destroyed) return;
            res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': result.length,
              'content-disposition': 'attachment; filename="danfse.pdf"' });
            res.setTimeout(45_000, () => res.destroy());
            res.end(result);
            await finished(res, { cleanup: true });
            return;
          } finally {
            activeDocuments--;
          }
        }
        throw fail(404, 'Essa operação não está disponível.');
      }

      if (!['GET', 'HEAD'].includes(req.method)) throw fail(405, 'Método indisponível.');
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { throw fail(400, 'Endereço inválido.'); }
      const asset = resolve(publicDir, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!isPublicAsset(publicDir, asset)) throw fail(404, 'Arquivo não encontrado.');
      const target = await realpath(asset).catch(() => null);
      if (!isPublicAsset(publicDir, target)) throw fail(404, 'Arquivo não encontrado.');
      const info = await stat(target).catch(() => null);
      if (!info?.isFile()) throw fail(404, 'Arquivo não encontrado.');
      res.writeHead(200, { 'content-type': types[extname(asset)] || 'application/octet-stream',
        'content-length': info.size, 'cache-control': 'no-cache' });
      if (req.method === 'HEAD') return res.end();
      createReadStream(target).on('error', () => res.destroy()).pipe(res);
    } catch (err) {
      if (res.headersSent || res.destroyed) return;
      const known = Number.isInteger(err.status);
      json(res, known ? err.status : 500, { error: known ? err.message : 'Não foi possível concluir a operação.' });
    }
  });
}
