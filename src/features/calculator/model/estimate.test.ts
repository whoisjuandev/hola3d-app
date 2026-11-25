import { describe, expect, it } from 'vitest';
import { densityOf, estimateFromVolume, fillFactor } from './estimate';

describe('density by material', () => {
  it('knows the common materials, ignoring case, accents and what comes after the name', () => {
    expect(densityOf('PLA')).toBe(1.24);
    expect(densityOf('pla+ silk')).toBe(1.24);
    expect(densityOf('PETG negro')).toBe(1.27);
    expect(densityOf('abs')).toBe(1.04);
    expect(densityOf(' ASA ')).toBe(1.07);
    expect(densityOf('TPU 95A')).toBe(1.21);
    expect(densityOf('Nylón')).toBe(1.14);
    expect(densityOf('PETG-CF')).toBe(1.27);
  });

  it('uses PLA for a material it does not know, or none', () => {
    expect(densityOf('Resina')).toBe(1.24);
    expect(densityOf('')).toBe(1.24);
    expect(densityOf('PLAnet')).toBe(1.24);
  });
});

describe('estimate from volume', () => {
  it('fills a quarter of the volume with shells and the rest by the infill', () => {
    expect(fillFactor(15)).toBeCloseTo(0.3625, 10);
    expect(fillFactor(0)).toBe(0.25);
    expect(fillFactor(100)).toBe(1);
  });

  it('a 20 mm PLA cube at 15 % and 25 g/h: 8 × 1.24 × 0.3625 = 3.6 g → 4 g, and 4 ÷ 25 × 60 = 9.6 → 10 min', () => {
    expect(estimateFromVolume({ volumeCm3: 8, material: 'PLA', infillPercent: 15, gramsPerHour: 25 })).toEqual({ grams: 4, minutes: 10 });
  });

  it('follows the material, the infill and the rate', () => {
    expect(estimateFromVolume({ volumeCm3: 100, material: 'ABS', infillPercent: 20, gramsPerHour: 40 }))
      .toEqual({ grams: 42, minutes: 63 }); // 100 × 1.04 × 0.4 = 41.6
    expect(estimateFromVolume({ volumeCm3: 100, material: 'PETG', infillPercent: 100, gramsPerHour: 50 }))
      .toEqual({ grams: 127, minutes: 152 }); // 127 ÷ 50 × 60 = 152.4
  });

  it('never gives 0 g or 0 min for a model with volume', () => {
    expect(estimateFromVolume({ volumeCm3: 0.05, material: 'PLA', infillPercent: 15, gramsPerHour: 25 })).toEqual({ grams: 1, minutes: 2 });
  });
});
