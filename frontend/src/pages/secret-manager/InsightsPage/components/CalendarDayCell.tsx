import { useState } from "react";
import { isToday } from "date-fns";

import { Badge } from "@app/components/v3/generic/Badge";
import { Popover, PopoverContent, PopoverTrigger } from "@app/components/v3/generic/Popover";

import { CalendarEventPill } from "./CalendarEventPill";
import { CalendarEvent } from "./types";

const MAX_SLOTS = 2;

const getBgClass = (today: boolean, isCurrentMonth: boolean) => {
  if (today) return isCurrentMonth ? "bg-muted/5" : "bg-card/50";
  return isCurrentMonth ? "bg-container" : "bg-card";
};

export const CalendarDayCell = ({
  date,
  isCurrentMonth,
  events
}: {
  date: Date;
  isCurrentMonth: boolean;
  events: CalendarEvent[];
}) => {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const today = isToday(date);
  const dayNum = date.getDate();
  // If everything fits in MAX_SLOTS, show all. Otherwise reserve 1 slot for the overflow badge.
  const hasOverflow = events.length > MAX_SLOTS;
  const visibleCount = hasOverflow ? MAX_SLOTS - 1 : events.length;
  const visibleEvents = events.slice(0, visibleCount);
  const overflowCount = events.length - visibleCount;

  return (
    <div
      className={`min-h-[86px] border border-border p-2 transition-colors duration-75 hover:bg-container-hover ${getBgClass(
        today,
        isCurrentMonth
      )}`}
    >
      <div className="mb-1">
        {today ? (
          <span className="inline-flex size-7 items-center justify-center rounded border border-border bg-muted/35 text-sm font-medium text-foreground">
            {dayNum}
          </span>
        ) : (
          <span className="text-sm text-label">{dayNum}</span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {visibleEvents.map((event) => (
          <CalendarEventPill key={`${event.type}-${event.data.id}`} event={event} />
        ))}
        {hasOverflow && (
          <Popover open={overflowOpen} onOpenChange={setOverflowOpen}>
            <PopoverTrigger asChild>
              <Badge asChild variant="neutral" isFullWidth className="justify-center">
                <button type="button" onClick={(e) => e.stopPropagation()}>
                  +{overflowCount} more
                </button>
              </Badge>
            </PopoverTrigger>
            <PopoverContent className="w-48 bg-card" align="start">
              <div className="flex flex-col gap-1.5">
                {events.map((event) => (
                  <CalendarEventPill
                    key={`overflow-${event.type}-${event.data.id}`}
                    event={event}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
};
