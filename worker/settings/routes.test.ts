import { describe, expect, it } from 'vitest';
import { DEFAULT_COST_SETTINGS, type CostSettings } from '../../shared/cost-settings';
import { memoryCostSettingsRepository } from './repository';
import { handleCostSettings } from './routes';

const stored: CostSettings = {
  kwhPrice: 210, labourPerHour: 7000, failurePercent: 10, marginPercent: 50, monthlyFixedCosts: 150000,
  monthlyPrintHours: 180, packagingCost: 900, roundingStep: 100, commissionPercent: 0, updatedAt: '2026-11-01T00:00:00.000Z',
};

function call(method: string, path: string, body?: unknown, seed: CostSettings | null = stored) {
  const repo = memoryCostSettingsRepository(seed);
  const url = new URL(`https://app.test${path}`);
  const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  const request = new Request(url, { method, body: payload, headers: { 'Content-Type': 'application/json' } });
  return { repo, run: () => handleCostSettings(request, url, repo) };
}

async function read(res: Response | null) {
  if (!res) throw new Error('route not handled');
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('GET /api/settings/costs', () => {
  it('returns the stored settings', async () => {
    const { run } = call('GET', '/api/settings/costs');
    expect(await read(await run())).toEqual({ status: 200, body: { settings: stored } });
  });

  it('returns the defaults when nothing is stored yet', async () => {
    const { run } = call('GET', '/api/settings/costs', undefined, null);
    expect(await read(await run())).toEqual({ status: 200, body: { settings: { ...DEFAULT_COST_SETTINGS, updatedAt: null } } });
  });
});

describe('PUT /api/settings/costs', () => {
  it('changes the fields sent, keeps the rest and stores it', async () => {
    const { run, repo } = call('PUT', '/api/settings/costs', { commissionPercent: 14.5, roundingStep: 500 });
    const { status, body } = await read(await run());
    expect(status).toBe(200);
    expect(body.settings).toEqual({ ...stored, commissionPercent: 14.5, roundingStep: 500, updatedAt: expect.any(String) });
    expect(await repo.get()).toEqual(body.settings);
  });

  it('stores over the defaults when nothing is stored yet', async () => {
    const { run, repo } = call('PUT', '/api/settings/costs', { kwhPrice: 250 }, null);
    const { status } = await read(await run());
    expect(status).toBe(200);
    expect(await repo.get()).toEqual({ ...DEFAULT_COST_SETTINGS, kwhPrice: 250, updatedAt: expect.any(String) });
  });

  it('rejects percentages out of range, a 100 % commission, 0 monthly hours and a rounding below $1, changing nothing', async () => {
    const { run, repo } = call('PUT', '/api/settings/costs', {
      failurePercent: 101, marginPercent: -5, commissionPercent: 100, monthlyPrintHours: 0, roundingStep: 0, kwhPrice: 999,
    });
    const { status, body } = await read(await run());
    expect(status).toBe(422);
    expect(body).toEqual({
      error: 'Revisá los costos del taller.',
      fields: {
        failurePercent: 'Poné un porcentaje entre 0 y 100, con hasta dos decimales.',
        marginPercent: 'El margen va de 0 a 1000 %, con hasta dos decimales.',
        commissionPercent: 'La comisión va de 0 a menos de 100 %, con hasta dos decimales.',
        monthlyPrintHours: 'Poné las horas de impresión por mes: un número entero mayor que 0.',
        roundingStep: 'El redondeo va en pesos: un número entero desde 1.',
      },
    });
    expect(await repo.get()).toEqual(stored);
  });

  it('rejects money with cents, changing nothing', async () => {
    const { run, repo } = call('PUT', '/api/settings/costs', { labourPerHour: 7000.5 });
    const { status, body } = await read(await run());
    expect(status).toBe(422);
    expect(body).toEqual({ error: 'Revisá los costos del taller.', fields: { labourPerHour: 'Poné el valor de la hora en pesos, sin centavos.' } });
    expect(await repo.get()).toEqual(stored);
  });

  it('rejects a body that is not a JSON object, changing nothing', async () => {
    for (const payload of ['no es json', '[1]']) {
      const { run, repo } = call('PUT', '/api/settings/costs', payload);
      expect(await read(await run())).toEqual({ status: 400, body: { error: 'El cuerpo tiene que ser JSON.' } });
      expect(await repo.get()).toEqual(stored);
    }
  });
});

it('rejects other methods', async () => {
  for (const method of ['POST', 'DELETE']) {
    const { run } = call(method, '/api/settings/costs');
    expect(await read(await run())).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
  }
});

it('leaves other paths to the caller', async () => {
  expect(await call('GET', '/api/settings').run()).toBeNull();
  expect(await call('GET', '/api/settings/costs/1').run()).toBeNull();
  expect(await call('GET', '/api/printers').run()).toBeNull();
});
