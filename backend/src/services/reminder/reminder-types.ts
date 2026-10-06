import { Knex } from "knex";

import { TAlertChannelInput, TChannelRecipientInput } from "../alert/alert-channel-service-types";
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
    // From resolveReminderRecipients, for a caller that checked them before its own write.
    resolvedRecipients?: TChannelRecipientInput[];
    channels?: TAlertChannelInput[];
  };
};

export type TBatchCreateReminderDTO = {
  secretId: string;
  message?: string | null;
  repeatDays?: number | null;
  nextReminderDate?: string | Date | null;
  fromDate?: Date | null;
  projectId?: string;
}[];

export interface TReminderServiceFactory {
  resolveReminderRecipients: (input: {
    actorOrgId: string;
    projectId: string;
    recipients?: string[] | null;
  }) => Promise<TChannelRecipientInput[]>;

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

  batchCreateReminders: (
    remindersData: TBatchCreateReminderDTO,
    tx?: Knex
  ) => Promise<{
    created: number;
    reminderIds: string[];
  }>;

  moveReminderAlerts: (moves: { fromSecretId: string; toSecretId: string }[], tx: Knex) => Promise<void>;

  getRemindersForDashboard: (secretIds: string[]) => Promise<Record<string, TReminder & { recipients: string[] }>>;
}
