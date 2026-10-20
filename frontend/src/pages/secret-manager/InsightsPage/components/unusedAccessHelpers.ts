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

// The period the reads are judged on: the full window once tracking is that old, else since it began.
export const describeReadPeriod = (trackingStartedAt: string, preliminaryUntil: string) =>
  new Date(preliminaryUntil) > new Date()
    ? `since ${format(new Date(trackingStartedAt), "PP")}`
    : "in the last 30 days";

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
