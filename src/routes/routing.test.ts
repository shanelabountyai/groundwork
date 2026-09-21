import { afterEach, describe, expect, it, vi } from 'vitest';
import { estimate, type Point } from './route';
import { estimateDrive } from './routing';

const home: Point = { lat: 36.154, lng: -95.993 };
const stops: Point[] = [{ lat: 36.06, lng: -95.85 }, { lat: 36.2, lng: -96.02 }];

afterEach(() => {
  delete process.env.OSRM_BASE_URL;
  vi.unstubAllGlobals();
});

describe('estimateDrive', () => {
  it('falls back to the straight-line estimate when OSRM_BASE_URL is unset', async () => {
    expect(await estimateDrive(home, stops)).toEqual(estimate(home, stops));
  });

  it('calls OSRM and returns its miles/minutes when configured', async () => {
    process.env.OSRM_BASE_URL = 'https://osrm.example.com';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ routes: [{ distance: 16093.4, duration: 900 }] }), // 10 mi, 15 min
    }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await estimateDrive(home, stops)).toEqual({ miles: 10, driveMinutes: 15 });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('https://osrm.example.com/route/v1/driving/'), expect.any(Object));
  });

  it('falls back on a non-2xx response', async () => {
    process.env.OSRM_BASE_URL = 'https://osrm.example.com';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    expect(await estimateDrive(home, stops)).toEqual(estimate(home, stops));
  });

  it('falls back on a network error', async () => {
    process.env.OSRM_BASE_URL = 'https://osrm.example.com';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await estimateDrive(home, stops)).toEqual(estimate(home, stops));
  });

  it('skips the network call entirely for an empty day', async () => {
    process.env.OSRM_BASE_URL = 'https://osrm.example.com';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await estimateDrive(home, [])).toEqual({ miles: 0, driveMinutes: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
