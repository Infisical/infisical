import { TObservabilityScope, ObservabilityItemStatus, TResolverResult } from "../observability-widget-types";

export const DEFAULT_EXPIRATION_THRESHOLD_DAYS = 7;
export const DEFAULT_INACTIVITY_THRESHOLD_DAYS = 30;
export const DEFAULT_HEARTBEAT_THRESHOLD_MINUTES = 5;

export const createEmptyResult = (): TResolverResult => ({
  items: [],
  totalCount: 0,
  summary: {
    failedCount: 0,
    pendingCount: 0,
    activeCount: 0
  }
});

export const buildScope = (params: {
  type: "org" | "sub-org" | "project";
  projectName?: string | null;
  orgName?: string | null;
  subOrgName?: string | null;
}): TObservabilityScope => {
  const { type, projectName, orgName, subOrgName } = params;

  let displayName: string;
  let fullPath: string;

  if (type === "project" && projectName) {
    displayName = `project - ${projectName}`;
    fullPath = [orgName, subOrgName, projectName].filter(Boolean).join(" > ");
  } else if (type === "sub-org" && subOrgName) {
    displayName = `sub-org - ${subOrgName}`;
    fullPath = [orgName, subOrgName].filter(Boolean).join(" > ");
  } else {
    displayName = `org - ${orgName || "Unknown"}`;
    fullPath = orgName || "Unknown";
  }

  return { type, displayName, fullPath };
};

export const formatTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  return "just now";
};

export const formatExpiresIn = (date: Date): string => {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();

  if (diffMs <= 0) return "Expired";

  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) return `Expires in ${diffDays} day${diffDays > 1 ? "s" : ""}`;
  if (diffHours > 0) return `Expires in ${diffHours} hour${diffHours > 1 ? "s" : ""}`;
  return `Expires in ${diffMins} minute${diffMins > 1 ? "s" : ""}`;
};

export const formatExpiresAt = (date: Date): string => {
  return `Expires on ${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  })} at ${date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  })}`;
};

export const getThresholdDate = (days: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

export const getHeartbeatThresholdDate = (minutes: number): Date => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - minutes);
  return date;
};

export const computeSummary = (
  items: Array<{ status: ObservabilityItemStatus }>
): TResolverResult["summary"] => {
  return items.reduce(
    (acc, item) => {
      if (item.status === ObservabilityItemStatus.Failed) acc.failedCount += 1;
      else if (item.status === ObservabilityItemStatus.Pending) acc.pendingCount += 1;
      else acc.activeCount += 1;
      return acc;
    },
    { failedCount: 0, pendingCount: 0, activeCount: 0 }
  );
};
