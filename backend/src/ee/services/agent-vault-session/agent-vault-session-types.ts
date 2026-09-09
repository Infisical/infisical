import { TAgentVaultActorContext } from "../agent-vault/agent-vault-actor-types";
import {
  AgentVaultSessionScope,
  AgentVaultSessionStatus,
  AgentVaultSessionTtl
} from "../agent-vault/agent-vault-enums";

export type TMintSessionDTO = {
  projectId: string;
  ctx: TAgentVaultActorContext;
  accessBundles: string[];
  actorName: string;
  actorEmail: string | null;
  ttl: AgentVaultSessionTtl;
};

export type TListSessionsDTO = {
  projectId: string;
  ctx: TAgentVaultActorContext;
  scope: AgentVaultSessionScope;
  status?: AgentVaultSessionStatus;
  limit: number;
  offset: number;
  search?: string;
};

export type TRevokeSessionDTO = {
  projectId: string;
  ctx: TAgentVaultActorContext;
  sessionId: string;
};
