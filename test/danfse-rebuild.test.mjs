import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { compareRebuiltDistribution } from '../scripts/verificar-distribuicao-danfse.mjs';

test('compara a distribuição reconstruída inclusive licenças e manifesto', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'mesa-recompilacao-'));
  const dir = join(temp, 'engine');
  t.after(() => rm(temp, {recursive: true, force: true}));
  await cp(new URL('../public/engine/', import.meta.url), dir, {recursive: true});
  const manifest = join(temp, 'manifesto.mjs');
  const originalManifest = await readFile(new URL('../public/danfse-integrity.mjs', import.meta.url));
  await writeFile(manifest, originalManifest);
  await compareRebuiltDistribution(dir, manifest);
  await writeFile(manifest, Buffer.concat([originalManifest, Buffer.from('\n')]));
  await assert.rejects(compareRebuiltDistribution(dir, manifest), /manifesto de integridade/);
  await writeFile(manifest, originalManifest);
  const license = await readFile(join(dir, 'THIRD-PARTY.txt'));
  const changed = Buffer.concat([license, Buffer.from('\nExemplo fictício\n')]);
  await writeFile(join(dir, 'THIRD-PARTY.txt'), changed);
  const sums = await readFile(join(dir, 'SHA256SUMS'), 'utf8');
  const digest = createHash('sha256').update(changed).digest('hex');
  await writeFile(join(dir, 'SHA256SUMS'), sums.replace(/^[a-f0-9]{64}  THIRD-PARTY.txt$/m, digest + '  THIRD-PARTY.txt'));
  await assert.rejects(compareRebuiltDistribution(dir, manifest), /recompilação diverge/);
});
