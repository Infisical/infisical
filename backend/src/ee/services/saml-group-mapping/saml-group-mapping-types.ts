import { ActorAuthMethod, ActorType } from "@app/ee/services/audit-log/audit-log-types";

export type TSamlGroupMappingServiceFactory = {
  getSamlGroupMappings: (dto: {
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
    actorAuthMethod: ActorAuthMethod;
    samlConfigId: string;
  }) => Promise<Array<{
    id: string;
    samlConfigId: string;
    samlGroupName: string;
    groupId: string | null;
    groupName?: string | null;
    groupSlug?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>>;

  updateSamlGroupMappings: (dto: {
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
    actorAuthMethod: ActorAuthMethod;
    samlConfigId: string;
    mappings: Array<{
      samlGroupName: string;
      groupId: string | null;
    }>;
  }) => Promise<{
    mappings: Array<{
      samlGroupName: string;
      groupId: string | null;
    }>;
  }>;
};

export type TSamlGroupMappingMapping = {
  samlGroupName: string;
  groupId: string | null;
};

export type TProcessSamlGroupMappingsDTO = {
  user: { id: string; email?: string; username: string };
  groups: string[];
  samlConfigId: string;
  orgId: string;
};