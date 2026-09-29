import type { TEventOutboxServiceFactory } from "@app/services/event-outbox/event-outbox-service";

// Reached through a path the alias does not match, so this resolves to the real module.
import * as RealEventOutboxQueue from "../../src/services/event-outbox/event-outbox-queue";

// Wraps the real outbox queue so a spec can deliver pending events now rather than waiting up to
// OUTBOX_RELAY_INTERVAL_MS (plus start jitter) for the relay. Wired up by test.alias in
// vitest.e2e.config.mts; nothing under src/ references this file.
//
// The relay keeps running alongside. Claims are exclusive, so an event is delivered once whichever
// side gets to it first, and a spec should still wait on the outcome rather than on the drain.
//
// The handle hangs off globalThis for the reason given in aws-parameter-store-sync-fns.ts.
const globalScope = globalThis as typeof globalThis & {
  infisicalEventOutboxService?: Pick<TEventOutboxServiceFactory, "drain">;
};

export const eventOutboxQueueFactory: typeof RealEventOutboxQueue.eventOutboxQueueFactory = (deps) => {
  globalScope.infisicalEventOutboxService = deps.eventOutboxService;
  return RealEventOutboxQueue.eventOutboxQueueFactory(deps);
};

export const eventOutbox = {
  drain: async (consumer: string) => {
    const service = globalScope.infisicalEventOutboxService;
    if (!service) throw new Error("The test server has not wired the event outbox yet");
    await service.drain({ consumer });
  }
};
