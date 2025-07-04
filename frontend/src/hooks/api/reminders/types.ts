export type CreateReminderDTO = {
  message?: string | null;
  repeatDays?: number | null;
  nextReminderDate?: Date | null;
  secretId: string;
  recipients?: string[];
};

export type DeleteReminderDTO = {
  secretId: string;
  reminderId: string;
};

export type Reminder = { id: string } & CreateReminderDTO;
