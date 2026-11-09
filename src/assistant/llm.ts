// LLM brains. Claude (ANTHROPIC_API_KEY) if set; otherwise OpenAI-compatible endpoints in failover
// order: free Gemini (LLM_API_KEY), then free Groq (GROQ_API_KEY). All run the same tools in a manual loop.
import Anthropic from '@anthropic-ai/sdk';
import type { Card, ToolName } from '../types.ts';
import type { ToolCtx } from './context.ts';
import { isToolName, runTool, TOOLS, type ToolInputs } from './tools.ts';

export const CLAUDE_MODEL = 'claude-opus-5-5';
export const llmUrl = () => (process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/').replace(/\/?$/, '/');
export const llmModel = () => process.env.LLM_MODEL || 'gemini-3.8-flash';

/** OpenAI-compatible backends in failover order: the main one (Gemini by default), then free Groq. */
export interface Provider { name: string; url: string; key: string; model: string; plain?: boolean }
export function providers(): Provider[] {
  const list: Provider[] = [];
  if (process.env.LLM_API_KEY) list.push({ name: llmModel(), url: llmUrl(), key: process.env.LLM_API_KEY, model: llmModel() });
  if (process.env.GROQ_API_KEY) {
    const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
    list.push({ name: `Groq ${model}`, url: 'https://api.groq.com/openai/v1/', key: process.env.GROQ_API_KEY, model, plain: true });
  }
  return list;
}
export const brain = () => (process.env.ANTHROPIC_API_KEY ? `Claude (${CLAUDE_MODEL})`
  : providers().map((p) => p.name).join(' → ') || 'keyword mode');

export const systemPrompt = (ctx: ToolCtx) => `You are Mochi, a warm, playful cat who is ${ctx.name}'s personal assistant. Their timezone is ${ctx.timeZone}.
Your replies are spoken aloud by a voice: keep them short and natural to say (1-3 sentences, no lists, no markdown, no emoji).
A light cat touch is welcome now and then, never in every reply.
Call get_profile first in every conversation and follow it: reply in its language (en = English, id = Bahasa Indonesia),
call the user by their nickname if set, and be short when style is "concise" or warm when it is "friendly".
Use tools for facts about the user: their profile, the weather, and their Google Calendar. Never invent events or settings.
To move, rename or delete an event, list events first to get its id. Before deleting, say which event you are deleting.
When an answer uses a saved setting, say so briefly (e.g. "for Bandung, your default city").
If a calendar tool reports that Google is not connected, tell the user to connect it in Settings.`;

/** Runs one tool call for a model and records it as a UI card. Errors go back to the model as text. */
async function call(name: string, input: unknown, ctx: ToolCtx, cards: Card[]): Promise<{ ok: boolean; content: string }> {
  if (!isToolName(name)) return { ok: false, content: `Unknown tool ${name}` };
  try {
    const data = await runTool(name, input as ToolInputs[ToolName], ctx);
    cards.push({ tool: name, data } as Card);
    return { ok: true, content: JSON.stringify(data) };
  } catch (err) {
    return { ok: false, content: (err as Error).message };
  }
}

// ---- Claude ----
type ClaudeMessage = Anthropic.Beta.BetaMessageParam;
let client: Anthropic | undefined; // created lazily so the self-checks run without an API key

export async function claudeTurn(messages: ClaudeMessage[], ctx: ToolCtx, cards: Card[]): Promise<string> {
  client ??= new Anthropic();
  for (let step = 0; step < 8; step++) {
    const res = await client.beta.messages.create({
      model: CLAUDE_MODEL, max_tokens: 16000, output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      system: systemPrompt(ctx), tools: TOOLS as unknown as Anthropic.Beta.BetaTool[], messages,
    });
    messages.push({ role: 'assistant', content: res.content });
    if (res.stop_reason === 'refusal') return "Sorry, I can't help with that one.";
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
    if (res.stop_reason !== 'tool_use') return text;
    const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    const out = await Promise.all(uses.map((b) => call(b.name, b.input, ctx, cards)));
    messages.push({ role: 'user', content: uses.map((b, i) => ({ type: 'tool_result' as const, tool_use_id: b.id, is_error: !out[i].ok, content: out[i].content })) });
  }
  return 'That took too many steps. Try asking in a simpler way.';
}

// ---- OpenAI-compatible (Gemini by default; also Groq, OpenRouter, Ollama...) ----
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  [extra: string]: unknown; // e.g. Gemini thought signatures, which must be sent back unchanged
}

// additionalProperties is dropped: some OpenAI-compatible backends (Gemini) reject it.
const OPENAI_TOOLS = TOOLS.map(({ name, description, input_schema: { additionalProperties: _, ...parameters } }) =>
  ({ type: 'function' as const, function: { name, description, parameters } }));

// Strict backends (Groq) reject provider-specific extras such as Gemini's thought signatures.
const plainMessage = ({ role, content, tool_calls, tool_call_id }: OpenAIMessage): OpenAIMessage => ({
  role, content: content ?? null,
  ...(tool_calls ? { tool_calls: tool_calls.map(({ id, type, function: { name, arguments: args } }) => ({ id, type, function: { name, arguments: args } })) } : {}),
  ...(tool_call_id ? { tool_call_id } : {}),
});

export async function openaiTurn(messages: OpenAIMessage[], ctx: ToolCtx, cards: Card[], fetchFn: typeof fetch = fetch,
  p: Provider = providers()[0]): Promise<string> {
  if (messages[0]?.role !== 'system') messages.unshift({ role: 'system', content: systemPrompt(ctx) });
  const tools = ctx.tools ? OPENAI_TOOLS.filter((t) => ctx.tools!.has(t.function.name)) : OPENAI_TOOLS;
  for (let step = 0; step < 8; step++) {
    const res = await fetchFn(`${p.url}chat/completions`, {
      method: 'POST', headers: { authorization: `Bearer ${p.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: p.model, messages: p.plain ? messages.map(plainMessage) : messages, tool_choice: 'auto', tools }),
    });
    const data = await res.json().catch(() => ({})) as { choices?: { message: OpenAIMessage }[]; error?: { message?: string } };
    if (!res.ok || !data.choices?.length) throw new Error(`LLM ${res.status}: ${data.error?.message ?? 'request failed'}`);
    const msg = data.choices[0].message;
    messages.push(msg); // unchanged on purpose (thought signatures)
    if (!msg.tool_calls?.length) return (msg.content ?? '').trim();
    for (const tc of msg.tool_calls) {
      let input: unknown = null;
      try { input = JSON.parse(tc.function.arguments || '{}'); } catch { /* reported below */ }
      const out = input ? await call(tc.function.name, input, ctx, cards) : { content: 'Invalid JSON arguments' };
      messages.push({ role: 'tool', tool_call_id: tc.id, content: out.content });
    }
  }
  return 'That took too many steps. Try asking in a simpler way.';
}
