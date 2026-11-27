import { RuleViolationError } from "@app/domains/lib/errors";

// `DataRejected`: a subscribing consumer's schema refused the data.
export enum EventRejectionReason {
  InvalidEvent = "invalid_event",
  DataTooLarge = "data_too_large",
  DataRejected = "data_rejected"
}

// A bug at the emit site, never something a user sent. The emitter reports the reason and type itself.
export class EventRejectedError extends RuleViolationError {
  constructor(
    readonly reason: EventRejectionReason,
    readonly eventType: string,
    message: string
  ) {
    super({ message });
  }
}
