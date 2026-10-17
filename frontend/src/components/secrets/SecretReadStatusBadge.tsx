import { differenceInCalendarDays } from "date-fns";

import { Badge } from "@app/components/v3";

type Props = {
  lastReadAt?: string;
};

// Only a reader's first read of the day is recorded, so the time of day would understate later reads.
const formatReadDay = (lastReadAt: string) => {
  const days = differenceInCalendarDays(new Date(), new Date(lastReadAt));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
};

export const SecretReadStatusBadge = ({ lastReadAt }: Props) => {
  if (lastReadAt) {
    return <span>{formatReadDay(lastReadAt)}</span>;
  }
  return <Badge variant="warning">No Reads</Badge>;
};
