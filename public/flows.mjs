import { regularExample, projectEducation } from './regular-study.mjs';
import { simplesExample, estimateSimples } from './simples-study.mjs';

const labels = {
  regular: ['Regime regular', 'Simule o IBS e a CBS de uma operação com um produto ou serviço.'],
  simples: ['Simples Nacional', 'Veja quanto de IBS e CBS incide sobre um item vendido no Brasil.'],
  danfse: ['PDF da nota de serviço', 'Transforme o XML de uma NFS-e nacional já emitida em um documento para leitura ou impressão.'],
};
const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function currency(value) {
  const [whole, decimal = ''] = String(value).replace(',', '.').split('.');
  return formatter.formatToParts(BigInt(whole))
    .map(part => part.type === 'fraction' ? decimal.padEnd(2,'0') : part.value).join('');
}
const make = (tag, cls, content) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (content !== undefined) node.textContent = content;
  return node;
};
function pack(parent, ...children) { parent.append(...children); return parent; }
function button(label, cls = 'btn secondary') {
  const control = make('button', cls, label);
  control.type = 'button';
  return control;
}
function anchor(label, href, download) {
  const link = make('a', 'btn secondary', label);
  link.href = href;
  if (download) link.download = download;
  return link;
}
function description(text) { return make('p', 'flow-hint', text); }
function heading(title, caption) {
  return pack(make('header', 'flow-head'), make('h1', '', title), make('p', 'muted', caption));
}
function blockTitle(title) { return make('h2', 'section-heading', title); }
function amountInput(label, value, unit = 'R$', hint) {
  const input = make('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.required = true;
  input.autocomplete = 'off';
  input.maxLength = unit === '%' ? 10 : 22;
  input.value = String(value).replace('.', ',');
  input.pattern = unit === '%' ? '[0-9]{1,3}([,.][0-9]{1,4})?' : '([0-9]+|[0-9]{1,3}([.][0-9]{3})+)(,[0-9]{1,2})?|[0-9]+[.][0-9]{1,2}';
  input.title = unit === '%' ? 'Use um percentual entre 0 e 100, com até quatro casas decimais.' : 'Use um valor em reais, como 1.250,00.';
  if (unit === '%') input.addEventListener('input', () => {
    input.setCustomValidity(Number(input.value.replace(',', '.')) > 100 ? 'Use um percentual entre 0 e 100.' : '');
  });
  const field = make('div', 'field flow-field');
  const caption = make('label', '', label);
  const group = pack(make('div', 'flow-input-unit'), make('span', '', unit), input);
  const id = 'fiscal-' + (++fieldId);
  input.id = id;
  caption.htmlFor = id;
  field.append(caption, group);
  if (hint) addHint(field, input, hint);
  return { node: field, control: input, read: () => {
    const raw = input.value.trim();
    if (unit === '%' && Number(raw.replace(',', '.')) > 100) throw new Error('Confira o percentual em “' + label + '”. Ele deve ficar entre 0 e 100.');
    if (unit === 'R$' && (raw.includes(',') || /^\d{1,3}(?:\.\d{3})+$/.test(raw))) return raw.replaceAll('.', '').replace(',', '.');
    return raw.replace(',', '.');
  } };
}
let fieldId = 0;
function addHint(field, input, text) {
  const hint = make('small', 'flow-hint', text);
  hint.id = input.id + '-dica';
  input.setAttribute('aria-describedby', hint.id);
  field.append(hint);
}
function basicField(label, opts = {}) {
  const { options, type = 'text', value, hint, pattern, digits } = opts;
  const input = make(options ? 'select' : 'input');
  input.required = true;
  input.id = 'fiscal-' + (++fieldId);
  if (options) {
    for (const [val, name] of options) {
      const option = make('option', '', name);
      option.value = val;
      input.append(option);
    }
  } else {
    input.type = type;
    if (pattern) input.pattern = pattern;
    if (digits) { input.inputMode = 'numeric'; input.maxLength = digits; }
    input.autocomplete = 'off';
  }
  input.value = value ?? '';
  const caption = make('label', '', label);
  caption.htmlFor = input.id;
  const field = pack(make('div', 'field flow-field'), caption, input);
  if (hint) addHint(field, input, hint);
  return {node: field, control: input, read: () => input.value};
}
function fields(...entries) { return pack(make('div', 'fields flow-fields'), ...entries.map(e => e.node)); }
function disclosure(title, ...nodes) {
  return pack(make('details', 'flow-details'), make('summary', '', title), ...nodes);
}
const states = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
function scenarioText(kind) {
  return kind === 'regular' ? 'Serviço de educação em Porto Alegre (RS), em 10/03/2027. O exemplo aplica redução de 60% às alíquotas informadas.' : 'Venda de um produto no Brasil em 15/03/2027, com nota modelo 55. O exemplo usa valores e percentuais fictícios.';
}
function codeFields(kind, defaults) {
  if (kind === 'regular') {
    const type = basicField('O que será vendido?', {options: [['produto','Produto'], ['servico','Serviço']], value: defaults.kind});
    const classification = basicField('Código do produto ou serviço', {value: defaults.classification, digits: 9, pattern:'[0-9]{9}', hint:'Use o NCM do produto (8 dígitos) ou o NBS do serviço (9 dígitos).'});
    const update = () => { classification.control.pattern = type.read() === 'produto' ? '[0-9]{8}' : '[0-9]{9}'; };
    update();
    type.control.addEventListener('change', update);
    return {
      date: basicField('Data da operação', {type:'date',value:defaults.date}), uf: basicField('Estado da operação', {options:states.map(s => [s,s]),value:defaults.uf}),
      municipio: basicField('Código IBGE do município', {value:defaults.municipio, digits:7, pattern:'[0-9]{7}', hint:'Use os 7 dígitos do município onde o imposto é devido.'}), kind: type, classification,
      cst: basicField('Situação tributária (CST)', {value:defaults.cst, digits:3, pattern:'[0-9]{3}'}),
      cClassTrib: basicField('Classificação tributária', {value:defaults.cClassTrib, digits:6, pattern:'[0-9]{6}',hint:'Código cClassTrib de 6 dígitos do item.'}),
    };
  }
  return {
    data: basicField('Data da operação', {type:'date',value:defaults.data}),
    documento: basicField('Tipo de nota', {options:[['55','NF-e · Nota fiscal eletrônica'],['65','NFC-e · Nota fiscal ao consumidor']],value:defaults.documento}),
    atividade: basicField('Código da atividade', {value:defaults.atividade,digits:2,pattern:'[0-9]{2}',hint:'Use os 2 dígitos da atividade no catálogo do motor.'}),
    classificacao: basicField('Classificação tributária', {value:defaults.classificacao,digits:6,pattern:'[0-9]{6}',hint:'Código cClassTrib de 6 dígitos do item.'}),
  };
}
function modeButton(value, label, active) {
  const b = button(label, 'flow-mode');
  b.value = value;
  b.setAttribute('aria-pressed', String(active));
  return b;
}
function activityLookup(codes) {
  const find = button('Consultar atividades compatíveis');
  const responseBox = make('div','flow-activities');
  responseBox.setAttribute('aria-live','polite');
  const criteria = ['data','documento','classificacao'].map(key => codes[key]);
  const current = () => new URLSearchParams({data:codes.data.read(),documento:codes.documento.read(),classificacao:codes.classificacao.read()}).toString();
  criteria.forEach(entry => entry.control.addEventListener('input',() => responseBox.replaceChildren()));
  find.addEventListener('click', async () => {
    if (criteria.some(entry => !entry.control.reportValidity())) return;
    const query = current();
    find.disabled = true; responseBox.textContent = 'Consultando atividades…';
    try {
      const response = await callEngine('/api/atividades?' + query, {method:'GET'});
      const json = await response.json();
      const available = Array.isArray(json) ? json : json.atividades;
      if (!Array.isArray(available)) throw new Error('O serviço não devolveu a lista de atividades.');
      if (query !== current()) return;
      if (!available.length) { responseBox.textContent = 'Nenhuma atividade disponível para essa combinação.'; return; }
      const picker = basicField('Atividades compatíveis', {options:[['','Selecione uma atividade'],...available.map(a => [a.codigo,a.codigo + ' · ' + a.descricao])]});
      picker.control.required = false;
      picker.control.addEventListener('change', () => {
        if (!picker.read()) return;
        codes.atividade.control.value = picker.read();
        codes.atividade.control.dispatchEvent(new Event('input',{bubbles:true}));
      });
      responseBox.replaceChildren(picker.node);
    } catch(err) {
      if (query === current()) responseBox.textContent = err.message;
    } finally { find.disabled = false; }
  });
  return pack(make('div', 'flow-lookup'),find,responseBox);
}
function errorBox() {
  const box = make('div', 'callout flow-error');
  box.hidden = true;
  box.tabIndex = -1;
  box.setAttribute('role', 'alert');
  return box;
}
function showError(box, message) { box.textContent = message; box.hidden = false; box.focus(); }
function card(label, amount, total = false) {
  return pack(make('div', 'result-card' + (total ? ' flow-sum' : '')), make('span', 'muted', label), make('strong','',amount));
}
function resultOrigin(result, official) {
  if (!official) return 'Projeção de exemplo';
  return result.status === 'simulado' ? 'Simulação do motor da Receita' : 'Calculado pelo motor da Receita';
}
function differenceText(total, original) {
  const inCents = value => {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2,'0'));
  };
  const difference = inCents(total) - inCents(original);
  const starting = currency(original);
  if (difference === 0n) return 'O total continua em ' + starting + ', igual ao exemplo original.';
  const magnitude = difference < 0n ? -difference : difference;
  const amount = currency(String(magnitude / 100n) + '.' + String(magnitude % 100n).padStart(2,'0'));
  return 'O total ' + (difference > 0n ? 'subiu ' : 'caiu ') + amount + ' em relação ao exemplo original de ' + starting + '.';
}
function presentResult(result, host, official, kind, originalTotal) {
  const amounts = [result?.total, result?.cbs, result?.ibs];
  if (result?.is != null) amounts.push(result.is);
  if (amounts.some(value => !/^\d{1,20}(?:\.\d{1,2})?$/.test(String(value)))) throw new Error('A resposta veio incompleta. Confira se o serviço está atualizado e tente novamente.');
  const content = make('section','panel flow-result');
  content.tabIndex = -1;
  const title = blockTitle(official ? resultOrigin(result,true) : 'Resultado da projeção');
  const grid = make('div', 'result-grid flow-results');
  grid.append(card('Total dos tributos do item', currency(result.total), true), card('CBS · contribuição federal', currency(result.cbs)), card('IBS · imposto estadual e municipal', currency(result.ibs)));
  if (result.is != null) grid.append(card('IS · imposto seletivo', currency(result.is)));
  content.append(title, grid);
  if (originalTotal !== undefined) content.append(make('p','flow-comparison',differenceText(result.total, originalTotal)));
  const info = Array.isArray(result.memoria) ? result.memoria.filter(s => typeof s === 'string') : [];
  if (info.length) content.append(disclosure('Entender o cálculo', ...info.map(description)));
  host.replaceChildren(content);
  content.focus();
}
async function callEngine(url, init) {
  let response;
  try { response = await fetch(url, init); }
  catch { throw new Error('Não conseguimos acessar o serviço. Verifique a conexão e tente novamente.'); }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error([data.error, data.message].find(v => typeof v === 'string') || 'O serviço não concluiu a operação. Confira os campos e tente novamente.');
  }
  return response;
}
function renderCalculator(kind, host, opts) {
  const canCall = Boolean(opts.apiAvailable?.[kind]);
  let official = canCall && opts.initialMode !== 'example';
  const defaults = kind === 'regular' ? regularExample.input : simplesExample.input;
  const modebar = make('div', 'flow-modes');
  modebar.setAttribute('role', 'group');
  modebar.setAttribute('aria-label','Origem do cálculo');
  const studyMode = modeButton('study','Exemplo guiado',!official);
  const realMode = modeButton('official','Motor da Receita',official);
  realMode.disabled = !canCall;
  modebar.append(studyMode, realMode);
  const main = make('div','flow-body');
  host.append(heading(...labels[kind]), modebar, main);
  const views = new Map();
  const updateMode = mode => {
    official = mode;
    studyMode.setAttribute('aria-pressed',String(!mode));
    realMode.setAttribute('aria-pressed',String(mode));
    if (!views.has(mode)) views.set(mode, makeCalcForm(mode));
    main.replaceChildren(views.get(mode));
  };
  studyMode.addEventListener('click',() => updateMode(false));
  realMode.addEventListener('click',() => updateMode(true));
  updateMode(official);
  function makeCalcForm(isOfficial) {
    const wrap = make('div','flow-stack');
    const form = make('form','panel flow-form');
    const title = isOfficial ? 'Dados da operação' : kind === 'regular' ? 'Simular um serviço de educação' : 'Simular uma venda de produto';
    form.append(blockTitle(title));
    const lead = isOfficial ? 'Os campos começam com os dados de um exemplo. Confira e substitua os dados antes de calcular.' : scenarioText(kind);
    form.append(description(lead));
    if (kind === 'simples') form.append(description('Esta simulação calcula os tributos de um item. A apuração do DAS mensal é feita à parte.'));
    if (!isOfficial && !canCall) {
      const online = document.querySelector('meta[name="mesa-edicao"]')?.content === 'navegador';
      const availability = online ? 'Na versão online, você pode explorar este exemplo. Outras operações estão disponíveis na instalação local.' : 'O motor da Receita está desconectado. O exemplo funciona neste navegador.';
      form.append(make('p','flow-status',availability));
    }
    const original = kind === 'regular' ? regularExample.source : 'https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional/blob/c5b0f01c8351c3f0d0795cc617b29d233e9f98df/src/test/java/br/gov/serpro/rtc/testesintegracao/simplesnacional/SimplesNacionalControllerTest.java#L41-L97';
    let codes;
    if (isOfficial) {
      codes = codeFields(kind,defaults);
      form.append(fields(...Object.values(codes)));
      if (kind === 'simples') form.append(activityLookup(codes));
    } else {
      const source = make('a','flow-source','Consultar o exemplo da Receita');
      source.href = original;
      source.target = '_blank'; source.rel = 'noreferrer';
      const exact = kind === 'regular' ? 'NBS 122011200 · CST 200 · cClassTrib 200028 · Município IBGE 4314902.' : 'NF-e modelo 55 · Venda ou revenda de mercadoria (atividade 01) · cClassTrib 000001 · Regime CRT 1.';
      form.append(disclosure('Ver os dados fixos do exemplo',description(exact), source));
    }
    const base = amountInput(isOfficial ? 'Base de cálculo' : 'Valor usado no cálculo',defaults.base,'R$',isOfficial ? 'Use o valor sobre o qual os percentuais serão aplicados.' : 'Você pode trocar este valor para ver como o total dos tributos muda.');
    const entries = kind === 'regular' ? {
      cbs:amountInput('Alíquota da CBS',defaults.rates.cbs,'%'),
      ibsEstadual:amountInput('Alíquota estadual do IBS',defaults.rates.ibsEstadual,'%'),
      ibsMunicipal:amountInput('Alíquota municipal do IBS',defaults.rates.ibsMunicipal,'%'),
    } : {
      aliquotaIbs:amountInput('Alíquota efetiva do IBS',defaults.aliquotaIbs,'%'),
      aliquotaCbs:amountInput('Alíquota efetiva da CBS',defaults.aliquotaCbs,'%'),
      impostoSeletivo:amountInput('Imposto seletivo já calculado',defaults.impostoSeletivo,'R$', 'Informe zero se o imposto não fizer parte deste item.'),
    };
    form.append(fields(base));
    const rateFields = fields(...Object.values(entries));
    if (isOfficial) form.append(rateFields);
    else form.append(disclosure('Ajustar alíquotas e impostos do exemplo',rateFields),description('Os percentuais e impostos do exemplo já estão preenchidos.'));
    form.addEventListener('invalid', event => {
      const details = event.target.closest('details');
      if (details) details.open = true;
    },true);
    const regularRatesApply = () => !isOfficial || kind !== 'regular' || codes.date.read() >= '2027-01-01';
    if (isOfficial && kind === 'regular') {
      const toggle = () => {
        rateFields.hidden = !regularRatesApply();
        for (const item of Object.values(entries)) item.control.disabled = !regularRatesApply();
      };
      codes.date.control.addEventListener('input',toggle);
      toggle();
    }
    const output = make('div','flow-output');
    const error = errorBox();
    const submit = button(isOfficial ? 'Calcular no motor' : 'Calcular projeção','btn primary');
    const idleText = submit.textContent;
    submit.type = 'submit';
    form.append(error, pack(make('div', 'action-row'), submit));
    let revision = 0;
    form.addEventListener('input',() => { ++revision; output.replaceChildren(); error.hidden = true; });
    form.addEventListener('submit',async e => {
      e.preventDefault();
      if (submit.disabled) return;
      const currentRevision = revision;
      submit.disabled = true; submit.textContent = 'Calculando…';
      form.setAttribute('aria-busy','true'); error.hidden = true;
      try {
        const inputs = {...defaults,base:base.read()};
        if (codes) for (const [name,entry] of Object.entries(codes)) inputs[name] = entry.read();
        if (regularRatesApply()) {
          const edit = Object.fromEntries(Object.entries(entries).map(([key,entry]) => [key,entry.read()]));
          if (kind === 'regular') inputs.rates = edit;
          else Object.assign(inputs,edit);
        } else { delete inputs.rates; }
        let result;
        if (isOfficial) {
          const response = await callEngine('/api/' + kind, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(inputs)});
          const json = await response.json(); result = json.result ?? json;
        } else { result = kind === 'regular' ? projectEducation(inputs) : estimateSimples(inputs); }
        if (currentRevision !== revision || !form.isConnected) return;
        let originalTotal;
        if (!isOfficial) {
          const normalized = value => String(value).replace(/^0+(?=\d)/,'').replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
          const originalEntries = kind === 'regular' ? defaults.rates : defaults;
          const edited = normalized(inputs.base) !== normalized(defaults.base) ||
            Object.entries(entries).some(([key,entry]) => normalized(entry.read()) !== normalized(originalEntries[key]));
          if (edited) originalTotal = kind === 'regular' ? regularExample.result.total : simplesExample.result.total;
        }
        presentResult(result, output, isOfficial, kind, originalTotal);
        opts.onComplete?.({kind,title:labels[kind][0],value:currency(result.total),detail:resultOrigin(result,isOfficial)});
      } catch (err) {
        if (form.isConnected && currentRevision === revision) showError(error, err.message);
      } finally { submit.textContent = idleText; submit.disabled = false; form.removeAttribute('aria-busy'); }
    });
    return pack(wrap,form,output);
  }
}

function downloadDocument(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = anchor('Baixar PDF', url, name);
  document.body.append(link);
  link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
function renderDocument(host, opts) {
  const form = make('form','panel flow-form');
  const info = description('Escolha o arquivo que recebeu ao emitir a nota. O arquivo deve estar em XML, com até 5 MiB.');
  form.append(blockTitle('Escolher a nota'), info);
  const file = make('input');
  file.type = 'file'; file.id = 'danfse-arquivo'; file.accept='.xml,application/xml,text/xml';
  const caption = make('label','','Arquivo XML da nota'); caption.htmlFor = file.id;
  const fileField = pack(make('div','field flow-upload'), caption, file);
  const useExample = button('Usar o XML de exemplo');
  const choice = make('p','flow-status'); choice.setAttribute('aria-live','polite');
  form.append(fileField, pack(make('div','action-row'),useExample), choice);
  const status = basicField('Situação da nota', {options:[['0','Válida'],['1','Substituída'],['2','Cancelada']],value:'0',hint:'Informe a situação que consta no seu documento. O gerador não consulta a situação da nota.'});
  const chk = make('input'); chk.type='checkbox'; chk.id='danfse-canhoto';
  const receipt = make('label','flow-check'); receipt.htmlFor = chk.id;
  receipt.append(chk, document.createTextNode('Incluir canhoto de recebimento'));
  form.append(disclosure('Opções do PDF',fields(status),receipt));
  const service = make('p','flow-status','Verificando o gerador de PDF…'); service.setAttribute('aria-live','polite');
  const submit = button('Gerar PDF','btn primary'); submit.type='submit'; submit.disabled = true;
  const errors = errorBox();
  const result = make('div','flow-output');
  form.append(service,errors,pack(make('div','action-row'),submit));
  const examples = make('section','panel flow-examples');
  const xmlLink = anchor('Baixar XML de exemplo','/exemplo-nfse.xml','exemplo-nfse.xml');
  const pdfLink = anchor('Ver PDF ilustrativo','/exemplo-danfse.pdf'); pdfLink.target='_blank'; pdfLink.rel='noreferrer';
  examples.append(blockTitle('Conheça os arquivos'),description('Use estes arquivos fictícios para ver como um XML e um PDF de nota se apresentam.'),pack(make('div','action-row'),xmlLink,pdfLink));
  host.append(heading(...labels.danfse), form, result, examples);
  let example = opts.initialMode === 'example';
  let backend = null;
  let wasm;
  let revision = 0;
  let busy = false;
  function syncChoice() {
    submit.disabled = busy || !backend || (!example && !file.files?.[0]);
    useExample.setAttribute('aria-pressed',String(example));
    useExample.textContent = example ? 'XML de exemplo selecionado' : 'Usar o XML de exemplo';
    choice.textContent = example ? 'O gerador usará uma nota fictícia.' : '';
  }
  function resetResult() { ++revision; result.replaceChildren(); errors.hidden=true; }
  useExample.addEventListener('click',() => { example = true; file.value = ''; resetResult(); syncChoice(); });
  file.addEventListener('change',() => { example = false; resetResult(); syncChoice(); });
  form.addEventListener('input',resetResult);
  syncChoice();
  async function selectEngine() {
    try {
      wasm = await import('./danfse-browser.mjs');
      if (await wasm.browserDanfseAvailable()) backend = 'wasm';
    } catch { /* O pacote pode ser usado sem o gerador de navegador. */ }
    if (!backend && opts.apiAvailable?.danfse) backend = 'server';
    service.textContent = backend === 'wasm' ? 'O PDF será gerado neste navegador. O XML fica neste dispositivo.' : backend === 'server' ? 'O arquivo será processado pelo gerador local ao clicar em Gerar PDF.' : 'O gerador está desconectado. Você pode consultar o XML e o PDF de exemplo abaixo.';
    syncChoice();
  }
  selectEngine();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (submit.disabled) return;
    const currentRevision = revision;
    const engine = backend;
    busy = true; syncChoice();
    submit.textContent = 'Gerando PDF…'; form.setAttribute('aria-busy','true'); errors.hidden = true;
    try {
      let xml;
      if (example) {
        const sample = await callEngine('/exemplo-nfse.xml',{method:'GET'}); xml = await sample.text();
      } else {
        const picked = file.files?.[0];
        if (!picked) throw new Error('Selecione o XML da nota ou use o exemplo.');
        if (picked.size > 5 * 1024 * 1024) throw new Error('O XML excede o limite de 5 MiB. Confira o arquivo selecionado.');
        try { xml = new TextDecoder('utf-8',{fatal:true}).decode(await picked.arrayBuffer()); }
        catch { throw new Error('O XML precisa estar no formato UTF-8. Use o arquivo original da nota.'); }
      }
      if (currentRevision !== revision || !form.isConnected) return;
      let pdf;
      const s = status.read(); const receiptIncluded = chk.checked;
      if (engine === 'wasm') {
        pdf = await wasm.generateBrowserDanfse(xml, {status:s,receipt:receiptIncluded});
      } else {
        const params = new URLSearchParams({stc:s,canhoto:String(receiptIncluded)});
        const response = await callEngine('/api/danfse?' + params, {method:'POST',headers:{'Content-Type':'application/xml','Accept':'application/pdf'},body:xml});
        if (!response.headers.get('content-type')?.startsWith('application/pdf')) throw new Error('O gerador devolveu um formato inesperado. Tente novamente.');
        pdf = await response.blob();
      }
      if (currentRevision !== revision || !form.isConnected) return;
      const resultBox = make('section','panel flow-result'); resultBox.tabIndex=-1;
      const save = button('Baixar PDF','btn primary'); save.addEventListener('click',()=>downloadDocument(pdf,example?'danfse-exemplo.pdf':'danfse.pdf'));
      resultBox.append(blockTitle('Seu PDF está pronto'),description(engine==='wasm' ? 'Processado neste navegador.' : 'Processado pelo gerador local.'),save);
      result.replaceChildren(resultBox); resultBox.focus();
      opts.onComplete?.({kind:'danfse',title:'PDF da nota de serviço',value:'PDF',detail:example ? 'Nota fictícia' : 'Documento gerado'});
    } catch(err) {
      if (form.isConnected && currentRevision === revision) showError(errors,err.message);
    } finally { busy=false; submit.textContent='Gerar PDF'; form.removeAttribute('aria-busy'); syncChoice(); }
  });
}

export function renderFlow(kind, container, options = {}) {
  if (!Object.hasOwn(labels,kind)) throw new Error('Ferramenta desconhecida.');
  const scope = make('div','fiscal-flow');
  container.replaceChildren(scope);
  if (kind === 'danfse') renderDocument(scope,options);
  else renderCalculator(kind,scope,options);
}
