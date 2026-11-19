import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { createMesaServer } from '../server/app.mjs';
import { regularExample } from '../public/regular-study.mjs';
import { simplesExample } from '../public/simples-study.mjs';

async function localApp(t, options = {}) {
  const server = createMesaServer({ regularUrl: null, simplesUrl: null, danfseUrl: null, ...options });
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

test('o servidor publica só a interface e os arquivos de exemplo', async t => {
  const local = await localApp(t);
  const home = await fetch(local + '/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Mesa Fiscal/);
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
  assert.match(home.headers.get('content-security-policy'), /worker-src 'self'/);
  for (const path of ['/server/app.mjs', '/compose.yaml', '/package.json']) {
    assert.equal((await fetch(local + path)).status, 404);
  }
  const file = await fetch(local + '/exemplo-nfse.xml', { method: 'HEAD' });
  assert.equal(file.status, 200);
  assert.equal(await file.text(), '');
  assert.match(file.headers.get('content-type'), /application\/xml/);
});
