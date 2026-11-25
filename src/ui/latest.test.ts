import { describe, expect, it } from 'vitest';
import { latestRequests } from './latest';

describe('latestRequests', () => {
  it('keeps only the newest request: an older answer that arrives later is dropped', () => {
    const requests = latestRequests();
    const first = requests.start(); // the first load
    expect(first()).toBe(true);
    const refresh = requests.start(); // a refresh after a save, before the first load answered
    expect(first()).toBe(false);
    expect(refresh()).toBe(true);
  });

  it('drops every answer still on its way once cancelled', () => {
    const requests = latestRequests();
    const load = requests.start();
    requests.cancel();
    expect(load()).toBe(false);
    expect(requests.start()()).toBe(true);
  });
});
