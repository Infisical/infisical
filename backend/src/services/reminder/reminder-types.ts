import { Knex } from "knex";

import { TAlertChannelInput } from "../alert/alert-channel-service-types";
import { TPreparedAlert } from "../alert/alert-service";
import { ActorAuthMethod, ActorType } from "../auth/auth-type";

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

export type TCreateReminderDTO = {
  actor: ActorType;
  actorId: string;
  actorOrgId: string;
  actorAuthMethod: ActorAuthMethod;
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

export type TPrepareReminderDTO = TCreateReminderDTO & {
  // The key the secret will have once the caller's own write lands (eg a rename in the same update), so
  // the alert is named after it rather than the key being replaced.
  secretKey?: string;
};

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

  createReminder: ({ actor, actorId, actorOrgId, actorAuthMethod, reminder }: TCreateReminderDTO) => Promise<{
    id: string;
    created: boolean;
  }>;

  getReminder: ({
    secretId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: {
    secretId: string;
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
    actorAuthMethod: ActorAuthMethod;
  }) => Promise<(TReminder & { recipients: string[] }) | null>;

  dispatchDueReminders: (opts?: { now?: Date }) => Promise<void>;

  reapOrphanedReminderAlerts: () => Promise<void>;

  deleteReminder: ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    secretId
  }: {
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
    actorAuthMethod: ActorAuthMethod;
    secretId: string;
  }) => Promise<void>;

  deleteReminderBySecretId: (secretId: string, projectId: string, tx?: Knex) => Promise<void>;

  moveReminders: (moves: TReminderMove[], tx: Knex) => Promise<void>;

  copyReminders: (moves: TReminderMove[], tx: Knex) => Promise<void>;

  getRemindersForDashboard: (secretIds: string[]) => Promise<Record<string, TReminder & { recipients: string[] }>>;
}
