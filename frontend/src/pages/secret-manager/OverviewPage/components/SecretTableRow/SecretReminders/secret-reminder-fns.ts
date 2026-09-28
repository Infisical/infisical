import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";

import { SecretReminderRecurrence, TAlert, TSecretReminderCondition } from "@app/hooks/api/alerts";

export const getReminderCondition = (alert: TAlert): TSecretReminderCondition | null => {
  const condition = alert.condition ?? {};
  if (!condition.recurrence || !condition.startDate) return null;
  return {
    recurrence: condition.recurrence,
    startDate: condition.startDate,
    repeatDays: condition.repeatDays ?? null,
    note: condition.note ?? null
  };
};

// Null once a one-off reminder's date has passed.
export const getNextReminderDate = (
  condition: TSecretReminderCondition,
  asOf: Date = new Date()
): Date | null => {
  const start = startOfDay(new Date(condition.startDate));
  const today = startOfDay(asOf);

  if (condition.recurrence === SecretReminderRecurrence.OneTime || !condition.repeatDays) {
    return start >= today ? start : null;
  }

  if (start >= today) return start;
  const elapsedPeriods = Math.ceil(differenceInCalendarDays(today, start) / condition.repeatDays);
  return addDays(start, elapsedPeriods * condition.repeatDays);
};

export const formatReminderSchedule = (condition: TSecretReminderCondition): string => {
  const next = getNextReminderDate(condition);

  if (condition.recurrence === SecretReminderRecurrence.OneTime || !condition.repeatDays) {
    const date = format(new Date(condition.startDate), "MMM d, yyyy");
    return next ? `Once on ${date}` : `Sent on ${date}`;
  }

  const interval = condition.repeatDays === 1 ? "day" : `${condition.repeatDays} days`;
  return next ? `Every ${interval}, next ${format(next, "MMM d, yyyy")}` : `Every ${interval}`;
};
