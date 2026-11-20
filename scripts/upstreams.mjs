// A detecção só usa metadados da API GitHub. Nenhum repositório externo é executado aqui.
import { readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const path = name => fileURLToPath(new URL(name, root));
export const projects = {
  regular: 'ReceitaFederal/calculadora-rtc-regime-regular',
  simples: 'ReceitaFederal/calculadora-rtc-simples-nacional',
  danfse: 'ReceitaFederal/calculadora-rtc-gerador-danfse',
};
const keys = Object.keys(projects);
const shaPattern = /^[0-9a-f]{40}$/;
const issueMarker = '<!-- mesa-fiscal:atualizacao-oficial:v1 -->';
const title = 'Revisões oficiais da Receita para homologar';

function revision(value) {
  if (typeof value !== 'string' || !shaPattern.test(value)) throw new Error('SHA de revisão inválido.');
  return value;
}
function lockText(pins) {
  return keys.map(key => key.toUpperCase() + '_REV=' + revision(pins[key]) + '\n').join('');
}
export function parseLock(text) {
  const result = {};
  for (const line of text.trim().split(/\r?\n/)) {
    const match = /^(REGULAR|SIMPLES|DANFSE)_REV=([0-9a-f]{40})$/.exec(line);
    if (!match || Object.hasOwn(result, match[1].toLowerCase())) throw new Error('Formato inválido em upstream.lock.env.');
    result[match[1].toLowerCase()] = match[2];
  }
  lockText(result);
  return result;
}
// Os nomes dos contextos são usados pelos Dockerfiles.
const contexts = { 'regular.upstream': 'regular', 'simples.upstream': 'simples', 'simples.catalog': 'regular', 'danfse.upstream': 'danfse' };
export function renderCompose(text, pins) {
  let service = '';
  const found = new Set();
  const lines = text.split('\n').map(line => {
    const section = /^  ([a-z][\w-]*):\s*$/.exec(line);
    if (section) service = section[1];
    const entry = /^(\s+)(upstream|catalog):\s+(https:\/\/github\.com\/[\w./-]+\.git#)[0-9a-f]{40}\s*$/.exec(line);
    if (!entry) return line;
    const position = service + '.' + entry[2];
    const key = contexts[position];
    if (!key || found.has(position) || entry[3] !== 'https://github.com/' + projects[key] + '.git#') {
      throw new Error('Revise a origem Docker em ' + position + '.');
    }
    found.add(position);
    return entry[1] + entry[2] + ': ' + entry[3] + revision(pins[key]);
  });
  if (found.size !== Object.keys(contexts).length) throw new Error('O Compose precisa dos quatro contextos de origem dos motores e do catálogo.');
  return lines.join('\n');
}

export function renderReadme(text, pins) {
  const pattern = /<!-- upstream-pins:start -->[\s\S]*?<!-- upstream-pins:end -->/g;
  if ((text.match(pattern) || []).length !== 1) throw new Error('Tabela de revisões ausente ou duplicada no README.');
  return text.replace(pattern, section => {
    for (const key of keys) {
      const prefix = 'https://github.com/' + projects[key] + '/commit/';
      const link = new RegExp('\\[[0-9a-f]{7,40}\\]\\(' + prefix.replaceAll('.', '\\.') + '[0-9a-f]{40}\\)', 'g');
      if ((section.match(link) || []).length !== 1) throw new Error('Revise o link de ' + key + ' na tabela do README.');
      section = section.replace(link, '[' + revision(pins[key]).slice(0, 8) + '](' + prefix + pins[key] + ')');
    }
    return section;
  });
}

async function github(route, { method = 'GET', data } = {}) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (data) headers['Content-Type'] = 'application/json';
  if (process.env.GH_TOKEN) headers.Authorization = 'Bearer ' + process.env.GH_TOKEN;
  const res = await fetch('https://api.github.com/' + route, {
    method, headers, body: data && JSON.stringify(data), redirect: 'error', signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error('Falha na API GitHub (' + res.status + ') para ' + route.split('?')[0] + '.');
  return res.json();
}

export async function detect(pins, request = github) {
  const changes = await Promise.all(keys.map(async key => {
    const repo = 'repos/' + projects[key];
    const branch = (await request(repo)).default_branch;
    if (typeof branch !== 'string' || !branch || branch.length > 250) throw new Error('Branch padrão ausente em ' + projects[key]);
    const head = revision((await request(repo + '/commits/' + encodeURIComponent(branch))).sha);
    const pin = revision(pins[key]);
    const relation = head === pin ? 'identical' : (await request(repo + '/compare/' + pin + '...' + head)).status;
    if (!['ahead', 'behind', 'diverged', 'identical'].includes(relation) || ((head === pin) !== (relation === 'identical'))) {
      throw new Error('Comparação inválida para ' + projects[key] + '.');
    }
    return [key, { pin, head, relation }];
  }));
  return Object.fromEntries(changes);
}

function validateReport(report, pins) {
  if (!report || Object.keys(report).length !== keys.length) throw new Error('Relatório incompleto.');
  for (const key of keys) {
    const row = report[key];
    if (!row || revision(row.pin) !== pins[key] || !['identical', 'ahead', 'behind', 'diverged'].includes(row.relation) ||
        ((revision(row.head) === row.pin) !== (row.relation === 'identical'))) throw new Error('Revise o relatório de ' + key + '.');
  }
}
export function candidatePins(report, expected = []) {
  if (expected.length && expected.length !== keys.length) throw new Error('Informe os três SHAs na ordem regular, simples e DANFSe.');
  return Object.fromEntries(keys.map((key, i) => {
    const { head, relation } = report[key];
    if (!['ahead', 'identical'].includes(relation)) throw new Error('Histórico alterado em ' + key + '. Compare as revisões antes de preparar o PR.');
    if (expected.length && revision(expected[i]) !== head) throw new Error('A revisão oficial mudou. Rode a verificação novamente.');
    return [key, revision(head)];
  }));
}

export function issueBody(report) {
  const lines = keys.filter(k => report[k].relation !== 'identical').map(key => {
    const { pin, head, relation } = report[key];
    return '- [' + projects[key] + ': ' + pin.slice(0, 8) + ' → ' + head.slice(0, 8) +
      '](https://github.com/' + projects[key] + '/compare/' + pin + '...' + head + ')' +
      (relation === 'ahead' ? '' : ' (histórico divergente ou recuado; revisão manual necessária)');
  });
  const next = keys.some(key => ['behind', 'diverged'].includes(report[key].relation))
    ? 'Investigue a mudança de histórico. A preparação automática está bloqueada.'
    : 'Em uma branch do Mesa Fiscal, prepare exatamente estas revisões:\n\n`node scripts/upstreams.mjs apply ' +
      keys.map(k => report[k].head).join(' ') + '`\n\nRevise os contratos, os requisitos Java/Go, as migrações e mudanças de workflow. Se o DANFSe mudou, regenere o WebAssembly e confira as licenças. Abra um PR e acompanhe a homologação antes de incorporar. Consulte `docs/atualizar-motores.md`.';
  return issueMarker + '\n\n' + (lines.length ? 'A Receita publicou mudanças.\n\n' + lines.join('\n') + '\n\n' + next :
    'Os três projetos oficiais estão nas revisões registradas em `upstream.lock.env`.') + '\n';
}

export function reconcileIssue(existing, report) {
  const changed = keys.some(key => report[key].relation !== 'identical');
  const body = issueBody(report);
  if (!existing) return changed ? { create: { title, body } } : null;
  if (existing.body === body && (changed || existing.state === 'closed')) return null;
  if (!changed && existing.state === 'closed') return null;
  return { update: { state: changed ? 'open' : 'closed', body } };
}

async function publish(report) {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '')) throw new Error('Repositório de destino inválido.');
  const issues = 'repos/' + repository + '/issues';
  let existing;
  for (let page = 1; !existing; page++) {
    const batch = await github(issues + '?state=all&creator=github-actions%5Bbot%5D&per_page=100&page=' + page);
    existing = batch.find(row => !row.pull_request && row.user?.login === 'github-actions[bot]' && row.body?.startsWith(issueMarker));
    if (batch.length < 100) break;
  }
  const action = reconcileIssue(existing, report);
  if (action?.create) await github(issues, { method: 'POST', data: action.create });
  if (action?.update) await github(issues + '/' + existing.number, { method: 'PATCH', data: action.update });
  return action?.create ? 'Issue criada.' : action?.update ? 'Issue atualizada.' : 'Sem aviso novo.';
}

async function save(name, text) {
  const temp = path(name + '.tmp-' + process.pid);
  await writeFile(temp, text, { flag: 'wx' });
  await rename(temp, path(name));
}

async function main([command, ...args]) {
  const pins = parseLock(await readFile(path('upstream.lock.env'), 'utf8'));
  if (command === 'pin') {
    if (!Object.hasOwn(pins, args[0])) throw new Error('Projeto inválido.');
    return console.log(pins[args[0]]);
  }
  const compose = await readFile(path('compose.yaml'), 'utf8');
  const readme = await readFile(path('README.md'), 'utf8');
  if (command === 'sync') {
    await save('compose.yaml', renderCompose(compose, pins));
    return save('README.md', renderReadme(readme, pins));
  }
  if (command === 'verify') {
    if (compose !== renderCompose(compose, pins)) throw new Error('Pins do Compose diferem do manifesto. Rode node scripts/upstreams.mjs sync.');
    if (readme !== renderReadme(readme, pins)) throw new Error('A tabela do README difere do manifesto.');
    const build = await readFile(path('public/engine/BUILD.txt'), 'utf8');
    const source = 'Fonte: https://github.com/' + projects.danfse + '/commit/' + pins.danfse;
    if (build.split(/\r?\n/).filter(line => line.startsWith('Fonte:')).join('\n') !== source) {
      throw new Error('O WebAssembly não foi gerado a partir da revisão registrada. Execute bash scripts/compilar-danfse.sh.');
    }
    return console.log('Revisões do Compose e do WebAssembly conferidas.');
  }
  if (command === 'issue') {
    const report = JSON.parse(process.env.UPSTREAM_REPORT || 'null');
    validateReport(report, pins);
    return console.log(await publish(report));
  }
  if (!['check','apply'].includes(command)) throw new Error('Use check, apply [três SHAs], sync, verify ou pin <nome>.');
  const report = await detect(pins);
  if (command === 'check') return console.log(JSON.stringify(report));
  const nextPins = candidatePins(report, args);
  const nextCompose = renderCompose(compose, nextPins);
  const nextReadme = renderReadme(readme, nextPins);
  await save('upstream.lock.env', lockText(nextPins));
  await save('compose.yaml', nextCompose);
  await save('README.md', nextReadme);
  console.log('Pins preparados no checkout. ' + (nextPins.danfse !== pins.danfse ? 'Recompile o DANFSe antes de abrir o PR. ' : '') + 'Confira o diff e a homologação.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
