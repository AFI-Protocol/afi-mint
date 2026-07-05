/**
 * Deterministic token-unit to base-unit (wei) conversion.
 *
 * Converts a finite positive JavaScript number representing whole token units
 * into base units using decimal-string truncation (floor toward zero for
 * positive amounts). This is the sanctioned settlement boundary for off-chain
 * mint amount calculation and supersedes the legacy
 * `BigInt(Math.floor(amount * 10 ** decimals))` float-scaling path.
 */

/**
 * Expand a decimal or scientific-notation string to plain decimal form.
 */
function expandScientificNotation(value: string): string {
  if (!/e/i.test(value)) {
    return value;
  }

  const lower = value.toLowerCase();
  const [mantissa, exponentPart] = lower.split('e');
  const exponent = Number.parseInt(exponentPart, 10);

  const sign = mantissa.startsWith('-') ? '-' : '';
  const unsignedMantissa = sign ? mantissa.slice(1) : mantissa;
  const [integerPart = '0', fractionalPart = ''] = unsignedMantissa.split('.');
  const digits = `${integerPart}${fractionalPart}`;
  const decimalPosition = integerPart.length;
  const newDecimalPosition = decimalPosition + exponent;

  let plain: string;
  if (newDecimalPosition <= 0) {
    plain = `0.${'0'.repeat(-newDecimalPosition)}${digits}`;
  } else if (newDecimalPosition >= digits.length) {
    plain = `${digits}${'0'.repeat(newDecimalPosition - digits.length)}`;
  } else {
    plain = `${digits.slice(0, newDecimalPosition)}.${digits.slice(newDecimalPosition)}`;
  }

  return sign ? `-${plain}` : plain;
}

/**
 * Convert token units to base units with deterministic truncation.
 *
 * @param amountTokens - Token amount in whole-token float units (already computed)
 * @param decimals - Base-unit decimals (e.g. 18 for wei)
 * @returns Base-unit amount as bigint; `0n` for non-positive amounts
 * @throws If amount is non-finite or decimals is invalid
 */
export function tokenUnitsToBaseUnits(amountTokens: number, decimals: number): bigint {
  if (!Number.isFinite(amountTokens)) {
    throw new Error(`tokenUnitsToBaseUnits: amount must be finite, received ${amountTokens}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(
      `tokenUnitsToBaseUnits: decimals must be a non-negative integer, received ${decimals}`
    );
  }
  if (amountTokens <= 0) {
    return 0n;
  }

  const plain = expandScientificNotation(amountTokens.toString());
  const negative = plain.startsWith('-');
  const unsigned = negative ? plain.slice(1) : plain;
  const [integerPart = '0', fractionalPart = ''] = unsigned.split('.');
  const normalizedInteger = integerPart === '' ? '0' : integerPart;
  const truncatedFraction = fractionalPart.slice(0, decimals);
  const paddedFraction = truncatedFraction.padEnd(decimals, '0');
  const digits = `${normalizedInteger}${paddedFraction}`.replace(/^0+(?=\d)/, '');

  return BigInt(digits === '' ? '0' : digits);
}
