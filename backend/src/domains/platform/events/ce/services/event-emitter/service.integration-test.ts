import { randomUUID } from "node:crypto";

import { z } from "zod";

import { TableName, TEventOutbox } from "@app/db/schemas";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { sealKnexTransaction, TransactionRunner } from "@app/domains/lib/transactions";

import { TEventInput } from "../../models/emitted-event";
import { EventOutboxStatus, EventResultStatus } from "../../models/outbox-entry";
import { EventsModule } from "../../module";
import { TEvent } from "../dependencies";

const EVENT_TYPE = "it.resource.happened";

describe("Events services on Postgres", () => {
  const h = setupIntegration();

  // Never started, so the queue and cron go unused.
  const build = () => {
    const consumer = `it-${randomUUID().slice(0, 8)}`;
    const received: TEvent[] = [];
    const module = new EventsModule({
      db: h.db,
      queueService: {} as never,
      cronJob: {} as never,
      isSecondaryInstance: false,
      isGeneralWorkerRunModeEnabled: false,
      isTelemetryEnabled: false
    });
    module.registerConsumer({
      name: consumer,
      dataSchema: z.object({ resourceId: z.string() }),
      subscribesTo: (type) => type === EVENT_TYPE,
      handle: async (events) => {
        received.push(...events);
        return events.map((event) => ({ id: event.id, status: EventResultStatus.Delivered }));
      }
    });
    // Stands in for the domain whose write the events describe.
    const callerRunner = new TransactionRunner(h.db, () => ({}));
    const rows = () => h.db(TableName.EventOutbox).where({ consumer }).orderBy("id", "asc").select<TEventOutbox[]>("*");
    const { eventEmitterService, eventDeliveryService } = module;
    return { eventEmitterService, eventDeliveryService, callerRunner, consumer, received, rows };
  };

  const makeEvents = (count: number): TEventInput[] =>
    Array.from({ length: count }, () => ({ id: randomUUID(), type: EVENT_TYPE, data: { resourceId: "res-1" } }));

  describe("EventEmitterService.within", () => {
    test("should commit the events with the caller's transaction", async () => {
      // Setup
      const { eventEmitterService, callerRunner, rows } = build();
      const events = makeEvents(2);

      // Action
      await callerRunner.run(({ tx }) => eventEmitterService.within(tx).emit(events));

      // Assert
      expect((await rows()).map((row) => row.eventId)).toEqual(events.map((event) => event.id));
    });

    // More than one insert chunk, so a rollback has to undo statements that already ran.
    test("should keep none of the events when the caller's transaction rolls back", async () => {
      // Setup
      const { eventEmitterService, callerRunner, rows } = build();

      // Action
      const result = callerRunner.run(async ({ tx }) => {
        await eventEmitterService.within(tx).emit(makeEvents(1001));
        throw new Error("the business write failed");
      });

      // Assert
      await expect(result).rejects.toThrow("the business write failed");
      expect(await rows()).toEqual([]);
    });

    test("should not let another connection see the events before the caller commits", async () => {
      // Setup
      const { eventEmitterService, callerRunner, rows } = build();
      let seenBeforeCommit = -1;

      // Action
      await callerRunner.run(async ({ tx }) => {
        await eventEmitterService.within(tx).emit(makeEvents(1));
        seenBeforeCommit = (await rows()).length;
      });

      // Assert
      expect(seenBeforeCommit).toBe(0);
      expect(await rows()).toHaveLength(1);
    });

    test("should join a transaction held by code outside the domains", async () => {
      // Setup
      const { eventEmitterService, rows } = build();

      // Action
      const result = h.db.transaction(async (trx) => {
        await eventEmitterService.within(sealKnexTransaction(trx)).emit(makeEvents(1));
        throw new Error("the business write failed");
      });

      // Assert
      await expect(result).rejects.toThrow("the business write failed");
      expect(await rows()).toEqual([]);
    });
  });

  describe("EventEmitterService.emit", () => {
    test("should write the events on their own when there is no transaction to join", async () => {
      // Setup
      const { eventEmitterService, rows } = build();

      // Action
      await eventEmitterService.emit(makeEvents(1));

      // Assert
      expect(await rows()).toMatchObject([{ status: EventOutboxStatus.Pending, attempts: 0 }]);
    });
  });

  describe("EventDeliveryService.drain", () => {
    test("should deliver what was emitted and settle it", async () => {
      // Setup
      const { eventEmitterService, eventDeliveryService, consumer, received, rows } = build();
      const events = makeEvents(3);
      await eventEmitterService.emit(events);

      // Action
      const result = await eventDeliveryService.drain(consumer);

      // Assert
      expect(result).toEqual({ handled: 3, unknownConsumer: false });
      expect(received.map((event) => event.id)).toEqual(events.map((event) => event.id));
      expect((await rows()).every((row) => row.status === EventOutboxStatus.Delivered && !row.lockToken)).toBe(true);
    });
  });
});
