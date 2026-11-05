import type {
  TAgentVaultSessionList,
  useListAgentVaultAccessBundles
} from "@app/hooks/api/agentVault/queries";
import type {
  TListAgentVaultAccessBundlesDTO,
  TListAgentVaultSessionsDTO
} from "@app/hooks/api/agentVault/types";
import type { TGetUserProjectPermissionDTO } from "@app/hooks/api/roles/types";

import type { V4QueryResult } from "../contract";

export type TAgentVaultAccessBundleList = NonNullable<
  ReturnType<typeof useListAgentVaultAccessBundles>["data"]
>;

export type AgentVaultAdapter = {
  useProjectId: (orgId: string) => V4QueryResult<string>;
  useProjectPermission: (
    dto: TGetUserProjectPermissionDTO
  ) => V4QueryResult<{ memberships: { roles: { role: string }[] }[] }>;
  useSessions: (
    orgId: string,
    params: TListAgentVaultSessionsDTO
  ) => V4QueryResult<TAgentVaultSessionList>;
  useAccessBundles: (
    orgId: string,
    params: TListAgentVaultAccessBundlesDTO
  ) => V4QueryResult<TAgentVaultAccessBundleList>;
};
