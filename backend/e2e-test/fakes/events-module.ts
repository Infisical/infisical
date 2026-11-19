import { z } from "zod";

import { FolderModifiedEventV1 } from "@app/services/secret-folder/secret-folder-events";
import { SecretImportModifiedEventV1 } from "@app/services/secret-import/secret-import-events";
import { SecretModifiedEventV1 } from "@app/services/secret-v2-bridge/secret-events";

// Relative on purpose: the vitest alias only catches the specifier domains.ts uses.
import {
  EventResultStatus,
  EventsModule as RealEventsModule,
  TEventConsumer,
  TEventDeliveryService,
  TEventsDeps
} from "../../src/domains/platform/events/ce/module";

// Wraps the real events module for specs, wired in via test.alias in vitest.e2e.config.mts.
// - Registers a consumer for the secret events. Nothing in src/ subscribes to them yet, and emit skips events
//   nobody subscribes to, so specs would never see the rows.
// - Lets a spec drain now instead of waiting on the relay. The relay still runs, so wait on the outcome, not on
//   the drain.
export const SECRET_EVENTS_RECORDER = "e2e-secret-events";

const RECORDED_EVENTS = [SecretModifiedEventV1, FolderModifiedEventV1, SecretImportModifiedEventV1] as const;

const secretEventsRecorder: TEventConsumer = {
  name: SECRET_EVENTS_RECORDER,
  // Real schemas, so a bad payload fails the spec like it would a real consumer.
  dataSchema: z.union([RECORDED_EVENTS[0].data, RECORDED_EVENTS[1].data, RECORDED_EVENTS[2].data]),
  subscribesTo: (eventType) => RECORDED_EVENTS.some((definition) => definition.type === eventType),
  handle: async (events) => events.map((event) => ({ id: event.id, status: EventResultStatus.Delivered }))
};

// On globalThis for the same reason as aws-iam-user-secret-rotation-fns.ts.
const globalScope = globalThis as typeof globalThis & {
  infisicalEventDeliveryService?: TEventDeliveryService;
};

export class EventsModule extends RealEventsModule {
  constructor(deps: TEventsDeps) {
    super(deps);
    this.registerConsumer(secretEventsRecorder);
    // First server wins: a spec that boots and closes its own server (eg api-run-modes.spec.ts) must not take
    // the handle, or later specs would drive a closed server.
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
