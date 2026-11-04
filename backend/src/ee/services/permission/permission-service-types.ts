import { MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule } from "@casl/ability/extra";
import { MongoQuery } from "@ucast/mongo2js";
import { Knex } from "knex";

import {
  AccessScopeData,
  ActionProjectType,
  OrganizationActionScope,
  ResourceType,
  TMemberships
} from "@app/db/schemas";
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
  includeFolderPermissions: boolean;
};

export type TGetIdentityPermissionAuditArg = {
  actor: ActorType;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
  projectId: string;
  targetIdentityId: string;
  includeFolderPermissions: boolean;
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

export type TProjectFolderScopedPrivilege = {
  id: string;
  folderId: string;
  role: string;
  environmentSlug: string;
  secretPath: string;
};

export type TCachedFolderScopedPrivileges = {
  privileges: (TProjectFolderScopedPrivilege & {
    isTemporary: boolean;
    temporaryAccessEndTime?: Date | null;
  })[];
};

export type TGetOrgPermissionArg = {
  actor: ActorType;
  actorId: string;
  orgId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
  scope: OrganizationActionScope;
};

export type TResolveRolesOpts = {
  ignoreUnresolvedRoles?: boolean;
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
    memberships: Array<
      TMemberships & {
        roles: {
          role: string;
          customRoleSlug?: string | null;
          isTemporary?: boolean;
          temporaryAccessEndTime?: Date | null;
        }[];
      }
    >;
    hasRole: (role: string) => boolean;
    hasProjectEnforcement: (check: "enforceEncryptedSecretManagerSecretMetadata") => boolean;
    folderScopedPrivileges: TProjectFolderScopedPrivilege[];
  }>;
  invalidateProjectFolderPermissionCache: (projectId: string | string[], tx?: Knex) => Promise<void>;
  getProjectPermissionFingerprint: (arg: {
    projectId: string;
    orgId: string;
    actorId: string;
    actorType: ActorType.USER | ActorType.IDENTITY;
  }) => Promise<string>;
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
      roles: {
        // The role assignment's id.
        id: string;
        role: string;
        customRoleSlug?: string | null;
        customRoleId?: string | null;
        customRoleName?: string | null;
      }[];
      additionalPrivileges: { id: string; name: string }[];
      // Each role ("role:<assignment id>") and project-wide privilege ("privilege:<id>") as a permission of its own,
      // without folder grants.
      accessSources: () => { key: string; permission: MongoAbility<ProjectPermissionSet, MongoQuery> }[];
    }[];
    identityPermissions: {
      permission: MongoAbility<ProjectPermissionSet, MongoQuery>;
      id: string;
      name: string;
      membershipId: string;
      roles: {
        // The role assignment's id.
        id: string;
        role: string;
        customRoleSlug?: string | null;
        customRoleId?: string | null;
        customRoleName?: string | null;
      }[];
      additionalPrivileges: { id: string; name: string }[];
      // Each role ("role:<assignment id>") and project-wide privilege ("privilege:<id>") as a permission of its own,
      // without folder grants.
      accessSources: () => { key: string; permission: MongoAbility<ProjectPermissionSet, MongoQuery> }[];
    }[];
    groupPermissions: {
      permission: MongoAbility<ProjectPermissionSet, MongoQuery>;
      id: string;
      name: string;
      membershipId: string;
      roles: {
        role: string;
        customRoleSlug?: string | null;
        customRoleId?: string | null;
        customRoleName?: string | null;
      }[];
    }[];
    // Each user's and identity's active folder grants, keyed by actor id, whether they are a direct member or
    // reach the project through a group. Admins are listed too, though their grants are never applied.
    folderAccessByActorId: Map<string, TProjectFolderScopedPrivilege[]>;
    // One person's permission merged across their direct membership and the given groups, the way
    // getProjectPermission builds it. Pass the username and metadata of someone who is only in the project through a
    // group, since only direct members' details are loaded here.
    permissionForActor: (actor: {
      actorId: string;
      groupIds: string[];
      username?: string;
      metadata?: { key: string; value: string }[];
      // Only what the given groups give the person, without their direct membership or folder grants, still with
      // the person's own details filled in.
      groupsOnly?: boolean;
    }) => MongoAbility<ProjectPermissionSet, MongoQuery>;
    // Whether any group role holds a placeholder such as {{identity.username}}, so that a caller only looks up group
    // members' details when they change the result.
    groupRulesHavePlaceholders: boolean;
  }>;
  getOrgPermissionByRoles: (
    roles: string[],
    orgId: string,
    opts?: TResolveRolesOpts
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
    projectId: string,
    opts?: TResolveRolesOpts
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
  getActorGrantAbilities: (arg: {
    scopeData: AccessScopeData;
    actorId: string;
    actorType: ActorType.USER | ActorType.IDENTITY;
  }) => Promise<{ permission: MongoAbility }[]>;
  getMembershipPermissionAudit: (arg: TGetMembershipPermissionAuditArg) => Promise<{
    sources: TPermissionAuditSource[];
  }>;
  getIdentityPermissionAudit: (arg: TGetIdentityPermissionAuditArg) => Promise<{
    sources: TPermissionAuditSource[];
  }>;
};
