import RE2 from "re2";
import { z } from "zod";

import { EventRejectedError, EventRejectionReason } from "./event-rejection";

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

// `id` is set at build time, so every consumer's row for the event shares it.
export type TEventInput = z.input<typeof EventInputSchema>;

export class EmittedEvent {
  private constructor(
    readonly id: string,
    readonly type: string,
    readonly data: Record<string, unknown>,
    readonly occurredAt: Date
  ) {}

  static create(input: TEventInput): EmittedEvent {
    const parsed = EventInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new EventRejectedError(
        EventRejectionReason.InvalidEvent,
        input.type,
        parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join(", ")
      );
    }
    const { id, type, data, time } = parsed.data;

    const dataBytes = Buffer.byteLength(JSON.stringify(data), "utf8");
    if (dataBytes > MAX_OUTBOX_PAYLOAD_BYTES) {
      throw new EventRejectedError(
        EventRejectionReason.DataTooLarge,
        type,
        `data is ${dataBytes} bytes, over the ${MAX_OUTBOX_PAYLOAD_BYTES} byte limit; the outbox carries identifiers, not documents`
      );
    }

    return new EmittedEvent(id, type, data, time ?? new Date());
  }
}
