import { z } from "zod";

import { FolderModifiedEventV1 } from "@app/services/secret-folder/secret-folder-events";
import { SecretImportModifiedEventV1 } from "@app/services/secret-import/secret-import-events";
import { SecretModifiedEventV1 } from "@app/services/secret-v2-bridge/secret-events";

// Reached through a path the alias does not match, so these resolve to the real modules.
import * as RealEventOutboxRegistry from "../../src/services/event-outbox/event-outbox-registry";
import { EventResultStatus, IEventConsumer } from "../../src/services/event-outbox/event-outbox-types";

// Nothing in src/ subscribes to the secret events yet, and emit writes no row for an event nobody
// subscribes to, so without a consumer a spec could not see what a write emitted. This one records
// every secret event and accepts it, so the row stays in event_outbox for a spec to read. Wired up by
// test.alias in vitest.e2e.config.mts; nothing under src/ references this file.
export const SECRET_EVENTS_RECORDER = "e2e-secret-events";

const RECORDED_EVENTS = [SecretModifiedEventV1, FolderModifiedEventV1, SecretImportModifiedEventV1] as const;

const secretEventsRecorder: IEventConsumer = {
  name: SECRET_EVENTS_RECORDER,
  // The definitions' own schemas, so an emit site that builds a bad payload is dropped here exactly as
  // it would be for a real consumer, and the spec waiting for its row fails.
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
