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
  label: string | null;
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

export type TUpdateSessionLabelDTO = TRevokeSessionDTO & {
  label: string | null;
};

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

/** The user a machine identity started a session on behalf of. `id` is null once the user is deleted. */
export type TAgentVaultSessionOnBehalfOf = Extract<TAgentVaultSessionActor, { type: AgentVaultMemberType.User }>;
