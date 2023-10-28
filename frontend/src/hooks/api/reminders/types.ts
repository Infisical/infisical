export type TReminder = {
  _id: string;
  secret: string;
  frequency: number;
  note: string;
};

export type TReminders = TReminder[];

export type TCreateReminder = {
  secretID: string;
  frequency: number;
  note: string;
};

export type TUpdateReminder = {
  secretID: string;
  reminderID: string;
  frequency: number;
  note: string;
};

export type TDeleteReminder = {
  secretID: string;
  reminderID: string;
};