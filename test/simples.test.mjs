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

test('arredonda cada imposto para o par antes de somar o total do item', () => {
  const tiny = { ...input, base: '1,00', aliquotaCbs: '0,5', aliquotaIbs: '0,5', impostoSeletivo: 0 };
  assert.deepEqual(estimateSimples(tiny), { ibs: '0.00', cbs: '0.00', is: '0.00', total: '0.00' });
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
    { base: '5.213' }, { aliquotaCbs: '1000' }, { aliquotaIbs: '1e-3' }, { atividade: '1' }]) {
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
  assert.deepEqual(output, { status: 'calculado', ...result });
});

test('recusa itens não calculados mesmo com HTTP 200, respostas incompletas e valores suspensos', () => {
  for (const estadoItem of ['NAO_CALCULADO', 'NAO_IMPLEMENTADO', 'INCONSISTENCIA_ENTRADA', 'FALHA_TECNICA']) {
    assert.throws(() => parseSimplesResult({ ...goodResponse, objetos: [{ nObj: 1, estadoItem }] }),
      { status: estadoItem === 'FALHA_TECNICA' ? 502 : 422 });
  }
  assert.throws(() => parseSimplesResult({ objetos: goodResponse.objetos, total: {} }), { status: 502 });
  assert.throws(() => parseSimplesResult({ ...goodResponse, total: { ...goodResponse.total, vIBSSNtotPendSusp: '1.00' } }), { status: 422 });
});

test('confere a soma de IBS, CBS e IS em centavos inteiros', () => {
  const cases = [
    { vIBSSNtot: '0.10', vCBSSNtot: '0.20', totalIs: '0.00', totalTributos: '0.30' },
    { vIBSSNtot: '000.10', vCBSSNtot: '00.20', totalIs: '0.00', totalTributos: '00.30' },
    { vIBSSNtot: '0.00', vCBSSNtot: '0.00', totalIs: '0.00', totalTributos: '0.00' },
    { vIBSSNtot: '99999999999999999999.97', vCBSSNtot: '0.01', totalIs: '0.01', totalTributos: '99999999999999999999.99' },
  ];
  for (const total of cases) {
    assert.equal(parseSimplesResult({ ...goodResponse, total }).total, total.totalTributos);
  }
  for (const totalTributos of ['0.29', '0.31']) {
    assert.throws(() => parseSimplesResult({ ...goodResponse, total: { ...cases[0], totalTributos } }),
      { status: 502, message: /soma de IBS, CBS e IS/ });
  }
  assert.throws(() => parseSimplesResult({ ...goodResponse,
    total: { ...cases[3], totalTributos: '99999999999999999999.98' },
  }), { status: 502 });
});

test('recusa valores fora do formato e do limite aceito pela interface', () => {
  for (const field of Object.keys(goodResponse.total)) {
    for (const value of [1.23, '-1.00', '0.001', '0.1', '1e2', '1,00', '1.00\n', '1' + '0'.repeat(20) + '.00']) {
      assert.throws(() => parseSimplesResult({ ...goodResponse, total: { ...goodResponse.total, [field]: value } }),
        { status: 502 });
    }
    assert.throws(() => parseSimplesResult({ ...goodResponse,
      total: { ...goodResponse.total, [field]: goodResponse.total[field] + '\n' },
    }), { status: 502 });
  }
  assert.throws(() => parseSimplesResult({ ...goodResponse,
    total: { ...goodResponse.total, vIBSSNtotPendSusp: '0.00\n' },
  }), { status: 502 });
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

test('usa a alíquota integral de até 34 casas, inclusive no exemplo de alta precisão da Receita', () => {
  const high = { ...input, base: '987654.32', impostoSeletivo: '0', aliquotaIbs: '0.01867380622521988789135487',
    aliquotaCbs: '1.6839379378389463610262954' };
  assert.deepEqual(estimateSimples(high), { ibs: '184.43', cbs: '16631.49', is: '0.00', total: '16815.92' });
  assert.equal(buildSimplesPayload(high).itens[0].pCBSSN, high.aliquotaCbs);
  const maximum = '999.' + '9'.repeat(34);
  assert.equal(buildSimplesPayload({ ...input, aliquotaIbs: maximum }).itens[0].pIBSSN, maximum);
  assert.throws(() => buildSimplesPayload({ ...input, aliquotaIbs: maximum + '0' }), { status: 400 });
  assert.throws(() => buildSimplesPayload({ ...input, aliquotaCbs: '0.1e0' }), { status: 400 });
});

test('encaminha NCM de oito dígitos para o motor somente quando informado', () => {
  const product = { ...input, classificacao: '200003', ncm: '10062010' };
  assert.equal(buildSimplesPayload(product).itens[0].ncm, '10062010');
  assert.equal(buildSimplesPayload({ ...input, ncm: '02013000' }).itens[0].ncm, '02013000');
  for (const ncm of [undefined, null, '', '00', '00000000']) assert.ok(!('ncm' in buildSimplesPayload({ ...input, ncm }).itens[0]));
  for (const ncm of ['1', 12345678, ' 00 ']) assert.throws(() => buildSimplesPayload({ ...input, ncm }), { status: 400 });
  assert.throws(() => buildSimplesPayload({ ...input, nbs: '122012000' }), { status: 422 });
  assert.throws(() => estimateSimples({ ...input, ncm: '10062010' }), { status: 422 });
});

test('explica a causa oficial quando uma atividade não é calculada, mesmo sob HTTP 200', () => {
  const descricao = 'A atividade não está vigente na data informada.';
  const item = { nObj: 1, estadoItem: 'NAO_CALCULADO', motivoEstado: { codigo: 'CATIVSN_DESCONHECIDO', descricao } };
  assert.throws(() => parseSimplesResult({ objetos: [item], total: {} }), { status: 422, message: descricao });
});

test('devolve ao usuário o motivo da rejeição do código de produto', () => {
  const item = { nObj: 1, estadoItem: 'INCONSISTENCIA_ENTRADA', erros: [{ code: 'VSN-042', detail: 'A classificação exige o NCM completo.' }] };
  assert.throws(() => parseSimplesResult({ objetos: [item] }), { status: 422, message: 'A classificação exige o NCM completo. (VSN-042)' });
});
