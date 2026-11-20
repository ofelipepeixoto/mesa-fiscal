import { moneyString } from '../public/decimal-fiscal.mjs';
import { randomUUID } from 'node:crypto';
import { readLocalJson } from './local-json.mjs';
import { fiscalError, rateUnits, scaledDigits } from '../public/regular-study.mjs';

export { projectEducation, regularExample } from '../public/regular-study.mjs';

const states = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));

function checkDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw fiscalError('Escolha a data da operação.');
  }
  const parsed = new Date(value + 'T10:00:00Z');
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw fiscalError('Confira o dia, mês e ano da operação.');
  }
  return value;
}

function numericCode(value, pattern, field) {
  if ((typeof value !== 'string' && typeof value !== 'number') || !pattern.test(String(value))) {
    throw fiscalError('Confira ' + field + '.');
  }
  return String(value);
}

export function regularPayload(input) {
  const date = checkDate(input?.date);
  if (!states.has(input.uf)) throw fiscalError('Escolha o estado da operação.');
  const municipio = numericCode(input.municipio, /^\d{7}$/, 'os sete dígitos do código IBGE do município');
  const isService = input.kind === 'servico';
  if (!isService && input.kind !== 'produto') throw fiscalError('Escolha produto ou serviço.');
  const item = {
    numero: 1,
    [isService ? 'nbs' : 'ncm']: numericCode(input.classification, isService ? /^\d{9}$/ : /^\d{8}$/,
      isService ? 'os nove dígitos do código do serviço (NBS)' : 'os oito dígitos do código do produto (NCM)'),
    cst: numericCode(input.cst, /^\d{3}$/, 'os três dígitos da situação tributária'),
    cClassTrib: numericCode(input.cClassTrib, /^\d{6}$/, 'os seis dígitos da classificação tributária'),
    baseCalculo: Number(scaledDigits(input.base, 13, 2, 'a base de cálculo')) / 100,
  };
  if (date >= '2027-01-01') {
    item.aliquotasNominais = {};
    for (const name of ['cbs', 'ibsEstadual', 'ibsMunicipal']) {
      item.aliquotasNominais[name] = Number(rateUnits(input.rates?.[name])) / 10000;
    }
  } else if (input.rates != null) {
    throw fiscalError('Até 2026, o motor consulta as alíquotas. Remova as alíquotas informadas.');
  }
  return {
    id: randomUUID().replaceAll('-', ''), versao: '1.0.0', dhFatoGerador: date + 'T10:00:00-03:00',
    municipio: Number(municipio), uf: input.uf, itens: [item],
  };
}

const incomplete = () => fiscalError('O motor não devolveu um resultado completo para esta operação.', 502);

function responseAmount(value) {
  if (!/^\d{1,17}(?:\.\d{1,2})?$/.test(typeof value === 'string' || typeof value === 'number' ? String(value) : '')) {
    throw incomplete();
  }
  return scaledDigits(value, 17, 2, 'o valor devolvido');
}

export function regularResult(response) {
  if (!Array.isArray(response?.objetos) || response.objetos.length !== 1) throw incomplete();
  const item = response.objetos[0];
  if (item?.nObj !== 1) throw incomplete();
  if (item.estadoItem !== 'CALCULADO' && item.estadoItem !== 'CALCULO_SIMULADO') {
    if (item.estadoItem === 'INCONSISTENCIA_ENTRADA') {
      const issue = item.erros?.[0];
      const detail = typeof issue?.detail === 'string' ? issue.detail.slice(0, 350) : 'Confira os dados e a classificação do item.';
      throw fiscalError(detail);
    }
    if (item.estadoItem === 'NAO_IMPLEMENTADO') throw fiscalError('O motor ainda não calcula esta situação tributária.');
    if (item.estadoItem === 'FALHA_TECNICA') throw fiscalError('O motor encontrou uma falha ao calcular o item. Tente novamente.', 502);
    throw incomplete();
  }
  const totals = response.total?.tribCalc;
  const group = item.tribCalc?.IBSCBS?.gIBSCBS;
  if (!group || !totals?.IBSCBSTot) {
    throw fiscalError('O resultado não contém os grupos de CBS e IBS exibidos nesta tela.', 422);
  }
  const cbs = responseAmount(totals.IBSCBSTot.gCBS?.vCBS);
  const ibs = responseAmount(totals.IBSCBSTot.gIBS?.vIBS);
  const selective = item.tribCalc.IS || totals.ISTot?.vIS != null
    ? responseAmount(totals.ISTot?.vIS) : null;
  const memoria = [group.gCBS, group.gIBSUF, group.gIBSMun, item.tribCalc.IS]
    .map(component => component?.memoriaCalculo)
    .filter(value => typeof value === 'string' && value.trim())
    .map(value => value.slice(0, 4000));
  return {
    status: item.estadoItem === 'CALCULADO' ? 'calculado' : 'simulado',
    cbs: moneyString(cbs), ibs: moneyString(ibs), is: selective === null ? null : moneyString(selective),
    total: moneyString(cbs + ibs + (selective ?? 0n)), memoria,
  };
}

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', 'regular']);

export function serviceAddress(baseUrl) {
  const disconnected = 'Conecte o motor do regime regular para calcular esta operação.';
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw fiscalError(disconnected, 503);
  }
  const paths = ['/', '/api', '/api/', '/api/calculadora', '/api/calculadora/'];
  if (!['http:', 'https:'].includes(url.protocol) || !localHosts.has(url.hostname) ||
      url.username || url.password || url.search || url.hash || !paths.includes(url.pathname)) {
    throw fiscalError(disconnected, 503);
  }
  return new URL('/api/calculadora/observabilidade/regime-geral', url).href;
}

export async function calculateRegular(input, { baseUrl, fetchImpl = fetch } = {}) {
  const payload = regularPayload(input);
  const address = serviceAddress(baseUrl);
  let response;
  try {
    response = await fetchImpl(address, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20000), redirect: 'error',
    });
  } catch {
    throw fiscalError('Não foi possível acessar o motor do regime regular. Confira a conexão local.', 503);
  }
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 400 || response.status === 422) {
      throw fiscalError('O motor recusou a operação. Confira a data, o município e a classificação tributária.');
    }
    throw fiscalError('O motor do regime regular não respondeu ao cálculo.', 502);
  }
  return regularResult(await readLocalJson(response, incomplete));
}
