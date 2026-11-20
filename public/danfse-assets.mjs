import { engine } from "./danfse-integrity.mjs";

const invalidBuild = "A verificação do gerador local falhou. Recarregue a página e tente novamente.";
function check(condition) {
  if (!condition) throw new Error(invalidBuild);
}

async function readBounded(stream, max) {
  check(stream);
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      check(size <= max);
      chunks.push(value);
    }
  } catch (err) {
    await reader.cancel().catch(() => {});
    throw err;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

async function verify(bytes, entry) {
  check(bytes.byteLength === entry.size);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hash = Array.from(digest, b => b.toString(16).padStart(2, "0")).join("");
  check(hash === entry.sha256);
  return bytes;
}

export async function getDanfseAssets({fetchImpl = fetch, signal} = {}) {
  const load = async (path, max) => {
    const response = await fetchImpl(new URL(path, import.meta.url), {
      credentials: "same-origin", redirect: "error", signal,
    });
    check(response.ok);
    return readBounded(response.body, max);
  };
  const [runtime, worker, wire] = await Promise.all([
    load("./engine/wasm_exec.js", engine.runtime.size).then(bytes => verify(bytes, engine.runtime)),
    load("./danfse-worker.js", engine.worker.size).then(bytes => verify(bytes, engine.worker)),
    load("./engine/danfse.wasm.gz", Math.max(engine.wasm.size, engine.gzip.size)),
  ]);
  let wasm = wire;
  if (wire[0] === 0x1f && wire[1] === 0x8b) {
    await verify(wire, engine.gzip);
    const stream = new Blob([wire]).stream().pipeThrough(new DecompressionStream("gzip"));
    wasm = await readBounded(stream, engine.wasm.size);
  }
  // Um servidor com Content-Encoding: gzip já fornece ao fetch os bytes descompactados.
  await verify(wasm, engine.wasm);
  return {runtime, worker, wasm};
}
