import { ExternalSystemError } from "@app/domains/lib/errors";
import { logger } from "@app/lib/logger";

import { EmittedEvent, TEventInput } from "../../models/emitted-event";
import { EventRejectedError, EventRejectionReason } from "../../models/event-rejection";
import { TEventsMetrics, TOutboxDelivery } from "../dependencies";
import { ConsumerRegistry } from "./consumer-registry";

// A malformed event is a bug at the emit site. Throwing fails the caller's transaction on purpose: a write
// that commits without its event is a change consumers never hear about.
const reject = (
  metrics: TEventsMetrics,
  rejection: { type: string; reason: EventRejectionReason; detail: string; consumer?: string }
): never => {
  const { type, reason, detail, consumer } = rejection;
  logger.error(
    `event-outbox: rejected event [type=${type}] [reason=${reason}]${consumer ? ` [consumer=${consumer}]` : ""}: ${detail}`
  );
  metrics.recordRejected({ eventType: type, reason, consumer });
  throw new ExternalSystemError({
    message:
      "Infisical could not record an event for this change, so the change was not saved. Contact support and include the request ID."
  });
};

const createEvent = (metrics: TEventsMetrics, input: TEventInput): EmittedEvent => {
  try {
    return EmittedEvent.create(input);
  } catch (error) {
    if (!(error instanceof EventRejectedError)) throw error;
    return reject(metrics, { type: error.eventType, reason: error.reason, detail: error.message });
  }
};

// One delivery per subscribing consumer. Runs before any DB access, and only `subscribesTo` decides who gets
// a row.
export const buildDeliveries = (
  consumerRegistry: ConsumerRegistry,
  metrics: TEventsMetrics,
  events: TEventInput[]
): TOutboxDelivery[] =>
  events.flatMap((input) => {
    const event = createEvent(metrics, input);

    return consumerRegistry.subscribersOf(event.type).map((consumer) => {
      const data = consumer.dataSchema.safeParse(event.data);
      if (!data.success) {
        return reject(metrics, {
          type: event.type,
          reason: EventRejectionReason.DataRejected,
          detail: data.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join(", "),
          consumer: consumer.name
        });
      }
      return { consumer: consumer.name, event };
    });
  });
