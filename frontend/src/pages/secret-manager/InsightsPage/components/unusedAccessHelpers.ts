import { format } from "date-fns";
import { HardDriveIcon, UserIcon, UsersIcon } from "lucide-react";

import { UnusedAccessPrincipalType } from "@app/hooks/api/secretInsights";

export const PRINCIPAL_TYPE_CONFIG: Record<
  UnusedAccessPrincipalType,
  { icon: typeof UserIcon; label: string }
> = {
  [UnusedAccessPrincipalType.User]: { icon: UserIcon, label: "User" },
  [UnusedAccessPrincipalType.Identity]: { icon: HardDriveIcon, label: "Machine Identity" },
  [UnusedAccessPrincipalType.Group]: { icon: UsersIcon, label: "Group" }
};

// The period reads are judged on: the last 30 days once tracking has run that long, else since it began.
export const describeReadPeriod = (trackingStartedAt: string, fullWindowFrom: string) =>
  new Date(fullWindowFrom) > new Date()
    ? `since ${format(new Date(trackingStartedAt), "PP")}`
    : "in the last 30 days";

// The share of the secrets a principal can read that it has not read, as a whole percentage that only reads 0
// or 100 when it is exactly that.
export const unusedSharePercent = (unreadCount: number, entitledCount: number) => {
  if (unreadCount >= entitledCount) return 100;
  return Math.min(99, Math.max(1, Math.round((unreadCount / Math.max(1, entitledCount)) * 100)));
};

// Most of its access unread is the strongest sign a principal has access it does not need.
export const unusedShareTone = (percent: number) => {
  if (percent >= 75) return { text: "text-danger", bar: "bg-danger" };
  if (percent >= 25) return { text: "text-warning", bar: "bg-warning" };
  return { text: "text-success", bar: "bg-success" };
};

export const formatRemainingTtl = (seconds: number) => {
  if (seconds < 60) {
    const remainingSeconds = Math.max(1, seconds);
    return `${remainingSeconds} ${remainingSeconds === 1 ? "second" : "seconds"}`;
  }
  if (seconds < 60 * 60) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  const hours = Math.ceil(seconds / (60 * 60));
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
};
