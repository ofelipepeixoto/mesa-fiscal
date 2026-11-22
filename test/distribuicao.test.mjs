import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildDistribution } from '../scripts/build.mjs';

test('o site distribui só os arquivos previstos e verifica o código recebido', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'mesa-distribuicao-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const sourceDir = join(temp, 'public');
  const outputDir = join(temp, 'dist');
  await cp(new URL('../public/', import.meta.url), sourceDir, {recursive: true});
  await writeFile(join(sourceDir, 'rascunho-privado.txt'), 'Rascunho fictício para conferir o empacotamento.');
  await buildDistribution({sourceDir, outputDir});

  const html = await readFile(join(outputDir, 'index.html'), 'utf8');
  assert.match(html, /name="mesa-edicao" content="navegador"/);
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.match(html, /connect-src 'self'/);
  assert.match(html, /worker-src 'self' blob:/);
  assert.ok(!html.includes('unsafe-inline'));
  const links = [...html.matchAll(/(?:src|href)="\/(mesa-[a-f0-9]{20}\.(?:css|js))" integrity="(sha384-[A-Za-z\d+/=]+)"/g)];
  assert.equal(links.length, 2);
  for (const [, filename, integrity] of links) {
    const data = await readFile(join(outputDir, filename));
    assert.equal(integrity, 'sha384-' + createHash('sha384').update(data).digest('base64'));
    assert.ok(!data.toString().includes('sourceMappingURL='));
  }
  assert.deepEqual((await readdir(outputDir)).sort(), [
    'document-validators-LICENSE.txt',
    '_headers', 'danfse-worker.js', 'engine', 'exemplo-danfse.pdf', 'exemplo-nfse.xml',
    'index.html', 'marca.svg', ...links.map(link => link[1]),
  ].sort());
  const validatorsLicense = await readFile(join(outputDir, 'document-validators-LICENSE.txt'), 'utf8');
  assert.match(validatorsLicense, /Copyright \(c\) 2026 Carlos Felipe/);
  assert.match(validatorsLicense, /Copyright \(c\) 2026 Nikolas DeHor/);
  assert.match(validatorsLicense, /Permission is hereby granted/);
  const javascript = await readFile(join(outputDir, links.find(link => link[1].endsWith('.js'))[1]), 'utf8');
  assert.match(javascript, /document-validators-LICENSE\.txt/);
  assert.match(javascript, /Nikolas DeHor/);
  assert.deepEqual((await readdir(join(outputDir, 'engine'))).sort(), [
    'BUILD.txt', 'LICENSE-DANFSe.txt', 'LICENSE-Go.txt', 'SHA256SUMS', 'THIRD-PARTY.txt',
    'danfse.wasm.gz', 'wasm_exec.js',
  ].sort());
  for (const asset of ['danfse-worker.js', 'engine/wasm_exec.js', 'engine/danfse.wasm.gz']) {
    assert.deepEqual(await readFile(join(outputDir, asset)), await readFile(join(sourceDir, asset)));
  }

  const original = await readFile(join(sourceDir, 'app.mjs'), 'utf8');
  const outside = join(temp, 'fora.mjs');
  await writeFile(outside, 'export const aviso = "Exemplo fictício";');
  await writeFile(join(sourceDir, 'app.mjs'), "import '../fora.mjs';\n" + original);
  await assert.rejects(buildDistribution({sourceDir, outputDir}), /fora da pasta pública/);
  await writeFile(join(sourceDir, 'app.mjs'), original);
  await rm(join(sourceDir, 'exemplo-nfse.xml'));
  await symlink(outside, join(sourceDir, 'exemplo-nfse.xml'));
  await assert.rejects(buildDistribution({sourceDir, outputDir}), /fora da pasta pública/);
});
