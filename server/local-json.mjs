const maxJsonBytes = 1024 * 1024;

// Consome apenas respostas JSON locais e limita também streams sem Content-Length.
export async function readLocalJson(response, invalidResponse) {
  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json' || Number(response.headers.get('content-length')) > maxJsonBytes || !response.body) {
    await response.body?.cancel();
    throw invalidResponse();
  }
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > maxJsonBytes) throw invalidResponse();
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
  } catch {
    throw invalidResponse();
  }
}
