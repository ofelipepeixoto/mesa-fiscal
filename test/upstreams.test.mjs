import test from 'node:test';
import assert from 'node:assert/strict';
import { projects, parseLock, renderCompose, renderReadme, detect, candidatePins, reconcileIssue } from '../scripts/upstreams.mjs';

const old = '1'.repeat(40);
const next = '2'.repeat(40);
const later = '3'.repeat(40);
const pins = { regular: old, simples: old, danfse: old };
const text = Object.entries(pins).map(([k, sha]) => k.toUpperCase() + '_REV=' + sha).join('\n');
const context = (name, key) => '        ' + name + ': https://github.com/' + projects[key] + '.git#' + old;
const compose = [
  '  regular:', context('upstream', 'regular'),
  '  simples:', context('upstream', 'simples'), context('catalog', 'regular'),
  '  danfse:', context('upstream', 'danfse'),
].join('\n');
const report = () => Object.fromEntries(Object.keys(pins).map(k => [k, { pin: old, head: old, relation: 'identical' }]));

test('manifesto exige três SHAs exatos e nenhum outro campo', () => {
  assert.deepEqual(parseLock(text), pins);
  for (const bad of [text + '\nX=oi', text.replace(old, 'abcd'), text + '\nREGULAR_REV=' + old, text.split('\n')[0]]) {
    assert.throws(() => parseLock(bad));
  }
});
test('sincroniza também o catálogo utilizado pelo Simples e detecta contexto ausente', () => {
  const output = renderCompose(compose, { ...pins, regular: next, danfse: later });
  assert.equal(output.split(next).length - 1, 2);
  assert.equal(output.split(later).length - 1, 1);
  assert.equal(renderCompose(output, { ...pins, regular: next, danfse: later }), output);
  assert.throws(() => renderCompose(compose.split('\n').slice(1).join('\n'), pins));
});
test('atualiza somente a tabela de revisões utilizada pelo README', () => {
  const links = Object.values(projects).map(repo => '[' + old.slice(0, 8) + '](https://github.com/' + repo + '/commit/' + old + ')');
  const doc = 'Caso histórico ' + old + '\n<!-- upstream-pins:start -->\n' + links.join('\n') + '\n<!-- upstream-pins:end -->';
  const revised = renderReadme(doc, { ...pins, regular: next });
  assert.equal(revised.split(next).length - 1, 1);
  assert.ok(revised.startsWith('Caso histórico ' + old));
  assert.throws(() => renderReadme('sem tabela', pins));
});
test('confere o head real da branch padrão de cada projeto e o parentesco da mudança', async () => {
  const calls = [];
  const result = await detect(pins, async route => {
    calls.push(route);
    if (route.endsWith('/commits/trunk')) return { sha: route.includes('simples-nacional') ? next : old };
    if (route.endsWith('/compare/' + old + '...' + next)) return { status: 'ahead' };
    return { default_branch: 'trunk' };
  });
  assert.deepEqual(result.simples, { pin: old, head: next, relation: 'ahead' });
  assert.equal(calls.filter(c => c.includes('/commits/')).length, 3);
  assert.equal(calls.filter(c => c.includes('/compare/')).length, 1);
  assert.deepEqual(candidatePins(result), { ...pins, simples: next });
  assert.throws(() => candidatePins(result, [old, old, old]));
  assert.throws(() => candidatePins({ ...result, simples: { pin: old, head: next, relation: 'diverged' } }));
});
test('falha de consulta ou resposta inválida não gera proposta parcial', async () => {
  await assert.rejects(detect(pins, async route => {
    if (route.includes('gerador-danfse')) throw Error('offline');
    return route.includes('/commits/') ? { sha: old } : { default_branch: 'main' };
  }), /offline/);
  await assert.rejects(detect(pins, async route => route.includes('/commits/') ? { sha: 'main' } : { default_branch: 'main' }), /SHA/);
});
test('mantém uma única issue sem duplicar avisos, reabrindo apenas para revisão diferente', () => {
  const same = report();
  const changed = { ...same, simples: { pin: old, head: next, relation: 'ahead' } };
  assert.equal(reconcileIssue(null, same), null);
  const { create } = reconcileIssue(null, changed);
  assert.match(create.body, /compare\//);
  const open = { ...create, state: 'open' };
  assert.equal(reconcileIssue(open, changed), null);
  assert.equal(reconcileIssue({ ...open, state: 'closed' }, changed), null);
  assert.equal(reconcileIssue(open, same).update.state, 'closed');
  const newer = { ...same, simples: { pin: old, head: later, relation: 'ahead' } };
  assert.equal(reconcileIssue({ ...open, state: 'closed' }, newer).update.state, 'open');
});
