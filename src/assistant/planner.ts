// Orchestrator: a fast planner model decides the route before the main agent runs.
//   quick -> the keyword engine answers (no main-model tokens)
//   agent -> the LLM agent answers, with only the tools the planner picked
import type { Decision } from '../types.ts';
import { llmModel, llmUrl } from './llm.ts';
import { isToolName, TOOLS } from './tools.ts';

const plannerModel = () => process.env.PLANNER_MODEL || llmModel();
const QUICK = 'current weather or a forecast (today, tomorrow, this week, a named city); listing the calendar for today, tomorrow or this week; '
  + '"am I free at <time>"; adding an event with a quoted title and a time; moving or deleting an event by quoted title; '
  + 'finding free time on a day; changing one setting (city, units, nickname, language, event length, reply style); a daily briefing';

export async function plan(text: string, lastReply = '', fetchFn: typeof fetch = fetch): Promise<Decision | null> {
  if (!process.env.LLM_API_KEY) return null; // the planner runs on the OpenAI-compatible (free) model
  const res = await fetchFn(`${llmUrl()}chat/completions`, {
    method: 'POST', headers: { authorization: `Bearer ${process.env.LLM_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: plannerModel(), temperature: 0, messages: [
      { role: 'system', content: `You are the decision layer of a personal assistant. Decide how to handle the user's latest message. Reply with JSON only:
{"route":"quick"|"agent","tools":["..."],"reason":"max 12 words"}
"quick": ONE simple, explicit request a fast keyword engine handles: ${QUICK}.
"agent": everything else: follow-ups that depend on the previous reply, vague or multi-step requests, advice and decisions, chit-chat.
"tools": what the agent will need, from: ${TOOLS.map((t) => t.name).join(', ')}.` },
      ...(lastReply ? [{ role: 'assistant', content: lastReply.slice(0, 500) }] : []),
      { role: 'user', content: text },
    ] }),
  });
  const data = await res.json().catch(() => ({})) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(`planner ${res.status}: ${data.error?.message ?? ''}`);
  let j: { route?: unknown; tools?: unknown; reason?: unknown };
  try { j = JSON.parse(data.choices?.[0]?.message?.content?.match(/\{[\s\S]*\}/)?.[0] ?? ''); } catch { return null; }
  if (j.route !== 'quick' && j.route !== 'agent') return null;
  const tools = Array.isArray(j.tools) ? j.tools.filter((n): n is string => typeof n === 'string').filter(isToolName) : [];
  return { route: j.route, tools, reason: String(j.reason ?? '').slice(0, 120) };
}
