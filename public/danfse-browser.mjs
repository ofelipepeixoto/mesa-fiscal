import {getDanfseAssets} from "./danfse-assets.mjs";

const MAX_XML_BYTES = 5 * 1024 * 1024;

export async function browserDanfseAvailable() {
  if (!globalThis.crypto?.subtle || typeof Worker === "undefined" || typeof WebAssembly === "undefined"
      || typeof DecompressionStream === "undefined") return false;
  try {
    const files = ["engine/danfse.wasm.gz", "engine/wasm_exec.js", "danfse-worker.js"];
    const responses = await Promise.all(files.map(path =>
      fetch(new URL(path, import.meta.url), {
        method: "HEAD", credentials: "same-origin", redirect: "error", signal: AbortSignal.timeout(3500),
      }),
    ));
    return responses.every(response => response.ok && !response.headers.get("content-type")?.includes("text/html"));
  } catch {
    return false;
  }
}

export async function generateBrowserDanfse(input, {status = 0, receipt = true} = {}) {
  if (!["0", "1", "2"].includes(String(status)) || ![true, false].includes(receipt)) {
    throw new Error("Confira a situação da nota e a opção de incluir o canhoto.");
  }
  if (!(input instanceof Blob) && typeof input !== "string") throw new Error("Escolha o arquivo XML da nota de serviço.");
  const file = input instanceof Blob ? input : new Blob([input]);
  if (!file.size || file.size > MAX_XML_BYTES) throw new Error("Escolha um XML de até 5 MiB.");
  let assets;
  try {
    assets = await getDanfseAssets({signal: AbortSignal.timeout(45000)});
  } catch {
    throw new Error("A verificação do gerador local falhou. Recarregue a página e tente novamente.");
  }
  let xml;
  try {
    xml = new TextDecoder("utf-8", {fatal: true}).decode(await file.arrayBuffer());
  } catch {
    throw new Error("O XML precisa estar no formato UTF-8.");
  }
  // Worker não aceita SRI nativamente. O Blob contém apenas os dois scripts já verificados.
  const url = URL.createObjectURL(new Blob([assets.runtime, "\n;\n", assets.worker], {type: "text/javascript"}));
  let worker;
  try {
    worker = new Worker(url);
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("O PDF demorou para ficar pronto. Tente novamente.")), 60000);
      worker.onerror = () => {
        clearTimeout(timer);
        reject(new Error("O navegador não conseguiu iniciar o gerador local."));
      };
      worker.onmessage = ({data}) => {
        clearTimeout(timer);
        if (data?.pdf instanceof ArrayBuffer) resolve(new Blob([data.pdf], {type: "application/pdf"}));
        else reject(new Error(data?.error || "O navegador não conseguiu gerar o PDF."));
      };
      worker.postMessage({wasm: assets.wasm.buffer, request: {xml, stc: Number(status), canhoto: receipt}}, [assets.wasm.buffer]);
    });
  } finally {
    worker?.terminate();
    URL.revokeObjectURL(url);
  }
}
