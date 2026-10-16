import { differenceInCalendarDays } from "date-fns";

import { Badge } from "@app/components/v3";
import { SecretReadStatus } from "@app/hooks/api/secrets/types";

type Props = {
  status: SecretReadStatus;
  lastReadAt?: string | null;
};

// Only a reader's first read of the day is recorded, so the time of day would understate later reads.
const formatReadDay = (lastReadAt: string) => {
  const days = differenceInCalendarDays(new Date(), new Date(lastReadAt));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
};

export const SecretReadStatusBadge = ({ status, lastReadAt }: Props) => {
  if (status === SecretReadStatus.Read && lastReadAt) {
    return <span>{formatReadDay(lastReadAt)}</span>;
  }
  return <Badge variant="danger">No reads</Badge>;
};
