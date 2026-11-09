// The assistant's tools. Each one acts as the signed-in user:
//   get_profile / update_profile  -> first-party API with the user's Auth0 access token
//   get_weather                   -> Open-Meteo (public)
//   *_calendar_event, find_free_time, day_briefing -> Google Calendar via Auth0 Token Vault
import type { Briefing, Profile, ToolName, ToolResults, Units } from '../types.ts';
import { createEvent, deleteEvent, freeSlots, listEvents, updateEvent } from './calendar.ts';
import type { ToolCtx } from './context.ts';
import { dayBounds, recommend } from './decisions.ts';
import { weather } from './weather.ts';

export interface ToolInputs {
  get_profile: Record<string, never>;
  update_profile: Partial<Profile>;
  get_weather: { city: string; units: Units; days?: number };
  list_calendar_events: { time_min: string; time_max: string };
  create_calendar_event: { summary: string; start: string; end: string };
  update_calendar_event: { event_id: string; summary?: string; start?: string; end?: string };
  delete_calendar_event: { event_id: string };
  day_briefing: { date: string; city: string; units: Units };
  find_free_time: { time_min: string; time_max: string; minutes: number };
}

interface JsonSchema { type: 'object'; properties: Record<string, unknown>; required: string[]; additionalProperties: false }
export interface ToolDef { name: ToolName; description: string; strict?: boolean; input_schema: JsonSchema }

const obj = (properties: Record<string, unknown>, required = Object.keys(properties)): JsonSchema =>
  ({ type: 'object', properties, required, additionalProperties: false });
const iso = { type: 'string', description: 'ISO 8601 date-time with UTC offset, e.g. 2026-11-10T09:00:00+07:00' };
const units = { type: 'string', enum: ['celsius', 'fahrenheit'] };

export const TOOLS: ToolDef[] = [
  { name: 'get_profile', strict: true, input_schema: obj({}),
    description: "Read the user's saved settings from the first-party profile API: city, units, nickname, language (en|id), eventMinutes (default event length), style (concise|friendly). Call it at the start of every conversation and follow those settings." },
  { name: 'update_profile',
    input_schema: obj({ city: { type: 'string' }, units, nickname: { type: 'string' }, language: { type: 'string', enum: ['en', 'id'] },
      eventMinutes: { type: 'integer', minimum: 5, maximum: 480 }, style: { type: 'string', enum: ['concise', 'friendly'] } }, []),
    description: "Change the user's saved settings. Send only the fields the user asked to change. Only call it when the user asks." },
  { name: 'get_weather', strict: true,
    input_schema: obj({ city: { type: 'string' }, units,
      days: { type: 'integer', minimum: 0, maximum: 7, description: '0 = current only; 1-7 = also a daily forecast for that many days, starting today' } }),
    description: 'Current weather and optional daily forecast for a city (Open-Meteo). Use the profile city and units unless the user names others.' },
  { name: 'list_calendar_events', strict: true, input_schema: obj({ time_min: iso, time_max: iso }),
    description: "List events on the user's primary Google Calendar between two date-times. Each event has an id used by update/delete." },
  { name: 'create_calendar_event', strict: true, input_schema: obj({ summary: { type: 'string' }, start: iso, end: iso }),
    description: "Create an event on the user's primary Google Calendar. If the user gives no end time, make it last eventMinutes from their profile. If they gave no title or no start time, ask first instead of guessing." },
  { name: 'update_calendar_event', input_schema: obj({ event_id: { type: 'string' }, summary: { type: 'string' }, start: iso, end: iso }, ['event_id']),
    description: 'Rename or move an event (get its id from list_calendar_events). When moving, keep its length unless the user says otherwise.' },
  { name: 'delete_calendar_event', strict: true, input_schema: obj({ event_id: { type: 'string' } }),
    description: 'Delete an event (get its id from list_calendar_events). Only when the user clearly asked to delete that event; if several match, ask which one.' },
  { name: 'day_briefing', strict: true,
    input_schema: obj({ date: { type: 'string', description: 'YYYY-MM-DD in the user timezone' }, city: { type: 'string' }, units }),
    description: "Decision support for one day (today up to 6 days ahead): combines the forecast, the user's events and free blocks, and returns concrete recommendations. Use it for 'how does my day look', 'should I...', 'when is the best time to...' questions, then explain the recommendations." },
  { name: 'find_free_time', strict: true, input_schema: obj({ time_min: iso, time_max: iso, minutes: { type: 'integer', minimum: 5, maximum: 480 } }),
    description: "Find gaps of at least `minutes` in the user's Google Calendar between two date-times (use waking hours, e.g. 08:00-20:00, unless asked otherwise)." },
];
export const isToolName = (n: string): n is ToolName => TOOLS.some((t) => t.name === n);

async function briefing(input: ToolInputs['day_briefing'], ctx: ToolCtx): Promise<Briefing> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('date must be YYYY-MM-DD');
  const b = dayBounds(input.date, ctx.timeZone);
  const lang = (await ctx.getProfile().catch(() => null))?.language;
  const w = await weather(input.city, input.units, 7, ctx.fetch);
  const forecast = w?.forecast?.find((d) => d.date === input.date) ?? null;
  let events: Briefing['events'] = [], slots: Briefing['slots'] = [], calendar = true;
  try {
    events = await listEvents(ctx, b.start, b.end);
    const inWindow = events.filter((e) => new Date(e.end) > new Date(b.from) && new Date(e.start) < new Date(b.to));
    slots = freeSlots(inWindow, b.from, b.to, 30);
  } catch (err) {
    if (!/not connected/i.test((err as Error).message)) throw err;
    calendar = false; // still useful: weather-only advice
  }
  return { date: input.date, place: w?.place, unit: w?.unit, forecast, events, slots, calendar,
    recommendations: recommend({ forecast, unit: w?.unit, events, slots, tz: ctx.timeZone, lang }) };
}

const HANDLERS: { [N in ToolName]: (input: ToolInputs[N], ctx: ToolCtx) => Promise<ToolResults[N]> } = {
  get_profile: (_, ctx) => ctx.getProfile(),
  update_profile: (input, ctx) => ctx.saveProfile(input),
  get_weather: async (i, ctx) => (await weather(i.city, i.units, i.days ?? 0, ctx.fetch)) ?? { error: `No place called "${i.city}"` },
  list_calendar_events: async (i, ctx) => ({ events: await listEvents(ctx, i.time_min, i.time_max) }),
  create_calendar_event: async (i, ctx) => ({ created: await createEvent(ctx, i.summary, i.start, i.end) }),
  update_calendar_event: async (i, ctx) => ({ updated: await updateEvent(ctx, i.event_id, i) }),
  delete_calendar_event: async (i, ctx) => ({ deleted: await deleteEvent(ctx, i.event_id) }),
  day_briefing: briefing,
  find_free_time: async (i, ctx) => ({ slots: freeSlots(await listEvents(ctx, i.time_min, i.time_max), i.time_min, i.time_max, i.minutes) }),
};

export function runTool<N extends ToolName>(name: N, input: ToolInputs[N], ctx: ToolCtx): Promise<ToolResults[N]> {
  const handler = HANDLERS[name] as ((i: ToolInputs[N], c: ToolCtx) => Promise<ToolResults[N]>) | undefined;
  if (!handler) return Promise.reject(new Error(`Unknown tool ${name}`));
  return handler(input, ctx);
}
