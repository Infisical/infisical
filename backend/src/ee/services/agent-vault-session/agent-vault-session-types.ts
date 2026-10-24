import { TGenericPermission } from "@app/lib/types";

import {
  AgentVaultMemberType,
  AgentVaultSessionScope,
  AgentVaultSessionStatus
} from "../agent-vault/agent-vault-enums";

/** Exactly one of the two names the user. */
export type TOnBehalfOfUser = { userId?: string; userEmail?: string };

export type TMintSessionDTO = {
  projectId: string;
  ctx: TGenericPermission;
  accessBundles: string[];
  /** The caller's name and email, snapshotted from the request. */
  actorName: string;
  actorEmail: string | null;
  ttl?: string;
  onBehalfOf?: TOnBehalfOfUser;
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

/** The machine identity that started a session on its actor's behalf. `id` is null once the identity is deleted. */
export type TAgentVaultSessionActingIdentity = { id: string | null; name: string };

export type TAgentVaultSessionActor =
  | {
      type: AgentVaultMemberType.User;
      id: string | null;
      username: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
    }
  | { type: AgentVaultMemberType.MachineIdentity; id: string | null; name: string };
