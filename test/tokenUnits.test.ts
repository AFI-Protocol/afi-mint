import { describe, it, expect } from 'vitest';
import { tokenUnitsToBaseUnits } from '../src/mint/tokenUnits.js';

describe('tokenUnitsToBaseUnits', () => {
  it('returns 0n for zero and negative amounts', () => {
    expect(tokenUnitsToBaseUnits(0, 18)).toBe(0n);
    expect(tokenUnitsToBaseUnits(-1, 18)).toBe(0n);
    expect(tokenUnitsToBaseUnits(-0.5, 18)).toBe(0n);
  });

  it('throws for non-finite amounts', () => {
    expect(() => tokenUnitsToBaseUnits(Number.NaN, 18)).toThrow(/finite/);
    expect(() => tokenUnitsToBaseUnits(Number.POSITIVE_INFINITY, 18)).toThrow(/finite/);
    expect(() => tokenUnitsToBaseUnits(Number.NEGATIVE_INFINITY, 18)).toThrow(/finite/);
  });

  it('throws for invalid decimals', () => {
    expect(() => tokenUnitsToBaseUnits(1, -1)).toThrow(/decimals/);
    expect(() => tokenUnitsToBaseUnits(1, 1.5)).toThrow(/decimals/);
  });

  it('converts whole tokens at 18 decimals', () => {
    expect(tokenUnitsToBaseUnits(1, 18)).toBe(1_000_000_000_000_000_000n);
  });

  it('converts fractional tokens with truncation, not rounding', () => {
    expect(tokenUnitsToBaseUnits(0.5, 18)).toBe(500_000_000_000_000_000n);
    expect(tokenUnitsToBaseUnits(0.000000000000000001, 18)).toBe(1n);
    expect(tokenUnitsToBaseUnits(0.0000000000000000009, 18)).toBe(0n);
    // float64 canonicalizes 1.9999999999999999999 to 2.0; policy converts that numeric value
    expect(tokenUnitsToBaseUnits(1.9999999999999999999, 18)).toBe(2_000_000_000_000_000_000n);
  });

  it('handles scientific notation', () => {
    expect(tokenUnitsToBaseUnits(1e-18, 18)).toBe(1n);
    expect(tokenUnitsToBaseUnits(1e-19, 18)).toBe(0n);
    expect(tokenUnitsToBaseUnits(1e18, 18)).toBe(10n ** 36n);
  });

  it('handles large schedule-like values deterministically', () => {
    const epoch2756 = 6_842_538.9986583935;
    const first = tokenUnitsToBaseUnits(epoch2756, 18);
    const second = tokenUnitsToBaseUnits(epoch2756, 18);
    expect(first).toBe(second);
    expect(first).toBeGreaterThan(0n);
  });

  it('truncates fractional digits beyond decimals', () => {
    expect(tokenUnitsToBaseUnits(1.23456789, 4)).toBe(12_345n);
    expect(tokenUnitsToBaseUnits(1.23499, 4)).toBe(12_349n);
  });

  it('supports decimals other than 18', () => {
    expect(tokenUnitsToBaseUnits(12.345, 6)).toBe(12_345_000n);
    expect(tokenUnitsToBaseUnits(0.1, 6)).toBe(100_000n);
  });

  it('is deterministic across repeated calls', () => {
    const values = [0.1, 1.5, 6842538.9986583935, 318302207.36608756];
    for (const value of values) {
      const a = tokenUnitsToBaseUnits(value, 18);
      const b = tokenUnitsToBaseUnits(value, 18);
      expect(a).toBe(b);
    }
  });
});
