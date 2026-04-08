import { Link, useParams } from "@tanstack/react-router";
import { format, formatDistanceToNow } from "date-fns";
import { BanIcon, BellIcon, ExternalLink, RefreshCwIcon, XIcon } from "lucide-react";

import {
  Badge,
  Button,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  UnstableSeparator
} from "@app/components/v3";

import { CalendarEvent } from "./types";

const RotationStatusBadge = ({
  status,
  nextRotationAt,
  isAutoRotationEnabled
}: {
  status: string | null;
  nextRotationAt: string | null;
  isAutoRotationEnabled: boolean;
}) => {
  if (status === "failed") {
    return (
      <Badge variant="danger">
        <XIcon />
        Rotation Failed
      </Badge>
    );
  }

  if (!isAutoRotationEnabled) {
    return (
      <Badge variant="neutral">
        <BanIcon />
        Auto-Rotation Disabled
      </Badge>
    );
  }

  if (!nextRotationAt) {
    return <Badge variant="info">Active</Badge>;
  }

  const daysToRotation = (new Date(nextRotationAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);

  return (
    <Badge variant={daysToRotation >= 7 ? "info" : "warning"} className="capitalize">
      <RefreshCwIcon />
      {daysToRotation < 0
        ? "Rotating"
        : `Rotates ${formatDistanceToNow(new Date(nextRotationAt), { addSuffix: true })}`}
    </Badge>
  );
};

const getDateString = (event: CalendarEvent): string => {
  if (event.type === "rotation") {
    if (!event.data.nextRotationAt) return "N/A";
    return format(new Date(event.data.nextRotationAt), "MMM d, yyyy 'at' h:mm a");
  }
  return format(new Date(event.data.nextReminderDate), "MMM d, yyyy");
};

export const CalendarEventDetail = ({ event }: { event: CalendarEvent }) => {
  const { orgId, projectId } = useParams({
    strict: false,
    select: (p) => ({
      orgId: (p as Record<string, string>).orgId,
      projectId: (p as Record<string, string>).projectId
    })
  });

  const isRotation = event.type === "rotation";
  const title = isRotation ? event.data.name : event.data.secretKey;
  const dateStr = getDateString(event);
  const { environment, secretPath } = event.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="truncate text-sm font-semibold">{title}</h3>
        <Badge variant={isRotation ? "info" : "warning"}>
          {isRotation ? <RefreshCwIcon /> : <BellIcon />}
          {isRotation ? "Rotation" : "Reminder"}
        </Badge>
      </div>
      <UnstableSeparator />
      <DetailGroup>
        <Detail>
          <DetailLabel>Date</DetailLabel>
          <DetailValue>{dateStr}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Environment</DetailLabel>
          <DetailValue>{environment}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Path</DetailLabel>
          <DetailValue>{secretPath}</DetailValue>
        </Detail>

        {isRotation && (
          <>
            <Detail>
              <DetailLabel>Interval</DetailLabel>
              <DetailValue>
                Every {event.data.rotationInterval} day
                {event.data.rotationInterval !== 1 ? "s" : ""}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Status</DetailLabel>
              <DetailValue>
                <RotationStatusBadge
                  status={event.data.rotationStatus}
                  nextRotationAt={event.data.nextRotationAt}
                  isAutoRotationEnabled={event.data.isAutoRotationEnabled}
                />
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Secret Keys</DetailLabel>
              <DetailValue>{event.data.secretKeys.map((key) => <p>{key}</p>) || "—"}</DetailValue>
            </Detail>
          </>
        )}

        {!isRotation && (
          <>
            {event.data.message && (
              <Detail>
                <DetailLabel>Message</DetailLabel>
                <DetailValue>{event.data.message}</DetailValue>
              </Detail>
            )}
            {event.data.repeatDays && (
              <Detail>
                <DetailLabel>Repeat</DetailLabel>
                <DetailValue>
                  Every {event.data.repeatDays} day
                  {event.data.repeatDays !== 1 ? "s" : ""}
                </DetailValue>
              </Detail>
            )}
          </>
        )}
      </DetailGroup>

      <Button asChild variant="project" size="sm" isFullWidth>
        <Link
          to="/organizations/$orgId/projects/secret-management/$projectId/overview"
          params={{ orgId: orgId!, projectId: projectId! }}
          search={{
            secretPath,
            search: title,
            environments: [environment],
            filterBy: isRotation ? "rotation" : "secret"
          }}
        >
          <ExternalLink />
          View in Overview
        </Link>
      </Button>
    </div>
  );
};
