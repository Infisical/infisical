import type { IconName } from "@infisical/cipher/ui/icon";
import ms from "ms";

import {
  PamAccessGrantStatus,
  PamAccessRequestStatus,
  type TPamAccessRequest
} from "@app/hooks/api/pam";

type Tone = "warn" | "ok" | "bad" | "neutral";
type Status = { label: string; tone: Tone; icon: IconName };

const STATUS: Record<string, Status> = {
  [PamAccessRequestStatus.Pending]: { label: "Pending review", tone: "warn", icon: "clock" },
  [PamAccessRequestStatus.Approved]: { label: "Approved", tone: "ok", icon: "check-c" },
  [PamAccessRequestStatus.Rejected]: { label: "Rejected", tone: "bad", icon: "x" },
  [PamAccessRequestStatus.Expired]: { label: "Expired", tone: "neutral", icon: "clock" },
  [PamAccessRequestStatus.Cancelled]: { label: "Cancelled", tone: "neutral", icon: "minus" },
  [PamAccessGrantStatus.Revoked]: { label: "Revoked", tone: "bad", icon: "lock" }
};

const grantExpired = (request: TPamAccessRequest) =>
  Boolean(request.grantExpiresAt) && new Date(request.grantExpiresAt!).getTime() <= Date.now();

// The request stays "approved" after approval; the grant carries the post-approval state.
export const requestStatus = (request: TPamAccessRequest): Status => {
  if (request.status === PamAccessRequestStatus.Approved) {
    if (request.grantStatus === PamAccessGrantStatus.Revoked)
      return STATUS[PamAccessGrantStatus.Revoked];
    if (grantExpired(request)) return STATUS[PamAccessRequestStatus.Expired];
    if (request.autoApprovedAt) return { label: "Auto-approved", tone: "ok", icon: "check-c" };
  }
  return STATUS[request.status] ?? STATUS[PamAccessRequestStatus.Pending];
};

export const isGrantActive = (request: TPamAccessRequest) =>
  request.status === PamAccessRequestStatus.Approved &&
  request.grantStatus !== PamAccessGrantStatus.Revoked &&
  !grantExpired(request);

// machineIdentityId is set null when the identity is deleted, leaving neither actor nor email.
export const isMachineIdentityRequest = (request: TPamAccessRequest) =>
  Boolean(request.machineIdentityId) || (!request.requesterId && !request.requesterEmail);

export const requesterSubtitle = (request: TPamAccessRequest) =>
  isMachineIdentityRequest(request) ? "Machine identity" : request.requesterEmail;

export const formatDuration = (duration?: string) => {
  if (!duration) return "Not set";
  const parsed = ms(duration);
  return typeof parsed === "number" ? ms(parsed, { long: true }) : duration;
};

export const formatRequestDate = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
