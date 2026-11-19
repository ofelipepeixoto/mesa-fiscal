const receita = 'https://github.com/ReceitaFederal/calculadora-rtc-';
const guiaDas = 'https://www.gov.br/pt-br/servicos/emitir-das-para-pagamento-de-tributos-do-simples-nacional';
const resposta = (id, titulo, texto, links = []) => ({ id, titulo, texto, links });
const regular = ['Abrir regime regular', '#regular'];
const simples = ['Abrir Simples Nacional', '#simples'];

const topics = [
  [resposta('pdf', 'PDF da nota de serviço', 'Abra o gerador e selecione o XML de uma NFS-e nacional já emitida. Você poderá baixar o documento auxiliar em PDF.', [
    ['Gerar PDF da NFS-e', '#danfse'], ['Projeto do gerador na Receita', receita + 'gerador-danfse'],
  ]), ['Como transformar XML em PDF?', 'Quero o DANFSe', 'Imprimir a nota de serviço', 'Tenho um XML de NFS-e', 'Baixar PDF da nota', 'Como baixo o PDF da nota de serviço?', 'Gerador de documento auxiliar']],
  [resposta('das', 'Guia mensal do Simples Nacional', 'Para emitir o DAS, use o serviço da Receita no gov.br. A simulação do Mesa Fiscal mostra os tributos de um item da operação.', [
    ['Emitir DAS no gov.br', guiaDas],
  ]), ['Como emitir o DAS?', 'DAS', 'Onde emito a guia?', 'Quero pagar a guia mensal', 'Segunda via do boleto do Simples', 'Emitir documento de arrecadação', 'PGDAS-D', 'Onde encontro a guia de pagamento?']],
  [resposta('tributos', 'IBS e CBS', 'O IBS é o imposto de estados e municípios. A CBS é a contribuição federal. O resultado mostra os dois valores separados para o item simulado.', [
    ['Ver uma simulação explicada', '#regular/exemplo'], ['Documentação da calculadora', receita + 'regime-regular'],
  ]), ['O que são IBS e CBS?', 'Diferença entre CBS e IBS', 'O que significa CBS?', 'O que significa IBS?', 'Imposto estadual e municipal', 'Contribuição federal']],
  [resposta('exemplo', 'Comece com um exemplo', 'Escolha uma operação preenchida, mude a base e veja como o resultado muda. Os exemplos usam cenários específicos para estudo.', [
    ['Exemplo de serviço', '#regular/exemplo'], ['Exemplo de venda', '#simples/exemplo'],
  ]), ['Como começar uma simulação?', 'Quero experimentar o sistema', 'Abrir um exemplo guiado', 'Fazer uma projeção sem dados reais', 'Testar com um exemplo', 'Simular um imposto']],
  [resposta('privacidade', 'Privacidade da pergunta', 'Esta pergunta é interpretada no seu navegador. O assistente não envia o texto a um modelo, não grava as perguntas e não precisa de CPF, CNPJ ou XML.', [
    ['Voltar à visão geral', '#inicio'], ['Consultar o código local', './assistente.mjs'],
  ]), ['Minha pergunta fica salva?', 'Quem tem acesso aos dados?', 'Privacidade das minhas notas', 'O texto sai do navegador?', 'Privacidade e dados pessoais', 'Vocês armazenam minhas perguntas?', 'Minha pergunta é enviada para uma IA?']],
  [resposta('regular', 'Operação no regime regular', 'Se a contabilidade já confirmou o regime regular da operação, abra essa calculadora. O exemplo de educação mostra onde informar os valores.', [
    regular, ['Projeto da Receita', receita + 'regime-regular'],
  ]), ['Abrir regime regular', 'Minha operação é do regime regular', 'Usar calculadora do regime geral', 'Regime normal de tributação']],
  [resposta('simples', 'Operação no Simples Nacional', 'Se a contabilidade confirmou o Simples Nacional (CRT 1), abra a simulação de um item. Você pode começar pela venda de mercadoria do exemplo.', [
    simples, ['Projeto da Receita', receita + 'simples-nacional'],
  ]), ['Abrir Simples Nacional', 'Minha empresa já é do Simples', 'Quero simular no Simples Nacional', 'Operação CRT 1']],
];

const ajudaFiscal = resposta('orientacao', 'Confirme os dados com sua contabilidade', 'O regime, a classificação e as alíquotas dependem da operação. Com esses dados confirmados, escolha a ferramenta correspondente para fazer a simulação.', [regular, simples]);
const desconhecida = resposta('esclarecer', 'Qual tarefa você quer fazer?', 'Faça uma pergunta por vez, como “Quero o PDF da NFS-e” ou “Onde encontro o DAS?”.');

const stopwords = new Set('a as o os e do da de dos ao na no nas nos um uma uns para por que qual quais meu minha me se como sao tenho quero ja onde fica minha minhas voce voces'.split(' '));
function terms(value) {
  let plain = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\bnfs[\s-]?e\b/g, 'nfse').replace(/\bpgdas[\s-]?d\b/g, 'pgdas')
    .replace(/\bdas\s+(minhas?|suas?|notas|perguntas|pessoas|empresas)\b/g, '$1');
  if (!/\bDAS\b/.test(value) && plain.trim() !== 'das' &&
      !/\b(o|um|meu|emitir|emito|pagar|gerar|guia) das\b/.test(plain)) {
    plain = plain.replace(/\bdas\b/g, '');
  }
  return new Set((plain.match(/[a-z0-9]+/g) || []).filter(t => !stopwords.has(t)));
}

const samples = topics.flatMap(([answer, phrases]) => phrases.map(phrase => ({ answer, tokens: terms(phrase) })));
const frequencies = new Map();
for (const { tokens } of samples) {
  for (const token of tokens) frequencies.set(token, (frequencies.get(token) || 0) + 1);
}
function weight(token) {
  return 1 + Math.log((samples.length + 1) / (1 + (frequencies.get(token) || 0)));
}
function similarity(query, example) {
  let dot = 0, queryNorm = 0, exampleNorm = 0;
  for (const token of query) {
    const square = weight(token) ** 2;
    queryNorm += square;
    if (example.has(token)) dot += square;
  }
  for (const token of example) exampleNorm += weight(token) ** 2;
  return dot / Math.sqrt(queryNorm * exampleNorm);
}

export function answerQuestion(question) {
  if (typeof question !== 'string' || question.length > 320) return desconhecida;
  const query = terms(question);
  if (!query.size) return desconhecida;
  const sentence = [...query].join(' ');
  if (/enquadr|aliquota|percentual|quanto (pagar|devo|pago)|melhor regime|regime (escolher|usar|adotar)|regime empresa|mais vantajoso|pago menos/.test(sentence) ||
      (query.has('melhor') && (query.has('regular') || query.has('simples')))) return ajudaFiscal;
  // Duas tarefas com destinos distintos precisam de esclarecimento.
  const anchors = [['danfse','pdf','xml','nfse'], ['das','pgdas','boleto'], ['privacidade'], ['regular','geral'], ['simples']];
  const distinct = anchors.map(group => group.some(token => query.has(token)));
  if ((distinct[0] && (distinct[1] || distinct[2])) || (distinct[3] && distinct[4])) return desconhecida;

  const ranking = topics.map(([answer]) => ({
    answer,
    score: Math.max(...samples.filter(s => s.answer === answer).map(s => similarity(query, s.tokens))),
  })).sort((a, b) => b.score - a.score);
  if (ranking[0].score < 0.49 || ranking[0].score - ranking[1].score < 0.11) return desconhecida;
  return ranking[0].answer;
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function mountAssistant(container) {
  const section = element('section', '', 'panel');
  const form = element('form');
  const label = element('label', 'O que você quer fazer?', 'field');
  const input = element('input');
  input.type = 'text';
  input.maxLength = 320;
  input.autocomplete = 'off';
  input.placeholder = 'Ex.: Como transformar o XML em PDF?';
  label.append(input);
  const actions = element('div', '', 'action-row');
  const submit = element('button', 'Perguntar', 'btn primary');
  submit.type = 'submit';
  actions.append(submit);
  const result = element('div');
  result.setAttribute('role', 'status');
  result.setAttribute('aria-live', 'polite');
  result.setAttribute('aria-atomic', 'true');
  function display(question) {
    const answer = answerQuestion(question);
    const card = element('div', '', 'callout');
    card.append(element('strong', answer.titulo), element('p', answer.texto));
    if (answer.links.length) {
      const nav = element('div', '', 'action-row');
      for (const [text, href] of answer.links) {
        const link = element('a', text, 'text-link');
        link.href = href;
        if (href.startsWith('https:')) link.rel = 'noreferrer';
        nav.append(link);
      }
      card.append(nav);
    }
    result.replaceChildren(card);
  }
  for (const [title, question] of [['Gerar um PDF', 'Como transformar XML em PDF?'], ['Encontrar o DAS', 'Como emitir o DAS?'], ['Entender IBS e CBS', 'O que são IBS e CBS?']]) {
    const button = element('button', title, 'btn secondary');
    button.type = 'button';
    button.addEventListener('click', () => { input.value = question; display(question); });
    actions.append(button);
  }
  form.addEventListener('submit', event => { event.preventDefault(); display(input.value); });
  form.append(label, actions);
  section.append(element('h2', 'Assistente de navegação'), element('p', 'Tire dúvidas sobre as ferramentas. A pergunta fica neste navegador.'), form, result);
  container.append(section);
}
