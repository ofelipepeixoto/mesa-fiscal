import assert from 'node:assert/strict';
import { request } from 'node:http';
import { resolve } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { createMesaServer, isPublicAsset } from '../server/app.mjs';
import { readLocalJson } from '../server/local-json.mjs';
import { regularExample } from '../public/regular-study.mjs';
import { simplesExample } from '../public/simples-study.mjs';
import { calculationVersions } from '../public/calculation-versions.mjs';

async function localApp(t, options = {}, onRequest) {
  const server = createMesaServer({ regularUrl: null, simplesUrl: null, danfseUrl: null, ...options });
  if (onRequest) server.on('request', onRequest);
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return 'http://127.0.0.1:' + server.address().port;
}

function jsonPost(value) {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) };
}

function httpStatus(url, headers, chunks = []) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: chunks.length ? 'POST' : 'GET', headers }, response => {
      response.resume();
      response.once('end', () => resolve(response.statusCode));
    });
    req.on('error', reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}

test('a instalação sem motores oferece os exemplos e mantém indisponíveis as rotas de produção', async t => {
  const local = await localApp(t, { fetchImpl: () => assert.fail('Não deve contatar outro processo.') });
  const states = await fetch(local + '/api/status');
  assert.deepEqual(await states.json(), { regular: false, simples: false, danfse: false });
  assert.equal(states.headers.get('cache-control'), 'no-store');
  for (const [kind, input] of [['regular', regularExample.input], ['simples', simplesExample.input]]) {
    const response = await fetch(local + '/api/' + kind, jsonPost(input));
    assert.equal(response.status, 503);
    const result = await response.json();
    assert.equal(typeof result.error, 'string');
    assert.equal(result.total, undefined);
  }
  const document = await fetch(local + '/api/danfse', {
    method: 'POST', headers: { 'content-type': 'application/xml' }, body: '<NFSe/>',
  });
  assert.equal(document.status, 503);
  assert.equal(document.headers.get('cache-control'), 'no-store');
  assert.match((await document.json()).error, /gerador/i);
});

test('a API aceita a própria origem e recusa host ou origem de outro site', async t => {
  const local = await localApp(t);
  const url = local + '/api/status';
  assert.equal(await httpStatus(url, { origin: local }), 200);
  assert.equal(await httpStatus(url, { host: 'outra-aplicacao.invalid' }), 403);
  assert.equal(await httpStatus(url, { origin: 'https://outra-aplicacao.invalid' }), 403);
  assert.equal(await httpStatus(url, { 'sec-fetch-site': 'same-origin' }), 200);
  assert.equal(await httpStatus(url, { 'sec-fetch-site': 'cross-site' }), 403);
});

test('a verificação de disponibilidade exige o contrato do motor certo', async t => {
  const local = await localApp(t, {
    regularUrl: 'http://regular:8080/api/calculadora', simplesUrl: 'http://simples:8082/api',
    danfseUrl: 'http://danfse:8080',
    fetchImpl: async url => {
      if (url.hostname === 'danfse') {
        assert.equal(url.pathname, '/health/ready');
        return Response.json({ status: 'ok' });
      }
      assert.equal(url.pathname, '/api/api-docs');
      const endpoint = '/calculadora/observabilidade/' + (url.hostname === 'regular' ? 'regime-geral' : 'simples-nacional');
      return Response.json({ openapi: '3.1.0', paths: { [endpoint]: { post: { operationId: 'calcular' } } } });
    },
  });
  const valid = await fetch(local + '/api/status');
  assert.deepEqual(await valid.json(), { regular: true, simples: true, danfse: true });
  const wrongService = await localApp(t, {
    regularUrl: 'http://regular:8080', simplesUrl: 'http://simples:8082', danfseUrl: 'http://danfse:8080',
    fetchImpl: async url => url.hostname === 'simples' ? new Response('Página inicial') : Response.json({ online: true }),
  });
  const invalid = await fetch(wrongService + '/api/status');
  assert.deepEqual(await invalid.json(), { regular: false, simples: false, danfse: false });
});

test('a API valida formato e tamanho antes de calcular', async t => {
  const local = await localApp(t);
  for (const path of ['/api/regular', '/api/simples', '/api/danfse']) {
    const response = await fetch(local + path, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'exemplo' });
    assert.equal(response.status, 415);
  }
  const form = await fetch(local + '/api/regular', jsonPost(['exemplo']));
  assert.equal(form.status, 400);
  const headers = { 'content-type': 'application/json', 'transfer-encoding': 'chunked' };
  assert.equal(await httpStatus(local + '/api/regular', headers, [Buffer.alloc(17 * 1024), Buffer.alloc(17 * 1024)]), 413);
});

test('a API do Simples recusa um total incompatível sem publicar resultado calculado', async t => {
  let totalTributos = simplesExample.result.total;
  const local = await localApp(t, {
    simplesUrl: 'http://simples:8082/api',
    fetchImpl: async () => Response.json({
      objetos: [{ nObj: 1, estadoItem: 'CALCULADO' }],
      total: { vIBSSNtot: simplesExample.result.ibs, vCBSSNtot: simplesExample.result.cbs,
        totalIs: simplesExample.result.is, totalTributos },
    }),
  });
  const valid = await fetch(local + '/api/simples', jsonPost(simplesExample.input));
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { status: 'calculado', ...simplesExample.result,
    calculationVersion: calculationVersions.engine.simples });
  totalTributos = '87.99';
  const invalid = await fetch(local + '/api/simples', jsonPost(simplesExample.input));
  assert.equal(invalid.status, 502);
  const response = await invalid.json();
  assert.match(response.error, /soma de IBS, CBS e IS/);
  assert.equal(response.total, undefined);
  assert.equal(response.status, undefined);
  assert.equal(response.calculationVersion, undefined);
});

test('a API do regime regular vincula revisões previstas apenas a um resultado aceito', async t => {
  let valid = true;
  const local = await localApp(t, {
    regularUrl: 'http://regular:8080/api/calculadora',
    fetchImpl: async () => Response.json({
      objetos: [{ nObj: 1, estadoItem: valid ? 'CALCULO_SIMULADO' : 'FALHA_TECNICA',
        tribCalc: { IBSCBS: { gIBSCBS: { gCBS: { vCBS: '42.24' }, vIBS: '0.48' } } } }],
      total: { tribCalc: { IBSCBSTot: { gCBS: { vCBS: '42.24' }, gIBS: { vIBS: '0.48' } } } },
      calculationVersion: { expectedEngineRevision: '0'.repeat(40) },
    }),
  });
  const response = await fetch(local + '/api/regular', jsonPost(regularExample.input));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.total, '42.72');
  assert.equal(result.status, 'simulado');
  assert.deepEqual(result.calculationVersion, calculationVersions.engine.regular);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  valid = false;
  const failed = await fetch(local + '/api/regular', jsonPost(regularExample.input));
  assert.equal(failed.status, 502);
  const failure = await failed.json();
  assert.equal(failure.calculationVersion, undefined);
  assert.equal(failure.total, undefined);
});

test('o servidor publica só a interface e os arquivos de exemplo', async t => {
  const local = await localApp(t);
  const home = await fetch(local + '/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Mesa Fiscal/);
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
  const policy = home.headers.get('content-security-policy');
  assert.match(policy, /worker-src 'self' blob:;/);
  assert.doesNotMatch(policy, /script-src [^;]*blob:/);
  for (const path of ['/server/app.mjs', '/compose.yaml', '/package.json']) {
    assert.equal((await fetch(local + path)).status, 404);
  }
  const file = await fetch(local + '/exemplo-nfse.xml', { method: 'HEAD' });
  assert.equal(file.status, 200);
  assert.equal(await file.text(), '');
  assert.match(file.headers.get('content-type'), /application\/xml/);
});

test('o caminho público permanece dentro da pasta de arquivos depois da resolução', () => {
  const root = resolve('exemplo', 'publico');
  assert.equal(isPublicAsset(root, resolve(root, 'documentos', 'manual.pdf')), true);
  assert.equal(isPublicAsset(root, resolve('exemplo', 'privado', 'manual.pdf')), false);
  assert.equal(isPublicAsset(root, resolve('exemplo', 'publico-anterior', 'manual.pdf')), false);
  assert.equal(isPublicAsset(root, resolve(root, '.interno', 'manual.pdf')), false);
});

test('uma pasta estática absoluta em caminho ou URL publica a edição indicada', async t => {
  const root = await mkdtemp(resolve(tmpdir(), 'mesa-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(resolve(root, 'index.html'), '<title>Edição de teste</title>');
  for (const staticRoot of [root, pathToFileURL(root)]) {
    const local = await localApp(t, { staticRoot });
    assert.match(await (await fetch(local + '/')).text(), /Edição de teste/);
    assert.equal((await fetch(local + '/exemplo-nfse.xml')).status, 404);
  }
  assert.throws(() => createMesaServer({ staticRoot: 'dist' }), /caminho absoluto/);
});

test('um JSON financeiro com texto ilegível gera erro em vez de alterar caracteres', async () => {
  const decode = bytes => readLocalJson(
    new Response(bytes, {headers: {'content-type': 'application/json'}}),
    () => new Error('Resposta incompatível.'),
  );
  assert.deepEqual(await decode('{"descricao":"Educação"}'), {descricao: 'Educação'});
  const truncatedText = Buffer.concat([Buffer.from('{"descricao":"Educa'), Buffer.from([0xc3]), Buffer.from('"}')]);
  await assert.rejects(decode(truncatedText), /incompatível/);
});

test('duas abas consultam um único conjunto de estados sem guardar respostas antigas', async t => {
  const seen = Promise.withResolvers();
  let requests = 0;
  let healthCalls = 0;
  const local = await localApp(t, {
    danfseUrl: 'http://danfse:8080',
    fetchImpl: async () => {
      healthCalls++;
      await seen.promise;
      return Response.json({ status: 'ok' });
    },
  }, () => { if (++requests === 2) seen.resolve(); });
  const parallel = await Promise.all([fetch(local + '/api/status'), fetch(local + '/api/status')]);
  for (const response of parallel) assert.equal((await response.json()).danfse, true);
  assert.equal(healthCalls, 1);
  assert.equal((await (await fetch(local + '/api/status')).json()).danfse, true);
  assert.equal(healthCalls, 2);
});

test('o gerador aceita nova solicitação assim que os dois documentos em andamento terminam', async t => {
  let calls = 0;
  const bothStarted = Promise.withResolvers();
  const release = Promise.withResolvers();
  t.after(() => release.resolve());
  const local = await localApp(t, {
    danfseUrl: 'http://danfse:8080',
    fetchImpl: async () => {
      if (++calls === 2) bothStarted.resolve();
      await release.promise;
      return new Response('%PDF-1.4\n%%EOF', {headers: {'content-type': 'application/pdf'}});
    },
  });
  const submit = () => fetch(local + '/api/danfse', {
    method: 'POST', headers: { 'content-type': 'application/xml' }, body: '<NFSe/>',
  });
  const firstTwo = Promise.all([submit(), submit()]);
  await bothStarted.promise;
  const busy = await submit();
  assert.equal(busy.status, 429);
  assert.ok(Number(busy.headers.get('retry-after')) > 0);
  assert.equal(calls, 2);
  release.resolve();
  for (const response of await firstTwo) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    await response.arrayBuffer();
  }
  const retry = await submit();
  assert.equal(retry.status, 200);
  await retry.arrayBuffer();
});
