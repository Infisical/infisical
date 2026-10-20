import { TGenericPermission } from "@app/lib/types";

import { AgentVaultTrafficPolicy } from "../agent-vault/agent-vault-enums";

export type TAgentVaultProxyScoped = { projectId: string; ctx: TGenericPermission };

export type TAgentVaultProxyConfig = {
  trafficPolicy: AgentVaultTrafficPolicy;
  allowedHosts: string | null;
  pollInterval: number;
};

export type TListProxiesDTO = TAgentVaultProxyScoped & {
  search?: string;
  orderBy: "name" | "createdAt";
  orderDirection: "asc" | "desc";
  limit: number;
  offset: number;
};

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
  hasSessionLogKey: boolean;
};

export type TResolvedService = {
  id: string;
  name: string;
  accessBundleName: string;
  hostPattern: string;
  allowedMethods: string[] | null;
  allowedPathPrefixes: string[] | null;
  credential:
    | { type: "bearer"; headerName: string; headerPrefix: string; value: string }
    | { type: "basic"; username: string; password: string }
    | { type: "passthrough" };
  customHeaders: { name: string; prefix: string; value: string }[];
  substitutions: { placeholder: string; surfaces: string[]; value: string }[];
};
