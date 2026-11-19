import type { Knex } from "knex";

import { TEventInput } from "@app/domains/platform/events/ce/module";
import { FakeEventEmitterService } from "@app/domains/platform/events/ce/testing/fake-event-emitter-service";

import { legacyEventEmitter } from "./event-emitter";

const events: TEventInput[] = [
  { id: "550e8400-e29b-41d4-a716-446655440000", type: "pki.certificate.issued", data: { certificateId: "cert-1" } }
];

describe("legacyEventEmitter", () => {
  test("should join a Knex transaction, so the events commit with the caller's write", async () => {
    // Setup
    const eventEmitterService = new FakeEventEmitterService();
    const trx = { isTransaction: true, executionPromise: Promise.resolve() } as unknown as Knex;

    // Action
    await legacyEventEmitter(eventEmitterService).emit(events, trx);

    // Assert
    expect(eventEmitterService.emittedInTransaction.map((joined) => joined.events)).toEqual([events]);
  });

  test("should emit on its own for a plain connection instead of trying to join it", async () => {
    // Setup
    const eventEmitterService = new FakeEventEmitterService();
    const connection = {} as Knex;

    // Action
    await legacyEventEmitter(eventEmitterService).emit(events, connection);

    // Assert
    expect(eventEmitterService.emitted).toEqual(events);
    expect(eventEmitterService.emittedInTransaction).toEqual([]);
  });

  test("should emit on its own when no transaction is given", async () => {
    // Setup
    const eventEmitterService = new FakeEventEmitterService();

    // Action
    await legacyEventEmitter(eventEmitterService).emit(events);

    // Assert
    expect(eventEmitterService.emitted).toEqual(events);
    expect(eventEmitterService.emittedInTransaction).toEqual([]);
  });
});
