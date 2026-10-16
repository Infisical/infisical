import { addDays, differenceInCalendarDays, format } from "date-fns";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { SecretReadStatus } from "@app/hooks/api/secrets/types";

const SECRET_READ_WINDOW_DAYS = 30;

type Props = {
  status: SecretReadStatus;
  lastReadAt?: string | null;
  trackedSince?: string;
};

// Only a reader's first read of the day is recorded, so the time of day would understate later reads.
const formatReadDay = (lastReadAt: string) => {
  const days = differenceInCalendarDays(new Date(), new Date(lastReadAt));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
};

export const SecretReadStatusBadge = ({ status, lastReadAt, trackedSince }: Props) => {
  if (status === SecretReadStatus.Read && lastReadAt) {
    return <span>{formatReadDay(lastReadAt)}</span>;
  }
  if (status === SecretReadStatus.Tracking && trackedSince) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="neutral">Tracking</Badge>
        </TooltipTrigger>
        <TooltipContent>
          Not read since {format(new Date(trackedSince), "PP")}, when this secret or access was
          created or last changed. Shown as unused if still unread on{" "}
          {format(addDays(new Date(trackedSince), SECRET_READ_WINDOW_DAYS), "PP")}.
        </TooltipContent>
      </Tooltip>
    );
  }
  return <Badge variant="danger">No reads</Badge>;
};
