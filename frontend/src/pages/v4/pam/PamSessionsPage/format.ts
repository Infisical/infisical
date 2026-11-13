import { PamSessionStatus, type TPamSession } from "@app/hooks/api/pam";

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

export const sessionDuration = (session: TPamSession, now: number) => {
  if (!session.startedAt) return undefined;
  const end =
    session.status === PamSessionStatus.Active || !session.endedAt
      ? now
      : new Date(session.endedAt).getTime();
  return formatElapsed(end - new Date(session.startedAt).getTime());
};

// identityId is set null when the identity is deleted, leaving neither actor id nor email.
export const isMachineSession = (session: TPamSession) =>
  Boolean(session.identityId) || (!session.userId && !session.actorEmail);
