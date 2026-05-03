import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths
} from "date-fns";
import { ChevronLeft, ChevronRight, ExternalLink, RefreshCwIcon } from "lucide-react";

import { Lottie } from "@app/components/v2";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { PamResourceType } from "@app/hooks/api/pam/enums";
import { PAM_RESOURCE_TYPE_MAP } from "@app/hooks/api/pam/maps";
import { TPamRotationCalendarEvent, useGetPamRotationCalendar } from "@app/hooks/api/pamInsights";

const knownResourceTypes = Object.values(PamResourceType) as string[];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const accountRoute =
  "/organizations/$orgId/projects/pam/$projectId/resources/$resourceType/$resourceId/accounts/$accountId" as const;

const formatInterval = (seconds: number): string => {
  const days = Math.round(seconds / 86400);
  if (days <= 0) {
    const hours = Math.max(1, Math.round(seconds / 3600));
    return `every ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `every ${days} day${days === 1 ? "" : "s"}`;
};

const groupEventsByDate = (
  events: TPamRotationCalendarEvent[]
): Record<string, TPamRotationCalendarEvent[]> => {
  const map: Record<string, TPamRotationCalendarEvent[]> = {};
  events.forEach((event) => {
    const key = format(parseISO(event.nextRotationAt), "yyyy-MM-dd");
    if (!map[key]) map[key] = [];
    map[key].push(event);
  });
  return map;
};

const RotationEventDetail = ({ event }: { event: TPamRotationCalendarEvent }) => {
  const { currentOrg } = useOrganization();
  const { projectId } = useProject();
  const navigate = useNavigate();
  const meta = knownResourceTypes.includes(event.resourceType)
    ? PAM_RESOURCE_TYPE_MAP[event.resourceType as PamResourceType]
    : null;
  const dateStr = format(parseISO(event.nextRotationAt), "MMM d, yyyy 'at' h:mm a");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold" title={event.accountName}>
          {event.accountName}
        </h3>
        <Badge variant="info">
          <RefreshCwIcon />
          Rotation
        </Badge>
      </div>
      <Separator />
      <DetailGroup>
        <Detail>
          <DetailLabel>Date</DetailLabel>
          <DetailValue>{dateStr}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Resource</DetailLabel>
          <DetailValue>
            <div className="flex items-center gap-1.5">
              {meta?.image && (
                <img
                  src={`/images/integrations/${meta.image}`}
                  alt={meta.name}
                  className="size-3.5 shrink-0 object-contain"
                />
              )}
              <span className="truncate">{event.resourceName}</span>
            </div>
          </DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Type</DetailLabel>
          <DetailValue>{meta?.name ?? event.resourceType}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Interval</DetailLabel>
          <DetailValue>{formatInterval(event.intervalSeconds)}</DetailValue>
        </Detail>
      </DetailGroup>

      <Button
        variant="project"
        size="sm"
        isFullWidth
        onClick={() =>
          navigate({
            to: accountRoute,
            params: {
              orgId: currentOrg.id,
              projectId,
              resourceType: event.resourceType,
              resourceId: event.resourceId,
              accountId: event.accountId
            }
          })
        }
      >
        <ExternalLink />
        View Account
      </Button>
    </div>
  );
};

const RotationEventPill = ({ event }: { event: TPamRotationCalendarEvent }) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Badge asChild className="justify-start" variant="info" isFullWidth isTruncatable>
          <button type="button" onClick={(e) => e.stopPropagation()} title={event.accountName}>
            <RefreshCwIcon />
            <span>{event.accountName}</span>
          </button>
        </Badge>
      </PopoverTrigger>
      <PopoverContent side="left" className="w-80 bg-card" align="start">
        <RotationEventDetail event={event} />
      </PopoverContent>
    </Popover>
  );
};

const MAX_SLOTS = 2;

const getBgClass = (today: boolean, isCurrentMonth: boolean) => {
  if (today) return isCurrentMonth ? "bg-muted/5" : "bg-card/50";
  return isCurrentMonth ? "bg-container" : "bg-card";
};

const RotationDayCell = ({
  date,
  isCurrentMonth,
  events
}: {
  date: Date;
  isCurrentMonth: boolean;
  events: TPamRotationCalendarEvent[];
}) => {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const today = isToday(date);
  const dayNum = date.getDate();
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
          <RotationEventPill key={event.id} event={event} />
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
            <PopoverContent className="w-56 bg-card" align="start">
              <div className="flex flex-col gap-1.5">
                {events.map((event) => (
                  <RotationEventPill key={`overflow-${event.id}`} event={event} />
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
};

const RotationLegend = () => (
  <div className="float-right mt-3 -mb-2 flex items-center gap-4">
    <div className="flex items-center gap-1.5">
      <span className="size-2 rounded-full bg-info" />
      <span className="text-xs text-muted">Rotation</span>
    </div>
  </div>
);

export const PamRotationCalendar = () => {
  const { projectId } = useProject();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const month = currentMonth.getMonth() + 1;
  const year = currentMonth.getFullYear();

  const { data, isPending } = useGetPamRotationCalendar(
    { projectId, month, year },
    { enabled: !!projectId }
  );

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [currentMonth]);

  const eventsByDate = useMemo(() => groupEventsByDate(data?.rotations ?? []), [data]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Rotation Calendar</CardTitle>
        <CardDescription>Account credentials due to rotate this month</CardDescription>
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
          <div className="overflow-hidden rounded-lg border border-border bg-container">
            <div className="grid grid-cols-7">
              {DAY_NAMES.map((day) => (
                <div
                  key={day}
                  className="border-b border-border py-2 text-center text-sm font-medium"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const dateKey = format(day, "yyyy-MM-dd");
                return (
                  <RotationDayCell
                    key={dateKey}
                    date={day}
                    isCurrentMonth={isSameMonth(day, currentMonth)}
                    events={eventsByDate[dateKey] ?? []}
                  />
                );
              })}
            </div>
          </div>
          {isPending && (
            <div className="absolute inset-0 flex items-center justify-center bg-container/40">
              <Lottie icon="infisical_loading_white" isAutoPlay className="w-16" />
            </div>
          )}
        </div>
        <RotationLegend />
      </CardContent>
    </Card>
  );
};
