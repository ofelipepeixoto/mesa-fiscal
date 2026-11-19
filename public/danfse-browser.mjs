const MAX_XML_BYTES = 5 * 1024 * 1024;

export async function browserDanfseAvailable() {
  if (typeof Worker === "undefined" || typeof WebAssembly === "undefined" || typeof DecompressionStream === "undefined") return false;
  try {
    const files = ["engine/danfse.wasm.gz", "engine/wasm_exec.js"];
    const responses = await Promise.all(files.map(path =>
      fetch(new URL(path, import.meta.url), {
        method: "HEAD", credentials: "omit", redirect: "error", signal: AbortSignal.timeout(3500),
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
  if (!(input instanceof Blob) && typeof input !== "string") {
    throw new Error("Escolha o arquivo XML da nota de serviço.");
  }
  const file = input instanceof Blob ? input : new Blob([input]);
  if (!file.size || file.size > MAX_XML_BYTES) throw new Error("Escolha um XML de até 5 MiB.");
  let xml;
  try {
    xml = new TextDecoder("utf-8", {fatal: true}).decode(await file.arrayBuffer());
  } catch {
    throw new Error("O XML precisa estar no formato UTF-8.");
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./danfse-worker.js", import.meta.url));
    const finish = (error, pdf) => {
      clearTimeout(timer);
      worker.terminate();
      if (error) reject(new Error(error));
      else resolve(new Blob([pdf], {type: "application/pdf"}));
    };
    const timer = setTimeout(() => finish("O PDF demorou para ficar pronto. Tente novamente."), 60000);
    worker.onerror = () => finish("O navegador não conseguiu iniciar o gerador local.");
    worker.onmessage = ({data}) => {
      if (data.pdf instanceof ArrayBuffer) finish(null, data.pdf);
      else finish(data.error || "O navegador não conseguiu gerar o PDF.");
    };
    worker.postMessage({xml, stc: Number(status), canhoto: receipt});
  });
}
