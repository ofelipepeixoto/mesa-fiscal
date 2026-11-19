import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { generateDanfse, MAX_XML_BYTES } from "../server/danfse.mjs";

const xml = await readFile(new URL("../public/exemplo-nfse.xml", import.meta.url));
const pdfStub = Buffer.from("%PDF-1.7\nPDF de teste de transporte\n%%EOF");

test("envia o XML e a situação ao gerador local e devolve os bytes recebidos", async t => {
  let request;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    request = { method: req.method, url: req.url, type: req.headers["content-type"], body: Buffer.concat(chunks) };
    res.writeHead(200, {"content-type": "application/pdf"});
    res.end(pdfStub);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const pdf = await generateDanfse(xml, {baseUrl: "http://127.0.0.1:" + server.address().port, status: "2", receipt: false});
  assert.deepEqual(pdf, pdfStub);
  assert.deepEqual(request, {method: "POST", url: "/api/danfse?stc=2&canhoto=false", type: "application/xml", body: xml});
});

test("recusa arquivo vazio, fora do limite, codificação ou situação inválidas antes de enviar", async () => {
  const options = {baseUrl: "http://127.0.0.1:8080", fetchImpl: () => { assert.fail("Envio inesperado"); }};
  for (const [input, expected] of [["", 400], ["<!DOCTYPE NFSe><NFSe/>", 400], [Buffer.from([60, 255]), 400], [Buffer.alloc(MAX_XML_BYTES + 1), 413]]) {
    await assert.rejects(generateDanfse(input, options), {status: expected});
  }
  await assert.rejects(generateDanfse(xml, {...options, status: "4"}), {status: 400});
  await assert.rejects(generateDanfse(xml, {...options, receipt: "nunca"}), {status: 400});
});

test("usa somente destinos locais sem credenciais e não segue redirecionamento", async () => {
  for (const baseUrl of ["", "https://externo.example", "http://user:pass@localhost:8080"]) {
    await assert.rejects(generateDanfse(xml, {baseUrl}), {status: 503});
  }
  await assert.rejects(generateDanfse(xml, {
    baseUrl: "http://danfse:8080",
    fetchImpl: async (url, options) => {
      assert.equal(url.hostname, "danfse");
      assert.equal(options.redirect, "error");
      return new Response("dados do cliente", {status: 400});
    },
  }), error => error.status === 422 && !error.message.includes("dados do cliente"));
});

test("exige PDF identificável e limita a saída antes de entregar o arquivo", async () => {
  for (const [content, headers] of [
    [pdfStub, {"content-type": "text/html"}],
    ["resposta indevida", {"content-type": "application/pdf"}],
    [pdfStub, {"content-type": "application/pdf", "content-length": String(64 * 1024 * 1024)}],
  ]) {
    await assert.rejects(generateDanfse(xml, {
      baseUrl: "http://localhost:8080", fetchImpl: async () => new Response(content, {headers}),
    }), {status: 502});
  }
});
