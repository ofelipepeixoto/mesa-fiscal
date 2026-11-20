import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

if (process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('Esta verificação usa somente os contêineres descartáveis do GitHub Actions.');
}
const run = promisify(execFile);
const started = new Date().toISOString();
const marker = 'MUNICIPIO_FICTICIO_' + randomUUID();
const xml = await readFile(new URL('../public/exemplo-nfse.xml', import.meta.url), 'utf8');
const originalField = '<cLocIncid>3304557</cLocIncid>';
assert.ok(xml.includes(originalField), 'O exemplo deve trazer o município de incidência.');
const probe = xml.replace(originalField, '<cLocIncid>' + marker + '</cLocIncid>');
const response = await fetch('http://127.0.0.1:4173/api/danfse', {
  method: 'POST',
  headers: { 'content-type': 'application/xml', accept: 'application/pdf' },
  body: probe,
  signal: AbortSignal.timeout(55_000),
});
await response.body?.cancel();
assert.ok([200, 422].includes(response.status),
  'A nota com município fictício deve chegar ao gerador para processamento ou validação.');

// A leitura abrange apenas a janela deste teste. Evita que stdout/stderr componham o erro do processo.
let captured;
try {
  captured = await run('docker', ['compose', 'logs', '--no-color', '--since', started, 'app', 'danfse'],
    { maxBuffer: 4 * 1024 * 1024, timeout: 20_000 });
} catch {
  throw new Error('O Docker não conseguiu devolver os logs da verificação de privacidade.');
}
assert.ok(!captured.stdout.includes(marker) && !captured.stderr.includes(marker),
  'O marcador fictício do XML apareceu nos registros dos contêineres.');
console.log('O marcador de município fictício não apareceu nos registros da aplicação e do DANFSe nesta requisição.');
