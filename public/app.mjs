import { icon, fillIcons } from './icons.mjs';
import { renderFlow } from './flows.mjs';
import { mountAssistant } from './assistente.mjs';
import { createHistoryEntry, describeCalculationVersion } from './history.mjs';
import { renderDocumentCheck } from './documents.mjs';

const tools = {
  regular: {
    name: 'Regime regular',
    icon: 'layers',
    theme: 'forest',
    desc: 'Veja a CBS e o IBS de uma venda ou prestação de serviço.',
    action: 'Simular operação',
  },
  simples: {
    name: 'Simples Nacional',
    icon: 'store',
    theme: 'blue',
    desc: 'Estime os tributos sobre o consumo de uma operação do Simples.',
    action: 'Simular no Simples',
  },
  danfse: {
    name: 'PDF da NFS-e',
    icon: 'file',
    theme: 'honey',
    desc: 'Transforme o XML de uma nota de serviço já emitida em PDF.',
    action: 'Gerar documento',
  },
};

const titles = {
  inicio: 'Visão geral',
  historico: 'Histórico da sessão',
  ajuda: 'Central de ajuda',
  documentos: 'Conferir CPF ou CNPJ',
  ...Object.fromEntries(Object.entries(tools).map(([key, tool]) => [key, tool.name])),
};

const questions = [
  [
    'Qual ferramenta eu escolho?',
    'Use o regime informado pela contabilidade da empresa. O regime regular calcula tributos sobre uma operação. O Simples Nacional mostra CBS, IBS e eventual Imposto Seletivo daquela operação. Para ver uma nota de serviço nacional já emitida, escolha PDF da NFS-e.',
  ],
  [
    'O resultado do Simples é o valor do DAS?',
    'O DAS reúne a apuração mensal da empresa. O Mesa Fiscal olha uma operação de cada vez. O valor mostrado serve para entender aquela venda ou serviço.',
  ],
  [
    'O que significam CBS e IBS?',
    'A CBS é a Contribuição sobre Bens e Serviços, federal. O IBS é o Imposto sobre Bens e Serviços, de estados e municípios. O resultado apresenta cada tributo separadamente.',
  ],
  [
    'De onde vêm os valores?',
    'Os exemplos educativos partem de casos publicados pela Receita. Você pode alterar a base e as alíquotas nos limites descritos na tela. Na instalação com os motores oficiais ligados, os dados são processados pelas calculadoras locais da Receita.',
  ],
  [
    'Posso conferir um CPF ou CNPJ?',
    'Use Conferir CPF ou CNPJ para verificar formato e dígitos neste navegador. A ferramenta é opcional, não consulta a Receita e não comprova existência, titularidade ou situação cadastral. O número não entra no histórico e é apagado ao limpar ou sair da ferramenta.',
  ],
  [
    'Meu XML e minhas simulações ficam salvos?',
    'O histórico desta aba guarda a ferramenta, a hora, o total da simulação, a origem e a identificação da versão disponível para o cálculo. A revisão prevista de um motor não confirma a versão em execução. Você pode limpar o histórico; ele também é apagado ao recarregar. Para um PDF, registra apenas a geração. O XML é processado no navegador ou, na instalação local, pelo gerador indicado antes do envio. Você pode remover o arquivo selecionado na tela do PDF. Os arquivos baixados ficam na pasta que você escolher.',
  ],
];

const host = document.querySelector('#route');
const main = document.querySelector('main');
const modal = document.querySelector('#chooser');
const sidebar = document.querySelector('.sidebar');
const menuButton = document.querySelector('#menu');
const scrim = document.querySelector('#scrim');
const history = [];
const availability = { regular: false, simples: false, danfse: false };
let lastRoute = '';
let revision = 0;
let clearDocumentView;

async function checkAvailability() {
  if (document.querySelector('meta[name="mesa-edicao"]')) return;

  try {
    const response = await fetch('/api/status', {
      cache: 'no-store', mode: 'same-origin', redirect: 'error', referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return;
    const status = await response.json();
    for (const key of Object.keys(availability)) {
      availability[key] = status[key] === true;
    }
  } catch {
    // Os exemplos estão disponíveis mesmo sem o serviço local.
  }
}
const statusReady = checkAvailability();

// Estes modelos de HTML recebem somente o catálogo e os textos fixos desta página.
// Dados produzidos em uma operação entram no histórico com textContent.
function tile(symbol, color) {
  return `<span class="tile-icon ${color}">${icon(symbol)}</span>`;
}

function pageHeading(title, subtitle) {
  return `
    <div class="home-head">
      <h1>${title}</h1>
      <p class="sub">${subtitle}</p>
    </div>`;
}

function toolCard([key, tool]) {
  return `
    <a href="#${key}" class="tool-card">
      ${tile(tool.icon, tool.theme)}
      <h3>${tool.name}</h3>
      <p>${tool.desc}</p>
      <span class="tool-action">${tool.action} ${icon('chev')}</span>
    </a>`;
}

function sampleRow(key, symbol, color, title, type, summary) {
  return `
    <a class="sample-row" href="#${key}/exemplo">
      ${tile(symbol, color)}
      <span class="sample-label"><b>${title}</b><small>${type}</small></span>
      <span class="tail"><span>${summary}</span>${icon('chev')}</span>
    </a>`;
}

const heroIllustration = `
  <div class="art" aria-hidden="true">
    <div class="paper-stack">
      <div class="sheet back"></div>
      <div class="sheet">
        <div class="paper-top"><span class="paper-mark">≋</span><b class="paper-fold"></b></div>
        <b class="ink-line"></b><b class="ink-line short"></b>
        <div class="mini-chart"><b></b><b></b><b></b><b></b><b></b></div>
        <b class="ink-line"></b>
      </div>
      <div class="art-token">${icon('receipt')}</div>
    </div>
  </div>`;

function home() {
  host.innerHTML = `
    ${pageHeading(titles.inicio, 'Simule tributos e prepare documentos fiscais em um só lugar.')}
    <section class="hero">
      <div class="hero-copy">
        <div class="hero-type"><i data-icon="layers">${icon('layers')}</i>Simulação guiada</div>
        <h2>Quanto pesa o imposto na sua operação?</h2>
        <p>Escolha o regime e veja como cada tributo entra na conta.</p>
        <div class="hero-actions">
          <button class="btn mint" id="start">${icon('plus')}Iniciar simulação</button>
          <a class="hero-link" href="#regular/exemplo">Ver um exemplo</a>
        </div>
      </div>
      ${heroIllustration}
    </section>
    <section class="dash-section">
      <div class="section-heading"><h2>Ferramentas fiscais</h2></div>
      <div class="card-grid">${Object.entries(tools).map(toolCard).join('')}</div>
    </section>
    <section class="dash-section">
      <div class="section-heading"><h2>Conferência de documentos</h2></div>
      <div class="sample-list">
        <a class="sample-row" href="#documentos">
          ${tile('shield', 'forest')}
          <span class="sample-label"><b>Conferir CPF ou CNPJ</b><small>Formato e dígitos, neste navegador</small></span>
          <span class="tail"><span>Opcional</span>${icon('chev')}</span>
        </a>
      </div>
    </section>
    <section class="dash-section">
      <div class="section-heading"><h2>Exemplos para explorar</h2></div>
      <div class="sample-list">
        ${sampleRow('regular', 'grad', 'forest', 'Serviço de educação', 'Regime regular', 'Base de R$ 1.200,00')}
        ${sampleRow('simples', 'cart', 'blue', 'Operação no mercado interno', 'Simples Nacional', 'Base de R$ 950,00')}
      </div>
    </section>`;
  host.querySelector('#start').onclick = () => modal.showModal();
}

function historyRow(operation) {
  const { icon: symbol, theme } = tools[operation.kind];
  const row = document.createElement('div');
  row.className = 'history-row';
  row.innerHTML = tile(symbol, theme);

  const description = document.createElement('div');
  const title = document.createElement('strong');
  const detail = document.createElement('small');
  const amount = document.createElement('strong');
  title.textContent = operation.title;
  detail.textContent = `${operation.time} · ${operation.detail}`;
  amount.textContent = operation.value;
  description.append(title, detail);
  if (operation.kind !== 'danfse') {
    const version = describeCalculationVersion(operation.calculationVersion, operation.kind);
    const details = document.createElement(version.lines.length ? 'details' : 'small');
    details.className = 'history-version';
    if (version.lines.length) {
      const summary = document.createElement('summary');
      summary.textContent = version.summary;
      details.append(summary);
      for (const line of version.lines) {
        const paragraph = document.createElement('p');
        paragraph.textContent = line;
        details.append(paragraph);
      }
    } else details.textContent = version.summary;
    description.append(details);
  }
  row.append(description, amount);
  return row;
}

function historyView() {
  const subtitle = 'Consulte as operações concluídas nesta aba. O histórico é apagado quando você recarrega a página.';
  host.innerHTML = pageHeading(titles.historico, subtitle);
  if (!history.length) {
    host.insertAdjacentHTML('beforeend', `
      <div class="empty panel">
        ${tile('history', 'forest')}
        <h2>Nenhuma operação por aqui ainda</h2>
        <p class="muted">Suas simulações e gerações de PDF aparecem aqui depois de concluídas.</p>
        <a href="#regular/exemplo" class="btn primary">Experimentar com um exemplo</a>
      </div>`);
    return;
  }

  const panel = document.createElement('div');
  panel.className = 'panel';
  const header = document.createElement('div');
  header.className = 'section-heading';
  const count = document.createElement('h2');
  count.textContent = `${history.length} ${history.length === 1 ? 'operação' : 'operações'}`;
  const clear = document.createElement('button');
  clear.className = 'btn secondary';
  clear.textContent = 'Limpar histórico';
  clear.onclick = () => {
    history.length = 0;
    historyView();
  };
  header.append(count, clear);
  panel.append(header, ...history.map(historyRow));
  host.append(panel);
}

function onComplete(operation) {
  const entry = createHistoryEntry(operation);
  if (!entry) return;
  history.unshift(entry);
  if (history.length > 60) history.pop();
}

function questionRow([question, answer]) {
  return `<details><summary>${question}</summary><p>${answer}</p></details>`;
}

function help() {
  host.innerHTML = `
    ${pageHeading(titles.ajuda, 'Respostas rápidas para usar as ferramentas do Mesa Fiscal.')}
    <div class="section-stack">
      <div id="orientacao"></div>
      <section class="panel help-group">
        <h2>Dúvidas frequentes</h2>
        ${questions.map(questionRow).join('')}
      </section>
      <section class="panel">
        <h2>Fontes e instalação</h2>
        <p>O Mesa Fiscal é um projeto independente. As três ferramentas de origem são mantidas pela Receita Federal.</p>
        <ul class="source-list">
          <li><a href="https://github.com/ReceitaFederal/calculadora-rtc-regime-regular" rel="noreferrer">Calculadora do regime regular</a></li>
          <li><a href="https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional" rel="noreferrer">Calculadora do Simples Nacional</a></li>
          <li><a href="https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse" rel="noreferrer">Gerador de DANFSe</a></li>
          <li><a href="https://github.com/ofelipepeixoto/mesa-fiscal#usar-os-motores-da-receita" rel="noreferrer">Como conectar os motores na instalação local</a></li>
        </ul>
      </section>
    </div>`;
  mountAssistant(host.querySelector('#orientacao'));
}

function navigate(kind, mode = 'new') {
  if (!Object.hasOwn(titles, kind)) return;
  const target = `#${kind}${mode === 'example' ? '/exemplo' : ''}`;
  if (location.hash === target) void route();
  else location.hash = target;
}

function closeMenu() {
  sidebar.classList.remove('open');
  scrim.hidden = true;
  menuButton.setAttribute('aria-expanded', 'false');
}

function restoreMenuFocus() {
  closeMenu();
  menuButton.focus();
}

function updateNavigation(key) {
  closeMenu();
  if (modal.open) modal.close();
  document.querySelector('#crumb').textContent = titles[key];
  document.title = `${titles[key]} | Mesa Fiscal`;
  for (const link of document.querySelectorAll('[data-route]')) {
    if (link.dataset.route === key) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

const views = { inicio: home, historico: historyView, ajuda: help,
  documentos: () => { clearDocumentView = renderDocumentCheck(host); } };

async function route() {
  const id = ++revision;
  const [hash, mode] = location.hash.slice(1).split('/');
  if (hash === 'conteudo') {
    main.focus();
    return;
  }
  const key = Object.hasOwn(titles, hash) ? hash : 'inicio';
  clearDocumentView?.();
  clearDocumentView = undefined;
  updateNavigation(key);
  if (Object.hasOwn(views, key)) {
    views[key]();
  } else {
    host.replaceChildren();
    await statusReady;
    if (id !== revision) return;
    renderFlow(key, host, {
      onComplete,
      navigate,
      apiAvailable: availability,
      initialMode: mode === 'exemplo' ? 'example' : 'new',
    });
  }
  if (lastRoute) {
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  lastRoute = key;
}

function choiceButton(key) {
  const tool = tools[key];
  return `
    <button class="choice" data-choose="${key}">
      ${tile(tool.icon, tool.theme)}
      <span><b>${tool.name}</b><small>${tool.desc}</small></span>
    </button>`;
}

fillIcons();
document.querySelector('#today').textContent = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
}).format(new Date());
document.querySelector('#choices').innerHTML = ['regular', 'simples'].map(choiceButton).join('');

modal.addEventListener('click', event => {
  const choice = event.target.closest('[data-choose]');
  if (choice) {
    modal.close();
    navigate(choice.dataset.choose);
  } else if (event.target === modal || event.target.closest('[data-close]')) {
    modal.close();
  }
});
menuButton.onclick = () => {
  sidebar.classList.add('open');
  scrim.hidden = false;
  menuButton.setAttribute('aria-expanded', 'true');
  sidebar.querySelector('[aria-current="page"]')?.focus();
};
scrim.onclick = restoreMenuFocus;
sidebar.addEventListener('click', event => {
  if (event.target.closest('a')) closeMenu();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !scrim.hidden) restoreMenuFocus();
});
window.addEventListener('hashchange', () => void route());
// Limpa o campo antes de congelar a aba e também quando o navegador a restaura.
window.addEventListener('pagehide', () => clearDocumentView?.());
window.addEventListener('pageshow', event => { if (event.persisted) clearDocumentView?.(); });
void route();
