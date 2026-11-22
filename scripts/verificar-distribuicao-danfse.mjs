import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { parseLock } from './upstreams.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtimeFiles = ['BUILD.txt', 'LICENSE-DANFSe.txt', 'LICENSE-Go.txt', 'THIRD-PARTY.txt', 'danfse.wasm.gz', 'wasm_exec.js'];
const entry = bytes => ({size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});

export async function goVersion() {
  const dockerfile = await readFile(join(root, 'deploy/danfse.Dockerfile'), 'utf8');
  const match = /^FROM golang:(\d+\.\d+\.\d+)-bookworm(?:@sha256:[0-9a-f]{64})? AS build$/m.exec(dockerfile);
  assert.ok(match, 'Revise a versão do Go no construtor DANFSe.');
  return match[1];
}

export async function checkDistribution(dir = join(root, 'public/engine')) {
  const entriesOnDisk = await readdir(dir, {withFileTypes: true});
  assert.ok(entriesOnDisk.every(entry => entry.isFile()), 'O diretório do motor só aceita arquivos regulares.');
  assert.deepEqual(entriesOnDisk.map(entry => entry.name).sort(), ['SHA256SUMS', ...runtimeFiles].sort(), 'Conteúdo de distribuição inesperado.');
  const checksums = (await readFile(join(dir, 'SHA256SUMS'), 'utf8')).trim().split('\n');
  const entries = checksums.map(line => /^([a-f0-9]{64})  ([\w.-]+)$/.exec(line));
  assert.ok(entries.every(Boolean), 'Formato inválido em SHA256SUMS.');
  assert.deepEqual(entries.map(e => e[2]).sort(), [...runtimeFiles].sort(), 'Conjunto de artefatos inesperado.');
  const files = {};
  for (const [, expected, name] of entries) {
    files[name] = await readFile(join(dir, name));
    assert.equal(entry(files[name]).sha256, expected, 'Artefato divergente: ' + name);
  }
  const build = files['BUILD.txt'].toString('utf8');
  const revision = parseLock(await readFile(join(root, 'upstream.lock.env'), 'utf8')).danfse;
  const source = 'Fonte: https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse/commit/' + revision;
  assert.deepEqual(build.split('\n').filter(line => line.startsWith('Fonte:')), [source], 'Revise a origem do binário.');
  const patch = entry(await readFile(join(root, 'deploy/danfse-go/nt009-issqn.patch')));
  const patchPrefix = 'Overlay Mesa Fiscal NT 009 (SHA-256): ';
  assert.deepEqual(build.split('\n').filter(line => line.startsWith(patchPrefix)), [patchPrefix + patch.sha256], 'Revise a identificação do patch local.');
  const overlay = await readFile(join(root, 'deploy/danfse-go/go.mod'), 'utf8');
  const required = new Map([...overlay.matchAll(/^\s*([^\s]+) (v\S+)/gm)].map(([, mod, version]) => [mod, version]));
  const compiled = new Map([...build.matchAll(/^(\S+) (v\S+)$/gm)].map(([, mod, version]) => [mod, version]));
  for (const module of ['github.com/labstack/echo/v5', 'golang.org/x/image']) {
    assert.ok(required.has(module) && compiled.has(module), 'Confira a lista de módulos do gerador: ' + module);
  }
  for (const [module, version] of compiled) {
    if (required.has(module)) assert.equal(version, required.get(module), 'O binário precisa ser recompilado para ' + module);
  }
  const expectedGo = await goVersion();
  assert.equal(build.split('\n')[0].split(' ')[2], 'go' + expectedGo, 'A compilação deve usar a versão de Go aprovada.');
  const wasm = gunzipSync(files['danfse.wasm.gz'], {maxOutputLength: 64 * 1024 * 1024});
  assert.deepEqual(wasm.subarray(0, 8), Buffer.from([0,97,115,109,1,0,0,0]));
  const original = entry(wasm);
  assert.deepEqual(build.split('\n').filter(line => line.endsWith('  danfse.wasm')), [original.sha256 + '  danfse.wasm']);
  const worker = await readFile(join(root, 'public/danfse-worker.js'));
  return {revision, goVersion: expectedGo, runtime: entry(files['wasm_exec.js']), worker: entry(worker), gzip: entry(files['danfse.wasm.gz']), wasm: original};
}

export async function compareRebuiltDistribution(dir, manifest, expectedDir = join(root, 'public/engine'), expectedManifest = join(root, 'public/danfse-integrity.mjs')) {
  await checkDistribution(expectedDir);
  await checkDistribution(dir);
  for (const name of ['SHA256SUMS', ...runtimeFiles]) {
    assert.deepEqual(await readFile(join(dir, name)), await readFile(join(expectedDir, name)), 'A recompilação diverge do arquivo proposto: ' + name);
  }
  assert.deepEqual(await readFile(manifest), await readFile(expectedManifest), 'A recompilação diverge do manifesto de integridade proposto.');
}

async function main([action = 'verificar', dir, destination]) {
  if (action === 'go-version') return console.log(await goVersion());
  if (action === 'comparar') {
    assert.ok(dir && destination, 'Informe a distribuição recompilada e seu manifesto.');
    await compareRebuiltDistribution(resolve(dir), resolve(destination));
    return console.log('Os sete arquivos distribuídos e o manifesto correspondem à recompilação.');
  }
  assert.ok(['gerar','verificar'].includes(action), 'Use gerar, verificar, comparar ou go-version.');
  const pins = await checkDistribution(dir && resolve(dir));
  const text = '// Gerado por scripts/verificar-distribuicao-danfse.mjs após conferir a compilação.\nexport const engine = ' + JSON.stringify(pins, null, 2) + ';\n';
  const file = destination ? resolve(destination) : join(root, 'public/danfse-integrity.mjs');
  if (action === 'gerar') {
    const temp = file + '.tmp-' + process.pid;
    await writeFile(temp, text, {flag: 'wx'});
    await rename(temp, file);
  } else {
    assert.equal(await readFile(file, 'utf8'), text, 'A lista de integridade da aplicação e o motor disponível divergem.');
  }
  console.log('Motor, runtime, worker e licenças verificados para ' + pins.revision.slice(0, 12) + '.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
