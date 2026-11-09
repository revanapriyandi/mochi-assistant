// A fake world for the self-checks: Open-Meteo, Google Calendar and the profile API, all in memory.
import type { ToolCtx } from '../src/assistant/context.ts';
import { isoDate } from '../src/assistant/time.ts';
import type { Profile } from '../src/types.ts';

export const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response;

export interface FakeEvent { id: string; summary: string; start: { dateTime: string; timeZone?: string }; end: { dateTime: string; timeZone?: string } }

export function fakeWorld(profile: Partial<Profile> = {}) {
  const state = {
    profile: { city: 'Bandung', units: 'celsius', nickname: '', language: 'en', eventMinutes: 30, style: 'concise', voice: 'cgSgspJ2msm6clMCkdW9', ...profile } as Profile,
    events: [] as FakeEvent[],
    calls: [] as { url: string; method: string; body?: string; auth?: string }[],
    connected: true,
  };
  const fetchFn = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    state.calls.push({ url, method, body: init.body as string | undefined, auth: (init.headers as Record<string, string> | undefined)?.authorization });
    if (url.includes('geocoding')) {
      const name = decodeURIComponent(new URL(url).searchParams.get('name') ?? '');
      return json({ results: /nowhere/i.test(name) ? undefined : [{ name, country: 'Indonesia', latitude: 1, longitude: 2 }] });
    }
    if (url.includes('open-meteo')) {
      const n = Number(new URL(url).searchParams.get('forecast_days') ?? 0);
      const dates = [...Array(n)].map((_, i) => isoDate(new Date(Date.now() + i * 864e5), 'Asia/Jakarta'));
      return json({
        current: { temperature_2m: 25.4, apparent_temperature: 27, relative_humidity_2m: 70, wind_speed_10m: 5, weather_code: 1, is_day: 0 },
        ...(n && { daily: { time: dates, weather_code: Array(n).fill(63), temperature_2m_max: Array(n).fill(29.6),
          temperature_2m_min: Array(n).fill(21.2), precipitation_probability_max: Array(n).fill(80) } }),
      });
    }
    const id = url.match(/\/events\/([^?]+)/)?.[1];
    const withLink = (e: FakeEvent) => ({ ...e, htmlLink: `https://cal/${e.id}` });
    if (method === 'POST') {
      const e = { ...JSON.parse(String(init.body)), id: `e${state.events.length + 1}` } as FakeEvent;
      state.events.push(e);
      return json(withLink(e));
    }
    if (method === 'PATCH') {
      const e = state.events.find((x) => x.id === id)!;
      Object.assign(e, JSON.parse(String(init.body)));
      return json(withLink(e));
    }
    if (method === 'DELETE') {
      state.events = state.events.filter((x) => x.id !== id);
      return { ok: true, status: 204 } as Response;
    }
    if (id) return json(withLink(state.events.find((x) => x.id === id)!));
    return json({ items: [...state.events].sort((a, b) => a.start.dateTime.localeCompare(b.start.dateTime)).map(withLink) });
  }) as typeof fetch;

  const ctx: ToolCtx = {
    name: 'Ana', timeZone: 'Asia/Jakarta', fetch: fetchFn,
    getProfile: async () => state.profile,
    saveProfile: async (p) => (state.profile = { ...state.profile, ...p }),
    googleToken: async () => { if (!state.connected) throw new Error('Google Calendar is not connected'); return 'g-token'; },
  };
  return { state, ctx };
}
