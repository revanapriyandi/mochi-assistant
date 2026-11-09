// One conversation turn: planner -> keyword engine or LLM agent -> mood, with a keyword fallback
// when the LLM is unavailable (free tiers hit quotas; the demo keeps working).
import type { Card, ChatReply, Decision } from '../types.ts';
import { chatLog } from './chat-log.ts';
import type { ToolCtx } from './context.ts';
import { localChat } from './keyword.ts';
import { claudeTurn, groq, openaiTurn, type OpenAIMessage } from './llm.ts';
import { mood } from './mood.ts';
import { plan } from './planner.ts';
import type Anthropic from '@anthropic-ai/sdk';

export { brain } from './llm.ts';

type Message = Anthropic.Beta.BetaMessageParam | OpenAIMessage;
// ponytail: the LLM context is in memory per user (lost on restart); the visible transcript is in chatLog.
const histories = new Map<string, Message[]>();

export const resetChat = (userId: string) => histories.delete(userId);
export const transcript = (userId: string) => chatLog.read(userId);
export const clearTranscript = async (userId: string) => { histories.delete(userId); await chatLog.clear(userId); };

const textOf = (m: Message | undefined): string => {
  if (!m) return '';
  if (typeof m.content === 'string') return m.content;
  if (!Array.isArray(m.content)) return '';
  return m.content.flatMap((b) => (typeof b === 'object' && b && 'type' in b && b.type === 'text' && 'text' in b ? [String(b.text)] : [])).join(' ');
};

async function think(userId: string, text: string, ctx: ToolCtx): Promise<Omit<ChatReply, 'mood'>> {
  const useClaude = Boolean(process.env.ANTHROPIC_API_KEY);
  const backend = groq();
  if (!useClaude && !backend) return localChat(text, ctx); // no key: keyword engine only

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
  try {
    const reply = useClaude
      ? await claudeTurn(messages as Anthropic.Beta.BetaMessageParam[], ctx, cards)
      : await openaiTurn(messages as OpenAIMessage[], ctx, cards, fetch, backend!);
    return { text: reply, cards, decision: agent };
  } catch (err) {
    return keywordFallback(userId, text, ctx, err);
  }
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
  // A failing store must not lose the reply the user is waiting for.
  await chatLog.append(userId, [{ who: 'me', text, at: now }, { who: 'bot', text: out.text, at: now + 1, mood: out.mood, tools: out.cards.map((c) => c.tool) }])
    .catch((err: Error) => console.error('chat log:', err.message));
  return out;
}
