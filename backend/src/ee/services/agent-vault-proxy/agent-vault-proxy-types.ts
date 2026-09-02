import { TAgentVaultActorContext } from "../agent-vault/agent-vault-actor-types";
import { AgentVaultUnmatchedHost } from "../agent-vault/agent-vault-enums";

export type TAgentVaultProxyScoped = { projectId: string; ctx: TAgentVaultActorContext };

/** The settings block the server owns and hands back on every heartbeat. */
export type TAgentVaultProxyConfig = {
  unmatchedHost: AgentVaultUnmatchedHost;
  bypassHosts: string | null;
  pollInterval: number;
};

export type TListProxiesDTO = TAgentVaultProxyScoped;

export type TCreateProxyDTO = TAgentVaultProxyScoped & {
  name: string;
  unmatchedHost?: AgentVaultUnmatchedHost;
  bypassHosts?: string | null;
  pollInterval?: number;
};

export type TUpdateProxyDTO = TAgentVaultProxyScoped & {
  proxyId: string;
  name?: string;
  unmatchedHost?: AgentVaultUnmatchedHost;
  bypassHosts?: string | null;
  pollInterval?: number;
};

export type TProxyByIdDTO = TAgentVaultProxyScoped & { proxyId: string };

export type TEnrollProxyDTO = {
  enrollmentToken: string;
  rootCaCertificate: string;
};

export type THeartbeatDTO = {
  proxyId: string;
  version?: string;
};

export type TResolveSessionDTO = {
  proxyId: string;
  orgId: string;
  sessionToken: string;
};

/** One connection as the proxy receives it — the only place a credential is ever decrypted. */
export type TResolvedConnection = {
  id: string;
  name: string;
  accessBundleName: string;
  hostPattern: string;
  credential:
    | { type: "bearer"; headerName: string; headerPrefix: string; value: string }
    | { type: "basic"; username: string; password: string }
    | { type: "passthrough" };
};
