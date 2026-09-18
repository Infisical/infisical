import { PamSessionStatus } from "@app/hooks/api/pam";
import { TPamSession } from "@app/hooks/api/pam/types";

export const STATUS_BADGE: Record<PamSessionStatus, { variant: "success" | "neutral" | "danger" }> =
  {
    [PamSessionStatus.Starting]: { variant: "neutral" },
    [PamSessionStatus.Active]: { variant: "success" },
    [PamSessionStatus.Ended]: { variant: "neutral" },
    [PamSessionStatus.Terminated]: { variant: "danger" }
  };

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const formatCompactDuration = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

const getSessionEnd = (session: TPamSession) => {
  if (session.status === PamSessionStatus.Active) return new Date();
  return session.endedAt ? new Date(session.endedAt) : new Date();
};

export const formatDuration = (session: TPamSession) => {
  const start = session.startedAt ? new Date(session.startedAt) : null;
  if (!start) return "—";
  return formatCompactDuration(getSessionEnd(session).getTime() - start.getTime());
};
