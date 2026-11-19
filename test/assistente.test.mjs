import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion } from '../public/assistente.mjs';

const questions = {
  pdf: ['Tenho o XML e quero o PDF', 'Onde baixo o PDF da nota de serviço?', 'DANFSe'],
  das: ['Onde emito o DAS?', 'Como emitir o DAS do Simples Nacional?', 'PGDAS-D'],
  tributos: ['O que significa ibs?', 'O que são IBS e CBS?'],
  exemplo: ['Como começar uma simulação?', 'Quero um exemplo guiado'],
  regular: ['Abrir regime regular', 'Regime geral'],
  simples: ['Minha empresa já é do Simples', 'Abrir Simples Nacional'],
  privacidade: ['Quem tem acesso aos dados?', 'Privacidade das minhas notas'],
};
for (const [intent, synonyms] of Object.entries(questions)) {
  test('encaminha perguntas sobre ' + intent, () => {
    for (const question of synonyms) {
      const answer = answerQuestion(question);
      assert.equal(answer.id, intent, question);
      assert.ok(answer.links.length);
      assert.match(answer.links[0][1], /^(?:#(?:danfse|regular|simples|inicio)|https:\/\/www.gov.br\/)/);
    }
  });
}
test('pede contexto para dúvidas misturadas ou não reconhecidas', () => {
  for (const question of ['', {}, ' ‍ ', 'PDF e DAS', 'Regular ou Simples?', 'Explique um neutrino', 'x'.repeat(800)]) {
    assert.equal(answerQuestion(question).id, 'esclarecer');
  }
});
test('direciona decisões fiscais personalizadas para a contabilidade', () => {
  for (const question of ['Qual regime escolher?', 'Qual é a alíquota em 2027?', 'Quanto devo pagar de IBS?', 'O Simples é melhor para mim?']) {
    assert.equal(answerQuestion(question).id, 'orientacao');
  }
});
test('o texto digitado não integra respostas ou links', () => {
  const question = 'Como transformar meu XML em PDF? visitante012345678';
  assert.doesNotMatch(JSON.stringify(answerQuestion(question)), /visitante012345678/);
});
