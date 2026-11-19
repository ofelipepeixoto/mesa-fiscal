// Adaptador para o contrato 2.0.0 da calculadora do Simples Nacional.
// Os valores do exemplo vêm do teste SimplesNacionalControllerTest (c5b0f01).
import { readLocalJson } from './local-json.mjs';

export const SIMPLES_PATH = '/calculadora/observabilidade/simples-nacional';

import { failure, dateValue, documentValue, classValue, checkedItem } from '../public/simples-study.mjs';
export { simplesExample, estimateSimples } from '../public/simples-study.mjs';

export function buildSimplesPayload(input) {
  const item = checkedItem(input);
  return {
    id: globalThis.crypto.randomUUID(),
    versao: '2.0.0',
    data: dateValue(input.data),
    tpDoc: documentValue(input.documento),
    CRT: '1',
    itens: [item],
  };
}

const itemStateMessage = {
  NAO_CALCULADO: 'A atividade informada não permite calcular os tributos deste documento nesta data. Confira a atividade.',
  NAO_IMPLEMENTADO: 'O motor da Receita ainda não calcula esta classificação tributária.',
  INCONSISTENCIA_ENTRADA: 'O motor da Receita identificou dados incompatíveis. Confira a atividade, a classificação e a data.',
  FALHA_TECNICA: 'O motor da Receita encontrou uma falha ao processar o item. Tente novamente.',
};

function invalidResponse() {
  return failure(502, 'O motor do Simples devolveu uma resposta incompleta. Confira a versão instalada.');
}

export function parseSimplesResult(response) {
  if (!Array.isArray(response?.objetos) || response.objetos.length !== 1) throw invalidResponse();
  const item = response.objetos[0];
  if (item?.nObj !== 1 || typeof item.estadoItem !== 'string') throw invalidResponse();
  if (item.estadoItem !== 'CALCULADO') {
    if (!Object.hasOwn(itemStateMessage, item.estadoItem)) throw invalidResponse();
    const code = item.erros?.[0]?.code;
    const suffix = typeof code === 'string' && /^VSN-\d{3}$/.test(code) ? ' (' + code + ')' : '';
    throw failure(item.estadoItem === 'FALHA_TECNICA' ? 502 : 422, itemStateMessage[item.estadoItem] + suffix);
  }
  const total = response.total;
  if (!total || typeof total !== 'object') throw invalidResponse();
  const result = {
    ibs: total.vIBSSNtot,
    cbs: total.vCBSSNtot,
    is: total.totalIs,
    total: total.totalTributos,
  };
  const amount = /^\d+\.\d{2}$/;
  if (!Object.values(result).every(value => typeof value === 'string' && amount.test(value))) {
    throw invalidResponse();
  }
  for (const key of ['vIBSSNtotPendSusp', 'vCBSSNtotPendSusp']) {
    if (total[key] !== undefined) {
      if (typeof total[key] !== 'string' || !amount.test(total[key])) throw invalidResponse();
      if (!/^0+\.00$/.test(total[key])) {
        throw failure(422, 'Há valores pendentes ou suspensos nesta operação. Consulte o detalhamento no motor da Receita.');
      }
    }
  }
  return result;
}

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', 'simples']);

export function serviceUrl(baseUrl, path) {
  const disconnected = 'O motor do Simples ainda não está conectado.';
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw failure(503, disconnected);
  }
  if (!['http:', 'https:'].includes(url.protocol) || !localHosts.has(url.hostname) ||
      url.username || url.password || url.search || url.hash || !['/', '/api', '/api/'].includes(url.pathname)) {
    throw failure(503, disconnected);
  }
  return new URL('/api' + path, url).href;
}

async function requestJson(path, options, { baseUrl, fetchImpl = fetch } = {}) {
  const url = serviceUrl(baseUrl, path);
  let response;
  try {
    response = await fetchImpl(url, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw failure(503, 'Não foi possível acessar o motor do Simples. Confira se ele está ligado.');
  }
  if (!response.ok) {
    await response.body?.cancel();
    if ([400, 404, 422].includes(response.status)) {
      throw failure(422, 'O motor não aceitou a consulta. Confira a operação e a data informada.');
    }
    throw failure(502, 'O motor do Simples não conseguiu atender à consulta.');
  }
  return readLocalJson(response, invalidResponse);
}

export async function calculateSimples(input, options) {
  const payload = buildSimplesPayload(input);
  const response = await requestJson(SIMPLES_PATH, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }, options);
  return parseSimplesResult(response);
}

export async function listSimplesActivities({ data, documento, classificacao }, options) {
  const params = new URLSearchParams({ data: dateValue(data), tpDoc: documentValue(documento) });
  if (classificacao) params.set('cClassTrib', classValue(classificacao));
  const path = '/calculadora/simples-nacional/atividades?' + params;
  const response = await requestJson(path, { method: 'GET' }, options);
  if (!Array.isArray(response)) throw invalidResponse();
  return response.filter(entry => entry?.disponivel === true && /^\d{2}$/.test(entry.codigo) &&
    typeof entry.descricao === 'string' && entry.descricao.trim())
    .map(entry => ({ codigo: entry.codigo, descricao: entry.descricao }));
}

