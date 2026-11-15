import { z } from "zod";

import { FolderModifiedEventV1 } from "@app/services/secret-folder/secret-folder-events";
import { SecretImportModifiedEventV1 } from "@app/services/secret-import/secret-import-events";
import { SecretModifiedEventV1 } from "@app/services/secret-v2-bridge/secret-events";

// Relative on purpose: the vitest alias would point back at this file.
import * as RealEventOutboxRegistry from "../../src/services/event-outbox/event-outbox-registry";
import { EventResultStatus, IEventConsumer } from "../../src/services/event-outbox/event-outbox-types";

// Nothing in src/ subscribes to the secret events yet, and emit skips events nobody subscribes to, so
// specs would never see them. This consumer accepts every secret event so the row stays in event_outbox
// for specs to read. Wired in through test.alias in vitest.e2e.config.mts.
export const SECRET_EVENTS_RECORDER = "e2e-secret-events";

const RECORDED_EVENTS = [SecretModifiedEventV1, FolderModifiedEventV1, SecretImportModifiedEventV1] as const;

const secretEventsRecorder: IEventConsumer = {
  name: SECRET_EVENTS_RECORDER,
  // The real schemas, so a bad payload fails the spec the same way it would fail a real consumer.
  dataSchema: z.union([RECORDED_EVENTS[0].data, RECORDED_EVENTS[1].data, RECORDED_EVENTS[2].data]),
  subscribesTo: (eventType) => RECORDED_EVENTS.some((definition) => definition.type === eventType),
  handle: async (events) => events.map((event) => ({ id: event.id, status: EventResultStatus.Delivered }))
};

export const eventOutboxRegistryFactory: typeof RealEventOutboxRegistry.eventOutboxRegistryFactory = () => {
  const registry = RealEventOutboxRegistry.eventOutboxRegistryFactory();
  registry.register(secretEventsRecorder);
  return registry;
};

export type { TEventOutboxRegistry } from "../../src/services/event-outbox/event-outbox-registry";
