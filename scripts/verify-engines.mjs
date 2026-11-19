import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { regularExample } from '../public/regular-study.mjs';
import { simplesExample } from '../public/simples-study.mjs';

const origin = 'http://127.0.0.1:4173';
const engines = ['regular', 'simples', 'danfse'];

async function waitForStack() {
  const deadline = Date.now() + 240_000;
  let last = 'Aplicativo ainda não respondeu.';
  do {
    try {
      const response = await fetch(origin + '/api/status', { signal: AbortSignal.timeout(8_000) });
      const status = await response.json();
      if (response.ok && engines.every(engine => status[engine] === true)) return;
      last = JSON.stringify(Object.fromEntries(engines.map(engine => [engine, status[engine] === true])));
    } catch (error) {
      last = error.message;
    }
    await delay(3_000);
  } while (Date.now() < deadline);
  throw new Error('Os três motores precisam responder em até quatro minutos. Último estado: ' + last);
}

async function submit(path, body, contentType) {
  const response = await fetch(origin + path, {
    method: 'POST', headers: { origin, 'content-type': contentType }, body,
    redirect: 'error', signal: AbortSignal.timeout(55_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 350);
    throw new Error(path + ' retornou HTTP ' + response.status + '. ' + detail);
  }
  return response;
}

async function verifyAmounts(path, input, amounts, status) {
  const response = await submit(path, JSON.stringify(input), 'application/json');
  assert.match(response.headers.get('content-type') || '', /application\/json/);
  const actual = await response.json();
  if (status) assert.equal(actual.status, status, path + ' deve informar o estado devolvido pelo motor.');
  for (const [field, amount] of Object.entries(amounts)) {
    assert.equal(actual[field], amount, path + ' devolveu um valor inesperado para ' + field);
  }
  console.log(path + ' confirmado com total de R$ ' + amounts.total);
}

await waitForStack();
await verifyAmounts('/api/regular', regularExample.input, { cbs: '42.24', ibs: '0.48', total: '42.72' }, 'simulado');
await verifyAmounts('/api/regular', { ...regularExample.input, base: '2400.00' },
  { cbs: '84.48', ibs: '0.96', total: '85.44' }, 'simulado');
await verifyAmounts('/api/simples', simplesExample.input, { cbs: '26.12', ibs: '11.88', is: '50.00', total: '88.00' });
await verifyAmounts('/api/simples', { ...simplesExample.input, base: '1900.00' },
  { cbs: '52.25', ibs: '23.75', is: '50.00', total: '126.00' });

const xml = await readFile(new URL('../public/exemplo-nfse.xml', import.meta.url));
const response = await submit('/api/danfse?stc=0&canhoto=false', xml, 'application/xml');
assert.match(response.headers.get('content-type') || '', /application\/pdf/);
const pdf = Buffer.from(await response.arrayBuffer());
assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
assert.match(pdf.subarray(-1024).toString('latin1'), /%%EOF/);
console.log('DANFSe confirmado. O XML fictício gerou um PDF de ' + pdf.length + ' bytes.');
