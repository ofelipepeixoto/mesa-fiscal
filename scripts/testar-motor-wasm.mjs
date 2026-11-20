import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { checkDistribution } from "./verificar-distribuicao-danfse.mjs";
import { engine as shipped } from "../public/danfse-integrity.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const dir = process.argv[2] || path.join(root, "public", "engine");
const checked = await checkDistribution(path.resolve(dir));
if (path.resolve(dir) === path.join(root, "public", "engine")) assert.deepEqual(checked, shipped);
const xml = await readFile(path.join(root, "public", "exemplo-nfse.xml"), "utf8");
await import(pathToFileURL(path.resolve(dir, "wasm_exec.js")).href);
const go = new globalThis.Go();
const wasm = gunzipSync(await readFile(path.join(dir, "danfse.wasm.gz")));
const { instance } = await WebAssembly.instantiate(wasm, go.importObject);
void go.run(instance).catch(() => { process.exitCode = 1; });
const engine = globalThis.danfseWasm;
assert.equal(engine.ready, true, "O motor precisa inicializar.");
const failures = [{ xml: "<DPS/>", stc: 0 }, { xml, stc: 3 }];
for (const data of failures) {
  assert.ok(engine.gerarPdf(JSON.stringify(data)).error, "O motor deve recusar entradas inválidas.");
}
for (const [stc, canhoto] of [[0, true], [1, false], [2, true]]) {
  const result = engine.gerarPdf(JSON.stringify({ xml, stc, canhoto }));
  assert.ok(!result.error, "O motor precisa processar o XML fictício.");
  const pdf = Buffer.from(result.pdf, "base64");
  assert.equal(pdf.length, result.size);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  if (stc === 0 && process.argv[3]) await writeFile(process.argv[3], pdf);
}
console.log("Motor oficial verificado com XML fictício nas três situações.");
