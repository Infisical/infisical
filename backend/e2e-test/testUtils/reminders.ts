import { eventOutbox } from "e2e-test/fakes/event-outbox-queue";
import { dailyReminderJob } from "e2e-test/fakes/reminder-queue";
import { TTestSmtpService } from "e2e-test/mocks/smtp";

import { ALERT_EVENT_CONSUMER } from "@app/services/alert/alert-event-consumer";
import { SECRET_REMINDER_RESOURCE_TYPE } from "@app/services/reminder/reminder-events";

import { listAlerts } from "./alerts";
import { pollUntil } from "./poll";
import { request } from "./request";

type TReminderRecord = {
  id: string;
  secretId: string;
  message?: string | null;
  repeatDays?: number | null;
  nextReminderDate: string;
  recipients?: string[];
};

export type TSetSecretReminderBody = {
  message?: string;
  repeatDays?: number | null;
  nextReminderDate?: string | null;
  fromDate?: string | null;
  recipients?: string[];
};

export const setSecretReminder = (dto: { secretId: string; authToken: string } & TSetSecretReminderBody) => {
  const { secretId, authToken, ...body } = dto;
  return request(
    {
      method: "POST",
      url: `/api/v1/reminders/secrets/${secretId}`,
      headers: { authorization: `Bearer ${authToken}` },
      body
    },
    (res) => {
      expect(res.statusCode).toBe(200);
    }
  );
};

export const getSecretReminder = (dto: { secretId: string; authToken: string }) =>
  request(
    {
      method: "GET",
      url: `/api/v1/reminders/secrets/${dto.secretId}`,
      headers: { authorization: `Bearer ${dto.authToken}` }
    },
    (res) => {
      expect(res.statusCode).toBe(200);
      return res.json<{ reminder?: TReminderRecord | null }>().reminder ?? null;
    }
  );

export const deleteSecretReminder = (dto: { secretId: string; authToken: string }) =>
  request(
    {
      method: "DELETE",
      url: `/api/v1/reminders/secrets/${dto.secretId}`,
      headers: { authorization: `Bearer ${dto.authToken}` }
    },
    (res) => {
      expect(res.statusCode).toBe(200);
    }
  );

export const listSecretReminderAlerts = (dto: { projectId: string; secretId: string; authToken: string }) =>
  listAlerts({ resourceType: SECRET_REMINDER_RESOURCE_TYPE, resourceId: dto.secretId, ...dto });

// Runs the daily reminder job as if it fired on `now`, then delivers what it emitted rather than
// leaving that to the outbox relay's next tick.
export const runDailyReminders = async (dto: { now: Date }) => {
  await dailyReminderJob.dispatchDueReminders({ now: dto.now });
  await eventOutbox.drain(ALERT_EVENT_CONSUMER);
};

export const reapOrphanedReminderAlerts = () => dailyReminderJob.reapOrphanedReminderAlerts();

const smtp = () => (globalThis as unknown as { testSmtp: TTestSmtpService }).testSmtp;

export const reminderEmailsFor = (secretKey: string) =>
  smtp()
    .getEmails()
    .filter((email) => {
      const items = (email.substitutions as { items?: { title: string }[] } | undefined)?.items ?? [];
      return email.subjectLine === "Infisical Secret Reminder Alert" && items.some((item) => item.title === secretKey);
    });

export const waitForReminderEmails = (secretKey: string) =>
  pollUntil({
    describe: `a reminder email for secret '${secretKey}'`,
    read: () => reminderEmailsFor(secretKey),
    done: (emails) => emails.length > 0
  });
