import { differenceInCalendarDays, format } from "date-fns";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

// What a reader's row says about their reads. A reader with no read is "unused access" only once the secret
// and their access have both existed for the whole judged period; before that it is too early to say.
export type TReaderReadStatus =
  | { kind: "read"; lastReadAt: string }
  | { kind: "unread"; since: string }
  | { kind: "pending"; reason: string };

type Props = {
  status: TReaderReadStatus;
};

// Only a reader's first read of the day is recorded, so the time of day would understate later reads.
export const formatReadDay = (lastReadAt: string) => {
  const days = differenceInCalendarDays(new Date(), new Date(lastReadAt));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
};

export const SecretReadStatusBadge = ({ status }: Props) => {
  if (status.kind === "read") {
    return <span>{formatReadDay(status.lastReadAt)}</span>;
  }
  if (status.kind === "unread") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="warning">No Reads</Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-72">
          No reads since {format(new Date(status.since), "PP")}
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="neutral">No Reads Yet</Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{status.reason}</TooltipContent>
    </Tooltip>
  );
};
