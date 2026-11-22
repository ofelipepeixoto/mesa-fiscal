import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseLock } from './upstreams.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const kinds = ['regular', 'simples'];

async function codeRevision(root, files) {
  const hash = createHash('sha256');
  for (const name of files) {
    const contents = await readFile(join(root, name));
    // Nome e tamanho separam os arquivos sem ambiguidades e sem dados de operações.
    hash.update(name + '\0' + contents.length + '\0');
    hash.update(contents);
  }
  return hash.digest('hex');
}

export async function generateCalculationVersions(root = projectRoot) {
  root = root instanceof URL ? fileURLToPath(root) : resolve(root);
  const pins = parseLock(await readFile(join(root, 'upstream.lock.env'), 'utf8'));
  const versions = { projection: {}, engine: {} };
  for (const kind of kinds) {
    const studyFiles = ['public/' + kind + '-study.mjs', 'public/decimal-fiscal.mjs'];
    versions.projection[kind] = {
      schema: 1, kind, mode: 'projection',
      codeRevision: await codeRevision(root, studyFiles),
    };
    versions.engine[kind] = {
      schema: 1, kind, mode: 'engine',
      codeRevision: await codeRevision(root, ['server/' + kind + '.mjs', 'server/local-json.mjs', ...studyFiles]),
      expectedEngineRevision: pins[kind],
      expectedCatalogRevision: pins.regular,
    };
  }
  return versions;
}

function render(versions) {
  return '// Gerado por node scripts/calculation-versions.mjs --write.\n'
    + '// Revisões previstas na distribuição; não atestam a versão do processo do motor.\n'
    + 'export const calculationVersions = ' + JSON.stringify(versions, null, 2) + ';\n';
}

async function main(args) {
  const [mode = 'verify', ...extra] = args;
  if (extra.length || !['verify', '--write'].includes(mode)) {
    throw new Error('Use node scripts/calculation-versions.mjs verify ou --write.');
  }
  const target = join(projectRoot, 'public/calculation-versions.mjs');
  const output = render(await generateCalculationVersions());
  if (mode === '--write') {
    await writeFile(target, output);
    console.log('Versões das projeções e revisões previstas dos motores atualizadas.');
    return;
  }
  const current = await readFile(target, 'utf8').catch(() => null);
  if (current !== output) {
    throw new Error('Versões de cálculo desatualizadas. Rode node scripts/calculation-versions.mjs --write.');
  }
  console.log('Versões das projeções e revisões previstas dos motores conferidas.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
