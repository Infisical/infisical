import { Knex } from "knex";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";

export type TReminder = {
  id: string;
  secretId?: string | null;
  message?: string | null;
  repeatDays?: number | null;
  nextReminderDate: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type TCreateReminderDTO = {
  actor: ActorType;
  actorId: string;
  actorOrgId: string;
  actorAuthMethod: ActorAuthMethod;
  projectId: string;
  reminder: {
    secretId?: string;
    message?: string | null;
    repeatDays?: number | null;
    nextReminderDate?: string | null;
    recipients?: string[] | null;
  };
};

export type TBatchCreateReminderDTO = {
  secretId: string;
  message?: string | null;
  repeatDays?: number | null;
  nextReminderDate?: string | Date | null;
  recipients?: string[] | null;
  projectId?: string;
}[];

export interface TReminderServiceFactory {
  createReminder: ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    reminder
  }: TCreateReminderDTO) => Promise<{
    id: string;
    created: boolean;
  }>;

  getReminder: ({
    secretId,
    projectId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: {
    secretId: string;
    projectId: string;
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
    actorAuthMethod: ActorAuthMethod;
  }) => Promise<(TReminder & { recipients: string[] }) | null>;

  sendDailyReminders: () => Promise<void>;

  deleteReminder: ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    secretId,
    projectId
  }: {
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
    actorAuthMethod: ActorAuthMethod;
    secretId: string;
    projectId: string;
  }) => Promise<void>;

  removeReminderRecipients: (secretId: string, projectId: string, tx?: Knex) => Promise<void>;

  deleteReminderBySecretId: (secretId: string, projectId: string, tx?: Knex) => Promise<void>;

  batchCreateReminders: (
    remindersData: TBatchCreateReminderDTO,
    tx?: Knex
  ) => Promise<{
    created: number;
    reminderIds: string[];
  }>;

  createReminderInternal: ({
    secretId,
    message,
    repeatDays,
    nextReminderDate,
    recipients,
    projectId
  }: {
    secretId?: string;
    message?: string | null;
    repeatDays?: number | null;
    nextReminderDate?: string | null;
    recipients?: string[] | null;
    projectId: string;
  }) => Promise<{
    id: string;
    created: boolean;
  }>;
}
