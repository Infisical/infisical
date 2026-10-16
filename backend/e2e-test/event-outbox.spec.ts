import { randomUUID } from "node:crypto";

import { Knex } from "knex";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { TableName } from "@app/db/schemas";
import { eventOutboxDALFactory, TOutboxInsertRow } from "@app/services/event-outbox/event-outbox-dal";
import { EventOutboxStatus, MAX_OUTBOX_ATTEMPTS } from "@app/services/event-outbox/event-outbox-types";

declare const testDb: Knex;

// Unit tests only check query shape. Only real Postgres can prove the partial-index conflict target
// compiles, two claimers never grab the same row, and the retry clock is computed in SQL.
const dal = eventOutboxDALFactory(testDb as never);

// Unique per run so leftovers from a crashed run can't leak into the next one.
const CONSUMER = `e2e-${randomUUID().slice(0, 8)}`;
const ORG_ID = randomUUID();

const KEY = { consumer: CONSUMER };

const makeRow = (overrides?: Partial<TOutboxInsertRow>): TOutboxInsertRow => ({
  consumer: CONSUMER,
  eventType: "e2e.resource.happened",
  payload: { orgId: ORG_ID, resourceType: "e2e.resource", resourceId: "res-1", targetIds: ["t-1"] },
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

    // Ids are bigints and come back as strings, so compare numerically.
    const idsA = a.rows.map((row) => Number(row.id));
    const idsB = b.rows.map((row) => Number(row.id));
    expect(new Set([...idsA, ...idsB]).size).toBe(idsA.length + idsB.length);
    expect(idsA.length + idsB.length).toBe(6);
    expect([...idsA].sort((x, y) => x - y)).toEqual(idsA);
    expect([...idsB].sort((x, y) => x - y)).toEqual(idsB);

    const stored = await rowsFor();
    expect(stored.every((row) => row.status === EventOutboxStatus.Processing && row.lockedAt)).toBe(true);
    expect(a.lockToken).not.toBe(b.lockToken);
    expect(new Set(stored.map((row) => row.lockToken))).toEqual(new Set([a.lockToken, b.lockToken]));
    expect((await dal.claimBatch(KEY, 10)).rows).toEqual([]);
  });

  test("claimBatch skips a row still inside its backoff window", async () => {
    await insert([makeRow(), makeRow()]);
    const [first, second] = await rowsFor();
    await testDb(TableName.EventOutbox)
      .where("id", first.id)
      .update({ status: EventOutboxStatus.Retry, nextRetryAt: new Date(Date.now() + 60 * 60_000) });

    const { rows: claimed } = await dal.claimBatch(KEY, 10);

    expect(claimed.map((row) => String(row.id))).toEqual([String(second.id)]);
  });

  test("commitResults applies every outcome and computes the retry clock in the database", async () => {
    await insert([makeRow(), makeRow(), makeRow()]);
    const {
      lockToken,
      rows: [d, r, f]
    } = await dal.claimBatch(KEY, 10);

    const settled = await dal.commitResults({
      lockToken,
      delivered: [{ ids: [String(d.id)] }],
      retriable: [{ ids: [String(r.id)], nextRetryDelayMs: 30 * 60_000, error: "slack 502" }],
      failed: [{ ids: [String(f.id)], error: "bad payload" }]
    });

    expect(settled).toBe(3);
    const [delivered, retry, failed] = await rowsFor();
    expect(delivered.status).toBe(EventOutboxStatus.Delivered);
    expect(delivered.lockedAt).toBeNull();
    expect(delivered.lockToken).toBeNull();

    expect(retry.status).toBe(EventOutboxStatus.Retry);
    expect(retry.attempts).toBe(1);
    expect(retry.lastError).toBe("slack 502");
    expect(retry.lockedAt).toBeNull();
    expect(new Date(retry.nextRetryAt).getTime()).toBeGreaterThan(Date.now() + 29 * 60_000);

    expect(failed.status).toBe(EventOutboxStatus.Failed);
    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toBe("bad payload");

    expect(await dal.findDueFlushKeys([CONSUMER])).toEqual([]);
  });

  test("findDueFlushKeys names each consumer with due rows once and ignores consumers not asked for", async () => {
    await insert([makeRow(), makeRow(), makeRow(), makeRow({ consumer: `${CONSUMER}-other` })]);

    const keys = await dal.findDueFlushKeys([CONSUMER]);

    expect(keys).toEqual([{ consumer: CONSUMER }]);
  });

  test("recoverStaleClaims backs a live-looking claim off and fails an exhausted one", async () => {
    await insert([makeRow(), makeRow(), makeRow()]);
    const {
      rows: [, stale, exhausted]
    } = await dal.claimBatch(KEY, 10);
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
    expect(retried.lockToken).toBeNull();
    // Backoff applies here too, otherwise a consumer that always hangs gets retried instantly.
    expect(new Date(retried.nextRetryAt).getTime()).toBeGreaterThan(Date.now() + 20_000);
    expect(failed.status).toBe(EventOutboxStatus.Failed);
    expect(failed.attempts).toBe(MAX_OUTBOX_ATTEMPTS);
  });

  test("commitResults ignores a late result for a claim the sweeper already handed back", async () => {
    await insert([makeRow()]);
    const {
      lockToken,
      rows: [row]
    } = await dal.claimBatch(KEY, 10);
    await testDb(TableName.EventOutbox)
      .where("id", row.id)
      .update({ lockedAt: new Date(Date.now() - 60 * 60_000) });
    await dal.recoverStaleClaims({ thresholdMs: 10 * 60_000, maxAttempts: MAX_OUTBOX_ATTEMPTS, limit: 100 });

    const settled = await dal.commitResults({
      lockToken,
      delivered: [{ ids: [String(row.id)] }],
      retriable: [],
      failed: []
    });

    expect(settled).toBe(0);
    const [stored] = await rowsFor();
    expect(stored.status).toBe(EventOutboxStatus.Retry);
    expect(stored.attempts).toBe(1);
  });

  // The race the token exists for: the sweeper recycles a claim, another worker picks the row up, then
  // the first worker reports late. Both claims look 'processing', so without the token the late result
  // would clobber the new owner's outcome.
  test("commitResults leaves a row alone once another worker has reclaimed it", async () => {
    await insert([makeRow()]);
    const first = await dal.claimBatch(KEY, 10);
    await testDb(TableName.EventOutbox)
      .where("id", first.rows[0].id)
      .update({ lockedAt: new Date(Date.now() - 60 * 60_000) });
    await dal.recoverStaleClaims({ thresholdMs: 10 * 60_000, maxAttempts: MAX_OUTBOX_ATTEMPTS, limit: 100 });
    // Fast-forward past the backoff window.
    await testDb(TableName.EventOutbox).where("id", first.rows[0].id).update({ nextRetryAt: new Date() });
    const second = await dal.claimBatch(KEY, 10);
    expect(second.rows.map((row) => String(row.id))).toEqual([String(first.rows[0].id)]);

    const late = await dal.commitResults({
      lockToken: first.lockToken,
      delivered: [{ ids: [String(first.rows[0].id)] }],
      retriable: [],
      failed: []
    });

    expect(late).toBe(0);
    const [held] = await rowsFor();
    expect(held.status).toBe(EventOutboxStatus.Processing);
    expect(held.lockToken).toBe(second.lockToken);
    expect(held.lockedAt).not.toBeNull();

    expect(
      await dal.commitResults({
        lockToken: second.lockToken,
        delivered: [{ ids: [String(first.rows[0].id)] }],
        retriable: [],
        failed: []
      })
    ).toBe(1);
    const [settled] = await rowsFor();
    expect(settled.status).toBe(EventOutboxStatus.Delivered);
    expect(settled.lockToken).toBeNull();
  });

  test("extendClaims refreshes only rows this claim still holds", async () => {
    await insert([makeRow(), makeRow()]);
    const {
      lockToken,
      rows: [claimed, released]
    } = await dal.claimBatch(KEY, 10);
    const longAgo = new Date(Date.now() - 60 * 60_000);
    await testDb(TableName.EventOutbox).whereIn("id", [claimed.id, released.id]).update({ lockedAt: longAgo });
    await dal.commitResults({ lockToken, delivered: [{ ids: [String(released.id)] }], retriable: [], failed: [] });

    await dal.extendClaims([String(claimed.id), String(released.id)], lockToken);

    const [a, b] = await rowsFor();
    expect(new Date(a.lockedAt as Date).getTime()).toBeGreaterThan(Date.now() - 10_000);
    expect(b.lockedAt).toBeNull();
  });

  // Otherwise a late heartbeat from the old owner keeps the new claim looking fresh, and the sweeper
  // never recovers it if that worker really is gone.
  test("extendClaims does not refresh a claim another worker now holds", async () => {
    await insert([makeRow()]);
    const first = await dal.claimBatch(KEY, 10);
    const longAgo = new Date(Date.now() - 60 * 60_000);
    await testDb(TableName.EventOutbox).where("id", first.rows[0].id).update({ lockedAt: longAgo });
    await dal.recoverStaleClaims({ thresholdMs: 10 * 60_000, maxAttempts: MAX_OUTBOX_ATTEMPTS, limit: 100 });
    await testDb(TableName.EventOutbox).where("id", first.rows[0].id).update({ nextRetryAt: new Date() });
    const second = await dal.claimBatch(KEY, 10);
    await testDb(TableName.EventOutbox).where("id", first.rows[0].id).update({ lockedAt: longAgo });

    await dal.extendClaims([String(first.rows[0].id)], first.lockToken);

    const [stored] = await rowsFor();
    expect(new Date(stored.lockedAt as Date).getTime()).toBe(longAgo.getTime());
    expect(stored.lockToken).toBe(second.lockToken);
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
