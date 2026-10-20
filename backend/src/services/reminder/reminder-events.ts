import { Knex } from "knex";
import RE2 from "re2";
import { z } from "zod";

import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";

export const SECRET_REMINDER_RESOURCE_TYPE = "secret.reminder";
export const SECRET_REMINDER_DUE_EVENT = "secret.reminder.due";

export const SecretReminderDuePayloadSchema = z.object({
  note: z.string().max(1024).nullish(),
  repeatDays: z.number().int().min(1).nullish(),
  // UTC calendar date (yyyy-mm-dd) the reminder was due on, which a catch-up run can send late.
  occurrenceDate: z.string().regex(new RE2("^\\d{4}-\\d{2}-\\d{2}$"))
});

export type TSecretReminderDueInput = {
  orgId: string;
  projectId: string;
  reminderId: string;
  secretId: string;
  note?: string | null;
  repeatDays?: number | null;
  occurrenceDate: string;
};

export const emitSecretReminderDue = (
  eventEmitter: TEventEmitter,
  { orgId, projectId, reminderId, secretId, note, repeatDays, occurrenceDate }: TSecretReminderDueInput,
  tx: Knex
): Promise<void> =>
  eventEmitter.emit(
    {
      eventType: SECRET_REMINDER_DUE_EVENT,
      // A cron retry after a partial run must not send the same occurrence twice. Keyed on the reminder
      // rather than the secret, so a reminder deleted and set again for a date that already fired still sends.
      idempotencyKey: `${SECRET_REMINDER_DUE_EVENT}:${reminderId}:${occurrenceDate}`,
      payload: {
        orgId,
        projectId,
        resourceType: SECRET_REMINDER_RESOURCE_TYPE,
        resourceId: secretId,
        targetIds: [secretId],
        note: note ?? null,
        repeatDays: repeatDays ?? null,
        occurrenceDate
      }
    },
    tx
  );
