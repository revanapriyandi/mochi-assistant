// Self-check: the keyword engine (fast path), in English and Indonesian. No network.
import assert from 'node:assert/strict';
import { localChat } from '../src/assistant/keyword.ts';
import { fakeWorld } from './helpers.ts';

const { state, ctx } = fakeWorld();
const tools = (r: { cards: { tool: string }[] }) => r.cards.map((c) => c.tool);

let r = await localChat("What's the weather today?", ctx);
assert.deepEqual(tools(r), ['get_profile', 'get_weather']);
assert.match(r.text, /Bandung.*default city/);

r = await localChat('Weather in Tokyo?', ctx);
assert.match(r.text, /Tokyo/);
assert.doesNotMatch(r.text, /default city/);

// Settings
await localChat('Change my city to Surabaya', ctx);
assert.equal(state.profile.city, 'Surabaya');
await localChat('use fahrenheit please', ctx);
assert.equal(state.profile.units, 'fahrenheit');
r = await localChat('call me Revan', ctx);
assert.deepEqual(tools(r), ['get_profile', 'update_profile']);
assert.equal(state.profile.nickname, 'Revan');
await localChat('make my events 45 minutes', ctx);
assert.equal(state.profile.eventMinutes, 45);
await localChat('be friendly', ctx);
assert.equal(state.profile.style, 'friendly');
r = await localChat('pakai bahasa indonesia ya', ctx);
assert.equal(state.profile.language, 'id');
assert.match(r.text, /Tersimpan.*panggil kamu Revan/);

// Calendar, now answered in Indonesian with the 45-minute default
r = await localChat('Tambah "Rapat tim" besok jam 9', ctx);
assert.deepEqual(tools(r), ['get_profile', 'create_calendar_event']);
assert.equal(state.events[0].summary, 'Rapat tim');
assert.equal((new Date(state.events[0].end.dateTime).getTime() - new Date(state.events[0].start.dateTime).getTime()) / 60000, 45);
assert.match(r.text, /Beres.*besok jam 09:00/);
await localChat("Add 'Demo prep' tomorrow 4-5pm", ctx);
r = await localChat('Add lunch', ctx);
assert.match(r.text, /Jam berapa/);

r = await localChat('jadwal besok', ctx);
assert.match(r.text, /Ada 2 acara besok/);
r = await localChat('am I free tomorrow at 4:30pm?', ctx);
assert.match(r.text, /sibuk.*Demo prep/);
r = await localChat('am I free tomorrow at 7pm?', ctx);
assert.match(r.text, /kosong besok jam 19:00/);

// Free time: Rapat tim 09:00-09:45 and Demo prep 16:00-17:00 block the 08:00-20:00 window
r = await localChat('cari waktu kosong besok 90 menit', ctx);
assert.deepEqual(tools(r), ['get_profile', 'find_free_time']);
assert.match(r.text, /09:45-16:00, 17:00-20:00/);
assert.doesNotMatch(r.text, /08:00-09:00/); // only 60 minutes, shorter than 90

// Move keeps the length; delete removes it
r = await localChat("pindahkan 'Demo prep' ke jam 18", ctx);
assert.deepEqual(tools(r), ['get_profile', 'list_calendar_events', 'update_calendar_event']);
assert.match(r.text, /dipindah.*18:00/);
const demo = state.events.find((e) => e.summary === 'Demo prep')!;
assert.equal((new Date(demo.end.dateTime).getTime() - new Date(demo.start.dateTime).getTime()) / 60000, 60);
r = await localChat("hapus 'Rapat tim'", ctx);
assert.deepEqual(tools(r), ['get_profile', 'list_calendar_events', 'delete_calendar_event']);
assert.deepEqual(state.events.map((e) => e.summary), ['Demo prep']);
state.approves = false; // vetoed on the phone: Mochi says so, the event stays
r = await localChat("hapus 'Demo prep'", ctx);
assert.match(r.text, /Tidak disetujui/);
assert.deepEqual(state.events.map((e) => e.summary), ['Demo prep']);
state.approves = true;
r = await localChat("hapus 'Tidak ada'", ctx);
assert.match(r.text, /tidak menemukan/);

// Forecast, in Indonesian descriptions
r = await localChat('cuaca besok?', ctx);
assert.match(r.text, /Besok di Surabaya.*hujan.*21 sampai 30°F.*80%/);
r = await localChat('weather this week', ctx);
assert.match(r.text, /Minggu ini di Surabaya/);

// Decision support: tomorrow has Demo prep 18:00-19:00 and an 80% rain forecast
r = await localChat('brief me on tomorrow', ctx);
assert.deepEqual(tools(r), ['get_profile', 'day_briefing']);
const brief = r.cards.at(-1)!;
assert.ok(brief.tool === 'day_briefing');
assert.equal(brief.data.forecast?.rain, 80);
assert.equal(brief.data.events.length, 1);
assert.ok(brief.data.recommendations.some((x) => x.icon === '☔'));
assert.match(r.text, /Gambaran besok.*bawa payung/);

state.connected = false;
r = await localChat('jadwal besok', ctx);
assert.match(r.text, /belum terhubung/);
state.connected = true;

r = await localChat('halo', ctx);
assert.match(r.text, /Halo Revan/);
assert.equal(r.handled, false); // not understood -> the orchestrator may hand it to the LLM

console.log('keyword ok');
