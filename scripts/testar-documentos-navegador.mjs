import assert from 'node:assert/strict';

const elementKey = 'element-6066-11e4-a52e-4f735466cecf';
const inputSelector = '#documento-numero';
const statusSelector = '#documento-resultado';

// Todos os documentos abaixo são vetores públicos/sintéticos, sem consulta cadastral.
// As mensagens de teste não incluem seus valores nem o conteúdo de cookies/storage.
export async function verifyDocumentCheck({ command, session, click, checkScreen, requests, origin }) {
  const evaluate = (script, args = []) => command(session + '/execute/sync', { script, args });
  const find = async selector => {
    const found = await command(session + '/element', { using: 'css selector', value: selector });
    return '/element/' + found[elementKey];
  };
  async function typeText(text, { enter = false } = {}) {
    const input = await find(inputSelector);
    await command(session + input + '/clear', {});
    const keys = text + (enter ? '\uE007' : '');
    await command(session + input + '/value', { text: keys, value: [...keys] });
  }
  async function navigate(route, title) {
    await click('#menu');
    await click('.sidebar [data-route=' + route + ']');
    await checkScreen('#' + route, title);
  }
  async function status() {
    return evaluate(`
      const result = document.querySelector('#documento-resultado');
      const input = document.querySelector('#documento-numero');
      return {title: result.querySelector('h2')?.textContent || '', text: result.textContent,
        role: result.getAttribute('role'), live: result.getAttribute('aria-live'), atomic: result.getAttribute('aria-atomic'),
        invalid: input.getAttribute('aria-invalid'), value: input.value, focus: document.activeElement?.id};
    `);
  }
  async function privacySnapshot() {
    return evaluate(`
      const values = storage => JSON.stringify(Object.keys(storage).sort().map(key => [key, storage.getItem(key)]));
      return {href: location.href, local: values(localStorage), session: values(sessionStorage), cookies: document.cookie};
    `);
  }
  async function drainedStatus() {
    const ready = await command(session + '/execute/async', { args: [origin], script: `
      const [origin, done] = arguments;
      const deadline = performance.now() + 6000;
      function inspect() {
        const staticEdition = !!document.querySelector('meta[name="mesa-edicao"]');
        const completed = performance.getEntriesByName(origin + '/api/status').length > 0;
        if (staticEdition || completed) done(true);
        else if (performance.now() >= deadline) done(false);
        else requestAnimationFrame(inspect);
      }
      inspect();
    `});
    assert.ok(ready, 'A leitura inicial de disponibilidade deve terminar antes de medir as requisições.');
  }
  async function assertPrivacy(snapshot, count) {
    const current = await privacySnapshot();
    assert.ok(requests.length === count, 'Conferir ou limpar documento não deve fazer requisições.');
    assert.ok(current.href === snapshot.href, 'O documento não deve alterar a URL.');
    assert.ok(current.local === snapshot.local, 'A conferência não deve alterar localStorage.');
    assert.ok(current.session === snapshot.session, 'A conferência não deve alterar sessionStorage.');
    assert.ok(current.cookies === snapshot.cookies, 'A conferência não deve alterar cookies.');
  }
  async function checkResult(valid, vector) {
    const current = await status();
    assert.ok(current.title === (valid ? 'Formato e dígitos conferem' : 'Confira o número informado'),
      'O resultado deve indicar apenas a conferência matemática.');
    assert.ok(current.text.includes('não comprova existência, titularidade ou situação cadastral'),
      'O resultado deve explicar os limites da conferência.');
    assert.ok(!current.text.includes(vector), 'O resultado não deve repetir o documento.');
    assert.ok(!current.text.includes(vector.replace(/[.\/-]/g, '').toUpperCase()),
      'O resultado não deve repetir o documento normalizado.');
    assert.ok(current.invalid === (valid ? null : 'true'), 'O campo deve indicar o erro à tecnologia assistiva.');
    assert.ok(current.role === 'status' && current.live === 'polite' && current.atomic === 'true',
      'O resultado deve possuir uma região de anúncio acessível.');
  }

  await checkScreen('#historico', 'Histórico da sessão');
  assert.ok(await evaluate("return document.querySelectorAll('.history-row').length === 0"),
    'A conferência começa sem registros no histórico.');
  await navigate('documentos', 'Conferir CPF ou CNPJ');
  await drainedStatus();
  const initialControls = await evaluate(`
    const input = document.querySelector('#documento-numero');
    return {name: input.hasAttribute('name'), mode: input.inputMode, type: input.type,
      autocomplete: input.autocomplete, maxlength: input.getAttribute('maxlength'),
      described: input.getAttribute('aria-describedby'), label: document.querySelector('label[for="documento-numero"]').textContent};
  `);
  assert.ok(!initialControls.name && initialControls.mode === 'numeric' && initialControls.type === 'text' &&
    initialControls.autocomplete === 'off' && initialControls.maxlength === null,
  'O CPF deve aceitar digitação sem envio por formulário nem truncamento silencioso.');
  assert.ok(initialControls.label === 'CPF' && initialControls.described.includes('documento-orientacao') &&
    initialControls.described.includes('documento-privacidade'), 'O campo deve ter rótulo e instruções associados.');

  const baseline = await privacySnapshot();
  const requestCount = requests.length;
  const cpf = '52998224725';
  await typeText(cpf, { enter: true });
  await checkResult(true, cpf);
  await assertPrivacy(baseline, requestCount);

  const input = await find(inputSelector);
  await command(session + input + '/value', { text: '0', value: ['0'] });
  const edited = await status();
  assert.ok(edited.title === '' && edited.invalid === null, 'Editar deve descartar o resultado anterior.');
  await typeText('52998224724');
  await click('main form button[type=submit]');
  await checkResult(false, '52998224724');
  await click('main form button[type=button]');
  const cleared = await status();
  assert.ok(cleared.value === '' && cleared.text === '' && cleared.invalid === null && cleared.focus === 'documento-numero',
    'Limpar deve apagar campo e resultado e devolver o foco ao campo.');

  await typeText(cpf);
  await click('main form button[type=submit]');
  await click('#documento-tipo option[value=cnpj]');
  const switched = await status();
  assert.ok(switched.value === '' && switched.text === '', 'Trocar o tipo deve apagar a entrada e o resultado.');
  assert.ok(await evaluate(`return document.querySelector('#documento-numero').inputMode === 'text'
    && document.querySelector('label[for="documento-numero"]').textContent === 'CNPJ'`),
  'O campo de CNPJ deve aceitar letras e possuir rótulo próprio.');
  for (const [vector, valid] of [
    ['11222333000181', true], ['12.abc.345/01de-35', true], ['12ABC34501DE36', false],
    [' 12ABC34501DE35', false], ['１２ABC34501DE35', false],
  ]) {
    await typeText(vector);
    await click('main form button[type=submit]');
    await checkResult(valid, vector);
    await assertPrivacy(baseline, requestCount);
  }

  // Eventos sintéticos verificam os handlers de CR/LF, não uma colagem física.
  for (const eventName of ['paste', 'drop']) {
    const transfer = await evaluate(`
      const [name, text] = arguments;
      const data = new DataTransfer();
      data.setData('text/plain', text);
      const event = name === 'paste'
        ? new ClipboardEvent(name, {clipboardData: data, bubbles: true, cancelable: true})
        : new DragEvent(name, {dataTransfer: data, bubbles: true, cancelable: true});
      const input = document.querySelector('#documento-numero');
      input.dispatchEvent(event);
      return {prevented: event.defaultPrevented, empty: input.value === ''};
    `, [eventName, '12ABC34501DE35\n']);
    assert.ok(transfer.prevented && transfer.empty, 'O handler deve recusar CR/LF antes da sanitização do campo.');
    await checkResult(false, '12ABC34501DE35');
  }
  await assertPrivacy(baseline, requestCount);

  await navigate('historico', 'Histórico da sessão');
  const historyPrivate = await evaluate(`
    return document.querySelectorAll('.history-row').length === 0
      && !document.querySelector('main').textContent.includes('52998224725')
      && !document.querySelector('main').textContent.includes('12ABC34501DE35');
  `);
  assert.ok(historyPrivate, 'A conferência não deve incluir documentos nem operações no histórico.');
  await navigate('documentos', 'Conferir CPF ou CNPJ');
  const returned = await status();
  assert.ok(returned.value === '' && returned.text === '', 'Voltar à ferramenta deve apresentar o campo vazio.');
  await typeText(cpf, { enter: true });
  await checkResult(true, cpf);

  await evaluate(`
    window.__mesaDocumentTestPageshow = false;
    window.addEventListener('pageshow', event => {
      window.__mesaDocumentTestPageshow = event.persisted;
    }, {once: true});
  `);
  await command(session + '/url', { url: 'about:blank' });
  await command(session + '/back', {});
  await checkScreen('#documentos', 'Conferir CPF ou CNPJ');
  await drainedStatus();
  const bfcacheRestored = await evaluate('return window.__mesaDocumentTestPageshow === true');
  const restored = await status();
  assert.ok(restored.value === '' && restored.text === '' && restored.invalid === null,
    'O retorno de navegação deve apagar entrada e resultado, com ou sem bfcache.');
  const afterBack = await privacySnapshot();
  const afterBackRequestCount = requests.length;
  await typeText(cpf, { enter: true });
  await checkResult(true, cpf);
  await click('main form button[type=button]');
  const final = await status();
  assert.ok(final.value === '' && final.text === '', 'A ferramenta deve continuar funcional depois do retorno.');
  await assertPrivacy(afterBack, afterBackRequestCount);
  await checkScreen('#documentos', 'Conferir CPF ou CNPJ');
  console.log('Conferência de documentos em 390 px validou formato, mensagens, teclado, limpeza, descarte e ausência de novas requisições ou persistência. Handlers de CR/LF exercitados com eventos sintéticos. bfcache restaurado:', bfcacheRestored);
  return { bfcacheRestored };
}
