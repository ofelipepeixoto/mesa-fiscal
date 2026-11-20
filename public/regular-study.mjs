import { moneyString, roundHalfEven } from './decimal-fiscal.mjs';

// Item 3 do exemplo publicado pela Receita. A projeção só aceita esse enquadramento.
export const regularSource = 'https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/blob/f1eebd7ce3157423b1a6aaca7dc1d6c3395452c4/docs/exemplos.md';

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

export function rateUnits(raw) {
  const units = scaledDigits(raw, 3, 4, 'a alíquota');
  if (units > 1_000_000n) throw fiscalError('Informe alíquotas entre 0 e 100%.');
  return units;
}

export function projectEducation(input) {
  const fixedFields = ['date', 'uf', 'municipio', 'kind', 'classification', 'cst', 'cClassTrib'];
  if (fixedFields.some(field => String(input?.[field]) !== referenceInput[field])) {
    throw fiscalError('A projeção usa o serviço de educação do exemplo da Receita. Para outro enquadramento, use o motor local.');
  }
  const baseCents = scaledDigits(input.base, 13, 2, 'a base de cálculo');
  // O motor 1.7.2 publica a alíquota efetiva em quatro casas antes de aplicá-la.
  const amountCents = rate => {
    const effectivePercent = roundHalfEven(rateUnits(rate) * 40n, 100n);
    return roundHalfEven(baseCents * effectivePercent, 1_000_000n);
  };
  const cbsCents = amountCents(input.rates?.cbs);
  const ibsCents = amountCents(input.rates?.ibsEstadual) + amountCents(input.rates?.ibsMunicipal);
  return {
    status: 'projecao', cbs: moneyString(cbsCents), ibs: moneyString(ibsCents), is: null,
    total: moneyString(cbsCents + ibsCents),
    memoria: ['Projeção local do serviço de educação, com data de operação em 10/03/2027.',
      'Depois da redução de 60%, arredondamos cada alíquota para quatro casas e calculamos o imposto em centavos. O IBS reúne as parcelas estadual e municipal já arredondadas.'],
  };
}
