import { useState } from "react";
import { addMonths, format, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Lottie } from "@app/components/v2";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  IconButton
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
    <Card>
      <CardHeader>
        <CardTitle>Rotation & Reminder Calendar</CardTitle>
        <CardDescription>View upcoming secret rotations and reminders</CardDescription>
        <CardAction>
          <div className="ml-4 flex items-center gap-1">
            <IconButton
              variant="ghost"
              size="xs"
              onClick={() => setCurrentMonth((prev) => subMonths(prev, 1))}
            >
              <ChevronLeft className="size-4" />
            </IconButton>
            <span className="min-w-[140px] text-center text-sm font-medium">
              {format(currentMonth, "MMMM yyyy")}
            </span>
            <IconButton
              variant="ghost"
              size="xs"
              onClick={() => setCurrentMonth((prev) => addMonths(prev, 1))}
            >
              <ChevronRight className="size-4" />
            </IconButton>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
};
