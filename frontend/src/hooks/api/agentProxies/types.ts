export type TAgentProxy = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  heartbeat: string | null;
  allowedHosts: string[] | null;
  canRevoke: boolean;
};

export type TCreateAgentProxyDTO = {
  name: string;
  allowedHosts?: string[];
};

export type TUpdateAgentProxyDTO = {
  agentProxyId: string;
  name?: string;
  allowedHosts?: string[];
};

export type TAgentProxyEnrollmentToken = {
  token: string;
  expiresAt: string;
};
