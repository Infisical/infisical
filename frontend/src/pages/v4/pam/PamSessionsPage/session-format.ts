import { PamSessionStatus, type TPamSession } from "@app/hooks/api/pam";

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

export const formatDuration = (session: TPamSession, now: number) => {
  if (!session.startedAt) return undefined;
  const end =
    session.status === PamSessionStatus.Active || !session.endedAt
      ? now
      : new Date(session.endedAt).getTime();
  return formatCompactDuration(end - new Date(session.startedAt).getTime());
};

export const isMachineSession = (session: TPamSession) =>
  Boolean(session.identityId) || (!session.userId && !session.actorEmail);
