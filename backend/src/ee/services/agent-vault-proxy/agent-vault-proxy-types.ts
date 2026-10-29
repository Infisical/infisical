import { TGenericPermission } from "@app/lib/types";

import {
  AgentVaultCredentialType,
  AgentVaultServiceType,
  AgentVaultTrafficPolicy
} from "../agent-vault/agent-vault-enums";

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

export type TBootstrapProxyDTO = {
  proxyId: string;
  tokenVersion: number;
  servedCaCertificate?: string;
};

export type TProxyRootCa = {
  certificate: string;
  privateKey: string;
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

export type TRefreshCredentialDTO = {
  proxyId: string;
  orgId: string;
  sessionToken: string;
  serviceId: string;
  // The host pattern of the cached service the proxy injected the rejected token into.
  hostPattern: string;
  rejectedTokenHash: string;
};

export type TReportMissingScopesDTO = TRefreshCredentialDTO & {
  requiredScopes: string[];
};

export type TResolvedService = {
  id: string;
  name: string;
  accessBundleName: string;
  type: AgentVaultServiceType;
  hostPattern: string;
  allowedMethods: string[] | null;
  allowedPathPrefixes: string[] | null;
  credential:
    | {
        type: AgentVaultCredentialType.Bearer;
        headerName: string;
        headerPrefix: string;
        value: string;
        // Set only for an OAuth credential, which the proxy may ask to refresh.
        source?: AgentVaultCredentialType.OAuth;
        expiresAt?: string | null;
      }
    | { type: AgentVaultCredentialType.Basic; username: string; password: string }
    | { type: AgentVaultCredentialType.Passthrough };
  customHeaders: { name: string; prefix: string; value: string }[];
  substitutions: { placeholder: string; surfaces: string[]; value: string }[];
  // The service takes part of its credential from each member and the session's actor has not set their values,
  // so the proxy refuses its requests rather than sending them without one.
  personalValuesMissing: boolean;
};
