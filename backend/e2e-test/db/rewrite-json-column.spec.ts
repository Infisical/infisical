import { Knex } from "knex";

import { rewriteJsonColumnInBatches } from "@app/db/migrations/utils/rewrite-json-column";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

type TPayload = { flat?: string[]; nested?: string[][]; done?: boolean };

const seed = async (table: string, idColumnType: string, count: number, makeId?: (index: number) => string) => {
  const db = getDb();
  await db.raw(`drop table if exists ${table}`);
  await db.raw(`create table ${table} (id ${idColumnType}, payload jsonb)`);
  await db(table).insert(
    Array.from({ length: count }, (_, index) => ({
      ...(makeId ? { id: makeId(index) } : {}),
      payload: JSON.stringify(index % 2 === 0 ? { flat: ["corp", "example", "com"] } : { done: true })
    }))
  );
};

const rewriteFlatToNested = async (table: string, batchSize: number) => {
  const visited: string[] = [];
  const rewrittenCount = await rewriteJsonColumnInBatches<TPayload>({
    knex: getDb(),
    table,
    column: "payload",
    batchSize,
    // the filter stops matching a row once it is rewritten, so the cursor cannot rely on it
    narrow: (query) => void query.whereRaw(`payload::text like '%flat%'`),
    rewrite: (value, row) => {
      visited.push(row.id);
      return value.flat ? { nested: [value.flat] } : undefined;
    }
  });

  const rows = await getDb()(table).select("id", "payload");
  return {
    rewrittenCount,
    visited,
    nested: rows.filter((row) => (row.payload as TPayload).nested).length,
    stillFlat: rows.filter((row) => (row.payload as TPayload).flat).length,
    untouched: rows.filter((row) => (row.payload as TPayload).done).length,
    total: rows.length
  };
};

describe("rewriteJsonColumnInBatches", async () => {
  const tables = ["zz_rewrite_uuid", "zz_rewrite_text", "zz_rewrite_multiple", "zz_rewrite_none"];

  afterAll(async () => {
    for (const table of tables) {
      // eslint-disable-next-line no-await-in-loop
      await getDb().raw(`drop table if exists ${table}`);
    }
  });

  test("rewrites every matching row exactly once across batches", async () => {
    await seed("zz_rewrite_uuid", "uuid primary key default gen_random_uuid()", 25);

    const result = await rewriteFlatToNested("zz_rewrite_uuid", 4);

    expect(result.rewrittenCount).toBe(13);
    expect(result.nested).toBe(13);
    expect(result.stillFlat).toBe(0);
    expect(result.untouched).toBe(12);
    expect(result.total).toBe(25);
    expect(new Set(result.visited).size).toBe(result.visited.length);
  });

  test("paginates a varchar id column the same way", async () => {
    await seed("zz_rewrite_text", "varchar primary key", 25, (index) => `id-${String(index).padStart(3, "0")}`);

    const result = await rewriteFlatToNested("zz_rewrite_text", 4);

    expect(result.rewrittenCount).toBe(13);
    expect(result.stillFlat).toBe(0);
    expect(new Set(result.visited).size).toBe(result.visited.length);
  });

  test("terminates when the matching rows are an exact multiple of the batch size", async () => {
    await seed("zz_rewrite_multiple", "uuid primary key default gen_random_uuid()", 24);

    const result = await rewriteFlatToNested("zz_rewrite_multiple", 4);

    expect(result.rewrittenCount).toBe(12);
    expect(result.stillFlat).toBe(0);
  });

  test("does not call rewrite when the filter matches nothing", async () => {
    const db = getDb();
    await db.raw(`drop table if exists zz_rewrite_none`);
    await db.raw(`create table zz_rewrite_none (id uuid primary key default gen_random_uuid(), payload jsonb)`);
    await db("zz_rewrite_none").insert([{ payload: JSON.stringify({ done: true }) }]);

    const rewrittenCount = await rewriteJsonColumnInBatches<TPayload>({
      knex: db,
      table: "zz_rewrite_none",
      column: "payload",
      narrow: (query) => void query.whereRaw(`payload::text like '%flat%'`),
      rewrite: () => {
        throw new Error("rewrite must not be called");
      }
    });

    expect(rewrittenCount).toBe(0);
  });
});
