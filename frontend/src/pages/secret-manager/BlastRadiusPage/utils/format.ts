import { formatDistanceToNowStrict, parseISO } from "date-fns";

import {
  DestinationStatus,
  ExposureBand,
  ReadPrecision,
  SecretActionName,
  TObservedActivity
} from "@app/hooks/api/blastRadius";

export const EXPOSURE_BAND_LABEL: Record<ExposureBand, string> = {
  [ExposureBand.Low]: "Low",
  [ExposureBand.Elevated]: "Elevated",
  [ExposureBand.High]: "High",
  [ExposureBand.Critical]: "Critical",
  [ExposureBand.Unavailable]: "Unavailable"
};

export const EXPOSURE_BAND_VARIANT: Record<
  ExposureBand,
  "success" | "info" | "warning" | "danger" | "neutral"
> = {
  [ExposureBand.Low]: "success",
  [ExposureBand.Elevated]: "info",
  [ExposureBand.High]: "warning",
  [ExposureBand.Critical]: "danger",
  [ExposureBand.Unavailable]: "neutral"
};

export const SECRET_ACTION_LABEL: Record<string, string> = {
  [SecretActionName.ReadValue]: "Read Value",
  [SecretActionName.DescribeAndReadValue]: "Read Value",
  [SecretActionName.DescribeSecret]: "Describe Only",
  [SecretActionName.Create]: "Create",
  [SecretActionName.Edit]: "Edit",
  [SecretActionName.Delete]: "Delete"
};

export const CLIENT_LABEL: Record<string, string> = {
  web: "web",
  cli: "cli",
  "k8-operator": "k8s",
  terraform: "terraform",
  InfisicalNodeSDK: "sdk",
  InfisicalPythonSDK: "sdk",
  other: "other"
};

export const DESTINATION_STATUS_VARIANT: Record<
  DestinationStatus,
  "success" | "warning" | "danger" | "neutral"
> = {
  [DestinationStatus.Healthy]: "success",
  [DestinationStatus.Stale]: "warning",
  [DestinationStatus.Failed]: "danger",
  [DestinationStatus.Unknown]: "neutral"
};

export const DESTINATION_STATUS_LABEL: Record<DestinationStatus, string> = {
  [DestinationStatus.Healthy]: "Synced",
  [DestinationStatus.Stale]: "Stale",
  [DestinationStatus.Failed]: "Failed",
  [DestinationStatus.Unknown]: "Unknown"
};

/** The strongest permission a principal holds, since that is what the node headline reports. */
export const strongestActionLabel = (actions: string[]) => {
  if (
    actions.includes(SecretActionName.ReadValue) ||
    actions.includes(SecretActionName.DescribeAndReadValue)
  )
    return SECRET_ACTION_LABEL[SecretActionName.ReadValue];
  if (actions.includes(SecretActionName.DescribeSecret))
    return SECRET_ACTION_LABEL[SecretActionName.DescribeSecret];
  return actions.length ? (SECRET_ACTION_LABEL[actions[0]] ?? actions[0]) : "No Access";
};

export const relativeTime = (iso: string) =>
  formatDistanceToNowStrict(parseISO(iso), { addSuffix: true });

/**
 * Folder-precision counts are approximate: a bulk read records the folder it covered, never the key it
 * returned. The leading tilde is the whole disclosure, so it must not be dropped.
 */
export const formatReadCount = (readCount: number, precision: ReadPrecision | null) =>
  `${precision === ReadPrecision.Folder ? "~" : ""}${readCount.toLocaleString()}`;

export const PRECISION_LABEL: Record<ReadPrecision, string> = {
  [ReadPrecision.Secret]: "this secret",
  [ReadPrecision.Folder]: "folder-level"
};

/**
 * The activity line under a principal's name. Three states have to stay distinguishable: read in the
 * window, no reads in the window but read before it, and no record at all.
 */
export const describeObserved = (
  observed: TObservedActivity | null,
  windowDays: number,
  consumptionAvailable: boolean
) => {
  if (!consumptionAvailable) return "activity hidden";
  if (!observed) return `No reads in ${windowDays}d`;

  if (observed.readCount > 0) {
    const count = formatReadCount(observed.readCount, observed.precision);
    return `${count} ${observed.readCount === 1 ? "read" : "reads"}${observed.lastReadAt ? ` · ${relativeTime(observed.lastReadAt)}` : ""}`;
  }

  if (observed.lastReadOutsideWindow && observed.lastReadAt) {
    return `last read ${relativeTime(observed.lastReadAt)}, outside the window`;
  }

  return `No reads in ${windowDays}d`;
};
