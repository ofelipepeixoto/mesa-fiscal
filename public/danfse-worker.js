/* global Go, danfseWasm, importScripts */
self.onmessage = async ({data}) => {
  try {
    importScripts("./engine/wasm_exec.js");
    const go = new Go();
    const response = await fetch("./engine/danfse.wasm.gz", {credentials: "omit", redirect: "error"});
    if (!response.ok) throw new Error();
    const bytes = new Uint8Array(await response.arrayBuffer());
    const compressed = bytes[0] === 0x1f && bytes[1] === 0x8b;
    // Alguns servidores já aplicam Content-Encoding gzip, e o navegador devolve o WASM descompactado.
    const wasm = compressed
      ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()
      : bytes;
    const {instance} = await WebAssembly.instantiate(wasm, go.importObject);
    go.run(instance).catch(() => self.postMessage({error: "O gerador local foi interrompido."}));
    if (!self.danfseWasm?.ready) throw new Error();
    const result = danfseWasm.gerarPdf(JSON.stringify(data));
    if (result.error) {
      self.postMessage({error: "O gerador não conseguiu ler a nota. Confira se o arquivo é o XML completo de uma NFS-e nacional."});
      return;
    }
    if (!result.pdf || result.size < 5 || result.size > 32 * 1024 * 1024) throw new Error();
    const binary = atob(result.pdf);
    if (binary.length !== result.size || !binary.startsWith("%PDF-")) throw new Error();
    const pdf = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    self.postMessage({pdf: pdf.buffer}, [pdf.buffer]);
  } catch {
    self.postMessage({error: "O navegador não conseguiu carregar o gerador de PDF. Confira a instalação local."});
  }
};
