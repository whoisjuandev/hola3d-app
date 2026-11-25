import { describe, expect, it } from 'vitest';
import type { CostSettingsInput } from './cost-settings';
import {
  jobCost, planEditRefusal, printJobProblems, readSubmissionKey, realCost, realProfit, sameEntry, validateNewPrintJob, type CostedJob, type CostPrinter, type CostSpool, type JobCost, type JobCostInput,
} from './print-jobs';

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

function job(overrides: Partial<JobCostInput> = {}): JobCostInput {
  return { actualMinutes: 60, labourMinutes: 0, extraCost: 0, filaments: [], ...overrides };
}

const noCost: JobCost = { material: 0, energy: 0, machineWear: 0, fixedCosts: 0, labour: 0, extra: 0 };

describe('validateNewPrintJob', () => {
  const valid = { printerId: 1, actualMinutes: 95, result: 'fallida', note: ' Se despegó ', filaments: [{ spoolId: 1, grams: 25 }, { spoolId: 2, grams: 4 }] };

  it('accepts a finished job and trims the note', () => {
    expect(validateNewPrintJob(valid)).toEqual({ ok: true, value: { ...valid, result: 'fallida', note: 'Se despegó', labourMinutes: 0, extraCost: 0 } });
  });

  it('defaults the note to empty', () => {
    const { note: _note, ...rest } = valid;
    expect(validateNewPrintJob(rest)).toEqual({ ok: true, value: { ...rest, result: 'fallida', note: '', labourMinutes: 0, extraCost: 0 } });
  });

  it('accepts labour minutes and an extra cost, 0 or more', () => {
    expect(validateNewPrintJob({ ...valid, labourMinutes: 45, extraCost: 900 })).toEqual({
      ok: true, value: { ...valid, note: 'Se despegó', labourMinutes: 45, extraCost: 900 },
    });
    expect(validateNewPrintJob({ ...valid, labourMinutes: 0, extraCost: 0 })).toMatchObject({ ok: true, value: { labourMinutes: 0, extraCost: 0 } });
  });

  it('takes missing labour minutes and extra cost as 0', () => {
    for (const missing of [null, '', undefined]) {
      expect(validateNewPrintJob({ ...valid, labourMinutes: missing, extraCost: missing })).toMatchObject({ ok: true, value: { labourMinutes: 0, extraCost: 0 } });
    }
  });

  it('rejects labour minutes that are not whole minutes from 0', () => {
    for (const labourMinutes of [-1, 12.5, '45', true]) {
      expect(validateNewPrintJob({ ...valid, labourMinutes }))
        .toEqual({ ok: false, errors: { labourMinutes: 'Poné los minutos de mano de obra: un número entero desde 0.' } });
    }
  });

  it('rejects an extra cost that is not whole pesos from 0', () => {
    for (const extraCost of [-100, 99.5, '900', {}]) {
      expect(validateNewPrintJob({ ...valid, extraCost })).toEqual({ ok: false, errors: { extraCost: 'Poné el costo extra en pesos, sin centavos.' } });
    }
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

describe('jobCost terms', () => {
  it('material: grams × spool price ÷ spool net weight, over every spool of the job', () => {
    // 30 g × 21000/1000 + 15 g × 16000/500 = 630 + 480 = 1110
    expect(jobCost(job({ filaments: [{ grams: 30, spool: white }, { grams: 15, spool: silk }] }), free, zero)).toEqual({ ...noCost, material: 1110 });
  });

  it('energy: watts ÷ 1000 × actual hours × kWh price', () => {
    // 100 W ÷ 1000 × 6 h × $200 = 120
    expect(jobCost(job({ actualMinutes: 360 }), { ...free, powerWatts: 100 }, { ...zero, kwhPrice: 200 })).toEqual({ ...noCost, energy: 120 });
  });

  it('machine wear: actual hours × purchase price ÷ lifetime hours', () => {
    // 6 h × 720000 ÷ 5000 = 864
    expect(jobCost(job({ actualMinutes: 360 }), { ...a1, powerWatts: 0 }, zero)).toEqual({ ...noCost, machineWear: 864 });
  });

  it('fixed costs: actual hours × monthly fixed costs ÷ monthly print hours', () => {
    // 6 h × 120000 ÷ 200 = 3600
    expect(jobCost(job({ actualMinutes: 360 }), free, { ...zero, monthlyFixedCosts: 120000, monthlyPrintHours: 200 })).toEqual({ ...noCost, fixedCosts: 3600 });
  });

  it('labour: labour minutes ÷ 60 × the hourly rate, in whole pesos', () => {
    // 45 min × 7000/h = 5250; 40 min × 7000/h = 4666.67 → 4667
    expect(jobCost(job({ labourMinutes: 45 }), free, { ...zero, labourPerHour: 7000 })).toEqual({ ...noCost, labour: 5250 });
    expect(jobCost(job({ labourMinutes: 40 }), free, { ...zero, labourPerHour: 7000 })).toEqual({ ...noCost, labour: 4667 });
  });

  it('extra: the extra cost as logged', () => {
    expect(jobCost(job({ extraCost: 900 }), free, zero)).toEqual({ ...noCost, extra: 900 });
  });

  it('adds no failure allowance, margin, commission or default packaging', () => {
    const settings = { ...zero, failurePercent: 50, marginPercent: 60, commissionPercent: 10, packagingCost: 900, roundingStep: 100 };
    expect(jobCost(job({ actualMinutes: 360, filaments: [{ grams: 30, spool: white }] }), { ...a1, powerWatts: 0 }, settings))
      .toEqual({ ...noCost, material: 630, machineWear: 864 });
  });

  it('works out a whole job, checked by hand', () => {
    /*
     * Settings: kWh $215, labour $7000/h, fixed $150000 over 180 h ($833.33/h). La A1: 95 W, $720000 over 5000 h ($144/h).
     * 420 min (7 h), 60 g of white and 35 g of yellow at $21/g, 40 min of labour and $900 of packaging:
     *   material 95 × 21 = 1995;  energy 0.095 × 7 × 215 = 142.98 → 143;  wear 7 × 144 = 1008;  fixed 7 × 833.33 = 5833.33 → 5833;
     *   labour 40 ÷ 60 × 7000 = 4666.67 → 4667;  extra 900.
     */
    const settings = { ...zero, kwhPrice: 215, labourPerHour: 7000, monthlyFixedCosts: 150000, monthlyPrintHours: 180 };
    const yellow = { price: 21000, netGrams: 1000 };
    const cost = jobCost(
      job({ actualMinutes: 420, labourMinutes: 40, extraCost: 900, filaments: [{ grams: 60, spool: white }, { grams: 35, spool: yellow }] }),
      { powerWatts: 95, purchasePrice: 720000, lifetimeHours: 5000 }, settings,
    );
    expect(cost).toEqual({ material: 1995, energy: 143, machineWear: 1008, fixedCosts: 5833, labour: 4667, extra: 900 });
  });
});

describe('realCost from stored job costs', () => {
  // Stored terms, as logged; realCost never sees a printer, spool or setting.
  const first: CostedJob = {
    status: 'fallida', actualMinutes: 95, filaments: [{ grams: 25 }],
    cost: { material: 525, energy: 32, machineWear: 228, fixedCosts: 1319, labour: 0, extra: 0 },
  };
  const second: CostedJob = {
    status: 'terminada', actualMinutes: 420, filaments: [{ grams: 60 }, { grams: 35 }],
    cost: { material: 1995, energy: 143, machineWear: 1008, fixedCosts: 5833, labour: 4667, extra: 900 },
  };

  it('adds every stored term over the jobs, failed ones included', () => {
    expect(realCost([first, second])).toEqual({
      material: 2520, energy: 175, machineWear: 1236, fixedCosts: 7152, labour: 4667, extra: 900, total: 16650,
      minutes: 515, grams: 120, jobs: 2, failedJobs: 1,
    });
  });

  it('adds labour and the extra cost to the total', () => {
    const labourOnly: CostedJob = { ...second, cost: { ...noCost, labour: 3000, extra: 500 } };
    expect(realCost([labourOnly])).toMatchObject({ labour: 3000, extra: 500, total: 3500 });
  });

  it('counts a failed job like the others, with no failure allowance on top', () => {
    expect(realCost([first])).toEqual({
      material: 525, energy: 32, machineWear: 228, fixedCosts: 1319, labour: 0, extra: 0, total: 2104, minutes: 95, grams: 25, jobs: 1, failedJobs: 1,
    });
  });

  it('skips planned jobs, and is null without a printed job', () => {
    expect(realCost([{ status: 'planeada', actualMinutes: null, filaments: [], cost: noCost }])).toBeNull();
    expect(realCost([])).toBeNull();
  });

  it('real profit is the order price minus the real cost', () => {
    const cost = realCost([first, second]);
    expect(realProfit(18000, cost)).toBe(1350);
    expect(realProfit(10000, cost)).toBe(-6650);
    expect(realProfit(18000, null)).toBeNull();
  });
});

describe('readSubmissionKey', () => {
  it('reads the key a form made for one save, and no key when it is missing', () => {
    expect(readSubmissionKey({ submissionKey: '0b6c5f4e-9a51-4c1e-8f43-2f1d3c4b5a69' })).toEqual({ ok: true, value: '0b6c5f4e-9a51-4c1e-8f43-2f1d3c4b5a69' });
    expect(readSubmissionKey({})).toEqual({ ok: true, value: null });
    expect(readSubmissionKey({ submissionKey: null })).toEqual({ ok: true, value: null });
    expect(readSubmissionKey({ submissionKey: '' })).toEqual({ ok: true, value: null });
  });

  it('rejects a key that is not 8 to 64 letters, digits or dashes', () => {
    const errors = { submissionKey: 'La clave de envío tiene que tener de 8 a 64 letras, números o guiones.' };
    expect(readSubmissionKey({ submissionKey: 'corta' })).toEqual({ ok: false, errors });
    expect(readSubmissionKey({ submissionKey: 'x'.repeat(65) })).toEqual({ ok: false, errors });
    expect(readSubmissionKey({ submissionKey: 'con espacios adentro' })).toEqual({ ok: false, errors });
    expect(readSubmissionKey({ submissionKey: 12345678 })).toEqual({ ok: false, errors });
  });
});

describe('planEditRefusal', () => {
  it('says why a plan edit cannot apply: the job is gone from the order, or it is no longer planned', () => {
    expect(planEditRefusal('0143', 2, undefined)).toBe('El pedido #0143 no tiene la impresión 2.');
    expect(planEditRefusal('0143', 2, { orderId: '0142', status: 'planeada' })).toBe('El pedido #0143 no tiene la impresión 2.');
    expect(planEditRefusal('0143', 2, { orderId: '0143', status: 'terminada' })).toBe('La impresión 2 ya se cargó como terminada: su plan no cambia.');
    expect(planEditRefusal('0143', 2, { orderId: '0143', status: 'fallida' })).toBe('La impresión 2 ya se cargó como terminada: su plan no cambia.');
  });

  it('has nothing to say while the job is still a planned job of the order', () => {
    expect(planEditRefusal('0143', 2, { orderId: '0143', status: 'planeada' })).toBeNull();
  });
});

describe('sameEntry', () => {
  const stored = { printerId: 1, actualMinutes: 90, result: 'ok' as const, labourMinutes: 10, extraCost: 500, note: 'Salió', filaments: [{ spoolId: 2, grams: 30 }, { spoolId: 1, grams: 5 }] };
  const sent = { ...stored, filaments: [{ spoolId: 1, grams: 5 }, { spoolId: 2, grams: 30 }] };

  it('matches the same data whatever the order of the filaments', () => {
    expect(sameEntry(stored, sent)).toBe(true);
  });

  it('does not match when any field or any filament use differs', () => {
    expect(sameEntry(stored, { ...sent, actualMinutes: 91 })).toBe(false);
    expect(sameEntry(stored, { ...sent, printerId: 2 })).toBe(false);
    expect(sameEntry(stored, { ...sent, result: 'fallida' })).toBe(false);
    expect(sameEntry(stored, { ...sent, labourMinutes: 0 })).toBe(false);
    expect(sameEntry(stored, { ...sent, extraCost: 0 })).toBe(false);
    expect(sameEntry(stored, { ...sent, note: '' })).toBe(false);
    expect(sameEntry(stored, { ...sent, filaments: [{ spoolId: 1, grams: 5 }] })).toBe(false);
    expect(sameEntry(stored, { ...sent, filaments: [{ spoolId: 1, grams: 6 }, { spoolId: 2, grams: 30 }] })).toBe(false);
  });
});
