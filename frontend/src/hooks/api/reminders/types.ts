import { TAlertChannelInput } from "../alerts/types";

export type CreateReminderDTO = {
  message?: string | null;
  repeatDays?: number | null;
  nextReminderDate?: Date | null;
  fromDate?: Date | null;
  secretId: string;
  recipients?: string[];
  channels?: TAlertChannelInput[];
};

export type DeleteReminderDTO = {
  secretId: string;
  reminderId: string;
};

export type Reminder = { id: string } & Omit<CreateReminderDTO, "channels">;
