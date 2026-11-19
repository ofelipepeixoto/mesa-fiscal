// Estudo de um item da simulação de referência, commit c5b0f01.
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
  const pattern = isPercent ? /^\d{1,3}(?:\.\d{1,4})?$/ : /^\d{1,13}(?:\.\d{1,2})?$/;
  if (!pattern.test(normalized) || (isPercent && Number(normalized) > 100)) {
    throw failure(400, isPercent
      ? 'Confira ' + label + '. Use um percentual de 0 a 100, com até quatro casas decimais.'
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
  return {
    numero: 1,
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

// A moeda é exibida em centavos. Na metade exata, o motor favorece o algarismo par.
function displayMoney(scaledCents) {
  const divisor = 1_000_000n;
  const lower = scaledCents / divisor;
  const doubleRemainder = (scaledCents % divisor) * 2n;
  const cents = lower + BigInt(doubleRemainder > divisor || (doubleRemainder === divisor && lower % 2n === 1n));
  return (cents / 100n).toString() + '.' + (cents % 100n).toString().padStart(2, '0');
}

export function estimateSimples(input) {
  const item = checkedItem(input);
  for (const key of ['data', 'documento', 'atividade', 'classificacao']) {
    if (input[key] !== simplesExample.input[key]) {
      throw failure(422, 'O exemplo usa NF-e de 15/03/2027, atividade 01 e classificação 000001. Para outras operações, conecte o motor da Receita.');
    }
  }
  // Comprador privado, CRT 1, receita interna integral.
  // Até 2 casas de moeda × 4 de percentual / 100 cabem nas 8 casas internas do motor.
  const baseCents = units(item.baseCalculo, 2);
  const ibs = baseCents * units(item.pIBSSN, 4);
  const cbs = baseCents * units(item.pCBSSN, 4);
  const is = units(item.valorImpostoSeletivo, 2) * 1_000_000n;
  return { ibs: displayMoney(ibs), cbs: displayMoney(cbs), is: displayMoney(is), total: displayMoney(ibs + cbs + is) };
}
