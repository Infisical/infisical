import { MongoAbility, RawRuleOf } from "@casl/ability";
import { MongoQuery } from "@ucast/mongo2js";

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

export type TGetUserProjectPermissionArg = {
  userId: string;
  projectId: string;
  authMethod: ActorAuthMethod;
  userOrgId?: string;
};

export type TGetIdentityProjectPermissionArg = {
  identityId: string;
  projectId: string;
  identityOrgId?: string;
};

export type TGetServiceTokenProjectPermissionArg = {
  serviceTokenId: string;
  projectId: string;
  actorOrgId?: string;
};

export type TGetProjectPermissionArg = {
  actor: ActorType;
  actorId: string;
  projectId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId?: string;
};

export type TPermissionServiceFactory = {
  getUserOrgPermission: (
    userId: string,
    orgId: string,
    authMethod: ActorAuthMethod,
    userOrgId?: string
  ) => Promise<{
    permission: MongoAbility<OrgPermissionSet, MongoQuery>;
    membership: {
      status: string;
      orgId: string;
      id: string;
      createdAt: Date;
      updatedAt: Date;
      role: string;
      isActive: boolean;
      shouldUseNewPrivilegeSystem: boolean;
      bypassOrgAuthEnabled: boolean;
      permissions?: unknown;
      userId?: string | null | undefined;
      roleId?: string | null | undefined;
      inviteEmail?: string | null | undefined;
      projectFavorites?: string[] | null | undefined;
      customRoleSlug?: string | null | undefined;
      orgAuthEnforced?: boolean | null | undefined;
    } & {
      groups: {
        id: string;
        updatedAt: Date;
        createdAt: Date;
        role: string;
        roleId: string | null | undefined;
        customRolePermission: unknown;
        name: string;
        slug: string;
        orgId: string;
      }[];
    };
  }>;
  getOrgPermission: (
    type: ActorType,
    id: string,
    orgId: string,
    authMethod: ActorAuthMethod,
    actorOrgId: string | undefined
  ) => Promise<
    | {
        permission: MongoAbility<OrgPermissionSet, MongoQuery>;
        membership: {
          status: string;
          orgId: string;
          id: string;
          createdAt: Date;
          updatedAt: Date;
          role: string;
          isActive: boolean;
          shouldUseNewPrivilegeSystem: boolean;
          bypassOrgAuthEnabled: boolean;
          permissions?: unknown;
          userId?: string | null | undefined;
          roleId?: string | null | undefined;
          inviteEmail?: string | null | undefined;
          projectFavorites?: string[] | null | undefined;
          customRoleSlug?: string | null | undefined;
          orgAuthEnforced?: boolean | null | undefined;
        } & {
          groups: {
            id: string;
            updatedAt: Date;
            createdAt: Date;
            role: string;
            roleId: string | null | undefined;
            customRolePermission: unknown;
            name: string;
            slug: string;
            orgId: string;
          }[];
        };
      }
    | {
        permission: MongoAbility<OrgPermissionSet, MongoQuery>;
        membership: {
          id: string;
          role: string;
          createdAt: Date;
          updatedAt: Date;
          orgId: string;
          roleId?: string | null | undefined;
          permissions?: unknown;
          identityId: string;
          orgAuthEnforced: boolean | null | undefined;
          shouldUseNewPrivilegeSystem: boolean;
        };
      }
  >;
  getUserProjectPermission: ({ userId, projectId, authMethod, userOrgId }: TGetUserProjectPermissionArg) => Promise<{
    permission: MongoAbility<ProjectPermissionSet, MongoQuery>;
    membership: {
      id: string;
      createdAt: Date;
      updatedAt: Date;
      userId: string;
      projectId: string;
    } & {
      orgAuthEnforced: boolean | null | undefined;
      orgId: string;
      roles: Array<{
        role: string;
      }>;
      shouldUseNewPrivilegeSystem: boolean;
    };
    hasRole: (role: string) => boolean;
  }>;
  getProjectPermission: <T extends ActorType>(
    arg: TGetProjectPermissionArg
  ) => Promise<
    T extends ActorType.SERVICE
      ? {
          permission: MongoAbility<ProjectPermissionSet, MongoQuery>;
          membership: {
            shouldUseNewPrivilegeSystem: boolean;
          };
          hasRole: (arg: string) => boolean;
        }
      : {
          permission: MongoAbility<ProjectPermissionSet, MongoQuery>;
          membership: (T extends ActorType.USER
            ? {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                userId: string;
                projectId: string;
              }
            : {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                projectId: string;
                identityId: string;
              }) & {
            orgAuthEnforced: boolean | null | undefined;
            orgId: string;
            roles: Array<{
              role: string;
            }>;
            shouldUseNewPrivilegeSystem: boolean;
          };
          hasRole: (role: string) => boolean;
        }
  >;
  getProjectPermissions: (projectId: string) => Promise<{
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
  getOrgPermissionByRole: (
    role: string,
    orgId: string
  ) => Promise<
    | {
        permission: MongoAbility<OrgPermissionSet, MongoQuery>;
        role: {
          name: string;
          orgId: string;
          id: string;
          createdAt: Date;
          updatedAt: Date;
          slug: string;
          permissions?: unknown;
          description?: string | null | undefined;
        };
      }
    | {
        permission: MongoAbility<OrgPermissionSet, MongoQuery>;
        role?: undefined;
      }
  >;
  getProjectPermissionByRole: (
    role: string,
    projectId: string
  ) => Promise<
    | {
        permission: MongoAbility<ProjectPermissionSet, MongoQuery>;
        role: {
          name: string;
          version: number;
          id: string;
          createdAt: Date;
          updatedAt: Date;
          projectId: string;
          slug: string;
          permissions?: unknown;
          description?: string | null | undefined;
        };
      }
    | {
        permission: MongoAbility<ProjectPermissionSet, MongoQuery>;
        role?: undefined;
      }
  >;
  buildOrgPermission: (orgUserRoles: TBuildOrgPermissionDTO) => MongoAbility<OrgPermissionSet, MongoQuery>;
  buildProjectPermissionRules: (
    projectUserRoles: TBuildProjectPermissionDTO
  ) => RawRuleOf<MongoAbility<ProjectPermissionSet>>[];
  checkGroupProjectPermission: ({
    groupId,
    projectId,
    checkPermissions
  }: {
    groupId: string;
    projectId: string;
    checkPermissions: ProjectPermissionSet;
  }) => Promise<boolean>;
};
