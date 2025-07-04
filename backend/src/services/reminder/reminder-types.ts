import { ActorAuthMethod, ActorType } from "../auth/auth-type";

export type TReminder = {
  id: string;
  secretId?: string;
  message?: string;
  repeatDays?: number;
  nextReminderDate?: Date;
  createdAt: Date;
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

export type TCreateSecretReminderDTO = {
  secretName: string;
  projectId: string;
  environment: string;
  secretPath: string;
  message?: string | null;
  repeatDays?: number | null;
  nextReminderDate?: string | null;
  recipients?: string[] | null;
};

export type TBatchCreateReminderDTO = {
  secretId: string;
  message?: string | null;
  repeatDays?: number | null;
  nextReminderDate?: string | Date | null;
  recipients?: string[] | null;
}[];
