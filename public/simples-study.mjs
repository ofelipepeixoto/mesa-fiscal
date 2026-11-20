// Estudo de um item da simulação de referência, versão 1.0.2.
import { moneyString, roundHalfEven } from './decimal-fiscal.mjs';
export const simplesExample = Object.freeze({
  input: Object.freeze({
    data: '2027-03-15',
    documento: '55',
    atividade: '01',
    classificacao: '000001',
    base: '950.00',
    impostoSeletivo: '50.00',
    aliquotaIbs: '1.25',
    aliquotaCbs: '2.75',
  }),
  result: Object.freeze({ ibs: '11.88', cbs: '26.12', is: '50.00', total: '88.00' }),
});

export function failure(status, message) {
  return Object.assign(new Error(message), { status });
}

export function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw failure(400, 'Informe a data da operação.');
  }
  const date = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw failure(400, 'Confira o dia e o mês da operação.');
  }
  return value;
}

export function documentValue(value) {
  if (!['55', '65'].includes(value)) {
    throw failure(400, 'Escolha uma nota de mercadoria (NF-e) ou de consumidor (NFC-e).');
  }
  return value;
}

export function classValue(value) {
  if (typeof value !== 'string' || !/^\d{6}$/.test(value)) {
    throw failure(400, 'Informe os seis dígitos da classificação tributária que aparece na nota.');
  }
  return value;
}

function decimal(value, label, isPercent = false) {
  const normalized = String(value ?? '').trim().replace(',', '.');
  const pattern = isPercent ? /^\d{1,3}(?:\.\d{1,34})?$/ : /^\d{1,13}(?:\.\d{1,2})?$/;
  if (!pattern.test(normalized)) {
    throw failure(400, isPercent
      ? 'Confira ' + label + '. Use até três dígitos inteiros e 34 casas decimais.'
      : 'Confira ' + label + '. Use um valor positivo ou zero, com até duas casas decimais e sem separador de milhar.');
  }
  const [integer, fraction = ''] = normalized.split('.');
  return BigInt(integer).toString() + '.' + fraction.padEnd(2, '0');
}

export function checkedItem(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw failure(400, 'Preencha os dados da operação.');
  }
  if ((input.CRT != null && String(input.CRT) !== '1') || input.tpEnteGov != null || input.tpRegimeIBSCBS != null) {
    throw failure(422, 'Esta simulação atende empresas do Simples Nacional com CRT 1 e comprador privado.');
  }
  if (typeof input.atividade !== 'string' || !/^\d{2}$/.test(input.atividade)) {
    throw failure(400, 'Escolha a atividade ou informe seu código de dois dígitos.');
  }
  const ncm = input.ncm;
  if (input.nbs != null && input.nbs !== '') {
    throw failure(422, 'A nota de mercadoria ou de consumidor usa NCM para identificar o produto.');
  }
  const hasNcm = ncm != null && ncm !== '' && ncm !== '00' && ncm !== '00000000';
  if (hasNcm && (typeof ncm !== 'string' || !/^\d{8}$/.test(ncm))) {
    throw failure(400, 'Confira os oito dígitos do NCM na nota.');
  }
  return {
    numero: 1,
    ...(hasNcm ? { ncm } : {}),
    cAtivSN: input.atividade,
    cClassTrib: classValue(input.classificacao),
    baseCalculo: decimal(input.base, 'a base de cálculo'),
    valorImpostoSeletivo: decimal(input.impostoSeletivo, 'o valor do Imposto Seletivo'),
    pIBSSN: decimal(input.aliquotaIbs, 'a alíquota efetiva de IBS', true),
    pCBSSN: decimal(input.aliquotaCbs, 'a alíquota efetiva de CBS', true),
  };
}

function units(decimalString, scale) {
  const [integer, fraction = ''] = decimalString.split('.');
  return BigInt(integer + fraction.padEnd(scale, '0'));
}

export function estimateSimples(input) {
  const item = checkedItem(input);
  if (item.ncm) throw failure(422, 'Para conferir a classificação de um produto específico, use o motor local.');
  for (const key of ['data', 'documento', 'atividade', 'classificacao']) {
    if (input[key] !== simplesExample.input[key]) {
      throw failure(422, 'O exemplo usa NF-e de 15/03/2027, atividade 01 e classificação 000001. Para outras operações, conecte o motor da Receita.');
    }
  }
  // A alíquota é usada com todas as casas informadas. A soma usa as parcelas em centavos.
  const baseCents = units(item.baseCalculo, 2);
  const percentScale = 34;
  const divisor = 100n * 10n ** BigInt(percentScale);
  const ibs = roundHalfEven(baseCents * units(item.pIBSSN, percentScale), divisor);
  const cbs = roundHalfEven(baseCents * units(item.pCBSSN, percentScale), divisor);
  const is = units(item.valorImpostoSeletivo, 2);
  return { ibs: moneyString(ibs), cbs: moneyString(cbs), is: moneyString(is), total: moneyString(ibs + cbs + is) };
}
