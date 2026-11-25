// The cost settings D1 adapter's SQL run against a real SQLite database with the migrations applied.
import { describe, expect, it } from 'vitest';
import { DEFAULT_COST_SETTINGS } from '../../shared/cost-settings';
import { sqliteD1 } from '../print-jobs/sqlite-d1';
import { d1CostSettingsRepository } from './repository';

describe('D1 cost settings', () => {
  it('reads the migrated row with the starting profit settings', async () => {
    const { db } = await sqliteD1();
    expect(await d1CostSettingsRepository(db).get()).toEqual({ ...DEFAULT_COST_SETTINGS, updatedAt: null });
  });

  it('saves the profit mode, multiplier and shortcuts and reads them back', async () => {
    const { db, sql } = await sqliteD1();
    const repo = d1CostSettingsRepository(db);
    const shortcuts = [{ name: 'Mayorista', multiplier: 2.5 }, { name: 'Ñandú', multiplier: 6 }];
    const saved = await repo.save({ ...DEFAULT_COST_SETTINGS, marginPercent: 60, profitMode: 'multiplicador', profitMultiplier: 1.75, profitShortcuts: shortcuts });
    expect(saved).toEqual({
      ...DEFAULT_COST_SETTINGS, marginPercent: 60, profitMode: 'multiplicador', profitMultiplier: 1.75, profitShortcuts: shortcuts, updatedAt: expect.any(String),
    });
    expect(await repo.get()).toEqual(saved);
    expect(sql.prepare('SELECT profit_mode, profit_multiplier, profit_shortcuts_json FROM cost_settings').all()).toEqual([
      { profit_mode: 'multiplicador', profit_multiplier: 1.75, profit_shortcuts_json: JSON.stringify(shortcuts) },
    ]);
  });

  it('rejects in SQL a multiplier out of range and an empty shortcut list', async () => {
    const { sql } = await sqliteD1();
    expect(() => sql.exec('UPDATE cost_settings SET profit_multiplier = 12')).toThrow();
    expect(() => sql.exec("UPDATE cost_settings SET profit_shortcuts_json = '[]'")).toThrow();
    expect(() => sql.exec("UPDATE cost_settings SET profit_mode = 'doble'")).toThrow();
  });
});
