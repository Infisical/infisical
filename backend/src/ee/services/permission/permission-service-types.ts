import { MongoAbility } from "@casl/ability";
import { MongoQuery } from "@ucast/mongo2js";
import { Knex } from "knex";

import { ActionProjectType, OrganizationActionScope, TMemberships } from "@app/db/schemas";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

import { OrgPermissionSet } from "./org-permission";
import { ProjectPermissionSet } from "./project-permission";

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
        id: string;
        createdAt: Date;
        updatedAt: Date;
        slug: string;
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
  invalidateProjectPermissionCache: (projectId: string, tx?: Knex) => Promise<void>;
};
