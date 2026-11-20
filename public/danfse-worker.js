// O navegador só cria este Worker depois de verificar estes bytes e o runtime Go.
self.onmessage = async ({data}) => {
  try {
    // Bibliotecas do motor podem registrar detalhes de entrada inválida em stderr.
    // Nenhuma saída textual de um trabalho fiscal precisa ir para o console.
    globalThis.fs.writeSync = (_fd, buffer) => buffer.length;
    const go = new globalThis.Go();
    const {instance} = await WebAssembly.instantiate(data.wasm, go.importObject);
    go.run(instance).catch(() => self.postMessage({error: "O gerador local foi interrompido."}));
    if (!self.danfseWasm?.ready) throw new Error();
    const result = self.danfseWasm.gerarPdf(JSON.stringify(data.request));
    if (result.error) {
      self.postMessage({error: "O gerador não conseguiu ler a nota. Confira se o arquivo é o XML completo de uma NFS-e nacional."});
      return;
    }
    if (!Number.isSafeInteger(result.size) || result.size < 5 || result.size > 32 * 1024 * 1024
        || typeof result.pdf !== "string" || result.pdf.length !== 4 * Math.ceil(result.size / 3)) throw new Error();
    const binary = atob(result.pdf);
    if (!binary.startsWith("%PDF-") || binary.length !== result.size) throw new Error();
    const pdf = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    self.postMessage({pdf: pdf.buffer}, [pdf.buffer]);
  } catch {
    self.postMessage({error: "O navegador não conseguiu gerar o PDF. Confira a instalação local."});
  }
};
