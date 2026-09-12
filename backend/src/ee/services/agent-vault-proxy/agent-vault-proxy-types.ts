import { TAgentVaultActorContext } from "../agent-vault/agent-vault-actor-types";
import { AgentVaultTrafficPolicy } from "../agent-vault/agent-vault-enums";

export type TAgentVaultProxyScoped = { projectId: string; ctx: TAgentVaultActorContext };

export type TAgentVaultProxyConfig = {
  trafficPolicy: AgentVaultTrafficPolicy;
  allowedHosts: string | null;
  pollInterval: number;
};

export type TListProxiesDTO = TAgentVaultProxyScoped;

export type TCreateProxyDTO = TAgentVaultProxyScoped & {
  name: string;
  trafficPolicy?: AgentVaultTrafficPolicy;
  allowedHosts?: string | null;
  pollInterval?: number;
};

export type TUpdateProxyDTO = TAgentVaultProxyScoped & {
  proxyId: string;
  name?: string;
  trafficPolicy?: AgentVaultTrafficPolicy;
  allowedHosts?: string | null;
  pollInterval?: number;
};

export type TProxyByIdDTO = TAgentVaultProxyScoped & { proxyId: string };

export type TEnrollProxyDTO = {
  enrollmentToken: string;
  rootCaCertificate: string;
};

export type THeartbeatDTO = {
  proxyId: string;
};

export type TResolveSessionDTO = {
  proxyId: string;
  orgId: string;
  sessionToken: string;
};

export type TResolvedService = {
  id: string;
  name: string;
  accessBundleName: string;
  hostPattern: string;
  credential:
    | { type: "bearer"; headerName: string; headerPrefix: string; value: string }
    | { type: "basic"; username: string; password: string }
    | { type: "passthrough" };
};
