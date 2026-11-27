import { Knex } from "knex";

import { TActorInput } from "@app/lib/types";

import { TAlertChannelInput } from "../alert/alert-channel-service-types";
import { TPreparedAlert } from "../alert/alert-service";

export type TReminder = {
  id: string;
  secretId?: string | null;
  message?: string | null;
  repeatDays?: number | null;
  nextReminderDate: Date;
  fromDate?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TCreateReminderDTO = TActorInput & {
  reminder: {
    secretId?: string;
    message?: string | null;
    repeatDays?: number | null;
    fromDate?: string | null;
    nextReminderDate?: string | null;
    recipients?: string[] | null;
    channels?: TAlertChannelInput[];
  };
};

export type TPrepareReminderDTO = TCreateReminderDTO;

// A reminder that has passed every check, ready to be written with applyReminder in the caller's
// transaction.
export type TPreparedReminder = {
  secretId: string;
  projectId: string;
  schedule: {
    message?: string | null;
    repeatDays?: number | null;
    nextReminderDate: Date;
    fromDate?: Date;
  };
  alert: TPreparedAlert;
};

// A secret recreated under a new id (eg by a move between folders).
export type TReminderMove = { fromSecretId: string; toSecretId: string };

export interface TReminderServiceFactory {
  prepareReminder: (dto: TPrepareReminderDTO) => Promise<TPreparedReminder>;

  applyReminder: (prepared: TPreparedReminder, tx: Knex) => Promise<{ id: string; created: boolean }>;

  createReminder: (dto: TCreateReminderDTO) => Promise<{
    id: string;
    created: boolean;
  }>;

  getReminder: (dto: { secretId: string } & TActorInput) => Promise<(TReminder & { recipients: string[] }) | null>;

  dispatchDueReminders: (opts?: { now?: Date }) => Promise<void>;

  reapOrphanedReminderAlerts: () => Promise<void>;

  deleteReminder: (dto: { secretId: string } & TActorInput) => Promise<void>;

  deleteReminderBySecretId: (secretId: string, projectId: string, tx?: Knex) => Promise<void>;

  moveReminders: (moves: TReminderMove[], tx: Knex) => Promise<void>;

  copyReminders: (moves: TReminderMove[], tx: Knex) => Promise<void>;

  getRemindersForDashboard: (secretIds: string[]) => Promise<Record<string, TReminder & { recipients: string[] }>>;
}
