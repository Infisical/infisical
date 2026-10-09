const DAY_MS = 24 * 60 * 60 * 1000;

// Reminders missed by up to this many days (eg the cron did not run) still fire once, late.
export const REMINDER_CATCH_UP_DAYS = 7;

const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

export const toUtcDateString = (date: Date): string => date.toISOString().slice(0, 10);

export const getReminderDueWindow = (now: Date): { from: Date; to: Date } => {
  const today = startOfUtcDay(now);
  return {
    from: new Date(today.getTime() - REMINDER_CATCH_UP_DAYS * DAY_MS),
    to: new Date(today.getTime() + DAY_MS - 1)
  };
};

// The next occurrence after today on the reminder's own schedule, so a late or caught-up run does not
// shift the dates it fires on.
export const advanceReminderDate = (dueDate: Date, repeatDays: number, now: Date): Date => {
  const periodMs = repeatDays * DAY_MS;
  const endOfToday = startOfUtcDay(now).getTime() + DAY_MS - 1;
  const periods = Math.max(1, Math.floor((endOfToday - dueDate.getTime()) / periodMs) + 1);
  return new Date(dueDate.getTime() + periods * periodMs);
};
