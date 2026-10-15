import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { Pool, type PoolClient } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import fs from "node:fs";
import { schema } from "./server/schema";

type Parameters = (string | number | null)[];
type Context = { client?: PoolClient; sqlite?: boolean };
type State = {
  sqlite?: DatabaseSync;
  pool?: Pool;
  init?: Promise<void>;
  tail: Promise<void>;
  context: AsyncLocalStorage<Context>;
};
const globalDb = globalThis as typeof globalThis & { modifyDb?: State };
const state = (globalDb.modifyDb ??= {
  tail: Promise.resolve(),
  context: new AsyncLocalStorage<Context>(),
});
export const isPostgres = () =>
  /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL || "");
const pgSql = (sql: string) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

export async function initDb() {
  if (!state.init)
    state.init = (async () => {
      if (isPostgres()) {
        state.pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          max: 10,
        });
        await state.pool.query(schema);
      } else {
        if (
          process.env.NODE_ENV === "production" &&
          process.env.ALLOW_LOCAL_PRODUCTION !== "true"
        )
          throw new Error("Production requires PostgreSQL. Set DATABASE_URL.");
        const file = (
          process.env.DATABASE_URL || "file:./data/modifyia.db"
        ).replace(/^file:/, "");
        const resolved = path.resolve(file);
        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        state.sqlite = new DatabaseSync(resolved);
        state.sqlite.exec(
          "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
        );
        state.sqlite.exec(schema);
      }
    })();
  return state.init;
}
async function locked<T>(fn: () => T | Promise<T>): Promise<T> {
  const prev = state.tail;
  let release!: () => void;
  state.tail = new Promise<void>((r) => {
    release = r;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}
export async function querySql<T = Record<string, unknown>>(
  sql: string,
  params: Parameters = [],
): Promise<T[]> {
  await initDb();
  const tx = state.context.getStore();
  if (state.pool)
    return (await (tx?.client || state.pool).query(pgSql(sql), params))
      .rows as T[];
  const run = () =>
    state.sqlite!.prepare(sql).all(...(params as SQLInputValue[])) as T[];
  return tx?.sqlite ? run() : locked(run);
}
export async function execSql(
  sql: string,
  params: Parameters = [],
): Promise<number> {
  await initDb();
  const tx = state.context.getStore();
  if (state.pool)
    return (
      (await (tx?.client || state.pool).query(pgSql(sql), params)).rowCount || 0
    );
  const run = () =>
    Number(
      state.sqlite!.prepare(sql).run(...(params as SQLInputValue[])).changes,
    );
  return tx?.sqlite ? run() : locked(run);
}
export async function oneSql<T = Record<string, unknown>>(
  sql: string,
  params: Parameters = [],
): Promise<T | null> {
  return (await querySql<T>(sql, params))[0] ?? null;
}
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  await initDb();
  if (state.context.getStore()) return fn();
  if (state.pool) {
    const client = await state.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await state.context.run({ client }, fn);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  return locked(async () => {
    state.sqlite!.exec("BEGIN IMMEDIATE");
    try {
      const result = await state.context.run({ sqlite: true }, fn);
      state.sqlite!.exec("COMMIT");
      return result;
    } catch (e) {
      state.sqlite!.exec("ROLLBACK");
      throw e;
    }
  });
}

/** Close resources after one-shot maintenance or isolated regression tests. */
export async function closeDb() {
  await state.tail;
  if (state.pool) await state.pool.end();
  state.sqlite?.close();
  state.pool = undefined;
  state.sqlite = undefined;
  state.init = undefined;
}
