import { TCalendarReminder, TCalendarRotation } from "@app/hooks/api/secretInsights/types";

export type CalendarEvent =
  | { type: "rotation"; data: TCalendarRotation }
  | { type: "reminder"; data: TCalendarReminder };
