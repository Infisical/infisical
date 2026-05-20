import { MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule } from "@casl/ability/extra";
import { MongoQuery } from "@ucast/mongo2js";

import { ActionProjectType, OrganizationActionScope, ResourceType, TMemberships } from "@app/db/schemas";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

import { OrgPermissionSet } from "./org-permission";
import { ProjectPermissionSet } from "./project-permission";
import { ResourcePermissionSet } from "./resource-permission";

export type TBuildProjectPermissionDTO = {
  permissions?: unknown;
  role: string;
}[];

export type TBuildOrgPermissionDTO = {
  permissions?: unknown;
  role: string;
}[];

export type TGetServiceTokenProjectPermissionArg = {
  serviceTokenId: string;
  projectId: string;
  actorOrgId?: string;
  actionProjectType: ActionProjectType;
};

export type TGetProjectPermissionArg = {
  actor: ActorType;
  actorId: string;
  projectId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId?: string;
  actionProjectType: ActionProjectType;
};

export type TGetResourcePermissionArg = {
  actor: ActorType;
  actorId: string;
  projectId: string;
  resourceType: ResourceType;
  resourceId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId?: string;
};

export type TGetMembershipPermissionAuditArg = {
  actor: ActorType;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
  projectId: string;
  targetUserId: string;
};

export type TGetIdentityPermissionAuditArg = {
  actor: ActorType;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
  projectId: string;
  targetIdentityId: string;
};

export type TPermissionAuditSource = {
  id: string;
  type: "role" | "group_role" | "additional_privilege";
  name: string;
  slug?: string;
  groupId?: string;
  groupName?: string;
  isTemporary: boolean;
  temporaryAccessStartTime?: string;
  temporaryAccessEndTime?: string;
  permissions: PackRule<RawRuleOf<MongoAbility<ProjectPermissionSet>>>[];
};

export type TGetOrgPermissionArg = {
  actor: ActorType;
  actorId: string;
  orgId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
  scope: OrganizationActionScope;
};

export type TPermissionServiceFactory = {
  getOrgPermission: (arg: TGetOrgPermissionArg) => Promise<{
    permission: MongoAbility<OrgPermissionSet, MongoQuery>;
    memberships: Array<
      TMemberships & {
        roles: { role: string; customRoleSlug?: string | null }[];
        shouldUseNewPrivilegeSystem?: boolean | null;
      }
    >;
    hasRole: (role: string) => boolean;
  }>;
  getProjectPermission: (arg: TGetProjectPermissionArg) => Promise<{
    permission: MongoAbility<ProjectPermissionSet, MongoQuery>;
    memberships: Array<TMemberships & { roles: { role: string; customRoleSlug?: string | null }[] }>;
    hasRole: (role: string) => boolean;
    hasProjectEnforcement: (check: "enforceEncryptedSecretManagerSecretMetadata") => boolean;
  }>;
  getResourcePermission: (arg: TGetResourcePermissionArg) => Promise<{
    permission: MongoAbility<ResourcePermissionSet, MongoQuery>;
    memberships: Array<TMemberships & { roles: { role: string; customRoleSlug?: string | null }[] }>;
    hasRole: (role: string) => boolean;
    isImplicitAdmin: boolean;
  }>;
  getProjectPermissions: (
    projectId: string,
    orgId: string
  ) => Promise<{
    userPermissions: {
      permission: MongoAbility<ProjectPermissionSet, MongoQuery>;
      id: string;
      name: string;
      membershipId: string;
    }[];
    identityPermissions: {
      permission: MongoAbility<ProjectPermissionSet, MongoQuery>;
      id: string;
      name: string;
      membershipId: string;
    }[];
    groupPermissions: {
      permission: MongoAbility<ProjectPermissionSet, MongoQuery>;
      id: string;
      name: string;
      membershipId: string;
    }[];
  }>;
  getOrgPermissionByRoles: (
    roles: string[],
    orgId: string
  ) => Promise<
    {
      permission: MongoAbility<OrgPermissionSet, MongoQuery>;
      role?: {
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        slug: string;
        permissions?: unknown;
        description?: string | null | undefined;
      };
    }[]
  >;
  getProjectPermissionByRoles: (
    roles: string[],
    projectId: string
  ) => Promise<
    {
      permission: MongoAbility<ProjectPermissionSet, MongoQuery>;
      role?: {
        name: string;
        slug: string;
        id?: string;
        createdAt?: Date;
        updatedAt?: Date;
        permissions?: unknown;
        description?: string | null | undefined;
      };
    }[]
  >;
  checkGroupProjectPermission: ({
    groupId,
    projectId,
    checkPermissions
  }: {
    groupId: string;
    projectId: string;
    checkPermissions: ProjectPermissionSet;
  }) => Promise<boolean>;
  getMembershipPermissionAudit: (arg: TGetMembershipPermissionAuditArg) => Promise<{
    sources: TPermissionAuditSource[];
  }>;
  getIdentityPermissionAudit: (arg: TGetIdentityPermissionAuditArg) => Promise<{
    sources: TPermissionAuditSource[];
  }>;
};
