// Todos os operandos são inteiros não negativos. Em empate, escolhe o inteiro par.
export function roundHalfEven(numerator, denominator) {
  const quotient = numerator / denominator;
  const twiceRemainder = (numerator % denominator) * 2n;
  const roundUp = twiceRemainder > denominator || (twiceRemainder === denominator && quotient % 2n === 1n);
  return roundUp ? quotient + 1n : quotient;
}

export function moneyString(cents) {
  return (cents / 100n).toString() + '.' + (cents % 100n).toString().padStart(2, '0');
}
