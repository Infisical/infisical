import { IconName } from "../ui/Icon";
import { ApprovalRequest, RequestType } from "./types";

export const typeLabel: Record<RequestType, string> = {
  "pam-access": "PAM access",
  "secret-access": "Secret access",
  "cert-request": "Certificate",
  "cert-code-signing": "Code signing"
};

export const typeIcon: Record<RequestType, IconName> = {
  "pam-access": "terminal",
  "secret-access": "key",
  "cert-request": "cert",
  "cert-code-signing": "file"
};

export const ago = (from: number, now = Date.now()) => {
  const minutes = Math.max(0, Math.round((now - from) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
};

export const timeLeft = (until: number | undefined, now = Date.now()) => {
  if (until === undefined) return "No expiry";
  const minutes = Math.round((until - now) / 60000);
  if (minutes <= 0) return "Expired";
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60} min left`;
  return `${Math.round(hours / 24)} days left`;
};

export const summary = (request: ApprovalRequest) =>
  [request.access, request.duration ? `for ${request.duration}` : null].filter(Boolean).join(" ");

export const pastTense = (request: ApprovalRequest) => {
  if (request.status === "approved") return request.decision?.by === "You" ? "You approved" : `Approved by ${request.decision?.by}`;
  if (request.status === "rejected") return request.decision?.by === "You" ? "You denied" : `Denied by ${request.decision?.by}`;
  if (request.status === "expired") return "Expired with no decision";
  if (request.status === "cancelled") return "Cancelled by requester";
  if (!request.awaitingYou) return "Waiting on the next approval step";
  return "Waiting on you";
};
