import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCpf, normalizeCnpj, validateCpf, validateCnpj } from '../public/document-validators.mjs';

// Vetores públicos/sintéticos do Radar Fiscal fixado em 14368391. Não afirmam existência de titulares.
const cpfPositive = ['52998224725', '529.982.247-25'];
const cpfNegative = [
  '52998224724', '00000000000', '11111111111', '52998224725x', 'x52998224725',
  ' 52998224725', '52998224725\n', '529 98224725', '５２９９８２２４７２５', '٥٢٩٩٨٢٢٤٧٢٥', '529.982247-25', '',
];
const cnpjPositive = ['11222333000181', '11.222.333/0001-81', '12ABC34501DE35', '12.abc.345/01de-35'];
const cnpjNegative = [
  '11222333000180', '00000000000000', '11111111111111', '12ABC34501DE36',
  '11.222.333/0001--81', '11 222333000181', '11222333000181x', 'x11222333000181',
  '１２２２２３３３０００１８１', '12ABC34501DÉ35', '12ABC34501DE3A', '',
];

test('CPF confere os vetores de referência com ou sem máscara', () => {
  for (const value of cpfPositive) {
    assert.equal(validateCpf(value), true, value);
    assert.equal(normalizeCpf(value), '52998224725');
  }
  for (const value of cpfNegative) assert.equal(validateCpf(value), false, value);
});

test('CNPJ numérico e alfanumérico preservam os vetores e aceitam minúsculas ASCII', () => {
  for (const value of cnpjPositive) assert.equal(validateCnpj(value), true, value);
  for (const value of cnpjNegative) assert.equal(validateCnpj(value), false, value);
  assert.equal(normalizeCnpj('12.abc.345/01de-35'), '12ABC34501DE35');
  assert.equal(normalizeCnpj('11.222.333/0001-81'), '11222333000181');
  assert.equal(validateCnpj('12abc34501de35'), true);
});

test('o exemplo técnico da Receita tem os verificadores 35 nas duas apresentações', () => {
  // Manual de cálculo DV CNPJ alfanumérico, SERPRO/Receita, páginas 3–4.
  assert.equal(validateCnpj('12ABC34501DE35'), true);
  assert.equal(validateCnpj('12.ABC.345/01DE-35'), true);
  for (const changed of ['12ABC34501DE25', '12ABC34501DE34', '12ABC34501DE36']) {
    assert.equal(validateCnpj(changed), false);
  }
});

test('máscaras inválidas, espaços, controles e Unicode não viram documentos normalizados', () => {
  for (const [normalize, validate, values] of [
    [normalizeCpf, validateCpf, [
      '\n52998224725', '52998224725\r', '529.982.247-25\n', '529.982.247-25\r\n',
      '52998224725\u2028', '52998224725\0', '52998224725 ', '529\u200b98224725',
      '529.982.247/25', '529-982-247.25', '529.982.247-2５', '<script>52998224725</script>',
    ]],
    [normalizeCnpj, validateCnpj, [
      '\n12ABC34501DE35', '12ABC34501DE35\n', '12.ABC.345/01DE-35\r\n',
      '12ABC34501DE35\u2029', '12ABC34501DE35 ', '12ABC34501DE35\0',
      '12ABC34501Dß35', '12ABC34501DK35', '12АBC34501DE35', '12ＡBC34501DE35',
      '12.ABC.345/01DE35', '12.ABC.345/01DE-3５', '12.ABC.345/01DE-3a', '<b>12ABC34501DE35</b>',
    ]],
  ]) {
    for (const value of values) {
      assert.equal(validate(value), false);
      assert.throws(() => normalize(value), RangeError);
    }
  }
});

test('ambas as conferências rejeitam sequências repetidas e verificadores alterados', () => {
  for (const digit of '0123456789') {
    assert.equal(validateCpf(digit.repeat(11)), false);
    assert.equal(validateCnpj(digit.repeat(14)), false);
  }
  for (const [validate, value] of [[validateCpf, '52998224725'], [validateCnpj, '12ABC34501DE35']]) {
    for (const position of [value.length - 2, value.length - 1]) {
      for (const digit of '0123456789') {
        if (digit === value[position]) continue;
        assert.equal(validate(value.slice(0, position) + digit + value.slice(position + 1)), false);
      }
    }
  }
});

test('tipos inesperados não são convertidos nem executam métodos fornecidos na entrada', () => {
  let conversions = 0;
  const hostile = { toString() { conversions++; throw new Error('Não executar.'); } };
  const values = [undefined, null, true, false, 52998224725, 11222333000181n, NaN, {}, [],
    new String('52998224725'), Symbol('fictício'), () => '', hostile];
  for (const value of values) {
    assert.equal(validateCpf(value), false);
    assert.equal(validateCnpj(value), false);
    assert.throws(() => normalizeCpf(value), TypeError);
    assert.throws(() => normalizeCnpj(value), TypeError);
  }
  assert.equal(conversions, 0);
});

test('normalização trata formato; a conferência dos verificadores é uma etapa separada', () => {
  assert.equal(normalizeCpf('529.982.247-24'), '52998224724');
  assert.equal(validateCpf('529.982.247-24'), false);
  assert.equal(normalizeCnpj('12.abc.345/01de-36'), '12ABC34501DE36');
  assert.equal(validateCnpj('12.abc.345/01de-36'), false);
});

test('erros de formato são fixos e não repetem entradas, inclusive entradas excessivas', () => {
  for (const normalize of [normalizeCpf, normalizeCnpj]) {
    const messages = ['conteudo-ficticio-invalido', '9'.repeat(1_000_000), 'A'.repeat(250)].map(value => {
      try { normalize(value); } catch (error) {
        assert.ok(error instanceof RangeError);
        assert.ok(!error.message.includes(value));
        return error.message;
      }
      assert.fail('Entrada inesperada aceita.');
    });
    assert.equal(new Set(messages).size, 1);
  }
  assert.equal(validateCpf('9'.repeat(1_000_000)), false);
  assert.equal(validateCnpj('A'.repeat(1_000_000)), false);
});
