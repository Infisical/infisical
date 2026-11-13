import type { IconName } from "@infisical/cipher/ui/icon";

import { PamSessionStatus, type TPamSession } from "@app/hooks/api/pam";

type Status = { label: string; tone: "neutral" | "ok" | "bad"; icon: IconName };

export const SESSION_STATUS: Record<PamSessionStatus, Status> = {
  [PamSessionStatus.Starting]: { label: "Starting", tone: "neutral", icon: "clock" },
  [PamSessionStatus.Active]: { label: "Active", tone: "ok", icon: "monitor" },
  [PamSessionStatus.Ended]: { label: "Ended", tone: "neutral", icon: "check" },
  [PamSessionStatus.Terminated]: { label: "Terminated", tone: "bad", icon: "x" }
};

export const isLive = (session: TPamSession) =>
  session.status === PamSessionStatus.Active || session.status === PamSessionStatus.Starting;

// identityId is set null when the identity is deleted, leaving neither actor nor email.
export const actorSubtitle = (session: TPamSession) =>
  session.identityId || (!session.userId && !session.actorEmail)
    ? "Machine identity"
    : session.actorEmail;

export const formatElapsed = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

export const formatStarted = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
