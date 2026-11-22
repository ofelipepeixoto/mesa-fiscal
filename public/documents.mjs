import { validateCpf, validateCnpj } from './document-validators.mjs';

const limitation = 'A conferência não consulta a Receita e não comprova existência, titularidade ou situação cadastral.';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// O número permanece apenas no campo. Nenhum resultado inclui a entrada informada.
export function renderDocumentCheck(host) {
  const page = element('div', 'fiscal-flow');
  const heading = element('header', 'flow-head');
  heading.append(
    element('h1', '', 'Conferir CPF ou CNPJ'),
    element('p', 'muted', 'Confira o formato e os dígitos de um documento, sem consultar cadastros.'),
  );

  const form = element('form', 'panel flow-form');
  form.noValidate = true;
  form.autocomplete = 'off';
  const fields = element('div', 'flow-fields');
  const typeField = element('div', 'field flow-field');
  const typeLabel = element('label', '', 'Tipo de documento');
  typeLabel.htmlFor = 'documento-tipo';
  const type = element('select');
  type.id = 'documento-tipo';
  for (const [value, label] of [['cpf', 'CPF'], ['cnpj', 'CNPJ']]) {
    const option = element('option', '', label);
    option.value = value;
    type.append(option);
  }
  typeField.append(typeLabel, type);

  const numberField = element('div', 'field flow-field');
  const numberLabel = element('label');
  numberLabel.htmlFor = 'documento-numero';
  const number = element('input');
  number.id = 'documento-numero';
  number.type = 'text';
  number.autocomplete = 'off';
  number.spellcheck = false;
  number.setAttribute('autocorrect', 'off');
  const hint = element('p', 'flow-hint');
  hint.id = 'documento-orientacao';
  const privacy = element('p', 'flow-hint', 'O número é conferido neste navegador. Não é enviado nem salvo no histórico.');
  privacy.id = 'documento-privacidade';
  number.setAttribute('aria-describedby', hint.id + ' ' + privacy.id);
  numberField.append(numberLabel, number, hint);
  fields.append(typeField, numberField);

  const actions = element('div', 'action-row');
  const submit = element('button', 'btn primary', 'Conferir');
  submit.type = 'submit';
  const clear = element('button', 'btn secondary', 'Limpar');
  clear.type = 'button';
  actions.append(submit, clear);
  form.append(fields, privacy, actions);

  // O contêiner permanece no DOM para anunciar alterações por tecnologia assistiva.
  const result = element('div');
  result.id = 'documento-resultado';
  result.setAttribute('role', 'status');
  result.setAttribute('aria-live', 'polite');
  result.setAttribute('aria-atomic', 'true');

  function clearResult() {
    result.replaceChildren();
    number.removeAttribute('aria-invalid');
  }

  function showResult(valid, detail) {
    const panel = element('section', valid ? 'panel flow-result' : 'panel flow-result flow-error');
    panel.append(
      element('h2', '', valid ? 'Formato e dígitos conferem' : 'Confira o número informado'),
      element('p', '', detail),
      element('p', 'flow-hint', limitation),
    );
    result.replaceChildren(panel);
    if (valid) number.removeAttribute('aria-invalid');
    else number.setAttribute('aria-invalid', 'true');
  }

  function clearNumber() {
    number.value = '';
    clearResult();
  }

  function updateType() {
    clearNumber();
    const isCnpj = type.value === 'cnpj';
    numberLabel.textContent = isCnpj ? 'CNPJ' : 'CPF';
    number.inputMode = isCnpj ? 'text' : 'numeric';
    number.setAttribute('autocapitalize', isCnpj ? 'characters' : 'off');
    hint.textContent = isCnpj
      ? 'Use 14 caracteres, com ou sem a máscara padrão. As 12 primeiras posições aceitam letras e números; as duas últimas são números.'
      : 'Use 11 números, com ou sem pontos e hífen na máscara padrão. Não acrescente espaços.';
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const valid = type.value === 'cpf' ? validateCpf(number.value) : validateCnpj(number.value);
    showResult(valid, valid
      ? 'O formato e os dois dígitos finais passaram na conferência matemática.'
      : 'Confira o formato e os dois dígitos finais. Não acrescente espaços ou outros caracteres.');
  });
  number.addEventListener('input', clearResult);
  type.addEventListener('change', updateType);
  clear.addEventListener('click', () => {
    clearNumber();
    number.focus();
  });

  // Inputs de texto removem CR/LF por conta própria. Recusar antes evita aceitar
  // silenciosamente uma colagem ou soltura de texto que não passou pelo contrato.
  for (const eventName of ['paste', 'drop']) {
    number.addEventListener(eventName, event => {
      const transfer = eventName === 'paste' ? event.clipboardData : event.dataTransfer;
      if (!/[\r\n]/.test(transfer?.getData('text/plain') || '')) return;
      event.preventDefault();
      clearNumber();
      showResult(false, 'O texto contém uma quebra de linha. Informe o documento em uma única linha.');
    });
  }

  updateType();
  page.append(heading, form, result);
  host.replaceChildren(page);
  // Sem listeners globais: a limpeza também funciona antes de restaurar a aba
  // pelo cache de navegação, mantendo a ferramenta utilizável e o campo vazio.
  return clearNumber;
}
