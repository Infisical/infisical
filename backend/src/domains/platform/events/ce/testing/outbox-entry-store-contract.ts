import { randomUUID } from "node:crypto";

import { EmittedEvent } from "../models/emitted-event";
import { OutboxClaim } from "../models/outbox-claim";
import { EventOutboxStatus, EventResultStatus, MAX_OUTBOX_ATTEMPTS } from "../models/outbox-entry";
import { TOutboxDelivery, TOutboxEntryStore } from "../services/dependencies";

export type TStoredOutboxRow = {
  id: string;
  consumer: string;
  eventId: string;
  status: string;
  attempts: number;
  nextRetryAt: Date;
  lockedAt: Date | null;
  lockToken: string | null;
  lastError: string | null;
};

export type TOutboxEntryStoreHarness = {
  store: TOutboxEntryStore;
  // Runs the work on a store bound to one transaction.
  transaction: <T>(work: (store: TOutboxEntryStore) => Promise<T>) => Promise<T>;
  // In write order.
  rows: (consumer: string) => Promise<TStoredOutboxRow[]>;
  // Moves a row in time, or into a state only another worker could have put it in.
  patch: (
    id: string,
    values: Partial<Pick<TStoredOutboxRow, "status" | "attempts" | "nextRetryAt" | "lockedAt"> & { updatedAt: Date }>
  ) => Promise<void>;
};

type TSetup = () => Promise<TOutboxEntryStoreHarness>;

const HOUR_MS = 60 * 60_000;
const STALE_AFTER_MS = 10 * 60_000;

const newConsumer = () => `contract-${randomUUID().slice(0, 8)}`;

const delivery = (consumer: string, eventId = randomUUID()): TOutboxDelivery => ({
  consumer,
  event: EmittedEvent.create({ id: eventId, type: "contract.resource.happened", data: { resourceId: "res-1" } })
});

const deliveries = (consumer: string, count: number) => Array.from({ length: count }, () => delivery(consumer));

const expireStaleClaims = (harness: TOutboxEntryStoreHarness) =>
  harness.transaction(async (store) => {
    const stale = await store.lockStaleClaims({ thresholdMs: STALE_AFTER_MS, limit: 100 });
    stale.forEach((entry) => entry.expireClaim());
    await store.saveExpired(stale);
    return stale;
  });

export const describeOutboxEntryStoreContract = (name: string, setup: TSetup) => {
  describe(`${name} outbox entry contract`, () => {
    test("should drop an event a consumer already has, and keep it for another consumer", async () => {
      // Setup
      const { store, rows } = await setup();
      const [mine, other] = [newConsumer(), newConsumer()];
      const eventId = randomUUID();
      await store.insert([delivery(mine, eventId), delivery(mine), delivery(mine)]);

      // Action
      await store.insert([delivery(mine, eventId), delivery(other, eventId)]);

      // Assert
      const stored = await rows(mine);
      expect(stored).toHaveLength(3);
      expect(stored.filter((row) => row.eventId === eventId)).toHaveLength(1);
      expect(stored[0]).toMatchObject({ status: EventOutboxStatus.Pending, attempts: 0, lockToken: null });
      expect(await rows(other)).toHaveLength(1);
    });

    // A bulk secret write can go past the 1000-row chunk the insert splits on.
    test("should write a batch larger than one chunk", async () => {
      // Setup
      const harness = await setup();
      const consumer = newConsumer();

      // Action
      await harness.transaction((store) => store.insert(deliveries(consumer, 1001)));

      // Assert
      expect(await harness.rows(consumer)).toHaveLength(1001);
    });

    test("should hand each entry to exactly one concurrent claimer, in the order written", async () => {
      // Setup
      const { store, rows } = await setup();
      const consumer = newConsumer();
      await store.insert(deliveries(consumer, 6));
      const written = (await rows(consumer)).map((row) => row.id);

      // Action
      const [a, b] = await Promise.all([store.claimBatch(consumer, 3), store.claimBatch(consumer, 3)]);

      // Assert
      const [idsA, idsB] = [a.entries.map((entry) => entry.id), b.entries.map((entry) => entry.id)];
      expect([...idsA, ...idsB].sort()).toEqual([...written].sort());
      expect(idsA).toEqual(written.filter((id) => idsA.includes(id)));
      expect(idsB).toEqual(written.filter((id) => idsB.includes(id)));
      expect(a.lockToken).not.toBe(b.lockToken);
      const stored = await rows(consumer);
      expect(stored.every((row) => row.status === EventOutboxStatus.Processing && row.lockedAt)).toBe(true);
      expect(new Set(stored.map((row) => row.lockToken))).toEqual(new Set([a.lockToken, b.lockToken]));
      expect((await store.claimBatch(consumer, 10)).entries).toEqual([]);
    });

    test("should not claim an entry still inside its backoff window, or another consumer's", async () => {
      // Setup
      const { store, rows, patch } = await setup();
      const [consumer, other] = [newConsumer(), newConsumer()];
      await store.insert([...deliveries(consumer, 2), delivery(other)]);
      const [waiting, due] = await rows(consumer);
      await patch(waiting.id, { status: EventOutboxStatus.Retry, nextRetryAt: new Date(Date.now() + HOUR_MS) });

      // Action
      const { entries } = await store.claimBatch(consumer, 10);

      // Assert
      expect(entries.map((entry) => entry.id)).toEqual([due.id]);
      expect(entries[0].toJSON()).toMatchObject({
        consumer,
        eventId: due.eventId,
        eventType: "contract.resource.happened",
        payload: { resourceId: "res-1" },
        status: EventOutboxStatus.Processing,
        attempts: 0
      });
    });

    test("should save every outcome of a settled batch and release the claim", async () => {
      // Setup
      const harness = await setup();
      const consumer = newConsumer();
      await harness.store.insert(deliveries(consumer, 3));
      const claim = await harness.store.claimBatch(consumer, 10);
      const { entries } = claim;
      entries[0].settle({ status: EventResultStatus.Delivered });
      entries[1].settle({ status: EventResultStatus.Retry, error: "slack 502" });
      entries[2].settle({ status: EventResultStatus.Failed, error: "bad payload" });

      // Action
      const saved = await harness.transaction((store) => store.saveSettled(claim));

      // Assert
      expect(saved).toBe(3);
      const [delivered, retry, failed] = await harness.rows(consumer);
      expect(delivered).toMatchObject({ status: EventOutboxStatus.Delivered, attempts: 0, lockedAt: null });
      expect(delivered.lockToken).toBeNull();
      expect(retry).toMatchObject({ status: EventOutboxStatus.Retry, attempts: 1, lastError: "slack 502" });
      expect(retry.lockedAt).toBeNull();
      expect(new Date(retry.nextRetryAt).getTime()).toBeGreaterThan(Date.now() + 20_000);
      expect(failed).toMatchObject({ status: EventOutboxStatus.Failed, attempts: 1, lastError: "bad payload" });
      expect(await harness.store.findDueConsumers([consumer])).toEqual([]);
    });

    test("should name each consumer with due entries once and ignore consumers not asked for", async () => {
      // Setup
      const { store } = await setup();
      const [asked, notAsked, idle] = [newConsumer(), newConsumer(), newConsumer()];
      await store.insert([...deliveries(asked, 3), delivery(notAsked)]);

      // Action
      const due = await store.findDueConsumers([asked, idle]);

      // Assert
      expect(due).toEqual([asked]);
    });

    test("should back a stale claim off, fail an exhausted one and leave a live one alone", async () => {
      // Setup
      const harness = await setup();
      const consumer = newConsumer();
      await harness.store.insert(deliveries(consumer, 3));
      const { entries } = await harness.store.claimBatch(consumer, 10);
      const longAgo = new Date(Date.now() - HOUR_MS);
      await harness.patch(entries[1].id, { lockedAt: longAgo });
      await harness.patch(entries[2].id, { lockedAt: longAgo, attempts: MAX_OUTBOX_ATTEMPTS - 1 });

      // Action
      const expired = await expireStaleClaims(harness);

      // Assert
      expect(expired.map((entry) => entry.id)).toEqual([entries[1].id, entries[2].id]);
      const [live, retried, failed] = await harness.rows(consumer);
      expect(live.status).toBe(EventOutboxStatus.Processing);
      expect(retried).toMatchObject({ status: EventOutboxStatus.Retry, attempts: 1, lockedAt: null });
      expect(retried.lockToken).toBeNull();
      expect(retried.lastError).toContain("claim went stale");
      expect(new Date(retried.nextRetryAt).getTime()).toBeGreaterThan(Date.now() + 20_000);
      expect(failed).toMatchObject({ status: EventOutboxStatus.Failed, attempts: MAX_OUTBOX_ATTEMPTS });
    });

    test("should ignore a late result for a claim the sweeper already handed back", async () => {
      // Setup
      const harness = await setup();
      const consumer = newConsumer();
      await harness.store.insert([delivery(consumer)]);
      const claim = await harness.store.claimBatch(consumer, 10);
      await harness.patch(claim.entries[0].id, { lockedAt: new Date(Date.now() - HOUR_MS) });
      await expireStaleClaims(harness);
      claim.entries[0].settle({ status: EventResultStatus.Delivered });

      // Action
      const saved = await harness.transaction((store) => store.saveSettled(claim));

      // Assert
      expect(saved).toBe(0);
      expect(await harness.rows(consumer)).toMatchObject([{ status: EventOutboxStatus.Retry, attempts: 1 }]);
    });

    // The race the token exists for: the sweeper recycles a claim, another worker picks the entry up, then the
    // first worker reports late. Both claims look 'processing', so only the token stops the late result from
    // overwriting the new owner's.
    test("should leave an entry alone once another worker has reclaimed it", async () => {
      // Setup
      const harness = await setup();
      const consumer = newConsumer();
      await harness.store.insert([delivery(consumer)]);
      const first = await harness.store.claimBatch(consumer, 10);
      await harness.patch(first.entries[0].id, { lockedAt: new Date(Date.now() - HOUR_MS) });
      await expireStaleClaims(harness);
      await harness.patch(first.entries[0].id, { nextRetryAt: new Date(Date.now() - 1_000) });
      const second = await harness.store.claimBatch(consumer, 10);
      first.entries[0].settle({ status: EventResultStatus.Delivered });
      second.entries[0].settle({ status: EventResultStatus.Delivered });

      // Action
      const late = await harness.transaction((store) => store.saveSettled(first));

      // Assert
      expect(late).toBe(0);
      expect(await harness.rows(consumer)).toMatchObject([
        { status: EventOutboxStatus.Processing, lockToken: second.lockToken }
      ]);
      expect(await harness.transaction((store) => store.saveSettled(second))).toBe(1);
      expect(await harness.rows(consumer)).toMatchObject([{ status: EventOutboxStatus.Delivered, lockToken: null }]);
    });

    test("should refresh only the entries a claim still holds", async () => {
      // Setup
      const harness = await setup();
      const consumer = newConsumer();
      await harness.store.insert(deliveries(consumer, 2));
      const claim = await harness.store.claimBatch(consumer, 10);
      const [held, released] = claim.entries;
      const longAgo = new Date(Date.now() - HOUR_MS);
      await harness.patch(held.id, { lockedAt: longAgo });
      await harness.patch(released.id, { lockedAt: longAgo });
      released.settle({ status: EventResultStatus.Delivered });
      await harness.transaction((store) =>
        store.saveSettled(OutboxClaim.restore({ lockToken: claim.lockToken, entries: [released] }))
      );

      // Action
      await harness.store.extendClaim(claim);

      // Assert
      const [a, b] = await harness.rows(consumer);
      expect(new Date(a.lockedAt as Date).getTime()).toBeGreaterThan(Date.now() - 60_000);
      expect(b.lockedAt).toBeNull();
    });

    // Otherwise a late heartbeat from the old owner keeps the new claim looking fresh, and the sweeper never
    // recovers it if that worker is really gone.
    test("should not refresh a claim another worker now holds", async () => {
      // Setup
      const harness = await setup();
      const consumer = newConsumer();
      await harness.store.insert([delivery(consumer)]);
      const first = await harness.store.claimBatch(consumer, 10);
      const { id } = first.entries[0];
      const longAgo = new Date(Date.now() - HOUR_MS);
      await harness.patch(id, { lockedAt: longAgo });
      await expireStaleClaims(harness);
      await harness.patch(id, { nextRetryAt: new Date(Date.now() - 1_000) });
      const second = await harness.store.claimBatch(consumer, 10);
      await harness.patch(id, { lockedAt: longAgo });

      // Action
      await harness.store.extendClaim(first);

      // Assert
      const [stored] = await harness.rows(consumer);
      expect(new Date(stored.lockedAt as Date).getTime()).toBe(longAgo.getTime());
      expect(stored.lockToken).toBe(second.lockToken);
    });

    test("should prune only terminal entries past their retention, in bounded batches", async () => {
      // Setup
      const { store, rows, patch } = await setup();
      const consumer = newConsumer();
      await store.insert(deliveries(consumer, 5));
      const [oldDelivered, alsoOldDelivered, oldFailed, oldPending, freshDelivered] = await rows(consumer);
      const old = new Date(Date.now() - 48 * HOUR_MS);
      await patch(oldDelivered.id, { status: EventOutboxStatus.Delivered, updatedAt: old });
      await patch(alsoOldDelivered.id, { status: EventOutboxStatus.Delivered, updatedAt: old });
      await patch(oldFailed.id, { status: EventOutboxStatus.Failed, updatedAt: old });
      await patch(oldPending.id, { updatedAt: old });
      await patch(freshDelivered.id, { status: EventOutboxStatus.Delivered });
      const retention = {
        deliveredBefore: new Date(Date.now() - 24 * HOUR_MS),
        failedBefore: new Date(Date.now() - 30 * 24 * HOUR_MS)
      };

      // Action
      const firstBatch = await store.deleteTerminalOlderThan({ ...retention, batchSize: 1 });
      const rest = await store.deleteTerminalOlderThan({ ...retention, batchSize: 100 });

      // Assert
      expect([firstBatch, rest]).toEqual([1, 1]);
      expect((await rows(consumer)).map((row) => row.id)).toEqual([oldFailed.id, oldPending.id, freshDelivered.id]);
    });

    test("should report how long each consumer's oldest undelivered entry has waited", async () => {
      // Setup
      const { store, rows, patch } = await setup();
      const consumer = newConsumer();
      await store.insert([
        {
          consumer,
          event: EmittedEvent.create({
            id: randomUUID(),
            type: "contract.resource.happened",
            data: {},
            time: new Date(Date.now() - 2 * HOUR_MS)
          })
        },
        {
          consumer,
          event: EmittedEvent.create({
            id: randomUUID(),
            type: "contract.resource.happened",
            data: {},
            time: new Date(Date.now() - 3 * HOUR_MS)
          })
        }
      ]);
      const [, oldest] = await rows(consumer);
      await patch(oldest.id, { status: EventOutboxStatus.Delivered });

      // Action
      const ages = await store.findOldestPendingAgeSeconds();

      // Assert
      const mine = ages.filter((age) => age.consumer === consumer);
      expect(mine).toHaveLength(1);
      expect(mine[0].ageSeconds).toBeGreaterThan(1.9 * 3600);
      expect(mine[0].ageSeconds).toBeLessThan(2.1 * 3600);
    });
  });
};
