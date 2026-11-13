import type { IconName } from "@infisical/cipher/ui/icon";

import { PamSessionStatus } from "@app/hooks/api/pam";
import type { TPamSession } from "@app/hooks/api/pam/types";

type Status = { label: string; tone: "neutral" | "ok" | "warn" | "bad"; icon: IconName };

export const SESSION_STATUS: Record<PamSessionStatus, Status> = {
  [PamSessionStatus.Starting]: { label: "Starting", tone: "neutral", icon: "clock" },
  [PamSessionStatus.Active]: { label: "Active", tone: "ok", icon: "monitor" },
  [PamSessionStatus.Ended]: { label: "Ended", tone: "neutral", icon: "check" },
  [PamSessionStatus.Terminated]: { label: "Terminated", tone: "bad", icon: "x" }
};

// identityId is set null when the identity is deleted, leaving neither actor id nor an email.
export const isMachineSession = (session: TPamSession) =>
  Boolean(session.identityId) || (!session.userId && !session.actorEmail);

export const formatSessionDate = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

export const formatSessionDuration = (session: TPamSession, now: number) => {
  if (!session.startedAt) return undefined;
  const end =
    session.status !== PamSessionStatus.Active && session.endedAt
      ? new Date(session.endedAt).getTime()
      : now;
  const seconds = Math.max(0, Math.floor((end - new Date(session.startedAt).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
};
