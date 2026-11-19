import { ExternalSystemError, RuleViolationError } from "@app/domains/lib/errors";
import { logger } from "@app/lib/logger";
import { EventOutboxRejectReason, recordEventOutboxRejectedMetric } from "@app/lib/telemetry/metrics";

import {
  EmittedEvent,
  EmittedEventRejection,
  TEmittedEventRejectionDetails,
  TEventInput
} from "../../models/emitted-event";
import { TOutboxDelivery } from "../dependencies";
import { ConsumerRegistry } from "./consumer-registry";

// A malformed event is a bug at the emit site. Throwing fails the caller's transaction on purpose: a
// write that commits without its event is a change consumers never hear about.
const reject = (type: string, reason: EventOutboxRejectReason, detail: string, consumer?: string): never => {
  logger.error(
    `event-outbox: rejected event [type=${type}] [reason=${reason}]${consumer ? ` [consumer=${consumer}]` : ""}: ${detail}`
  );
  recordEventOutboxRejectedMetric({ eventType: type, reason, consumer });
  throw new ExternalSystemError({
    message:
      "Infisical could not record an event for this change, so the change was not saved. Contact support and include the request ID."
  });
};

const createEvent = (input: TEventInput): EmittedEvent => {
  try {
    return EmittedEvent.create(input);
  } catch (error) {
    if (!(error instanceof RuleViolationError)) throw error;
    const { reason, type } = error.details as TEmittedEventRejectionDetails;
    return reject(
      type,
      reason === EmittedEventRejection.DataTooLarge
        ? EventOutboxRejectReason.DataTooLarge
        : EventOutboxRejectReason.InvalidEvent,
      error.message
    );
  }
};

// One delivery per subscribing consumer. Runs before any database access, and only `subscribesTo` decides
// who gets a row.
export const buildDeliveries = (consumerRegistry: ConsumerRegistry, events: TEventInput[]): TOutboxDelivery[] =>
  events.flatMap((input) => {
    const event = createEvent(input);

    return consumerRegistry.subscribersOf(event.type).map((consumer) => {
      const data = consumer.dataSchema.safeParse(event.data);
      if (!data.success) {
        return reject(
          event.type,
          EventOutboxRejectReason.DataRejected,
          data.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join(", "),
          consumer.name
        );
      }
      return { consumer: consumer.name, event };
    });
  });
