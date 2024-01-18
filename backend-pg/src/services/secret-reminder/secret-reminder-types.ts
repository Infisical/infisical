import { TSecrets } from "@app/db/schemas";

type TPartialSecret = Pick<TSecrets, "id" | "secretReminderRepeatDays" | "secretReminderNote">;

type TPartialInputSecret = Pick<
  TSecrets,
  "type" | "secretReminderNote" | "secretReminderRepeatDays" | "id"
>;

export type TCreateSecretReminderDTO = {
  oldSecret: TPartialSecret;
  newSecret: TPartialSecret;
  projectId: string;
};

export type TDeleteSecretReminderDTO = {
  secretId: string;
  repeatDays: number;
};

export type THandleReminderDTO = {
  newSecret: TPartialInputSecret;
  oldSecret: TPartialSecret;
  projectId: string;
};
