// Item 3 do exemplo publicado pela Receita. A projeção só aceita esse enquadramento.
export const regularSource = 'https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/blob/150cccbe414d4a5edea703e4f7a424af5aa222c7/docs/exemplos.md';

const referenceInput = Object.freeze({
  date: '2027-03-10', uf: 'RS', municipio: '4314902', kind: 'servico',
  classification: '122011200', cst: '200', cClassTrib: '200028', base: '1200.00',
  rates: Object.freeze({ cbs: '8.8', ibsEstadual: '0.05', ibsMunicipal: '0.05' }),
});

export const regularExample = Object.freeze({
  source: regularSource,
  input: referenceInput,
  result: Object.freeze({
    status: 'simulado', cbs: '42.24', ibs: '0.48', is: null, total: '42.72',
    memoria: Object.freeze(['O exemplo de educação aplica redução de 60% às três alíquotas.',
      'A CBS do item é de R$ 42,24. Os componentes estadual e municipal do IBS são de R$ 0,24 cada.']),
  }),
});

export function fiscalError(message, status = 422) {
  const error = new Error(message);
  error.status = status;
  error.statusCode = status;
  return error;
}

// A representação decimal em inteiros preserva os centavos inclusive no teto do contrato.
export function scaledDigits(value, wholeDigits, decimals, field) {
  const candidate = typeof value === 'number' || typeof value === 'string'
    ? String(value).trim().replace(',', '.') : '';
  const format = new RegExp('^\\d{1,' + wholeDigits + '}(?:\\.\\d{1,' + decimals + '})?$');
  if (!format.test(candidate)) throw fiscalError('Confira ' + field + '. Use até ' + decimals + ' casas decimais.');
  const [whole, fraction = ''] = candidate.split('.');
  return BigInt(whole + fraction.padEnd(decimals, '0'));
}

export function moneyString(cents) {
  return (cents / 100n).toString() + '.' + (cents % 100n).toString().padStart(2, '0');
}

export function rateUnits(raw) {
  const units = scaledDigits(raw, 3, 4, 'a alíquota');
  if (units > 1_000_000n) throw fiscalError('Informe alíquotas entre 0 e 100%.');
  return units;
}

function roundHalfEven(numerator, denominator) {
  const quotient = numerator / denominator;
  const twiceRemainder = (numerator % denominator) * 2n;
  const roundUp = twiceRemainder > denominator || (twiceRemainder === denominator && quotient % 2n === 1n);
  return roundUp ? quotient + 1n : quotient;
}

export function projectEducation(input) {
  const fixedFields = ['date', 'uf', 'municipio', 'kind', 'classification', 'cst', 'cClassTrib'];
  if (fixedFields.some(field => String(input?.[field]) !== referenceInput[field])) {
    throw fiscalError('A projeção usa o serviço de educação do exemplo da Receita. Para outro enquadramento, use o motor local.');
  }
  const baseCents = scaledDigits(input.base, 13, 2, 'a base de cálculo');
  // 40% da alíquota nominal após a redução. A unidade interna equivale a 10^-8 real.
  const internalAmount = rate => roundHalfEven(baseCents * rateUnits(rate) * 40n, 100n);
  const cbsValue = internalAmount(input.rates?.cbs);
  const ibsValue = internalAmount(input.rates?.ibsEstadual) + internalAmount(input.rates?.ibsMunicipal);
  const cbsCents = roundHalfEven(cbsValue, 1_000_000n);
  const ibsCents = roundHalfEven(ibsValue, 1_000_000n);
  return {
    status: 'projecao', cbs: moneyString(cbsCents), ibs: moneyString(ibsCents), is: null,
    total: moneyString(cbsCents + ibsCents),
    memoria: ['Projeção local do serviço de educação, com data de operação em 10/03/2027.',
      'Aplicamos 40% de cada alíquota informada sobre a base. Somamos o IBS estadual e o municipal antes de exibir os centavos.'],
  };
}
