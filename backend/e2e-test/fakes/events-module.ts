import { z } from "zod";

import { FolderModifiedEventV1 } from "@app/services/secret-folder/secret-folder-events";
import { SecretImportModifiedEventV1 } from "@app/services/secret-import/secret-import-events";
import { SecretModifiedEventV1 } from "@app/services/secret-v2-bridge/secret-events";

// Relative on purpose: it is the specifier domains.ts uses that the vitest alias points here.
import {
  EventResultStatus,
  EventsModule as RealEventsModule,
  TEventConsumer,
  TEventDeliveryService,
  TEventsDeps
} from "../../src/domains/platform/events/ce/module";

// Wraps the real events module for specs. Wired in through test.alias in vitest.e2e.config.mts; nothing under
// src/ references this file.
//
// It does two things. It registers a consumer that accepts every secret event: nothing in src/ subscribes to
// them yet, and emit skips events nobody subscribes to, so specs would never see the rows. And it hands a spec
// the delivery service, to deliver pending events now rather than waiting up to OUTBOX_RELAY_INTERVAL_MS (plus start
// jitter) for the relay.
//
// The relay keeps running alongside. Claims are exclusive, so an event is delivered once whichever side gets
// to it first, and a spec should still wait on the outcome rather than on the drain.
export const SECRET_EVENTS_RECORDER = "e2e-secret-events";

const RECORDED_EVENTS = [SecretModifiedEventV1, FolderModifiedEventV1, SecretImportModifiedEventV1] as const;

const secretEventsRecorder: TEventConsumer = {
  name: SECRET_EVENTS_RECORDER,
  // The real schemas, so a bad payload fails the spec the same way it would fail a real consumer.
  dataSchema: z.union([RECORDED_EVENTS[0].data, RECORDED_EVENTS[1].data, RECORDED_EVENTS[2].data]),
  subscribesTo: (eventType) => RECORDED_EVENTS.some((definition) => definition.type === eventType),
  handle: async (events) => events.map((event) => ({ id: event.id, status: EventResultStatus.Delivered }))
};

// The handle hangs off globalThis for the reason given in aws-iam-user-secret-rotation-fns.ts.
const globalScope = globalThis as typeof globalThis & {
  infisicalEventDeliveryService?: TEventDeliveryService;
};

export class EventsModule extends RealEventsModule {
  constructor(deps: TEventsDeps) {
    super(deps);
    this.registerConsumer(secretEventsRecorder);
    // The shared test server boots first. A spec that boots and closes a second server of its own (eg
    // api-run-modes.spec.ts) must not take the handle, or later specs would drive that closed server.
    globalScope.infisicalEventDeliveryService ??= this.eventDeliveryService;
  }
}

export const eventOutbox = {
  drain: async (consumer: string) => {
    const service = globalScope.infisicalEventDeliveryService;
    if (!service) throw new Error("The test server has not wired the events module yet");
    await service.drain(consumer);
  }
};
