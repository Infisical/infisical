import RE2 from "re2";
import { z } from "zod";

import { RuleViolationError } from "@app/domains/lib/errors";

export const MAX_OUTBOX_PAYLOAD_BYTES = 16 * 1024;

const MAX_EVENT_TYPE_LENGTH = 255;

const EventInputSchema = z.object({
  id: z.string().uuid(),
  type: z
    .string()
    .trim()
    .min(1)
    .max(MAX_EVENT_TYPE_LENGTH)
    .regex(
      new RE2(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
      "Must be lowercase and dot-namespaced, e.g. 'pki.certificate.issued'"
    ),
  data: z.record(z.unknown()),
  time: z.date().optional()
});

// `id` is set when the event is built, so every consumer's row for it shares the same one.
export type TEventInput = z.input<typeof EventInputSchema>;

export enum EmittedEventRejection {
  InvalidEvent = "invalid_event",
  DataTooLarge = "data_too_large"
}

export type TEmittedEventRejectionDetails = {
  reason: EmittedEventRejection;
  type: string;
};

export class EmittedEvent {
  private constructor(
    readonly id: string,
    readonly type: string,
    readonly data: Record<string, unknown>,
    readonly occurredAt: Date
  ) {}

  // Refuses with the reason in `details`, since the caller reports it and the user never sees the message.
  static create(input: TEventInput): EmittedEvent {
    const parsed = EventInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new RuleViolationError({
        message: parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join(", "),
        details: {
          reason: EmittedEventRejection.InvalidEvent,
          type: input.type
        } satisfies TEmittedEventRejectionDetails
      });
    }
    const { id, type, data, time } = parsed.data;

    const dataBytes = Buffer.byteLength(JSON.stringify(data), "utf8");
    if (dataBytes > MAX_OUTBOX_PAYLOAD_BYTES) {
      throw new RuleViolationError({
        message: `data is ${dataBytes} bytes, over the ${MAX_OUTBOX_PAYLOAD_BYTES} byte limit; the outbox carries identifiers, not documents`,
        details: {
          reason: EmittedEventRejection.DataTooLarge,
          type
        } satisfies TEmittedEventRejectionDetails
      });
    }

    return new EmittedEvent(id, type, data, time ?? new Date());
  }
}
