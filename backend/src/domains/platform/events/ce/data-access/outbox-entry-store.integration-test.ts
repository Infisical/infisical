import { randomUUID } from "node:crypto";

import { TableName, TEventOutbox } from "@app/db/schemas";
import { poolStoreConnection, singleStoreConnection } from "@app/domains/lib/data-access";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { describeOutboxEntryStoreContract, TStoredOutboxRow } from "../testing/outbox-entry-store-contract";
import { OutboxEntryStore } from "./outbox-entry-store";

// Pruning and the stale sweep touch every consumer's rows, so this file gets its own database.
const h = setupIntegration({ freshDatabase: true });

describeOutboxEntryStoreContract("OutboxEntryStore", async () => {
  await h.db(TableName.EventOutbox).delete();
  return {
    store: new OutboxEntryStore(poolStoreConnection(h.db)),
    transaction: (work) => h.db.transaction((trx) => work(new OutboxEntryStore(singleStoreConnection(trx)))),
    rows: async (consumer) =>
      (await h.db(TableName.EventOutbox).where({ consumer }).orderBy("id", "asc").select<TEventOutbox[]>("*")).map(
        (row) => ({ ...row, id: String(row.id) }) as TStoredOutboxRow
      ),
    // A trigger stamps updatedAt on every update, so backdating needs it off.
    patch: (id, values) =>
      h.db.transaction(async (trx) => {
        await trx.raw("ALTER TABLE ?? DISABLE TRIGGER USER", [TableName.EventOutbox]);
        await trx(TableName.EventOutbox).where({ id }).update(values);
        await trx.raw("ALTER TABLE ?? ENABLE TRIGGER USER", [TableName.EventOutbox]);
      })
  };
});

describe("OutboxEntryStore.claimBatch", () => {
  // A pod from before eventId existed still inserts without one during a rolling deploy.
  test("should give an entry written without an event id one of its own", async () => {
    // Setup
    const store = new OutboxEntryStore(poolStoreConnection(h.db));
    const consumer = `it-${randomUUID().slice(0, 8)}`;
    const eventId = randomUUID();
    const row = { consumer, eventType: "it.resource.happened", payload: JSON.stringify({}), occurredAt: new Date() };
    await h.db(TableName.EventOutbox).insert([row, row, { ...row, eventId }] as never);

    // Action
    const { entries } = await store.claimBatch(consumer, 10);

    // Assert
    expect(entries).toHaveLength(3);
    expect(entries[2].eventId).toBe(eventId);
    expect(new Set(entries.map((entry) => entry.eventId)).size).toBe(3);
    entries.forEach((entry) => expect(entry.eventId).toMatch(/^[0-9a-f-]{36}$/));
  });
});
