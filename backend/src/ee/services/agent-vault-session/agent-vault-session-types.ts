import { TGenericPermission } from "@app/lib/types";

import { AgentVaultSessionScope, AgentVaultSessionStatus } from "../agent-vault/agent-vault-enums";

export type TMintSessionDTO = {
  projectId: string;
  ctx: TGenericPermission;
  accessBundles: string[];
  actorName: string;
  actorEmail: string | null;
  ttl: string;
};

export type TListSessionsDTO = {
  projectId: string;
  ctx: TGenericPermission;
  scope: AgentVaultSessionScope;
  statuses?: AgentVaultSessionStatus[];
  limit: number;
  offset: number;
  search?: string;
};

export type TRevokeSessionDTO = {
  projectId: string;
  ctx: TGenericPermission;
  sessionId: string;
};

export type TGetSessionByIdDTO = TRevokeSessionDTO;
