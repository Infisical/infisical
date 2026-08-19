export type TAgentSession = {
  id: string;
  identityId: string;
  agentName: string;
  isAgentEnabled: boolean;
  userId: string;
  userEmail: string | null;
  username: string;
  firstName: string | null;
  lastName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type TRevokeAgentSessionDTO = {
  sessionId: string;
  projectId: string;
};
