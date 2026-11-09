// Self-check: tools, decision rules, mood, planner and the OpenAI-compatible loop. No network, no keys.
import assert from 'node:assert/strict';
import { recommend } from '../src/assistant/decisions.ts';
import { openaiTurn, type OpenAIMessage } from '../src/assistant/llm.ts';
import { mood } from '../src/assistant/mood.ts';
import { plan } from '../src/assistant/planner.ts';
import { zoned, parseTimes } from '../src/assistant/time.ts';
import { runTool, TOOLS } from '../src/assistant/tools.ts';
import type { Card } from '../src/types.ts';
import { fakeWorld, json } from './helpers.ts';

// Strict tools need every property required and no extras.
for (const t of TOOLS.filter((t) => t.strict)) {
  assert.equal(t.input_schema.additionalProperties, false, t.name);
  assert.deepEqual([...t.input_schema.required].sort(), Object.keys(t.input_schema.properties).sort(), t.name);
}

// Time helpers
assert.deepEqual(parseTimes('tomorrow 4-5pm'), { start: [16, 0], end: [17, 0] });
assert.deepEqual(parseTimes('besok jam 15.30', 30), { start: [15, 30], end: [15, 60] });
assert.equal(parseTimes('no time here'), null);
assert.equal(zoned('Asia/Jakarta', [2026, 11, 10], 9).toISOString(), '2026-11-10T02:00:00.000Z');
assert.equal(zoned('America/New_York', [2026, 7, 1], 9).toISOString(), '2026-07-01T13:00:00.000Z');

// Tools act through the user's credentials
const { state, ctx } = fakeWorld();
const w = await runTool('get_weather', { city: 'Bandung', units: 'fahrenheit', days: 0 }, ctx);
assert.ok(!('error' in w) && w.unit === '°F' && !w.day);
assert.ok(state.calls.at(-1)!.url.includes('temperature_unit=fahrenheit'));
assert.ok('error' in await runTool('get_weather', { city: 'Nowhere', units: 'celsius' }, ctx));

const { created } = await runTool('create_calendar_event', { summary: 'Standup', start: '2026-11-10T09:00:00+07:00', end: '2026-11-10T09:30:00+07:00' }, ctx);
assert.equal(created.summary, 'Standup');
assert.equal(state.calls.at(-1)!.auth, 'Bearer g-token'); // the Token Vault token is what reaches Google
assert.equal(JSON.parse(state.calls.at(-1)!.body!).start.timeZone, 'Asia/Jakarta');
const { updated } = await runTool('update_calendar_event', { event_id: created.id!, summary: 'Daily standup' }, ctx);
assert.equal(updated.summary, 'Daily standup');
const { slots } = await runTool('find_free_time', { time_min: '2026-11-10T01:00:00Z', time_max: '2026-11-10T13:00:00Z', minutes: 60 }, ctx);
assert.deepEqual(slots.map((s) => s.start), ['2026-11-10T01:00:00.000Z', '2026-11-10T02:30:00.000Z']);
const { deleted } = await runTool('delete_calendar_event', { event_id: created.id! }, ctx);
assert.equal(deleted.summary, 'Daily standup');
assert.equal(state.events.length, 0);

state.connected = false;
await assert.rejects(runTool('list_calendar_events', { time_min: 'a', time_max: 'b' }, ctx), /not connected/);
const weatherOnly = await runTool('day_briefing', { date: '2026-11-10', city: 'Bandung', units: 'celsius' }, ctx);
assert.equal(weatherOnly.calendar, false); // still gives weather advice without a calendar
state.connected = true;

// Decision rules
const recs = recommend({
  forecast: { date: '2026-11-10', code: 63, desc: 'rain', descId: 'hujan', rain: 85, max: 33, min: 24 }, unit: '°C', tz: 'Asia/Jakarta',
  events: [
    { summary: 'Standup', start: '2026-11-10T09:00:00+07:00', end: '2026-11-10T09:30:00+07:00' },
    { summary: 'Futsal', start: '2026-11-10T09:35:00+07:00', end: '2026-11-10T10:30:00+07:00' },
  ],
  slots: [{ start: '2026-11-10T03:30:00Z', end: '2026-11-10T13:00:00Z' }],
});
assert.deepEqual(recs.map((r) => r.icon), ['☔', '🥤', '🔁', '⏱️', '🎯']);
assert.match(recs.at(-1)!.text, /10:30-20:00/);
assert.equal(recommend({ events: [] })[0].icon, '🌿');

// Mood
const card = (c: Card) => [c];
assert.equal(mood('Done.', card({ tool: 'create_calendar_event', data: { created: { summary: 'x', start: '', end: '' } } })), 'happy');
assert.equal(mood('It is raining', card({ tool: 'get_weather', data: { ...w, code: 63 } as typeof w })), 'concerned');
assert.equal(mood('Google Calendar belum terhubung'), 'confused');
assert.equal(mood('Ada 2 acara besok.'), 'neutral');

// Planner: parses the decision JSON and drops unknown tools
process.env.LLM_API_KEY = 'test-key';
const plannerFetch = (async () => json({ choices: [{ message: { content: '```json\n{"route":"agent","tools":["day_briefing","nope"],"reason":"needs advice"}\n```' } }] })) as typeof fetch;
assert.deepEqual(await plan('should I go running tomorrow?', '', plannerFetch), { route: 'agent', tools: ['day_briefing'], reason: 'needs advice' });
assert.equal(await plan('x', '', (async () => json({ choices: [{ message: { content: 'not json' } }] })) as typeof fetch), null);

// OpenAI-compatible loop (Gemini): tool call -> tool result -> final text, system prompt first
const llmCalls: { url: string; body: { model: string; tools: { function: { name: string; parameters: Record<string, unknown> } }[] }; auth: string }[] = [];
const replies: OpenAIMessage[] = [
  { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_profile', arguments: '{}' } }] },
  { role: 'assistant', content: 'Halo! Kota default kamu Bandung.' },
];
const llmFetch = (async (url: string, init: RequestInit) => {
  llmCalls.push({ url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).authorization });
  return json({ choices: [{ message: replies.shift() }] });
}) as unknown as typeof fetch;
const msgs: OpenAIMessage[] = [{ role: 'user', content: 'hi' }];
const cards: Card[] = [];
assert.equal(await openaiTurn(msgs, ctx, cards, llmFetch), 'Halo! Kota default kamu Bandung.');
assert.ok(llmCalls[0].url.endsWith('/v1beta/openai/chat/completions'));
assert.equal(llmCalls[0].auth, 'Bearer test-key');
assert.equal(llmCalls[0].body.model, 'gemini-3.8-flash');
assert.equal(llmCalls[0].body.tools.find((t) => t.function.name === 'get_profile')!.function.parameters.additionalProperties, undefined);
assert.deepEqual(msgs.map((m) => m.role), ['system', 'user', 'assistant', 'tool', 'assistant']);
assert.equal(JSON.parse(String(msgs[3].content)).city, 'Bandung');
assert.deepEqual(cards.map((c) => c.tool), ['get_profile']);

console.log('assistant ok');
