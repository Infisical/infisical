import { randomUUID } from "node:crypto";

import { Knex } from "knex";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { TableName } from "@app/db/schemas";
import { eventOutboxDALFactory, TOutboxInsertRow } from "@app/services/event-outbox/event-outbox-dal";
import { EventOutboxStatus, MAX_OUTBOX_ATTEMPTS } from "@app/services/event-outbox/event-outbox-types";

declare const testDb: Knex;

// The unit tests assert query shape. Only Postgres can show that the partial-index conflict target
// compiles, that two claimers never take the same row, and that the retry clock is computed in SQL.
const dal = eventOutboxDALFactory(testDb as never);

// Unique per run so a crashed run's leftovers can't leak into the next one's assertions.
const CONSUMER = `e2e-${randomUUID().slice(0, 8)}`;
const ORG_ID = randomUUID();

const KEY = { consumer: CONSUMER, resourceType: "e2e.resource", resourceId: "res-1" };

const makeRow = (overrides?: Partial<TOutboxInsertRow>): TOutboxInsertRow => ({
  consumer: CONSUMER,
  eventType: "e2e.resource.happened",
  resourceType: KEY.resourceType,
  resourceId: KEY.resourceId,
  orgId: ORG_ID,
  payload: { targetIds: ["t-1"] },
  occurredAt: new Date(),
  ...overrides
});

const insert = (rows: TOutboxInsertRow[]) => testDb.transaction((tx) => dal.insertEvents(rows, tx));

const rowsFor = (consumer = CONSUMER) =>
  testDb(TableName.EventOutbox).where({ consumer }).orderBy("id", "asc").select("*");

const purge = () => testDb(TableName.EventOutbox).where("consumer", "like", "e2e-%").del();

describe("event outbox (postgres)", () => {
  beforeAll(purge);
  afterEach(purge);
  afterAll(purge);

  test("insertEvents dedupes on (consumer, idempotencyKey) and lets rows without a key repeat", async () => {
    await insert([makeRow({ idempotencyKey: "k-1" }), makeRow(), makeRow()]);
    await insert([makeRow({ idempotencyKey: "k-1" })]);
    await insert([makeRow({ idempotencyKey: "k-1", consumer: `${CONSUMER}-other` })]);

    const mine = await rowsFor();
    expect(mine).toHaveLength(3);
    expect(mine.filter((row) => row.idempotencyKey === "k-1")).toHaveLength(1);
    expect(mine[0].status).toBe(EventOutboxStatus.Pending);
    expect(mine[0].attempts).toBe(0);

    expect(await rowsFor(`${CONSUMER}-other`)).toHaveLength(1);
  });

  test("claimBatch hands each row to exactly one concurrent claimer, in id order", async () => {
    await insert(Array.from({ length: 6 }, () => makeRow()));

    const [a, b] = await Promise.all([dal.claimBatch(KEY, 3), dal.claimBatch(KEY, 3)]);

    const idsA = a.map((row) => String(row.id));
    const idsB = b.map((row) => String(row.id));
    expect(new Set([...idsA, ...idsB]).size).toBe(idsA.length + idsB.length);
    expect(idsA.length + idsB.length).toBe(6);
    expect([...idsA].sort()).toEqual(idsA);
    expect([...idsB].sort()).toEqual(idsB);

    const stored = await rowsFor();
    expect(stored.every((row) => row.status === EventOutboxStatus.Processing && row.lockedAt)).toBe(true);
    expect(await dal.claimBatch(KEY, 10)).toEqual([]);
  });

  test("claimBatch skips a row still inside its backoff window", async () => {
    await insert([makeRow(), makeRow()]);
    const [first, second] = await rowsFor();
    await testDb(TableName.EventOutbox)
      .where("id", first.id)
      .update({ status: EventOutboxStatus.Retry, nextRetryAt: new Date(Date.now() + 60 * 60_000) });

    const claimed = await dal.claimBatch(KEY, 10);

    expect(claimed.map((row) => String(row.id))).toEqual([String(second.id)]);
  });

  test("commitResults applies every outcome and computes the retry clock in the database", async () => {
    await insert([makeRow(), makeRow(), makeRow()]);
    const [d, r, f] = await dal.claimBatch(KEY, 10);

    await dal.commitResults({
      delivered: [{ ids: [String(d.id)], progress: { deliveredChannelIds: ["c-1"] } }],
      retriable: [{ ids: [String(r.id)], nextRetryDelayMs: 30 * 60_000, error: "slack 502" }],
      failed: [{ ids: [String(f.id)], error: "bad payload" }]
    });

    const [delivered, retry, failed] = await rowsFor();
    expect(delivered.status).toBe(EventOutboxStatus.Delivered);
    expect(delivered.lockedAt).toBeNull();
    expect(delivered.progress).toEqual({ deliveredChannelIds: ["c-1"] });

    expect(retry.status).toBe(EventOutboxStatus.Retry);
    expect(retry.attempts).toBe(1);
    expect(retry.lastError).toBe("slack 502");
    expect(retry.lockedAt).toBeNull();
    expect(new Date(retry.nextRetryAt).getTime()).toBeGreaterThan(Date.now() + 29 * 60_000);

    expect(failed.status).toBe(EventOutboxStatus.Failed);
    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toBe("bad payload");

    expect(await dal.findDueFlushKeys(10, [CONSUMER])).toEqual([]);
  });

  test("findDueFlushKeys groups due rows per resource and ignores consumers not asked for", async () => {
    await insert([
      makeRow(),
      makeRow(),
      makeRow({ resourceId: "res-2" }),
      makeRow({ consumer: `${CONSUMER}-other`, resourceId: "res-3" })
    ]);

    const keys = await dal.findDueFlushKeys(10, [CONSUMER]);

    expect(keys).toHaveLength(2);
    expect(keys.map((key) => key.resourceId).sort()).toEqual(["res-1", "res-2"]);
    expect(keys.every((key) => key.consumer === CONSUMER)).toBe(true);
  });

  test("recoverStaleClaims backs a live-looking claim off and fails an exhausted one", async () => {
    await insert([makeRow(), makeRow(), makeRow()]);
    const [, stale, exhausted] = await dal.claimBatch(KEY, 10);
    const longAgo = new Date(Date.now() - 60 * 60_000);
    await testDb(TableName.EventOutbox).where("id", stale.id).update({ lockedAt: longAgo });
    await testDb(TableName.EventOutbox)
      .where("id", exhausted.id)
      .update({ lockedAt: longAgo, attempts: MAX_OUTBOX_ATTEMPTS - 1 });

    const outcome = await dal.recoverStaleClaims({
      thresholdMs: 10 * 60_000,
      maxAttempts: MAX_OUTBOX_ATTEMPTS,
      limit: 100
    });

    expect(outcome).toEqual({ retried: 1, failed: [{ consumer: CONSUMER, count: 1 }] });
    const [untouched, retried, failed] = await rowsFor();
    expect(untouched.status).toBe(EventOutboxStatus.Processing);
    expect(retried.status).toBe(EventOutboxStatus.Retry);
    expect(retried.attempts).toBe(1);
    expect(retried.lockedAt).toBeNull();
    // Not handed straight back: a consumer that hangs every time must not hold a worker slot on repeat.
    expect(new Date(retried.nextRetryAt).getTime()).toBeGreaterThan(Date.now() + 20_000);
    expect(failed.status).toBe(EventOutboxStatus.Failed);
    expect(failed.attempts).toBe(MAX_OUTBOX_ATTEMPTS);
  });

  test("extendClaims refreshes only rows still processing", async () => {
    await insert([makeRow(), makeRow()]);
    const [claimed, released] = await dal.claimBatch(KEY, 10);
    const longAgo = new Date(Date.now() - 60 * 60_000);
    await testDb(TableName.EventOutbox).whereIn("id", [claimed.id, released.id]).update({ lockedAt: longAgo });
    await dal.commitResults({ delivered: [{ ids: [String(released.id)] }], retriable: [], failed: [] });

    await dal.extendClaims([String(claimed.id), String(released.id)]);

    const [a, b] = await rowsFor();
    expect(new Date(a.lockedAt as Date).getTime()).toBeGreaterThan(Date.now() - 10_000);
    expect(b.lockedAt).toBeNull();
  });

  test("deleteTerminalOlderThan prunes only terminal rows past their retention, in bounded batches", async () => {
    const old = new Date(Date.now() - 48 * 60 * 60_000);
    await testDb(TableName.EventOutbox).insert([
      { ...makeRow(), payload: JSON.stringify({}), status: EventOutboxStatus.Delivered, updatedAt: old },
      { ...makeRow(), payload: JSON.stringify({}), status: EventOutboxStatus.Delivered, updatedAt: old },
      { ...makeRow(), payload: JSON.stringify({}), status: EventOutboxStatus.Failed, updatedAt: old },
      { ...makeRow(), payload: JSON.stringify({}), status: EventOutboxStatus.Pending, updatedAt: old },
      { ...makeRow(), payload: JSON.stringify({}), status: EventOutboxStatus.Delivered }
    ]);

    const firstBatch = await dal.deleteTerminalOlderThan({
      deliveredBefore: new Date(Date.now() - 24 * 60 * 60_000),
      failedBefore: new Date(Date.now() - 30 * 24 * 60 * 60_000),
      batchSize: 1
    });
    const rest = await dal.deleteTerminalOlderThan({
      deliveredBefore: new Date(Date.now() - 24 * 60 * 60_000),
      failedBefore: new Date(Date.now() - 30 * 24 * 60 * 60_000),
      batchSize: 100
    });

    expect(firstBatch).toBe(1);
    expect(rest).toBe(1);
    const remaining = await rowsFor();
    expect(remaining.map((row) => row.status).sort()).toEqual(
      [EventOutboxStatus.Delivered, EventOutboxStatus.Failed, EventOutboxStatus.Pending].sort()
    );
  });
});
