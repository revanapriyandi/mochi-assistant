// Avatar expression for a reply. ponytail: keyword + tool heuristics, works for every brain.
import type { Card, Mood } from '../types.ts';

const MUTATIONS = new Set(['create_calendar_event', 'update_calendar_event', 'update_profile']);

export function mood(text = '', cards: Card[] = []): Mood {
  const w = cards.find((c) => c.tool === 'get_weather')?.data;
  if (/couldn't|can't|not connected|belum terhubung|tidak menemukan|tidak bisa|sorry|maaf|error|⚠️|unavailable/i.test(text)) return 'confused';
  if (cards.some((c) => MUTATIONS.has(c.tool))) return 'happy';
  if (w && !('error' in w)) {
    const wet = w.forecast?.some((d) => d.code >= 61) || w.code >= 51;
    return wet ? 'concerned' : w.code <= 1 ? 'happy' : 'neutral';
  }
  if (/busy|sibuk|no free|tidak ada waktu/i.test(text)) return 'concerned';
  if (/^(hi|halo|hello|hey)\b|done|beres|great|mantap|free|kosong|clear/i.test(text)) return 'happy';
  return 'neutral';
}
