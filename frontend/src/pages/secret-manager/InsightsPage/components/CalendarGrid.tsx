import { useMemo } from "react";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek
} from "date-fns";

import { TCalendarReminder, TCalendarRotation } from "@app/hooks/api/secretInsights/types";

import { CalendarDayCell } from "./CalendarDayCell";
import { CalendarEvent } from "./types";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const groupEventsByDate = (
  rotations: TCalendarRotation[],
  reminders: TCalendarReminder[]
): Record<string, CalendarEvent[]> => {
  const map: Record<string, CalendarEvent[]> = {};

  rotations.forEach((r) => {
    if (!r.nextRotationAt) return;
    const key = format(new Date(r.nextRotationAt), "yyyy-MM-dd");
    if (!map[key]) map[key] = [];
    map[key].push({ type: "rotation", data: r });
  });

  reminders.forEach((r) => {
    const key = format(new Date(r.nextReminderDate), "yyyy-MM-dd");
    if (!map[key]) map[key] = [];
    map[key].push({ type: "reminder", data: r });
  });

  return map;
};

export const CalendarGrid = ({
  currentMonth,
  rotations,
  reminders
}: {
  currentMonth: Date;
  rotations: TCalendarRotation[];
  reminders: TCalendarReminder[];
}) => {
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [currentMonth]);

  const eventsByDate = useMemo(
    () => groupEventsByDate(rotations, reminders),
    [rotations, reminders]
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-container">
      <div className="grid grid-cols-7">
        {DAY_NAMES.map((day) => (
          <div key={day} className="border-b border-border py-2 text-center text-sm font-medium">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          return (
            <CalendarDayCell
              key={dateKey}
              date={day}
              isCurrentMonth={isSameMonth(day, currentMonth)}
              events={eventsByDate[dateKey] ?? []}
            />
          );
        })}
      </div>
    </div>
  );
};
