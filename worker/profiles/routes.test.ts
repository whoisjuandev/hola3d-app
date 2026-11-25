import { describe, expect, it } from 'vitest';
import type { CalcProfile } from '../../shared/calc-profiles';
import type { CalcInput } from '../../shared/calculator';
import { memoryCalcProfileRepository } from './repository';
import { handleCalcProfiles } from './routes';

const stamp = '2026-11-01T00:00:00.000Z';
const keychains: CalcInput = {
  lines: [{
    name: 'Llavero con logo', quantity: 12, printerId: 1, printMinutesPerUnit: 30,
    filaments: [{ spoolId: 1, material: '', pricePerKg: 0, gramsPerUnit: 8 }], prepMinutes: 20, postMinutes: 40, packaging: 1200,
  }],
  profit: { mode: 'multiplicador', value: 3 },
};
const sign: CalcInput = {
  lines: [{
    name: 'Cartel', quantity: 1, printerId: null, printMinutesPerUnit: 0,
    filaments: [{ spoolId: null, material: 'PETG negro', pricePerKg: 30000, gramsPerUnit: 100 }], prepMinutes: 0, postMinutes: 0, packaging: 0,
  }],
};
const wholesale: CalcProfile = { id: 1, name: 'Llaveros por mayor', input: keychains, createdAt: stamp, updatedAt: stamp };
const signs: CalcProfile = { id: 2, name: 'Carteles', input: sign, createdAt: stamp, updatedAt: stamp };

function setup() {
  const repo = memoryCalcProfileRepository([wholesale, signs]);
  const call = async (method: string, path: string, body?: unknown) => {
    const url = new URL(`https://app.test${path}`);
    const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const res = await handleCalcProfiles(new Request(url, { method, body: payload, headers: { 'Content-Type': 'application/json' } }), url, repo);
    if (!res) throw new Error('route not handled');
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  return { repo, call };
}

const INVALID = 'Revisá los datos del perfil.';

describe('GET /api/calculator/profiles', () => {
  it('lists the profiles by name', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/calculator/profiles')).toEqual({ status: 200, body: { profiles: [signs, wholesale] } });
  });
});

describe('POST /api/calculator/profiles', () => {
  it('saves the input under a trimmed name, with a printer or spool that does not exist', async () => {
    const { call, repo } = setup();
    const input: CalcInput = { lines: [{ ...keychains.lines[0], printerId: 99, filaments: [{ spoolId: 77, material: '', pricePerKg: 0, gramsPerUnit: 5 }] }] };
    const { status, body } = await call('POST', '/api/calculator/profiles', { name: '  Soportes ', input });
    expect(status).toBe(201);
    expect(body.profile).toEqual({ id: 3, name: 'Soportes', input, createdAt: expect.any(String), updatedAt: expect.any(String) });
    expect(await repo.get(3)).toEqual(body.profile);
  });

  it('rejects a name another profile has, ignoring case, storing nothing', async () => {
    const { call, repo } = setup();
    expect(await call('POST', '/api/calculator/profiles', { name: ' carteles ', input: sign })).toEqual({
      status: 422, body: { error: INVALID, fields: { name: 'Ya hay un perfil con ese nombre.' } },
    });
    expect(await repo.list()).toEqual([signs, wholesale]);
  });

  it('returns field errors and stores nothing when data is invalid', async () => {
    const { call, repo } = setup();
    expect(await call('POST', '/api/calculator/profiles', { name: 'x'.repeat(61), input: { lines: [{ ...sign.lines[0], quantity: 0 }] } })).toEqual({
      status: 422,
      body: { error: INVALID, fields: { name: 'Máximo 60 caracteres.', input: 'Pieza 1: la cantidad tiene que ser un número entero desde 1.' } },
    });
    expect(await call('POST', '/api/calculator/profiles', { name: 'Margen', input: { ...sign, profit: { mode: 'porcentaje', value: -1 } } })).toEqual({
      status: 422, body: { error: INVALID, fields: { input: 'El margen va de 0 a 1000 %, con hasta dos decimales.' } },
    });
    expect(await repo.list()).toEqual([signs, wholesale]);
  });

  it('rejects a body that is not JSON, storing nothing', async () => {
    const { call, repo } = setup();
    expect(await call('POST', '/api/calculator/profiles', 'no es json')).toEqual({ status: 400, body: { error: 'El cuerpo tiene que ser JSON.' } });
    expect(await repo.list()).toEqual([signs, wholesale]);
  });
});

describe('PUT /api/calculator/profiles/:id', () => {
  it('renames a profile, keeping its input', async () => {
    const { call, repo } = setup();
    const { status, body } = await call('PUT', '/api/calculator/profiles/1', { name: 'Llaveros x 50' });
    expect(status).toBe(200);
    expect(body.profile).toEqual({ ...wholesale, name: 'Llaveros x 50', updatedAt: expect.any(String) });
    expect(await repo.get(1)).toEqual(body.profile);
  });

  it('overwrites the input, keeping its name; the same name in other case is fine for itself', async () => {
    const { call, repo } = setup();
    const { status, body } = await call('PUT', '/api/calculator/profiles/1', { input: sign, name: 'LLAVEROS POR MAYOR' });
    expect(status).toBe(200);
    expect(body.profile).toEqual({ ...wholesale, name: 'LLAVEROS POR MAYOR', input: sign, updatedAt: expect.any(String) });
    expect(await repo.get(1)).toEqual(body.profile);
    expect((await call('PUT', '/api/calculator/profiles/2', { input: keychains })).body.profile).toMatchObject({ name: 'Carteles', input: keychains });
  });

  it('rejects the name of another profile, changing nothing', async () => {
    const { call, repo } = setup();
    expect(await call('PUT', '/api/calculator/profiles/1', { name: 'CARTELES', input: sign })).toEqual({
      status: 422, body: { error: INVALID, fields: { name: 'Ya hay un perfil con ese nombre.' } },
    });
    expect(await repo.list()).toEqual([signs, wholesale]);
  });

  it('returns field errors and changes nothing when data is invalid', async () => {
    const { call, repo } = setup();
    expect(await call('PUT', '/api/calculator/profiles/1', { name: '', input: { lines: [] } })).toEqual({
      status: 422, body: { error: INVALID, fields: { name: 'Completá este dato.', input: 'Agregá al menos una pieza.' } },
    });
    expect(await repo.list()).toEqual([signs, wholesale]);
  });

  it('rejects a body that is not a JSON object, changing nothing', async () => {
    const { call, repo } = setup();
    for (const payload of ['no es json', '[1]']) {
      expect(await call('PUT', '/api/calculator/profiles/1', payload)).toEqual({ status: 400, body: { error: 'El cuerpo tiene que ser JSON.' } });
    }
    expect(await repo.list()).toEqual([signs, wholesale]);
  });

  it('answers 404 for a profile that does not exist', async () => {
    const { call } = setup();
    expect(await call('PUT', '/api/calculator/profiles/9', { name: 'Otro' })).toEqual({ status: 404, body: { error: 'No existe el perfil 9.' } });
  });
});

describe('DELETE /api/calculator/profiles/:id', () => {
  it('deletes a profile and answers it as it was', async () => {
    const { call, repo } = setup();
    expect(await call('DELETE', '/api/calculator/profiles/2')).toEqual({ status: 200, body: { profile: signs } });
    expect(await repo.list()).toEqual([wholesale]);
  });

  it('answers 404 for a profile that does not exist, changing nothing', async () => {
    const { call, repo } = setup();
    expect(await call('DELETE', '/api/calculator/profiles/9')).toEqual({ status: 404, body: { error: 'No existe el perfil 9.' } });
    expect(await repo.list()).toEqual([signs, wholesale]);
  });
});

it('rejects other methods', async () => {
  const { call } = setup();
  for (const [method, path] of [['PUT', '/api/calculator/profiles'], ['DELETE', '/api/calculator/profiles'], ['GET', '/api/calculator/profiles/1'], ['POST', '/api/calculator/profiles/1']]) {
    expect(await call(method, path)).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
  }
});

it('leaves other paths to the caller', async () => {
  const repo = memoryCalcProfileRepository();
  for (const path of ['/api/calculator', '/api/calculator/profile', '/api/calculator/profiles/abc', '/api/calculator/profiles/1/x', '/api/quotes']) {
    const url = new URL(`https://app.test${path}`);
    expect(await handleCalcProfiles(new Request(url), url, repo)).toBeNull();
  }
});
