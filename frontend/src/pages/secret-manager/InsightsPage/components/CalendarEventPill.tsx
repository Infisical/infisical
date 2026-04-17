import { useState } from "react";
import { BellIcon, RefreshCwIcon } from "lucide-react";

import { Badge } from "@app/components/v3/generic/Badge";
import { Popover, PopoverContent, PopoverTrigger } from "@app/components/v3/generic/Popover";

import { CalendarEventDetail } from "./CalendarEventDetail";
import { CalendarEvent } from "./types";

export const CalendarEventPill = ({ event }: { event: CalendarEvent }) => {
  const [open, setOpen] = useState(false);
  const label = event.type === "rotation" ? event.data.name : event.data.secretKey;
  const isRotation = event.type === "rotation";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Badge
          asChild
          className="justify-start"
          variant={isRotation ? "info" : "warning"}
          isFullWidth
          isTruncatable
        >
          <button type="button" onClick={(e) => e.stopPropagation()} title={label}>
            {isRotation ? <RefreshCwIcon /> : <BellIcon />}
            <span>{label}</span>
          </button>
        </Badge>
      </PopoverTrigger>
      <PopoverContent side="left" className="w-80 bg-card" align="start">
        <CalendarEventDetail event={event} />
      </PopoverContent>
    </Popover>
  );
};
