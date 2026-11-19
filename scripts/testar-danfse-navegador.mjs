import assert from "node:assert/strict";
import { once } from "node:events";
import { createMesaServer } from "../server/app.mjs";

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

const app = createMesaServer({ regularUrl: null, simplesUrl: null, danfseUrl: null });
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
  async function checkScreen(title) {
    const dimensions = await command(session + "/execute/sync", {
      args: [], script: "return [window.innerWidth, document.documentElement.scrollWidth, document.querySelector('h1')?.textContent.trim()];",
    });
    assert.deepEqual(dimensions, [390, 390, title], "Conteúdo da tela e largura sem rolagem lateral.");
  }
  await checkScreen("Visão geral");
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
      return {size: pdf.byteLength, prefix: new TextDecoder().decode(pdf.slice(0,5)),
        local: document.body.textContent.includes('Processado neste navegador.')};
    })().then(done, error => done({error: String(error.message)}));
  `});
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.prefix, "%PDF-");
  assert.ok(result.size > 1000 && result.local, "O PDF deve sair do motor local do navegador.");
  await checkScreen("PDF da nota de serviço");
  await click("#menu");
  await click(".sidebar [data-route=inicio]");
  await checkScreen("Visão geral");
  assert.ok(requests.some(req => req.method === "GET" && req.path === "/engine/danfse.wasm.gz"));
  assert.ok(requests.some(req => req.method === "GET" && req.path === "/exemplo-nfse.xml"));
  assert.ok(requests.every(req => ["GET","HEAD"].includes(req.method)), "O navegador enviou dados ao servidor.");
  console.log("Chrome", launch.capabilities.browserVersion, "a 390 px abriu o menu, gerou PDF de", result.size, "bytes e voltou ao início sem rolagem horizontal ou envio do XML.");
} finally {
  if (session) await command(session, undefined, "DELETE");
  app.closeAllConnections();
  await new Promise(resolve => app.close(resolve));
}
