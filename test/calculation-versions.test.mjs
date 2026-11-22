import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { generateCalculationVersions } from '../scripts/calculation-versions.mjs';
import { calculationVersions } from '../public/calculation-versions.mjs';

const root = new URL('../', import.meta.url);
const inputs = [
  'upstream.lock.env', 'public/regular-study.mjs', 'public/simples-study.mjs',
  'public/decimal-fiscal.mjs', 'server/regular.mjs', 'server/simples.mjs', 'server/local-json.mjs',
];

async function fixture(t) {
  const folder = await mkdtemp(join(tmpdir(), 'mesa-versoes-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  for (const name of inputs) {
    await cp(new URL(name, root), join(folder, name), { recursive: true });
  }
  return folder;
}

test('as versões distribuídas correspondem aos arquivos de cálculo e ao manifesto', async () => {
  const first = await generateCalculationVersions(root);
  assert.deepEqual(first, calculationVersions);
  assert.deepEqual(await generateCalculationVersions(root), first);
  for (const mode of ['projection', 'engine']) {
    for (const kind of ['regular', 'simples']) {
      const value = first[mode][kind];
      assert.equal(value.schema, 1);
      assert.equal(value.kind, kind);
      assert.equal(value.mode, mode);
      assert.match(value.codeRevision, /^[a-f0-9]{64}$/);
    }
    assert.notEqual(first[mode].regular.codeRevision, first[mode].simples.codeRevision);
  }
});

test('cada fórmula e adaptador altera apenas as identificações que dependem dele', async t => {
  const folder = await fixture(t);
  const baseline = await generateCalculationVersions(folder);
  const affected = {
    'public/regular-study.mjs': ['projection.regular', 'engine.regular'],
    'public/simples-study.mjs': ['projection.simples', 'engine.simples'],
    'public/decimal-fiscal.mjs': ['projection.regular', 'projection.simples', 'engine.regular', 'engine.simples'],
    'server/regular.mjs': ['engine.regular'],
    'server/simples.mjs': ['engine.simples'],
    'server/local-json.mjs': ['engine.regular', 'engine.simples'],
  };
  for (const [name, changes] of Object.entries(affected)) {
    const path = join(folder, name);
    const original = await readFile(path);
    await writeFile(path, Buffer.concat([original, Buffer.from('\n// Alteração fictícia para conferir a identificação.\n')]));
    const next = await generateCalculationVersions(folder);
    for (const mode of ['projection', 'engine']) {
      for (const kind of ['regular', 'simples']) {
        assert.equal(next[mode][kind].codeRevision !== baseline[mode][kind].codeRevision,
          changes.includes(mode + '.' + kind), name + ': ' + mode + '.' + kind);
      }
    }
    await writeFile(path, original);
    assert.deepEqual(await generateCalculationVersions(folder), baseline);
  }
});

test('o manifesto identifica as revisões previstas sem alterar a identidade do código', async t => {
  const folder = await fixture(t);
  const manifestPath = join(folder, 'upstream.lock.env');
  const manifest = await readFile(manifestPath, 'utf8');
  const baseline = await generateCalculationVersions(folder);
  const revision = '1'.repeat(40);
  for (const kind of ['regular', 'simples', 'danfse']) {
    await writeFile(manifestPath, manifest.replace(new RegExp(kind.toUpperCase() + '_REV=[a-f0-9]{40}'), kind.toUpperCase() + '_REV=' + revision));
    const next = await generateCalculationVersions(folder);
    assert.deepEqual(next.projection, baseline.projection);
    for (const engine of ['regular', 'simples']) {
      assert.equal(next.engine[engine].codeRevision, baseline.engine[engine].codeRevision);
      assert.equal(next.engine[engine].expectedEngineRevision,
        engine === kind ? revision : baseline.engine[engine].expectedEngineRevision);
      assert.equal(next.engine[engine].expectedCatalogRevision,
        kind === 'regular' ? revision : baseline.engine[engine].expectedCatalogRevision);
    }
  }
});

test('arquivos ausentes e manifesto inválido interrompem a geração', async t => {
  const folder = await fixture(t);
  await writeFile(join(folder, 'upstream.lock.env'), 'REGULAR_REV=main\n');
  await assert.rejects(generateCalculationVersions(folder), /inválido/);
  await cp(new URL('upstream.lock.env', root), join(folder, 'upstream.lock.env'));
  await rm(join(folder, 'public/decimal-fiscal.mjs'));
  await assert.rejects(generateCalculationVersions(folder), { code: 'ENOENT' });
});

test('a conferência por terminal recusa metadados antigos e a geração os atualiza', async t => {
  const folder = await fixture(t);
  for (const name of ['scripts/calculation-versions.mjs', 'scripts/upstreams.mjs', 'public/calculation-versions.mjs']) {
    await cp(new URL(name, root), join(folder, name), { recursive: true });
  }
  const execute = promisify(execFile);
  const script = join(folder, 'scripts/calculation-versions.mjs');
  const run = (...args) => execute(process.execPath, [script, ...args]);
  await run('verify');
  const target = join(folder, 'public/calculation-versions.mjs');
  const original = await readFile(target, 'utf8');
  await writeFile(join(folder, 'public/decimal-fiscal.mjs'), '// Regra fictícia alterada.\n');
  await assert.rejects(run(), error => error.code === 1 && /desatualizadas/.test(error.stderr));
  assert.equal(await readFile(target, 'utf8'), original, 'Conferir não deve reescrever a identificação.');
  await run('--write');
  assert.notEqual(await readFile(target, 'utf8'), original);
  await run('verify');
});
