import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRegular, projectEducation, regularExample, regularPayload, regularResult } from '../server/regular.mjs';

const input = regularExample.input;
const observed = {
  objetos: [{ nObj: 1, estadoItem: 'CALCULO_SIMULADO', tribCalc: { IBSCBS: {
    gIBSCBS: { gCBS: { vCBS: '42.24', memoriaCalculo: 'Cálculo do exemplo.' }, vIBS: '0.48' },
  } } }],
  total: { tribCalc: { IBSCBSTot: { gCBS: { vCBS: '42.24' }, gIBS: { vIBS: '0.48' } } } },
};

test('rastreia o item de educação do exemplo publicado e preserva o total', () => {
  const result = projectEducation(input);
  for (const field of ['cbs', 'ibs', 'is', 'total']) assert.equal(result[field], regularExample.result[field]);
  assert.equal(result.status, 'projecao');
  assert.equal(projectEducation({ ...input, base: '2400,00' }).total, '85.44');
});

test('usa arredondamento para o par e soma as duas parcelas de IBS antes da exibição', () => {
  const rates = { cbs: '1.25', ibsEstadual: '1.25', ibsMunicipal: '1.25' };
  assert.equal(projectEducation({ ...input, base: '1', rates }).cbs, '0.00');
  assert.equal(projectEducation({ ...input, base: '3', rates }).cbs, '0.02');
  assert.equal(projectEducation({ ...input, base: '1', rates }).ibs, '0.01');
});

test('a projeção permite mudar só os valores, exige decimais válidos e limita taxas', () => {
  for (const edit of [{ date: '2027-11-01' }, { classification: '000000001' }, { uf: 'RJ' },
    { base: 'NaN' }, { base: -1 }, { base: '.1' }, { base: '1.001' }, { rates: {} },
    { rates: { ...input.rates, cbs: '100.0001' } }]) {
    assert.throws(() => projectEducation({ ...input, ...edit }), { status: 422 });
  }
});

test('monta um item real com o formato documentado e preserva o zero inicial dos códigos', () => {
  const result = regularPayload(input);
  assert.equal(result.dhFatoGerador, '2027-03-10T10:00:00-03:00');
  assert.match(result.id, /^[a-f0-9]{32}$/);
  assert.deepEqual(result.itens[0], {
    numero: 1, nbs: '122011200', cst: '200', cClassTrib: '200028', baseCalculo: 1200,
    aliquotasNominais: { cbs: 8.8, ibsEstadual: 0.05, ibsMunicipal: 0.05 },
  });
  const goods = regularPayload({ ...input, kind: 'produto', classification: '02013000',
    cst: '000', cClassTrib: '000001', date: '2026-11-19', rates: undefined });
  assert.equal(goods.itens[0].ncm, '02013000');
  assert.equal(goods.itens[0].cst, '000');
  assert.equal(goods.itens[0].cClassTrib, '000001');
  assert.ok(!('aliquotasNominais' in goods.itens[0]));
});

test('rejeita datas inválidas e campos fora do contrato', () => {
  for (const edit of [{ date: '2027-02-31' }, { date: '2026-11-19' }, { rates: undefined },
    { municipio: 12345 }, { uf: 'XX' }, { kind: 'outro' }, { kind: 'produto' }, { cClassTrib: '28' }]) {
    assert.throws(() => regularPayload({ ...input, ...edit }), { status: 422 });
  }
});

test('somente totaliza um item válido e não transforma erros com HTTP 200 em crédito zero', () => {
  const good = regularResult(observed);
  assert.deepEqual(good, { status: 'simulado', cbs: '42.24', ibs: '0.48', is: null, total: '42.72', memoria: ['Cálculo do exemplo.'] });
  for (const item of [{ nObj: 1, estadoItem: 'FALHA_TECNICA' }, { nObj: 2, estadoItem: 'CALCULADO' },
    { nObj: 1, estadoItem: 'INCONSISTENCIA_ENTRADA', erros: [{ detail: 'Confira a classificação.' }] }]) {
    assert.throws(() => regularResult({ ...observed, objetos: [item] }));
  }
  assert.throws(() => regularResult({ ...observed, objetos: [...observed.objetos, ...observed.objetos] }));
  assert.throws(() => regularResult({ ...observed, total: { tribCalc: { IBSCBSTot: {} } } }));
});

test('faz a chamada do adaptador e comunica indisponibilidade sem recorrer ao exemplo', async () => {
  const baseUrl = 'http://127.0.0.1:8080/api/calculadora';
  const good = await calculateRegular(input, { baseUrl, fetchImpl: async (address, init) => {
    assert.equal(address, baseUrl + '/observabilidade/regime-geral');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    assert.equal(JSON.parse(init.body).municipio, 4314902);
    return Response.json(observed);
  } });
  assert.equal(good.total, '42.72');
  await assert.rejects(calculateRegular(input), { status: 503 });
  await assert.rejects(calculateRegular(input, { baseUrl, fetchImpl: async () => new Response(null, { status: 422 }) }), { status: 422 });
  await assert.rejects(calculateRegular(input, { baseUrl, fetchImpl: async () => new Response('inválido') }), { status: 502 });
  await assert.rejects(calculateRegular(input, { baseUrl, fetchImpl: async () => { throw new Error('offline'); } }), { status: 503 });
});

test('protege os dados contra saída externa e limita a resposta inclusive em streaming', async () => {
  for (const baseUrl of ['https://example.org', 'http://usuario:senha@localhost', 'http://regular/api?x=1']) {
    await assert.rejects(calculateRegular(input, { baseUrl, fetchImpl: () => assert.fail('Endereço inesperado') }), { status: 503 });
  }
  const baseUrl = 'http://regular:8080';
  for (const response of [
    new Response(JSON.stringify(observed), { headers: { 'content-type': 'text/plain' } }),
    new Response(JSON.stringify(observed), { headers: { 'content-type': 'application/json', 'content-length': 1024 * 1024 + 1 } }),
    new Response('x'.repeat(1024 * 1024 + 1), { headers: { 'content-type': 'application/json' } }),
  ]) {
    await assert.rejects(calculateRegular(input, { baseUrl, fetchImpl: async () => response }), { status: 502 });
  }
});
