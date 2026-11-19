export const MAX_XML_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 32 * 1024 * 1024;
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "danfse"]);

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

export function serviceAddress(baseUrl) {
  const unavailable = "O gerador de PDF está desconectado. Inicie o serviço DANFSe e tente novamente.";
  if (!baseUrl) throw fail(503, unavailable);
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw fail(503, unavailable);
  }
  if (!["http:", "https:"].includes(url.protocol) || !localHosts.has(url.hostname)
      || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw fail(503, unavailable);
  }
  return new URL("/api/danfse", url);
}

function validateXml(xml) {
  if (typeof xml !== "string" && !(xml instanceof Uint8Array)) {
    throw fail(400, "Escolha o arquivo XML de uma nota de serviço nacional.");
  }
  if (Buffer.byteLength(xml) > MAX_XML_BYTES) {
    throw fail(413, "O XML ultrapassa 5 MiB. Confira o arquivo selecionado.");
  }
  const bytes = Buffer.from(xml);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw fail(400, "O XML precisa estar no formato UTF-8.");
  }
  if (!text.trim() || !text.trimStart().startsWith("<") || bytes.includes(0)) {
    throw fail(400, "O arquivo precisa conter o XML da nota em formato UTF-8.");
  }
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) {
    throw fail(400, "O arquivo contém declarações incompatíveis com o gerador. Use o XML original da NFS-e.");
  }
  return bytes;
}

async function readPdf(response) {
  const invalid = "O gerador devolveu um arquivo inesperado. Tente gerar o PDF novamente.";
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (type !== "application/pdf" || Number(response.headers.get("content-length")) > MAX_PDF_BYTES || !response.body) {
    await response.body?.cancel();
    throw fail(502, invalid);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > MAX_PDF_BYTES) throw fail(502, invalid);
    chunks.push(chunk);
  }
  const pdf = Buffer.concat(chunks, size);
  if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") throw fail(502, invalid);
  return pdf;
}

export async function generateDanfse(xml, {
  status = 0, receipt = true, baseUrl = process.env.DANFSE_URL, fetchImpl = fetch,
} = {}) {
  if (!["0", "1", "2"].includes(String(status)) || ![true, false, "true", "false"].includes(receipt)) {
    throw fail(400, "Confira a situação da nota e a opção de incluir o canhoto.");
  }
  const body = validateXml(xml);
  const url = serviceAddress(baseUrl);
  url.searchParams.set("stc", String(status));
  url.searchParams.set("canhoto", String(receipt));
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/xml", Accept: "application/pdf" },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 413) throw fail(413, "O XML excede o limite aceito pelo gerador de PDF.");
      if (response.status === 400 || response.status === 422) {
        throw fail(422, "O gerador não conseguiu ler a nota. Confira se o arquivo é o XML completo de uma NFS-e nacional.");
      }
      throw fail(502, "O gerador de PDF encontrou um problema. Tente novamente.");
    }
    return await readPdf(response);
  } catch (error) {
    if (Number.isInteger(error.status)) throw error;
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw fail(504, "O gerador demorou para responder. Tente novamente.");
    }
    throw fail(503, "O gerador de PDF está indisponível. Verifique se o serviço DANFSe está em execução.");
  }
}
