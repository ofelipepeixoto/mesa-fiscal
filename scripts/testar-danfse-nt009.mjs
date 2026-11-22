import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { checkDistribution } from './verificar-distribuicao-danfse.mjs';

assert.ok(process.argv.slice(2).join(' ') === '' || process.argv.slice(2).join(' ') === '--http');
const cases = [
  ['../public/exemplo-nfse.xml', '-', '-', '-', 'R$ 850,00'],
  ['../test/fixtures/tributado.xml', '-', 'R$ 850,00', 'R$ 17,00', 'R$ 850,00'],
  ['../test/fixtures/ajuste-issqn-percentual.xml', 'R$ 85,00', 'R$ 765,00', 'R$ 15,30', 'R$ 850,00'],
];
const origin = process.env.MESA_TEST_HTTP_ORIGIN || 'http://127.0.0.1:4173';
const endpoint = new URL('/api/danfse?stc=0&canhoto=true', origin);
assert.equal(endpoint.hostname, '127.0.0.1', 'O teste HTTP aceita apenas loopback.');
assert.equal(endpoint.protocol, 'http:');

async function convertHttp(xml) {
  const res = await fetch(endpoint, {method: 'POST', headers: {origin: endpoint.origin,
    'content-type': 'application/xml'}, body: xml, redirect: 'error', signal: AbortSignal.timeout(30_000)});
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /^application\/pdf\b/);
  return Buffer.from(await res.arrayBuffer());
}

async function createWasmConverter() {
  await checkDistribution();
  const engineDir = new URL('../public/engine/', import.meta.url);
  await import(new URL('wasm_exec.js', engineDir));
  const go = new globalThis.Go();
  const bin = gunzipSync(await readFile(new URL('danfse.wasm.gz', engineDir)), {maxOutputLength: 64 * 1024 * 1024});
  const { instance } = await WebAssembly.instantiate(bin, go.importObject);
  void go.run(instance).catch(error => { console.error(error); process.exitCode = 1; });
  assert.ok(globalThis.danfseWasm?.ready);
  return xml => {
    const result = globalThis.danfseWasm.gerarPdf(JSON.stringify({xml, stc: 0, canhoto: true}));
    assert.ok(!result.error, result.error);
    const pdf = Buffer.from(result.pdf, 'base64');
    assert.equal(pdf.length, result.size);
    return pdf;
  };
}

function field(rows, rowMarker, label) {
  const index = rows.findIndex(row => row.includes(rowMarker) && row.includes(label));
  assert.ok(index >= 0 && index + 1 < rows.length, 'Rótulo não encontrado: ' + label);
  const heading = rows[index];
  const col = heading.indexOf(label);
  const next = heading.slice(col + label.length).match(/ {2,}\S/);
  const end = next ? col + label.length + next.index + next[0].length - 2 : undefined;
  return rows[index + 1].slice(Math.max(col - 1, 0), end).trim();
}

const http = process.argv.includes('--http');
const convert = http ? convertHttp : await createWasmConverter();
for (const [filename, deductions, base, tax, total] of cases) {
  const xml = await readFile(new URL(filename, import.meta.url), 'utf8');
  const pdf = await convert(xml);
  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  const rows = execFileSync('pdftotext', ['-layout', '-', '-'], {
    input: pdf, encoding: 'utf8', timeout: 5_000, maxBuffer: 1_048_576,
  }).split(/\r?\n/);
  assert.equal(field(rows, 'Benefício Municipal', 'Total Deduções/Reduções'), deductions, filename);
  assert.equal(field(rows, 'BC ISSQN', 'BC ISSQN'), base, filename);
  assert.equal(field(rows, 'BC ISSQN', 'ISSQN Apurado'), tax, filename);
  assert.equal(field(rows, 'Total das Retenções', 'VALOR LÍQUIDO DA NFS-e'), total, filename);
  assert.equal(field(rows, 'NÚMERO DA NFS-E', 'NÚMERO DA NFS-E'), '1', filename);
  assert.equal(field(rows, 'NÚMERO DA NFS-E', 'COMPETÊNCIA DA NFS-E'), '19/11/2026', filename);
  assert.equal(field(rows, 'CHAVE DE ACESSO DA NFS-E', 'CHAVE DE ACESSO DA NFS-E'), '0'.repeat(50), filename);
  console.log(`${http ? 'HTTP local' : 'WASM'}: ${filename} — deduções ${deductions}, base ${base} e total ${total}.`);
}
