import { TGenericPermission } from "@app/lib/types";

import { AgentVaultDelegationScope, AgentVaultMemberType } from "../agent-vault/agent-vault-enums";

type TAgentVaultDelegationScoped = {
  projectId: string;
  ctx: TGenericPermission;
};

export type TListDelegationsDTO = TAgentVaultDelegationScoped & {
  machineIdentityIds?: string[];
  limit: number;
  offset: number;
};

export type TGetDelegationDTO = TAgentVaultDelegationScoped & {
  machineIdentityId: string;
};

export type TSetDelegationDTO = TGetDelegationDTO & {
  scope: AgentVaultDelegationScope;
  userIds: string[];
  groupIds: string[];
};

export type TDeleteDelegationDTO = TGetDelegationDTO;

export type TChangeDelegationSubjectsDTO = TGetDelegationDTO & {
  userIds: string[];
  groupIds: string[];
};

export type TListAvailableDelegationSubjectsDTO = TGetDelegationDTO & {
  actorType?: AgentVaultMemberType.User | AgentVaultMemberType.Group;
  search?: string;
  limit: number;
  offset: number;
};
