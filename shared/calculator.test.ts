import { describe, expect, it } from 'vitest';
import { BREAKDOWN_TERMS, calculateCost, spoolShortages, type CalcLineInput, type CalcPrinter, type CalcSpool } from './calculator';
import type { CostSettingsInput } from './cost-settings';

// Every cost at zero, so each test turns on only the term it checks.
const zero: CostSettingsInput = {
  kwhPrice: 0, labourPerHour: 0, failurePercent: 0, marginPercent: 0, monthlyFixedCosts: 0,
  monthlyPrintHours: 1, packagingCost: 0, roundingStep: 1, commissionPercent: 0,
};

const a1: CalcPrinter = { id: 1, name: 'La A1', purchasePrice: 720000, lifetimeHours: 5000, powerWatts: 100 };
const white: CalcSpool = { id: 1, material: 'PLA', colorName: 'Blanco', colorHex: '#ffffff', brand: 'Grilon3', netGrams: 1000, remainingGrams: 640, price: 21000 };
const yellow: CalcSpool = { id: 2, material: 'PLA', colorName: 'Amarillo', colorHex: '#ffc42e', brand: '', netGrams: 1000, remainingGrams: 30, price: 20000 };
const silk: CalcSpool = { id: 3, material: 'PLA', colorName: 'Dorado silk', colorHex: '#d4a72c', brand: 'Printalot', netGrams: 500, remainingGrams: 90, price: 16000 };

function line(overrides: Partial<CalcLineInput> = {}): CalcLineInput {
  return {
    name: 'Llavero', quantity: 1, printerId: null, printMinutesPerUnit: 0,
    filaments: [], prepMinutes: 0, postMinutes: 0, packaging: 0, ...overrides,
  };
}

function one(l: CalcLineInput, settings: Partial<CostSettingsInput> = {}) {
  return calculateCost({ lines: [l] }, [a1], [white, yellow, silk], { ...zero, ...settings });
}

describe('calculateCost terms', () => {
  it('material: grams × spool price ÷ spool net weight, for every unit and filament', () => {
    // 3 units × (10 g × 21000/1000 + 5 g × 16000/500) = 3 × (210 + 160) = 1110
    const r = one(line({ quantity: 3, filaments: [{ spoolId: 1, material: '', pricePerKg: 0, gramsPerUnit: 10 }, { spoolId: 3, material: '', pricePerKg: 0, gramsPerUnit: 5 }] }));
    expect(r.breakdown.material).toBe(1110);
    expect(r.lines[0].filaments).toEqual([
      { label: 'PLA Blanco · Grilon3', colorHex: '#ffffff', gramsPerUnit: 10, grams: 30, pricePerKg: 21000, cost: 630 },
      { label: 'PLA Dorado silk · Printalot', colorHex: '#d4a72c', gramsPerUnit: 5, grams: 15, pricePerKg: 32000, cost: 480 },
    ]);
  });

  it('material: a typed price per kg when the spool is not in stock', () => {
    // 2 units × 60 g × 30000/1000 = 3600
    const r = one(line({ quantity: 2, filaments: [{ spoolId: null, material: 'PETG negro', pricePerKg: 30000, gramsPerUnit: 60 }] }));
    expect(r.breakdown.material).toBe(3600);
    expect(r.lines[0].filaments[0]).toEqual({ label: 'PETG negro', colorHex: null, gramsPerUnit: 60, grams: 120, pricePerKg: 30000, cost: 3600 });
  });

  it('energy: watts ÷ 1000 × hours × kWh price', () => {
    // 100 W ÷ 1000 × (4 units × 90 min = 6 h) × $200 = 120
    expect(one(line({ quantity: 4, printerId: 1, printMinutesPerUnit: 90 }), { kwhPrice: 200 }).breakdown.energy).toBe(120);
  });

  it('machine wear: hours × purchase price ÷ lifetime hours', () => {
    // 6 h × 720000 ÷ 5000 = 864
    expect(one(line({ quantity: 4, printerId: 1, printMinutesPerUnit: 90 })).breakdown.machineWear).toBe(864);
  });

  it('energy and machine wear are 0 without a printer; the line keeps no printer name', () => {
    const r = one(line({ quantity: 4, printerId: null, printMinutesPerUnit: 90 }), { kwhPrice: 200 });
    expect(r.breakdown.energy).toBe(0);
    expect(r.breakdown.machineWear).toBe(0);
    expect(r.lines[0].printerName).toBeNull();
  });

  it('fixed costs: hours × monthly fixed costs ÷ monthly print hours', () => {
    // 6 h × 120000 ÷ 200 = 3600
    expect(one(line({ quantity: 4, printMinutesPerUnit: 90 }), { monthlyFixedCosts: 120000, monthlyPrintHours: 200 }).breakdown.fixedCosts).toBe(3600);
  });

  it('labour: (prep + post minutes) ÷ 60 × hourly rate, once for the whole line', () => {
    // (20 + 25) ÷ 60 × 6000 = 4500, whatever the quantity
    expect(one(line({ quantity: 10, prepMinutes: 20, postMinutes: 25 }), { labourPerHour: 6000 }).breakdown.labour).toBe(4500);
  });

  it('packaging: the amount set on the line', () => {
    expect(one(line({ packaging: 1200 }), { packagingCost: 999 }).breakdown.packaging).toBe(1200);
  });

  it('failure allowance: failure % of material, energy and machine wear only', () => {
    // material 420 + energy 120 + wear 864 = 1404; 10 % = 140.4 → 140. Fixed costs and labour do not count.
    const r = one(
      line({ quantity: 4, printerId: 1, printMinutesPerUnit: 90, prepMinutes: 60, filaments: [{ spoolId: 1, material: '', pricePerKg: 0, gramsPerUnit: 5 }] }),
      { kwhPrice: 200, failurePercent: 10, labourPerHour: 6000, monthlyFixedCosts: 120000, monthlyPrintHours: 200 },
    );
    expect(r.breakdown.failureAllowance).toBe(140);
  });

  it('production cost: the sum of every term before it', () => {
    const r = one(
      line({ quantity: 4, printerId: 1, printMinutesPerUnit: 90, prepMinutes: 60, packaging: 500, filaments: [{ spoolId: 1, material: '', pricePerKg: 0, gramsPerUnit: 5 }] }),
      { kwhPrice: 200, failurePercent: 10, labourPerHour: 6000, monthlyFixedCosts: 120000, monthlyPrintHours: 200 },
    );
    // 420 + 120 + 864 + 3600 + 6000 + 500 + 140
    expect(r.breakdown.productionCost).toBe(11644);
  });

  it('profit: margin % of the production cost', () => {
    // production 1000 (labour), 35 % = 350
    expect(one(line({ prepMinutes: 60 }), { labourPerHour: 1000, marginPercent: 35 }).breakdown.profit).toBe(350);
  });

  it('price before commission: production cost + profit', () => {
    expect(one(line({ prepMinutes: 60 }), { labourPerHour: 1000, marginPercent: 35 }).breakdown.priceBeforeCommission).toBe(1350);
  });

  it('commission: the final price is the price before commission ÷ (1 − commission %)', () => {
    // 8700 ÷ (1 − 0.13) = 10000 exactly, so no rounding is added even with a $100 step.
    const r = one(line({ packaging: 8700 }), { commissionPercent: 13, roundingStep: 100 });
    expect(r.breakdown).toMatchObject({ priceBeforeCommission: 8700, commission: 1300, rounding: 0, finalPrice: 10000 });
    expect(r.total).toBe(10000);
  });

  it('rounding: the final price goes up to the next multiple of the rounding step', () => {
    const r = one(line({ packaging: 12001 }), { roundingStep: 500 });
    expect(r.breakdown).toMatchObject({ priceBeforeCommission: 12001, commission: 0, rounding: 499, finalPrice: 12500 });
    expect(one(line({ packaging: 12500 }), { roundingStep: 500 }).breakdown.finalPrice).toBe(12500);
    expect(one(line({ packaging: 12001 }), { roundingStep: 1 }).breakdown.finalPrice).toBe(12001);
  });

  it('price per unit: the line total ÷ quantity, in whole pesos', () => {
    const r = one(line({ quantity: 3, packaging: 1000 }), { roundingStep: 100 });
    expect(r.lines[0].total).toBe(1000);
    expect(r.lines[0].unitPrice).toBe(333);
    expect(r.unitPrice).toBe(333);
  });

  it('lists the breakdown terms in the order of the formula', () => {
    expect(BREAKDOWN_TERMS.map((t) => t.key)).toEqual([
      'material', 'energy', 'machineWear', 'fixedCosts', 'labour', 'packaging', 'failureAllowance',
      'productionCost', 'profit', 'priceBeforeCommission', 'commission', 'rounding', 'finalPrice',
    ]);
    expect(Object.keys(one(line()).breakdown)).toEqual(BREAKDOWN_TERMS.map((t) => t.key));
  });

  it('answers 0 per unit for an empty calculation', () => {
    expect(calculateCost({ lines: [] }, [], [], zero)).toMatchObject({ lines: [], total: 0, quantity: 0, unitPrice: 0 });
  });
});

describe('calculateCost worked example', () => {
  /*
   * Checked by hand. Settings: kWh $200, labour $6000/h, failure 10 %, margin 50 %, fixed $120000 over 200 h
   * ($600/h), rounding $100, commission 20 % (÷ 0.8). Printer La A1: 100 W, $720000 over 5000 h ($144/h).
   *
   * Line 1, Llavero × 12, 30 min each = 6 h:
   *   material  white 8 g × 12 = 96 g × $21/g = 2016; yellow 2 g × 12 = 24 g × $20/g = 480 → 2496
   *   energy    0.1 kW × 6 h × 200 = 120        wear  6 × 144 = 864        fixed  6 × 600 = 3600
   *   labour    (30 + 30) min = 1 h × 6000 = 6000                         packaging 1200
   *   failure   10 % × (2496 + 120 + 864 = 3480) = 348
   *   production 2496 + 120 + 864 + 3600 + 6000 + 1200 + 348 = 14628;  profit 50 % = 7314;  before 21942
   *   ÷ 0.8 = 27427.5 → commission 5485.5 ≈ 5486; up to $100 → 27500, rounding 27500 − 21942 − 5486 = 72
   *   per unit 27500 ÷ 12 = 2291.67 ≈ 2292
   *
   * Line 2, Soporte × 2, 150 min each = 5 h:
   *   material  typed PETG 60 g × 2 = 120 g × $30/g = 3600; white 10 g × 2 = 20 g × $21/g = 420 → 4020
   *   energy    0.1 × 5 × 200 = 100            wear  5 × 144 = 720        fixed  5 × 600 = 3000
   *   labour    (15 + 45) min = 1 h × 6000 = 6000                         packaging 800
   *   failure   10 % × (4020 + 100 + 720 = 4840) = 484
   *   production 4020 + 100 + 720 + 3000 + 6000 + 800 + 484 = 15124;  profit 7562;  before 22686
   *   ÷ 0.8 = 28357.5 → commission 5671.5 ≈ 5672; up to $100 → 28400, rounding 28400 − 22686 − 5672 = 42
   *   per unit 28400 ÷ 2 = 14200
   *
   * Overall: each term summed; total 27500 + 28400 = 55900 for 14 units, 3992.86 ≈ 3993 each.
   */
  const settings: CostSettingsInput = {
    kwhPrice: 200, labourPerHour: 6000, failurePercent: 10, marginPercent: 50, monthlyFixedCosts: 120000,
    monthlyPrintHours: 200, packagingCost: 1000, roundingStep: 100, commissionPercent: 20,
  };
  const lines: CalcLineInput[] = [
    line({
      name: 'Llavero', quantity: 12, printerId: 1, printMinutesPerUnit: 30, prepMinutes: 30, postMinutes: 30, packaging: 1200,
      filaments: [{ spoolId: 1, material: '', pricePerKg: 0, gramsPerUnit: 8 }, { spoolId: 2, material: '', pricePerKg: 0, gramsPerUnit: 2 }],
    }),
    line({
      name: 'Soporte', quantity: 2, printerId: 1, printMinutesPerUnit: 150, prepMinutes: 15, postMinutes: 45, packaging: 800,
      filaments: [{ spoolId: null, material: 'PETG', pricePerKg: 30000, gramsPerUnit: 60 }, { spoolId: 1, material: '', pricePerKg: 0, gramsPerUnit: 10 }],
    }),
  ];
  const result = calculateCost({ lines }, [a1], [white, yellow, silk], settings);

  it('prices each line', () => {
    expect(result.lines[0]).toMatchObject({
      name: 'Llavero', quantity: 12, printerName: 'La A1', printMinutes: 360, total: 27500, unitPrice: 2292,
      breakdown: {
        material: 2496, energy: 120, machineWear: 864, fixedCosts: 3600, labour: 6000, packaging: 1200, failureAllowance: 348,
        productionCost: 14628, profit: 7314, priceBeforeCommission: 21942, commission: 5486, rounding: 72, finalPrice: 27500,
      },
    });
    expect(result.lines[1]).toMatchObject({
      name: 'Soporte', quantity: 2, printerName: 'La A1', printMinutes: 300, total: 28400, unitPrice: 14200,
      breakdown: {
        material: 4020, energy: 100, machineWear: 720, fixedCosts: 3000, labour: 6000, packaging: 800, failureAllowance: 484,
        productionCost: 15124, profit: 7562, priceBeforeCommission: 22686, commission: 5672, rounding: 42, finalPrice: 28400,
      },
    });
  });

  it('adds the lines up for the whole calculation', () => {
    expect(result.breakdown).toEqual({
      material: 6516, energy: 220, machineWear: 1584, fixedCosts: 6600, labour: 12000, packaging: 2000, failureAllowance: 832,
      productionCost: 29752, profit: 14876, priceBeforeCommission: 44628, commission: 11158, rounding: 114, finalPrice: 55900,
    });
    expect(result).toMatchObject({ total: 55900, quantity: 14, unitPrice: 3993 });
  });

  it('is plain data that survives JSON, with the settings it used and no live records', () => {
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(result.settings).toEqual(settings);
    expect(JSON.stringify(result)).not.toMatch(/spoolId|printerId|remainingGrams/);
  });
});

describe('spoolShortages', () => {
  it('flags a spool when all the uses of it need more grams than it has left', () => {
    const input = {
      lines: [
        line({ quantity: 12, filaments: [{ spoolId: 2, material: '', pricePerKg: 0, gramsPerUnit: 2 }, { spoolId: 1, material: '', pricePerKg: 0, gramsPerUnit: 8 }] }),
        line({ quantity: 2, filaments: [{ spoolId: 2, material: '', pricePerKg: 0, gramsPerUnit: 4 }, { spoolId: null, material: 'PETG', pricePerKg: 30000, gramsPerUnit: 500 }] }),
      ],
    };
    // yellow: 24 + 8 = 32 g needed, 30 left. White: 96 g of 640, enough. Typed materials have no stock.
    expect(spoolShortages(input, [white, yellow])).toEqual([{ spoolId: 2, needed: 32, remaining: 30 }]);
  });

  it('does not flag a spool that has exactly enough', () => {
    expect(spoolShortages({ lines: [line({ quantity: 3, filaments: [{ spoolId: 2, material: '', pricePerKg: 0, gramsPerUnit: 10 }] })] }, [yellow])).toEqual([]);
  });
});
