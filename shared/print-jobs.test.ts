import { describe, expect, it } from 'vitest';
import type { CostSettingsInput } from './cost-settings';
import { printJobProblems, realCost, realProfit, validateNewPrintJob, type CostPrinter, type CostSpool, type RealCostJob } from './print-jobs';

// Every cost at zero, so each test turns on only the term it checks.
const zero: CostSettingsInput = {
  kwhPrice: 0, labourPerHour: 0, failurePercent: 0, marginPercent: 0, monthlyFixedCosts: 0,
  monthlyPrintHours: 1, packagingCost: 0, roundingStep: 1, commissionPercent: 0,
};

const a1: CostPrinter = { powerWatts: 100, purchasePrice: 720000, lifetimeHours: 5000 };
const white: CostSpool = { price: 21000, netGrams: 1000 };
const silk: CostSpool = { price: 16000, netGrams: 500 };
// A printer with no price or draw, so a test sees only the term it checks.
const free: CostPrinter = { powerWatts: 0, purchasePrice: 0, lifetimeHours: 1 };

function job(overrides: Partial<RealCostJob> = {}): RealCostJob {
  return { status: 'terminada', actualMinutes: 60, printer: a1, filaments: [], ...overrides };
}

describe('validateNewPrintJob', () => {
  const valid = { printerId: 1, actualMinutes: 95, result: 'fallida', note: ' Se despegó ', filaments: [{ spoolId: 1, grams: 25 }, { spoolId: 2, grams: 4 }] };

  it('accepts a finished job and trims the note', () => {
    expect(validateNewPrintJob(valid)).toEqual({ ok: true, value: { ...valid, result: 'fallida', note: 'Se despegó' } });
  });

  it('defaults the note to empty', () => {
    const { note: _note, ...rest } = valid;
    expect(validateNewPrintJob(rest)).toEqual({ ok: true, value: { ...rest, result: 'fallida', note: '' } });
  });

  it('rejects minutes that are not above 0', () => {
    for (const actualMinutes of [0, -5, 12.5, '90', null]) {
      expect(validateNewPrintJob({ ...valid, actualMinutes })).toEqual({ ok: false, errors: { actualMinutes: 'Poné cuánto tardó: más de 0 minutos.' } });
    }
  });

  it('rejects the same spool twice', () => {
    const r = validateNewPrintJob({ ...valid, filaments: [{ spoolId: 1, grams: 25 }, { spoolId: 1, grams: 4 }] });
    expect(r).toEqual({ ok: false, errors: { filaments: 'Cada bobina va una sola vez: sumá sus gramos en una fila.' } });
  });

  it('needs at least one spool, each with whole grams above 0', () => {
    expect(validateNewPrintJob({ ...valid, filaments: [] })).toEqual({ ok: false, errors: { filaments: 'Cargá al menos una bobina con los gramos que usó.' } });
    expect(validateNewPrintJob({ ...valid, filaments: [{ spoolId: 1, grams: 0 }] }))
      .toEqual({ ok: false, errors: { filaments: 'Elegí cada bobina y poné sus gramos: un número entero mayor que 0.' } });
    expect(validateNewPrintJob({ ...valid, filaments: [{ spoolId: null, grams: 10 }] }))
      .toEqual({ ok: false, errors: { filaments: 'Elegí cada bobina y poné sus gramos: un número entero mayor que 0.' } });
  });

  it('needs a printer and a result of ok or fallida', () => {
    const r = validateNewPrintJob({ ...valid, printerId: 'La A1', result: 'planeada' });
    expect(r).toEqual({ ok: false, errors: { printerId: 'Elegí una impresora.', result: 'Elegí cómo salió: bien o fallida.' } });
  });

  it('reports every missing field of an empty body', () => {
    const r = validateNewPrintJob({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['actualMinutes', 'filaments', 'printerId', 'result']);
  });
});

describe('printJobProblems', () => {
  const printers = [{ id: 1 }];
  const spools = [
    { id: 1, material: 'PLA', colorName: 'Blanco', colorHex: '#ffffff', brand: 'Grilon3', netGrams: 1000, remainingGrams: 40, price: 21000 },
    { id: 2, material: 'PLA', colorName: 'Amarillo', colorHex: '#ffc42e', brand: '', netGrams: 1000, remainingGrams: 300, price: 21000 },
  ];
  const ok = { printerId: 1, actualMinutes: 30, result: 'ok' as const, note: '', filaments: [{ spoolId: 1, grams: 40 }, { spoolId: 2, grams: 10 }] };

  it('finds nothing when the printer and spools exist and every spool has enough grams', () => {
    expect(printJobProblems(ok, printers, spools)).toBeNull();
  });

  it('flags a printer that does not exist', () => {
    expect(printJobProblems({ ...ok, printerId: 9 }, printers, spools)).toEqual({ printerId: 'Esa impresora no existe.' });
  });

  it('flags a spool that does not exist', () => {
    expect(printJobProblems({ ...ok, filaments: [{ spoolId: 7, grams: 5 }] }, printers, spools)).toEqual({ filaments: 'La bobina 7 no existe.' });
  });

  it('flags a spool without enough grams, naming it', () => {
    expect(printJobProblems({ ...ok, filaments: [{ spoolId: 1, grams: 41 }] }, printers, spools))
      .toEqual({ filaments: 'A PLA Blanco · Grilon3 le quedan 40 g y cargaste 41 g.' });
  });
});

describe('realCost terms', () => {
  it('material: grams × spool price ÷ spool net weight, over every spool of the job', () => {
    // 30 g × 21000/1000 + 15 g × 16000/500 = 630 + 480 = 1110
    const r = realCost([job({ printer: free, filaments: [{ grams: 30, spool: white }, { grams: 15, spool: silk }] })], zero);
    expect(r).toMatchObject({ material: 1110, total: 1110, grams: 45 });
  });

  it('energy: watts ÷ 1000 × actual hours × kWh price', () => {
    // 100 W ÷ 1000 × 6 h × $200 = 120
    expect(realCost([job({ actualMinutes: 360 })], { ...zero, kwhPrice: 200 })).toMatchObject({ energy: 120, total: 120 + 864 });
  });

  it('machine wear: actual hours × purchase price ÷ lifetime hours', () => {
    // 6 h × 720000 ÷ 5000 = 864
    expect(realCost([job({ actualMinutes: 360 })], zero)).toMatchObject({ machineWear: 864, total: 864, minutes: 360 });
  });

  it('fixed costs: actual hours × monthly fixed costs ÷ monthly print hours', () => {
    // 6 h × 120000 ÷ 200 = 3600
    expect(realCost([job({ actualMinutes: 360, printer: free })], { ...zero, monthlyFixedCosts: 120000, monthlyPrintHours: 200 }))
      .toMatchObject({ fixedCosts: 3600, total: 3600 });
  });

  it('leaves out labour, packaging and the failure allowance', () => {
    const settings = { ...zero, labourPerHour: 6000, packagingCost: 900, failurePercent: 50, marginPercent: 60, commissionPercent: 10 };
    const r = realCost([job({ actualMinutes: 360, filaments: [{ grams: 30, spool: white }] })], settings);
    expect(r).toEqual({ material: 630, energy: 0, machineWear: 864, fixedCosts: 0, total: 1494, minutes: 360, grams: 30, jobs: 1, failedJobs: 0 });
  });

  it('counts failed jobs like the others', () => {
    const r = realCost([job({ status: 'fallida', filaments: [{ grams: 10, spool: white }] }), job({ filaments: [{ grams: 10, spool: white }] })], zero);
    expect(r).toMatchObject({ material: 420, jobs: 2, failedJobs: 1, minutes: 120, grams: 20 });
  });

  it('skips planned jobs, and is null without a printed job', () => {
    expect(realCost([job({ status: 'planeada', actualMinutes: null })], zero)).toBeNull();
    expect(realCost([], zero)).toBeNull();
  });
});

describe('realCost worked example', () => {
  /*
   * Checked by hand. Settings: kWh $215, fixed $150000 over 180 h ($833.33/h). La A1: 95 W, $720000 over 5000 h ($144/h).
   * White and yellow spools: $21000 per 1000 g ($21/g).
   *
   * Job 1, failed after 95 min (1.5833 h), 25 g of white:
   *   material 25 × 21 = 525;  energy 0.095 × 1.5833 × 215 = 32.34 → 32;  wear 1.5833 × 144 = 228;  fixed 1.5833 × 833.33 = 1319.44 → 1319
   * Job 2, ok in 420 min (7 h), 60 g of white and 35 g of yellow:
   *   material 95 × 21 = 1995;  energy 0.095 × 7 × 215 = 142.98 → 143;  wear 7 × 144 = 1008;  fixed 7 × 833.33 = 5833.33 → 5833
   * Order: material 2520, energy 175, wear 1236, fixed 7152, total 11083. Price $18000 → real profit 6917.
   */
  const settings = { ...zero, kwhPrice: 215, monthlyFixedCosts: 150000, monthlyPrintHours: 180 };
  const printer = { powerWatts: 95, purchasePrice: 720000, lifetimeHours: 5000 };
  const yellow = { price: 21000, netGrams: 1000 };
  const cost = realCost([
    job({ status: 'fallida', actualMinutes: 95, printer, filaments: [{ grams: 25, spool: white }] }),
    job({ status: 'terminada', actualMinutes: 420, printer, filaments: [{ grams: 60, spool: white }, { grams: 35, spool: yellow }] }),
  ], settings);

  it('adds every job term by term', () => {
    expect(cost).toEqual({ material: 2520, energy: 175, machineWear: 1236, fixedCosts: 7152, total: 11083, minutes: 515, grams: 120, jobs: 2, failedJobs: 1 });
  });

  it('real profit is the order price minus the real cost', () => {
    expect(realProfit(18000, cost)).toBe(6917);
    expect(realProfit(10000, cost)).toBe(-1083);
    expect(realProfit(18000, null)).toBeNull();
  });
});
