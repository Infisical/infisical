import { useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { Detail, DetailGroup, DetailLabel, DetailValue } from "@infisical/cipher/ui/detail";
import { EventCalendar, type EventCalendarEvent } from "@infisical/cipher/ui/event-calendar";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Meta } from "@infisical/cipher/ui/text";
import { Link } from "@tanstack/react-router";
import { format, formatDistanceToNow } from "date-fns";

import type { TCalendarReminder, TCalendarRotation } from "@app/hooks/api/secretInsights/types";

import { useV4Adapter } from "../../data/adapters";
import { overviewLink } from "./insights.utils";

type CalendarItem =
  | { type: "rotation"; data: TCalendarRotation }
  | { type: "reminder"; data: TCalendarReminder };

const CATEGORIES = [
  { label: "Rotation", tone: "info" as const },
  { label: "Reminder", tone: "warn" as const }
];

const everyDays = (days: number) => `Every ${days} day${days === 1 ? "" : "s"}`;

const RotationStatus = ({ rotation }: { rotation: TCalendarRotation }) => {
  if (rotation.rotationStatus === "failed")
    return (
      <Badge tone="bad" icon="x">
        Rotation Failed
      </Badge>
    );
  if (!rotation.isAutoRotationEnabled) return <Badge tone="soft">Auto-Rotation Disabled</Badge>;
  if (!rotation.nextRotationAt) return <Badge tone="info">Active</Badge>;
  const days = (new Date(rotation.nextRotationAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return (
    <Badge tone={days >= 7 ? "info" : "warn"} icon="sync">
      {days < 0
        ? "Rotating"
        : `Rotates ${formatDistanceToNow(new Date(rotation.nextRotationAt), { addSuffix: true })}`}
    </Badge>
  );
};

const eventTitle = (item: CalendarItem) =>
  item.type === "rotation" ? item.data.name : item.data.secretKey;

const eventDate = (item: CalendarItem) => {
  if (item.type === "reminder") return format(new Date(item.data.nextReminderDate), "MMM d, yyyy");
  return item.data.nextRotationAt
    ? format(new Date(item.data.nextRotationAt), "MMM d, yyyy 'at' h:mm a")
    : "Not scheduled";
};

const RotationDetails = ({ rotation }: { rotation: TCalendarRotation }) => (
  <>
    <Detail>
      <DetailLabel>Interval</DetailLabel>
      <DetailValue>{everyDays(rotation.rotationInterval)}</DetailValue>
    </Detail>
    <Detail>
      <DetailLabel>Status</DetailLabel>
      <DetailValue>
        <RotationStatus rotation={rotation} />
      </DetailValue>
    </Detail>
    <Detail>
      <DetailLabel>Secret Keys</DetailLabel>
      <DetailValue>
        <Stack gap={4}>
          {rotation.secretKeys.map((key) => (
            <Meta key={key} mono>
              {key}
            </Meta>
          ))}
        </Stack>
      </DetailValue>
    </Detail>
  </>
);

const ReminderDetails = ({ reminder }: { reminder: TCalendarReminder }) => (
  <>
    {reminder.message && (
      <Detail>
        <DetailLabel>Message</DetailLabel>
        <DetailValue>{reminder.message}</DetailValue>
      </Detail>
    )}
    {reminder.repeatDays && (
      <Detail>
        <DetailLabel>Repeat</DetailLabel>
        <DetailValue>{everyDays(reminder.repeatDays)}</DetailValue>
      </Detail>
    )}
  </>
);

const EventSheet = ({
  orgId,
  projectId,
  item,
  onClose
}: {
  orgId: string;
  projectId: string;
  item: CalendarItem | null;
  onClose: () => void;
}) => {
  const isRotation = item?.type === "rotation";
  const title = item && eventTitle(item);

  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="sm">
        {item && (
          <>
            <SheetHeader>
              <SheetTitle>
                <Inline gap={8} align="center" wrap={false}>
                  <span>{title}</span>
                  <Badge tone={isRotation ? "info" : "warn"} icon={isRotation ? "sync" : "bell"}>
                    {isRotation ? "Rotation" : "Reminder"}
                  </Badge>
                </Inline>
              </SheetTitle>
            </SheetHeader>
            <SheetBody>
              <DetailGroup>
                <Detail>
                  <DetailLabel>Date</DetailLabel>
                  <DetailValue>{eventDate(item)}</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Environment</DetailLabel>
                  <DetailValue>{item.data.environment}</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Path</DetailLabel>
                  <DetailValue>
                    <Meta mono>{item.data.secretPath}</Meta>
                  </DetailValue>
                </Detail>
                {item.type === "rotation" ? (
                  <RotationDetails rotation={item.data} />
                ) : (
                  <ReminderDetails reminder={item.data} />
                )}
              </DetailGroup>
            </SheetBody>
            <SheetFooter>
              <Button asChild variant="primary" icon="external">
                <Link
                  {...overviewLink(orgId, projectId, {
                    secretPath: item.data.secretPath,
                    search: title ?? "",
                    environments: [item.data.environment],
                    filterBy: isRotation ? "rotation" : "secret"
                  })}
                >
                  View in Overview
                </Link>
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export const CalendarCard = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const { data, isPending } = useV4Adapter("secretInsights").useCalendar({
    projectId,
    month: month.getMonth() + 1,
    year: month.getFullYear()
  });

  const items = new Map<string, CalendarItem>();
  const events: EventCalendarEvent[] = [];
  (data?.rotations ?? []).forEach((rotation) => {
    if (!rotation.nextRotationAt) return;
    const id = `rotation-${rotation.id}`;
    items.set(id, { type: "rotation", data: rotation });
    events.push({
      id,
      date: new Date(rotation.nextRotationAt),
      label: rotation.name,
      tone: "info",
      category: "Rotation"
    });
  });
  (data?.reminders ?? []).forEach((reminder) => {
    const id = `reminder-${reminder.id}`;
    items.set(id, { type: "reminder", data: reminder });
    events.push({
      id,
      date: new Date(reminder.nextReminderDate),
      label: reminder.secretKey,
      tone: "warn",
      category: "Reminder"
    });
  });

  return (
    <Card title="Rotation & Reminder Calendar">
      <EventCalendar
        aria-label="Rotations and reminders"
        events={events}
        month={month}
        onMonthChange={setMonth}
        categories={CATEGORIES}
        loading={isPending}
        onEventSelect={(event) => setSelected(items.get(event.id) ?? null)}
      />
      <EventSheet
        orgId={orgId}
        projectId={projectId}
        item={selected}
        onClose={() => setSelected(null)}
      />
    </Card>
  );
};
