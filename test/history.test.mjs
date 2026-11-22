import assert from 'node:assert/strict';
import test from 'node:test';
import { createHistoryEntry, describeCalculationVersion, snapshotCalculationVersion } from '../public/history.mjs';
import { calculationVersions } from '../public/calculation-versions.mjs';

test('o histórico copia a versão por operação sem reter os campos fiscais recebidos', () => {
  const version = { ...calculationVersions.engine.regular, xml: '<NFSe/>', documento: 'fictício', url: 'https://example.invalid' };
  const input = { kind: 'regular', title: 'Regime regular', value: 'R$ 42,72', detail: 'Motor da Receita',
    calculationVersion: version, xml: '<NFSe/>', cpf: 'fictício', memoria: ['fictícia'] };
  const entry = createHistoryEntry(input);
  version.expectedEngineRevision = '0'.repeat(40);
  version.codeRevision = '0'.repeat(64);
  input.value = 'alterado';
  assert.equal(entry.value, 'R$ 42,72');
  assert.deepEqual(entry.calculationVersion, calculationVersions.engine.regular);
  assert.deepEqual(Object.keys(entry).sort(), ['kind', 'title', 'value', 'detail', 'time', 'calculationVersion'].sort());
  assert.ok(Object.isFrozen(entry) && Object.isFrozen(entry.calculationVersion));
  assert.doesNotMatch(JSON.stringify(entry), /xml|documento|https:|cpf|memoria/);
});

test('versão ausente ou malformada mantém o resumo e não inventa revisão de motor', () => {
  for (const version of [undefined, null, [], {}, { ...calculationVersions.engine.regular, codeRevision: 'a'.repeat(64) + '\n' },
    { ...calculationVersions.engine.regular, expectedEngineRevision: '<script>' },
    { ...calculationVersions.engine.regular, expectedCatalogRevision: undefined },
    calculationVersions.engine.simples, { ...calculationVersions.engine.regular, schema: 2 }]) {
    const entry = createHistoryEntry({ kind: 'regular', title: 'Regime regular', value: 'R$ 1,00', calculationVersion: version });
    assert.equal(entry.calculationVersion, null);
    assert.deepEqual(describeCalculationVersion(entry.calculationVersion, entry.kind), { summary: 'Versão não informada', lines: [] });
  }
});

test('o resumo distingue projeção, adaptação e revisões previstas sem atestar o runtime', () => {
  for (const kind of ['regular', 'simples']) {
    const local = describeCalculationVersion(calculationVersions.projection[kind], kind);
    assert.match(local.summary, /Projeção local/);
    assert.match(local.lines[0], new RegExp(calculationVersions.projection[kind].codeRevision));
    const engine = describeCalculationVersion(calculationVersions.engine[kind], kind);
    assert.match(engine.summary, /revisão prevista/);
    assert.ok(engine.lines.some(line => line.includes('não foi confirmada')));
    assert.ok(engine.lines.some(line => line.includes(calculationVersions.engine[kind].expectedCatalogRevision)));
  }
});

test('a fronteira da API não aceita versão de projeção como identificação do motor', () => {
  assert.equal(snapshotCalculationVersion(calculationVersions.projection.regular, 'regular', 'engine'), null);
  assert.deepEqual(snapshotCalculationVersion(calculationVersions.engine.regular, 'regular', 'engine'),
    calculationVersions.engine.regular);
});

test('o registro de PDF permanece sem versão de cálculo nem conteúdo do documento', () => {
  const entry = createHistoryEntry({ kind: 'danfse', title: 'PDF', value: 'PDF', detail: 'Nota fictícia',
    calculationVersion: calculationVersions.engine.regular, xml: '<NFSe/>' });
  assert.equal(Object.hasOwn(entry, 'calculationVersion'), false);
  assert.equal(Object.hasOwn(entry, 'xml'), false);
  assert.equal(createHistoryEntry({ kind: 'desconhecido' }), null);
});
