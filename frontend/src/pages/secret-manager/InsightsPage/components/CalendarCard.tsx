import { useState } from "react";
import { addMonths, format, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Lottie } from "@app/components/v2";
import {
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableIconButton
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useGetCalendarInsights } from "@app/hooks/api";

import { CalendarGrid } from "./CalendarGrid";
import { CalendarLegend } from "./CalendarLegend";

export const CalendarCard = () => {
  const { projectId } = useProject();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const month = currentMonth.getMonth() + 1;
  const year = currentMonth.getFullYear();

  const { data, isPending } = useGetCalendarInsights(
    { projectId, month, year },
    { enabled: !!projectId }
  );

  return (
    <UnstableCard>
      <UnstableCardHeader>
        <UnstableCardTitle>Rotation & Reminder Calendar</UnstableCardTitle>
        <UnstableCardDescription>
          View upcoming secret rotations and reminders
        </UnstableCardDescription>
        <UnstableCardAction>
          <div className="ml-4 flex items-center gap-1">
            <UnstableIconButton
              variant="ghost"
              size="xs"
              onClick={() => setCurrentMonth((prev) => subMonths(prev, 1))}
            >
              <ChevronLeft className="size-4" />
            </UnstableIconButton>
            <span className="min-w-[140px] text-center text-sm font-medium">
              {format(currentMonth, "MMMM yyyy")}
            </span>
            <UnstableIconButton
              variant="ghost"
              size="xs"
              onClick={() => setCurrentMonth((prev) => addMonths(prev, 1))}
            >
              <ChevronRight className="size-4" />
            </UnstableIconButton>
          </div>
        </UnstableCardAction>
      </UnstableCardHeader>
      <UnstableCardContent>
        <div className="relative">
          <CalendarGrid
            currentMonth={currentMonth}
            rotations={data?.rotations ?? []}
            reminders={data?.reminders ?? []}
          />
          {isPending && (
            <div className="absolute inset-0 flex items-center justify-center bg-container/40">
              <Lottie icon="infisical_loading_white" isAutoPlay className="w-16" />
            </div>
          )}
        </div>
        <CalendarLegend />
      </UnstableCardContent>
    </UnstableCard>
  );
};
