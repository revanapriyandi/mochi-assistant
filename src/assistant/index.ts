// One conversation turn: planner -> keyword engine or LLM agent -> mood, with a keyword fallback
// when the LLM is unavailable (free tiers hit quotas; the demo keeps working).
import type { Card, ChatReply, Decision, TranscriptLine } from '../types.ts';
import type { ToolCtx } from './context.ts';
import { localChat } from './keyword.ts';
import { claudeTurn, openaiTurn, providers, type OpenAIMessage } from './llm.ts';
import { mood } from './mood.ts';
import { plan } from './planner.ts';
import type Anthropic from '@anthropic-ai/sdk';

export { brain } from './llm.ts';

type Message = Anthropic.Beta.BetaMessageParam | OpenAIMessage;
// ponytail: in memory per user (lost on restart, single instance). Use a store to scale out.
const histories = new Map<string, Message[]>();
const transcripts = new Map<string, TranscriptLine[]>();

export const resetChat = (userId: string) => histories.delete(userId);
export const transcript = (userId: string): TranscriptLine[] => transcripts.get(userId) ?? [];
export const clearTranscript = (userId: string) => { transcripts.delete(userId); histories.delete(userId); };

const textOf = (m: Message | undefined): string => {
  if (!m) return '';
  if (typeof m.content === 'string') return m.content;
  if (!Array.isArray(m.content)) return '';
  return m.content.flatMap((b) => (typeof b === 'object' && b && 'type' in b && b.type === 'text' && 'text' in b ? [String(b.text)] : [])).join(' ');
};

async function think(userId: string, text: string, ctx: ToolCtx): Promise<Omit<ChatReply, 'mood'>> {
  const useClaude = Boolean(process.env.ANTHROPIC_API_KEY);
  const backends = providers();
  if (!useClaude && !backends.length) return localChat(text, ctx); // no key: keyword engine only

  let messages = histories.get(userId);
  if (!messages || messages.length > 80) histories.set(userId, (messages = [])); // ponytail: reset, not compaction
  const lastReply = textOf([...messages].reverse().find((m) => m.role === 'assistant'));

  const decision: Decision | null = await plan(text, lastReply).catch((err: Error) => { console.error(err.message); return null; });
  if (decision?.route === 'quick') {
    const r = await localChat(text, ctx);
    if (r.handled !== false) {
      messages.push({ role: 'user', content: text }, { role: 'assistant', content: r.text }); // keep the agent's context
      return { text: r.text, cards: r.cards, decision };
    }
  }
  // Tool subsets only for OpenAI-compatible models: changing Claude's tool list mid-conversation breaks its thinking cache.
  ctx.tools = !useClaude && decision?.tools.length ? new Set(['get_profile', ...decision.tools]) : null;
  // The clock goes in the user turn, not the system prompt, so the history stays append-only.
  messages.push({ role: 'user', content: `[now: ${new Date().toLocaleString('sv-SE', { timeZone: ctx.timeZone })} ${ctx.timeZone}]\n${text}` });
  const cards: Card[] = [];
  const agent = decision && { ...decision, route: 'agent' as const };
  if (useClaude) {
    try {
      return { text: await claudeTurn(messages as Anthropic.Beta.BetaMessageParam[], ctx, cards), cards, decision: agent };
    } catch (err) {
      return keywordFallback(userId, text, ctx, err);
    }
  }
  // Failover: Gemini, then Groq. Each try starts from the same history, so a half-finished turn never leaks.
  // ponytail: a tool that already ran (e.g. created an event) may run again on the next backend; rare, accepted.
  const before = messages.slice();
  for (const [i, p] of backends.entries()) {
    try {
      const reply = await openaiTurn(messages as OpenAIMessage[], ctx, cards, fetch, p);
      return { text: reply, cards, decision: agent, ...(i > 0 ? { note: `${backends[0].name} unavailable, answered by ${p.name}` } : {}) };
    } catch (err) {
      console.error(`${p.name} failed:`, (err as Error).message);
      messages.splice(0, messages.length, ...before);
      cards.length = 0;
      if (i === backends.length - 1) return keywordFallback(userId, text, ctx, err);
    }
  }
  return keywordFallback(userId, text, ctx, new Error('no backend'));
}

async function keywordFallback(userId: string, text: string, ctx: ToolCtx, err: unknown): Promise<Omit<ChatReply, 'mood'>> {
  resetChat(userId); // a half-finished turn would make the next request invalid
  console.error('LLM failed, using keyword mode:', (err as Error).message);
  const r = await localChat(text, ctx);
  return { text: r.text, cards: r.cards, note: 'LLM unavailable, answered in keyword mode' };
}

export async function chat(userId: string, text: string, ctx: ToolCtx): Promise<ChatReply> {
  const r = await think(userId, text, ctx);
  const out: ChatReply = { ...r, mood: mood(r.text, r.cards) };
  const now = Date.now();
  const log = transcript(userId);
  log.push({ who: 'me', text, at: now }, { who: 'bot', text: out.text, at: now, mood: out.mood, tools: out.cards.map((c) => c.tool) });
  transcripts.set(userId, log.slice(-200)); // ponytail: last 200 lines
  return out;
}
