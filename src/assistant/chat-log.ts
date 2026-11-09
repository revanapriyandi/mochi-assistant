// Conversation history (the History page). With DATABASE_URL it lives in a Tiger Data (TimescaleDB)
// hypertable, partitioned by time, so it survives redeploys; without it, in memory like before.
import pg from 'pg';
import type { TranscriptLine } from '../types.ts';

const KEEP = 200; // lines shown per user

const SCHEMA = `
CREATE TABLE IF NOT EXISTS chat_log (
  at      timestamptz NOT NULL,
  user_id text        NOT NULL,
  who     text        NOT NULL CHECK (who IN ('me', 'bot')),
  text    text        NOT NULL,
  mood    text,
  tools   text[]
);
SELECT create_hypertable('chat_log', by_range('at'), if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS chat_log_user_at ON chat_log (user_id, at DESC);`;

export interface Log {
  append(userId: string, lines: TranscriptLine[]): Promise<void>;
  read(userId: string): Promise<TranscriptLine[]>;
  clear(userId: string): Promise<void>;
}

export function memoryLog(): Log {
  const m = new Map<string, TranscriptLine[]>();
  return {
    append: async (u, lines) => { m.set(u, [...(m.get(u) ?? []), ...lines].slice(-KEEP)); },
    read: async (u) => m.get(u) ?? [],
    clear: async (u) => { m.delete(u); },
  };
}

export function postgresLog(db: Pick<pg.Pool, 'query'>): Log {
  let ready: Promise<unknown> | undefined;
  const q = async (sql: string, params: unknown[]) => { await (ready ??= db.query(SCHEMA)); return db.query(sql, params); };
  return {
    async append(u, lines) {
      // ponytail: one INSERT per line pair; batch with unnest() if ingest ever matters
      for (const l of lines) {
        await q('INSERT INTO chat_log (at, user_id, who, text, mood, tools) VALUES (to_timestamp($1 / 1000.0), $2, $3, $4, $5, $6)',
          [l.at, u, l.who, l.text, l.mood ?? null, l.tools ?? null]);
      }
    },
    async read(u) {
      const { rows } = await q(`SELECT * FROM (SELECT (extract(epoch FROM at) * 1000)::bigint AS at, who, text, mood, tools
        FROM chat_log WHERE user_id = $1 ORDER BY at DESC LIMIT ${KEEP}) t ORDER BY at`, [u]);
      return rows.map((r) => ({ at: Number(r.at), who: r.who, text: r.text, ...(r.mood && { mood: r.mood }), ...(r.tools && { tools: r.tools }) }));
    },
    async clear(u) { await q('DELETE FROM chat_log WHERE user_id = $1', [u]); },
  };
}

export const chatLog: Log = process.env.DATABASE_URL
  ? postgresLog(new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 }))
  : memoryLog();
