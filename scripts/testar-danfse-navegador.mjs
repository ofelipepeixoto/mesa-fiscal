import assert from "node:assert/strict";
import { once } from "node:events";
import { createMesaServer } from "../server/app.mjs";
import { calculationVersions } from "../public/calculation-versions.mjs";

// O runner inicia o ChromeDriver. O navegador usa a mesma aplicação e CSP do usuário.
const driver = "http://127.0.0.1:9515";
async function command(path, value, method = "POST") {
  const response = await fetch(driver + path, {
    method, headers: {"content-type": "application/json"}, body: value === undefined ? undefined : JSON.stringify(value),
    signal: AbortSignal.timeout(90_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error("ChromeDriver: " + (result.value?.message || response.status));
  return result.value;
}

const distribution = process.argv.includes("--dist");
const app = createMesaServer({
  regularUrl: null, simplesUrl: null, danfseUrl: null,
  staticRoot: new URL(distribution ? "../dist/" : "../public/", import.meta.url),
});
const requests = [];
app.on("request", (req) => requests.push({method: req.method, path: req.url}));
app.listen(0, "127.0.0.1");
await once(app, "listening");
let session;
try {
  const launch = await command("/session", { capabilities: {alwaysMatch: {
    browserName: "chrome", "goog:chromeOptions": {args: ["--headless=new", "--disable-dev-shm-usage"]},
  }}});
  session = "/session/" + launch.sessionId;
  await command(session + "/timeouts", {script: 65_000, pageLoad: 35_000, implicit: 6000});
  await command(session + "/goog/cdp/execute", {cmd: "Emulation.setDeviceMetricsOverride", params: {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  }});
  await command(session + "/url", {url: "http://127.0.0.1:" + app.address().port + "/#inicio"});
  async function click(selector) {
    const element = await command(session + "/element", {using: "css selector", value: selector});
    const ref = element["element-6066-11e4-a52e-4f735466cecf"];
    await command(session + "/element/" + ref + "/click", {});
  }
  async function checkScreen(hash, title) {
    const state = await command(session + "/execute/async", {args: [hash, title], script: `
      const [expectedHash, expectedTitle, done] = arguments;
      const deadline = performance.now() + 6000;
      function inspect() {
        const title = document.querySelector('main h1')?.textContent.trim();
        if ((location.hash === expectedHash && title === expectedTitle) || performance.now() >= deadline) {
          done([location.hash, title, window.innerWidth, document.documentElement.scrollWidth]);
        } else {
          setTimeout(inspect, 50);
        }
      }
      inspect();
    `});
    assert.deepEqual(state, [hash, title, 390, 390], "Rota, título e largura após a navegação.");
  }
  await checkScreen("#inicio", "Visão geral");
  if (distribution) {
    const mode = await command(session + "/execute/sync", {
      args: [], script: "return document.querySelector('meta[name=mesa-edicao]')?.content",
    });
    assert.equal(mode, "navegador", "Este teste exige o pacote estático publicado.");
    for (const [route, title, total] of [["regular", "Regime regular", "R$ 42,72"], ["simples", "Simples Nacional", "R$ 88,00"]]) {
      await click("#menu");
      await click(".sidebar [data-route=" + route + "]");
      await checkScreen("#" + route, title);
      await click("main form button[type=submit]");
      const selector = ".flow-result .flow-sum strong";
      const result = await command(session + "/element", {using: "css selector", value: selector});
      const amount = await command(session + "/element/" + result["element-6066-11e4-a52e-4f735466cecf"] + "/text", undefined, "GET");
      assert.equal(amount.replace(/\s+/gu, " ").trim(), total);
    }
  }
  await click("#menu");
  await click(".sidebar [data-route=danfse]");
  const result = await command(session + "/execute/async", {args: [], script: `
    const done = arguments[arguments.length - 1];
    async function waitForButton(label) {
      for (let attempt = 0; attempt < 450; attempt++) {
        const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label && !b.disabled);
        if (btn) return btn;
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error('Controle indisponível: ' + label);
    }
    (async () => {
      (await waitForButton('Usar o XML de exemplo')).click();
      (await waitForButton('Gerar PDF')).click();
      const download = await waitForButton('Baixar PDF');
      let downloaded;
      const original = URL.createObjectURL.bind(URL);
      URL.createObjectURL = blob => { downloaded = blob; return original(blob); };
      download.click();
      URL.createObjectURL = original;
      const pdf = await downloaded.arrayBuffer();
      const local = document.body.textContent.includes('Processado neste navegador.');
      (await waitForButton('Remover arquivo')).click();
      const byLabel = label => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label);
      const cleared = !byLabel('Baixar PDF') && byLabel('Gerar PDF')?.disabled && !document.querySelector('#danfse-arquivo').files.length;
      return {size: pdf.byteLength, prefix: new TextDecoder().decode(pdf.slice(0,5)),
        local, cleared};
    })().then(done, error => done({error: String(error.message)}));
  `});
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.prefix, "%PDF-");
  assert.ok(result.size > 1000 && result.local, "O PDF deve sair do motor local do navegador.");
  assert.equal(result.cleared, true, "Remover arquivo deve descartar a seleção e o PDF.");
  await checkScreen("#danfse", "PDF da nota de serviço");
  await click("#menu");
  await click(".sidebar [data-route=historico]");
  await checkScreen("#historico", "Histórico da sessão");
  const history = await command(session + "/execute/sync", {args: [], script: `
    const rows = [...document.querySelectorAll('.history-row')];
    for (const details of document.querySelectorAll('.history-version')) details.open = true;
    return {count: rows.length, versions: [...document.querySelectorAll('.history-version')].map(e => e.textContent),
      pdfHasVersion: !!rows[0]?.querySelector('.history-version'),
      width: document.documentElement.scrollWidth};
  `});
  assert.equal(history.count, distribution ? 3 : 1);
  assert.equal(history.pdfHasVersion, false);
  assert.equal(history.width, 390, 'As revisões completas não devem causar rolagem horizontal.');
  if (distribution) {
    for (const kind of ['regular', 'simples']) {
      assert.ok(history.versions.some(text => text.includes(calculationVersions.projection[kind].codeRevision)),
        'O histórico precisa identificar a fórmula utilizada em ' + kind);
    }
  }
  await click('main .section-heading button');
  assert.equal(await command(session + "/execute/sync", {args: [],
    script: "return document.querySelectorAll('.history-row').length"}), 0);
  if (distribution) {
    await click('main a[href="#regular/exemplo"]');
    await checkScreen('#regular/exemplo', 'Regime regular');
    await click('main form button[type=submit]');
    await command(session + '/element', {using: 'css selector', value: '.flow-result'});
    await command(session + '/url', {url: 'http://127.0.0.1:' + app.address().port + '/#historico'});
    await checkScreen('#historico', 'Histórico da sessão');
    await command(session + '/refresh', {});
    await checkScreen('#historico', 'Histórico da sessão');
    assert.equal(await command(session + '/execute/sync', {args: [],
      script: "return document.querySelectorAll('.history-row').length"}), 0, 'Recarregar deve apagar o histórico.');
  }
  await click("#menu");
  await click(".sidebar [data-route=inicio]");
  await checkScreen("#inicio", "Visão geral");
  assert.ok(requests.some(req => req.method === "GET" && req.path === "/engine/danfse.wasm.gz"));
  assert.ok(requests.some(req => req.method === "GET" && req.path === "/exemplo-nfse.xml"));
  assert.ok(requests.every(req => ["GET","HEAD"].includes(req.method)), "O navegador enviou dados ao servidor.");
  if (distribution) assert.ok(requests.every(req => !req.path.startsWith("/api/")), "A edição estática consultou a API.");
  console.log(distribution ? "Distribuição estática." : "Instalação local.", "Chrome", launch.capabilities.browserVersion, "a 390 px abriu o menu, conferiu e limpou o histórico, gerou PDF de", result.size, "bytes e voltou ao início sem rolagem horizontal ou envio do XML.");
} finally {
  if (session) await command(session, undefined, "DELETE");
  app.closeAllConnections();
  await new Promise(resolve => app.close(resolve));
}
