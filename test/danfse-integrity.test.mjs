import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { getDanfseAssets } from '../public/danfse-assets.mjs';
import { generateBrowserDanfse } from '../public/danfse-browser.mjs';
import { engine } from '../public/danfse-integrity.mjs';
import { checkDistribution } from '../scripts/verificar-distribuicao-danfse.mjs';

const dir = new URL('../public/', import.meta.url);
const paths = ['engine/wasm_exec.js','danfse-worker.js','engine/danfse.wasm.gz'];
const fixtures = Object.fromEntries(await Promise.all(paths.map(async path => [path, await readFile(new URL(path, dir))])));

function fetchFixture({change, unpack = false} = {}) {
  return async (url, init) => {
    assert.equal(init.redirect, 'error');
    assert.equal(init.credentials, 'same-origin');
    const path = url.href.slice(dir.href.length);
    let bytes = fixtures[path];
    if (unpack && path.endsWith('.gz')) bytes = gunzipSync(bytes);
    if (change === path) {
      bytes = Buffer.from(bytes);
      bytes[bytes.length - 1] ^= 1;
    }
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 13));
        controller.enqueue(bytes.subarray(13));
        controller.close();
      },
    }));
  };
}

test('o manifesto publicado coincide com a origem, versão do compilador e os bytes de distribuição', async () => {
  assert.deepEqual(await checkDistribution(), engine);
});

test('valida JS, worker e WASM compactado ou já descompactado pelo servidor', async () => {
  for (const unpack of [false, true]) {
    const assets = await getDanfseAssets({fetchImpl: fetchFixture({unpack})});
    assert.equal(assets.wasm.byteLength, engine.wasm.size);
  }
});

test('rejeita alterações de mesmo tamanho ou respostas truncadas antes de disponibilizar o motor', async () => {
  for (const change of paths) {
    await assert.rejects(getDanfseAssets({fetchImpl: fetchFixture({change})}), /verificação/);
  }
  await assert.rejects(getDanfseAssets({fetchImpl: fetchFixture({change: paths[2], unpack: true})}), /verificação/);
  await assert.rejects(getDanfseAssets({fetchImpl: async () => new Response('incompleto')}), /verificação/);
});

test('não lê o XML nem inicia Worker se os arquivos distribuídos divergem', async t => {
  t.mock.method(globalThis, 'fetch', fetchFixture({change: paths[0]}));
  let read = 0;
  class Sample extends Blob {
    async arrayBuffer() { read++; return super.arrayBuffer(); }
  }
  await assert.rejects(generateBrowserDanfse(new Sample(['<NFSe/>'])), /verificação/);
  assert.equal(read, 0);
});
