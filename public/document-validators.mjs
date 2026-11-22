/** @license
 * Conferência matemática de CPF/CNPJ; não comprova cadastro, titularidade ou situação fiscal.
 * Adaptado de Radar Fiscal ChatGPT, revisão 14368391aee1a04b597274cfccdf0e3055c134cf,
 * src/radar_fiscal/validators.py. Origem dos algoritmos: DeHor-Labs/mcp-fiscal-brasil,
 * revisão bba0a9f896969940ab2f49a171fc75ea592401e4, shared/validators.py.
 * Copyright (c) 2026 Nikolas DeHor. Copyright (c) 2026 Carlos Felipe.
 * Fronteira estrita e adaptações mantidas por Carlos Felipe.
 * MIT: document-validators-LICENSE.txt, distribuída com este módulo.
 */

// O tamanho e a máscara são conferidos antes de remover pontuação ou converter letras.
const cpfFormat = /^(?:[0-9]{11}|[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2})$/;
const cnpjFormat = /^(?:[A-Za-z0-9]{12}[0-9]{2}|[A-Za-z0-9]{2}\.[A-Za-z0-9]{3}\.[A-Za-z0-9]{3}\/[A-Za-z0-9]{4}-[0-9]{2})$/;

export function normalizeCpf(value) {
  if (typeof value !== 'string') throw new TypeError('Informe o CPF como texto.');
  // O tamanho exato também impede que o $ do JavaScript aceite uma quebra de linha final.
  if ((value.length !== 11 && value.length !== 14) || !cpfFormat.test(value)) {
    throw new RangeError('Formato de CPF inválido. Use 11 dígitos ou a máscara 000.000.000-00.');
  }
  return value.replaceAll('.', '').replaceAll('-', '');
}

export function normalizeCnpj(value) {
  if (typeof value !== 'string') throw new TypeError('Informe o CNPJ como texto.');
  if ((value.length !== 14 && value.length !== 18) || !cnpjFormat.test(value)) {
    throw new RangeError('Formato de CNPJ inválido. Use 14 caracteres ou a máscara 00.000.000/0000-00.');
  }
  // A expressão permite somente ASCII. Não expandir Unicode antes dessa verificação.
  return value.replaceAll('.', '').replaceAll('/', '').replaceAll('-', '').toUpperCase();
}

function repeated(value) {
  return [...value].every(character => character === value[0]);
}

export function validateCpf(value) {
  let digits;
  try { digits = normalizeCpf(value); } catch { return false; }
  if (repeated(digits)) return false;
  for (const size of [9, 10]) {
    let total = 0;
    for (let index = 0; index < size; index++) total += Number(digits[index]) * (size + 1 - index);
    const remainder = (total * 10) % 11;
    if ((remainder === 10 ? 0 : remainder) !== Number(digits[size])) return false;
  }
  return true;
}

export function validateCnpj(value) {
  let digits;
  try { digits = normalizeCnpj(value); } catch { return false; }
  if (repeated(digits)) return false;
  for (const [size, weights] of [
    [12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]],
    [13, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]],
  ]) {
    let total = 0;
    for (let index = 0; index < size; index++) total += (digits.charCodeAt(index) - 48) * weights[index];
    const remainder = total % 11;
    const expected = remainder < 2 ? 0 : 11 - remainder;
    if (expected !== Number(digits[size])) return false;
  }
  return true;
}
