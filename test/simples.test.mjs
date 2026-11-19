import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIMPLES_PATH, simplesExample, estimateSimples, buildSimplesPayload, parseSimplesResult, calculateSimples, listSimplesActivities,
} from '../server/simples.mjs';

const { input, result } = simplesExample;

test('reproduz o caso oficial do Simples preservando o IS fora da base', () => {
  assert.deepEqual(estimateSimples(input), result);
  assert.deepEqual(estimateSimples({ ...input, impostoSeletivo: '0' }), { ...result, is: '0.00', total: '38.00' });
});

test('somente arredonda na apresentação e preserva casas até quatro nos percentuais', () => {
  const tiny = { ...input, base: '1,00', aliquotaCbs: '0,5', aliquotaIbs: '0,5', impostoSeletivo: 0 };
  assert.deepEqual(estimateSimples(tiny), { ibs: '0.00', cbs: '0.00', is: '0.00', total: '0.01' });
  const granular = { ...tiny, base: '10000.00', aliquotaCbs: '0.1234', aliquotaIbs: '0' };
  assert.equal(estimateSimples(granular).cbs, '12.34');
});

test('restringe a análise pedagógica à combinação do exemplo', () => {
  for (const changed of [{ data: '2026-03-15' }, { documento: '65' }, { atividade: '02' }, { classificacao: '123456' }, { CRT: '2' }, { tpEnteGov: '1' }]) {
    assert.throws(() => estimateSimples({ ...input, ...changed }), { status: 422 });
  }
});

test('valida data real, campos monetários, casas decimais e percentuais', () => {
  for (const changed of [{ data: '2027-02-29' }, { documento: '91' }, { classificacao: 1 }, { base: '' }, { base: '-1' },
    { base: '5.213' }, { aliquotaCbs: '101' }, { aliquotaIbs: '1e-3' }, { atividade: '1' }]) {
    assert.throws(() => buildSimplesPayload({ ...input, ...changed }), { status: 400 });
  }
});

const goodResponse = {
  objetos: [{ nObj: 1, estadoItem: 'CALCULADO' }],
  total: { vIBSSNtot: result.ibs, vCBSSNtot: result.cbs, totalIs: result.is, totalTributos: result.total },
};

test('envia um item ao endpoint oficial e extrai o total devolvido', async () => {
  const output = await calculateSimples(input, {
    baseUrl: 'http://127.0.0.1:8082/api/',
    fetchImpl: async (url, opts) => {
      assert.equal(url, 'http://127.0.0.1:8082/api' + SIMPLES_PATH);
      assert.equal(opts.redirect, 'error');
      const payload = JSON.parse(opts.body);
      assert.equal(opts.method, 'POST');
      assert.equal(payload.versao, '2.0.0');
      assert.equal(payload.tpDoc, '55');
      assert.equal(payload.CRT, '1');
      assert.deepEqual(payload.itens, [{
        numero: 1, cAtivSN: '01', cClassTrib: '000001', baseCalculo: '950.00', valorImpostoSeletivo: '50.00', pIBSSN: '1.25', pCBSSN: '2.75',
      }]);
      return Response.json(goodResponse);
    },
  });
  assert.deepEqual(output, result);
});

test('recusa itens não calculados mesmo com HTTP 200, respostas incompletas e valores suspensos', () => {
  for (const estadoItem of ['NAO_CALCULADO', 'NAO_IMPLEMENTADO', 'INCONSISTENCIA_ENTRADA', 'FALHA_TECNICA']) {
    assert.throws(() => parseSimplesResult({ ...goodResponse, objetos: [{ nObj: 1, estadoItem }] }),
      { status: estadoItem === 'FALHA_TECNICA' ? 502 : 422 });
  }
  assert.throws(() => parseSimplesResult({ objetos: goodResponse.objetos, total: {} }), { status: 502 });
  assert.throws(() => parseSimplesResult({ ...goodResponse, total: { ...goodResponse.total, vIBSSNtotPendSusp: '1.00' } }), { status: 422 });
});

test('catálogo filtra atividades incompatíveis em vez de oferecê-las ao usuário', async () => {
  const items = await listSimplesActivities(input, {
    baseUrl: 'http://127.0.0.1:8082/api',
    fetchImpl: async url => {
      const { searchParams } = new URL(url);
      assert.equal(searchParams.get('tpDoc'), '55');
      assert.equal(searchParams.get('cClassTrib'), '000001');
      return Response.json([
        { codigo: '01', descricao: 'Vigente e compatível', disponivel: true },
        { codigo: '07', descricao: 'Incompatível', disponivel: false },
      ]);
    },
  });
  assert.deepEqual(items, [{ codigo: '01', descricao: 'Vigente e compatível' }]);
});

test('falha do motor encerra a consulta sem substituir o resultado pela estimativa', async () => {
  await assert.rejects(calculateSimples(input, {}), { status: 503 });
  await assert.rejects(calculateSimples(input, {
    baseUrl: 'http://127.0.0.1:8082/api', fetchImpl: async () => { throw new Error('offline'); },
  }), { status: 503 });
});

test('valida o destino privado e rejeita respostas maiores que o limite', async () => {
  for (const baseUrl of ['https://example.com/api', 'http://simples/extra', 'http://user@localhost/api']) {
    await assert.rejects(calculateSimples(input, {
      baseUrl, fetchImpl: () => assert.fail('não poderia tentar a conexão'),
    }), { status: 503 });
  }
  await assert.rejects(calculateSimples(input, {
    baseUrl: 'http://simples:8082/api', fetchImpl: async () => new Response(' '.repeat(1024 * 1024 + 1), {
      headers: { 'content-type': 'application/json' },
    }),
  }), { status: 502 });
});
