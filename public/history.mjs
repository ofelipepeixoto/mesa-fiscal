const calculationKinds = new Set(['regular', 'simples']);

function digest(value, length) {
  return typeof value === 'string' && value.length === length && /^[a-f0-9]+$/.test(value);
}

// Copia apenas identificadores de código. Entradas fiscais e documentos não fazem parte do contrato.
export function snapshotCalculationVersion(value, kind, expectedMode) {
  if (!calculationKinds.has(kind) || !value || typeof value !== 'object' || Array.isArray(value) ||
      value.schema !== 1 || value.kind !== kind || !['projection', 'engine'].includes(value.mode) ||
      !digest(value.codeRevision, 64) || (expectedMode !== undefined && value.mode !== expectedMode)) return null;
  const snapshot = { schema: 1, kind, mode: value.mode, codeRevision: value.codeRevision };
  if (value.mode === 'engine') {
    if (!digest(value.expectedEngineRevision, 40) || !digest(value.expectedCatalogRevision, 40)) return null;
    snapshot.expectedEngineRevision = value.expectedEngineRevision;
    snapshot.expectedCatalogRevision = value.expectedCatalogRevision;
  }
  return Object.freeze(snapshot);
}

export function createHistoryEntry({ kind, title, value, detail, calculationVersion }, date = new Date()) {
  if (!calculationKinds.has(kind) && kind !== 'danfse') return null;
  return Object.freeze({
    kind, title: String(title), value: String(value), detail: String(detail || ''),
    time: new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date),
    ...(calculationKinds.has(kind) ? { calculationVersion: snapshotCalculationVersion(calculationVersion, kind) } : {}),
  });
}

export function describeCalculationVersion(version, kind) {
  const snapshot = snapshotCalculationVersion(version, kind);
  if (!snapshot) return { summary: 'Versão não informada', lines: [] };
  if (snapshot.mode === 'projection') return {
    summary: 'Projeção local · código ' + snapshot.codeRevision.slice(0, 12),
    lines: ['Identificação da fórmula e do arredondamento (SHA-256): ' + snapshot.codeRevision],
  };
  return {
    summary: 'Motor local · revisão prevista ' + snapshot.expectedEngineRevision.slice(0, 12),
    lines: [
      'Revisão prevista do motor: ' + snapshot.expectedEngineRevision,
      'Revisão prevista do catálogo: ' + snapshot.expectedCatalogRevision,
      'Identificação do adaptador (SHA-256): ' + snapshot.codeRevision,
      'Estas revisões são declaradas pela distribuição. A versão do motor em execução não foi confirmada.',
    ],
  };
}
