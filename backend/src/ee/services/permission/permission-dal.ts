import { Knex } from "knex";
import { z } from "zod";

import { TDbClient } from "@app/db";
import {
  AccessScope,
  AccessScopeData,
  MembershipRolesSchema,
  MembershipsSchema,
  TableName,
  TMemberships,
  TRoles
} from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { ActorType } from "@app/services/auth/auth-type";

interface TPermissionDataReturn extends TMemberships {
  orgAuthEnforced?: boolean | null;
  orgGoogleSsoAuthEnforced?: boolean | null;
  shouldUseNewPrivilegeSystem?: boolean | null;
  rootOrgId?: string | null;
  bypassOrgAuthEnabled?: boolean | null;
  roles: {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    isTemporary: boolean;
    role: string;
    temporaryRange?: string | null | undefined;
    permissions?: unknown;
    customRoleId?: string | null | undefined;
    temporaryMode?: string | null | undefined;
    temporaryAccessStartTime?: Date | null | undefined;
    temporaryAccessEndTime?: Date | null | undefined;
    customRoleSlug?: string | null | undefined;
  }[];
  additionalPrivileges: {
    id: string;
    permissions: unknown;
    temporaryRange: string | null | undefined;
    temporaryMode: string | null | undefined;
    temporaryAccessEndTime: Date | null | undefined;
    temporaryAccessStartTime: Date | null | undefined;
    isTemporary: boolean;
  }[];
  metadata: {
    id: string;
    key: string;
    value: string;
  }[];
}

export interface TPermissionDALFactory {
  getProjectUserPermissions: (
    projectId: string,
    orgId: string
  ) => Promise<
    {
      roles: {
        id: string;
        role: string;
        customRoleSlug: string;
        permissions: unknown;
        temporaryRange: string | null | undefined;
        temporaryMode: string | null | undefined;
        temporaryAccessStartTime: Date | null | undefined;
        temporaryAccessEndTime: Date | null | undefined;
        isTemporary: boolean;
      }[];
      additionalPrivileges: {
        id: string;
        permissions: unknown;
        temporaryRange: string | null | undefined;
        temporaryMode: string | null | undefined;
        temporaryAccessStartTime: Date | null | undefined;
        temporaryAccessEndTime: Date | null | undefined;
        isTemporary: boolean;
      }[];
      userId: string;
      username: string;
      metadata: {
        id: string;
        key: string;
        value: string;
      }[];
    }[]
  >;
  getProjectIdentityPermissions: (
    projectId: string,
    orgId: string
  ) => Promise<
    {
      roles: {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        isTemporary: boolean;
        role: string;
        temporaryRange?: string | null | undefined;
        permissions?: unknown;
        customRoleId?: string | null | undefined;
        temporaryMode?: string | null | undefined;
        temporaryAccessStartTime?: Date | null | undefined;
        temporaryAccessEndTime?: Date | null | undefined;
        customRoleSlug?: string | null | undefined;
      }[];
      additionalPrivileges: {
        id: string;
        permissions: unknown;
        temporaryRange: string | null | undefined;
        temporaryMode: string | null | undefined;
        temporaryAccessEndTime: Date | null | undefined;
        temporaryAccessStartTime: Date | null | undefined;
        isTemporary: boolean;
      }[];
      id: string;
      identityId: string;
      username: string;
      projectId: string;
      createdAt: Date;
      updatedAt: Date;
      orgId: string;
      metadata: {
        id: string;
        key: string;
        value: string;
      }[];
    }[]
  >;
  getProjectGroupPermissions: (
    projectId: string,
    filterGroupId?: string
  ) => Promise<
    {
      roles: {
        id: string;
        role: string;
        customRoleSlug: string;
        permissions: unknown;
        temporaryRange: string | null | undefined;
        temporaryMode: string | null | undefined;
        temporaryAccessStartTime: Date | null | undefined;
        temporaryAccessEndTime: Date | null | undefined;
        isTemporary: boolean;
      }[];
      groupId: string;
      username: string;
      id: string;
      groupRoles: {
        id: string;
        role: string;
        customRoleSlug: string;
        permissions: unknown;
        temporaryRange: string | null | undefined;
        temporaryMode: string | null | undefined;
        temporaryAccessStartTime: Date | null | undefined;
        temporaryAccessEndTime: Date | null | undefined;
        isTemporary: boolean;
      }[];
    }[]
  >;
  getPermission: (dto: {
    scopeData: AccessScopeData;
    actorId: string;
    actorType: ActorType.IDENTITY | ActorType.USER;
    tx?: Knex;
  }) => Promise<TPermissionDataReturn[]>;
}

export const permissionDALFactory = (db: TDbClient): TPermissionDALFactory => {
  const getPermission: TPermissionDALFactory["getPermission"] = async ({ scopeData, tx, actorId, actorType }) => {
    try {
      // akhilmhdh: when group has another group like sub group we would need recursively go down
      const userGroupSubquery = (tx || db)(TableName.Groups)
        .leftJoin(TableName.UserGroupMembership, `${TableName.UserGroupMembership}.groupId`, `${TableName.Groups}.id`)
        .where(`${TableName.Groups}.orgId`, scopeData.orgId)
        .where(`${TableName.UserGroupMembership}.userId`, actorId)
        .select(db.ref("id").withSchema(TableName.Groups));

      const docs = await (tx || db)
        .replicaNode()(TableName.Membership)
        .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .join(TableName.Organization, `${TableName.Membership}.scopeOrgId`, `${TableName.Organization}.id`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .leftJoin(TableName.AdditionalPrivilege, (qb) => {
          if (actorType === ActorType.IDENTITY) {
            qb.on(`${TableName.Membership}.actorIdentityId`, `${TableName.AdditionalPrivilege}.actorIdentityId`);
          } else {
            qb.on(`${TableName.Membership}.actorUserId`, `${TableName.AdditionalPrivilege}.actorUserId`);
          }

          if (scopeData.scope === AccessScope.Organization) {
            qb.andOn(`${TableName.Membership}.scopeOrgId`, `${TableName.AdditionalPrivilege}.orgId`);
          } else if (scopeData.scope === AccessScope.Project) {
            qb.andOn(`${TableName.Membership}.scopeProjectId`, `${TableName.AdditionalPrivilege}.projectId`);
          } else {
            qb.andOn(`${TableName.Membership}.scopeNamespaceId`, `${TableName.AdditionalPrivilege}.namespaceId`);
          }
        })
        .leftJoin(TableName.IdentityMetadata, (queryBuilder) => {
          if (actorType === ActorType.USER) {
            void queryBuilder
              .on(`${TableName.IdentityMetadata}.userId`, db.raw("?", [actorId]))
              .andOn(`${TableName.Membership}.scopeOrgId`, `${TableName.IdentityMetadata}.orgId`);
          } else if (actorType === ActorType.IDENTITY) {
            void queryBuilder.on(`${TableName.IdentityMetadata}.identityId`, db.raw("?", [actorId]));
          }
        })
        .where(`${TableName.Membership}.scopeOrgId`, scopeData.orgId)
        .where((qb) => {
          if (actorType === ActorType.USER) {
            void qb
              .where(`${TableName.Membership}.actorUserId`, actorId)
              .orWhereIn(`${TableName.Membership}.actorGroupId`, userGroupSubquery);
          } else if (actorType === ActorType.IDENTITY) {
            void qb.where(`${TableName.Membership}.actorIdentityId`, actorId);
          }
        })
        .where((qb) => {
          if (scopeData.scope === AccessScope.Organization) {
            void qb.where(`${TableName.Membership}.scope`, AccessScope.Organization);
          } else if (scopeData.scope === AccessScope.Namespace) {
            void qb
              .where(`${TableName.Membership}.scope`, AccessScope.Namespace)
              .where(`${TableName.Membership}.scopeNamespaceId`, scopeData.namespaceId);
          } else if (scopeData.scope === AccessScope.Project) {
            void qb
              .where(`${TableName.Membership}.scope`, AccessScope.Project)
              .where(`${TableName.Membership}.scopeProjectId`, scopeData.projectId);
          }
        })
        .select(selectAllTableCols(TableName.Membership))
        .select(
          db.ref("slug").withSchema(TableName.Role).as("roleSlug"),
          db.ref("permissions").withSchema(TableName.Role).as("customRolePermission"),
          db.ref("id").withSchema(TableName.MembershipRole).as("membershipRoleId"),
          db.ref("role").withSchema(TableName.MembershipRole).as("membershipRole"),
          db.ref("temporaryMode").withSchema(TableName.MembershipRole).as("membershipRoleTemporaryMode"),
          db.ref("isTemporary").withSchema(TableName.MembershipRole).as("membershipRoleIsTemporary"),
          db.ref("temporaryRange").withSchema(TableName.MembershipRole).as("membershipRoleTemporaryRange"),
          db
            .ref("temporaryAccessStartTime")
            .withSchema(TableName.MembershipRole)
            .as("membershipRoleTemporaryAccessStartTime"),
          db
            .ref("temporaryAccessEndTime")
            .withSchema(TableName.MembershipRole)
            .as("membershipRoleTemporaryAccessEndTime"),
          db.ref("createdAt").withSchema(TableName.MembershipRole).as("membershipRoleCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.MembershipRole).as("membershipRoleUpdatedAt"),
          db.ref("id").withSchema(TableName.AdditionalPrivilege).as("additionalPrivilegeId"),
          db.ref("name").withSchema(TableName.AdditionalPrivilege).as("additionalPrivilegeName"),
          db.ref("permissions").withSchema(TableName.AdditionalPrivilege).as("additionalPrivilegePermissions"),
          db.ref("id").withSchema(TableName.AdditionalPrivilege).as("additionalPrivilegeId"),
          db.ref("temporaryMode").withSchema(TableName.AdditionalPrivilege).as("additionalPrivilegeTemporaryMode"),
          db.ref("isTemporary").withSchema(TableName.AdditionalPrivilege).as("additionalPrivilegeIsTemporary"),
          db.ref("temporaryRange").withSchema(TableName.AdditionalPrivilege).as("additionalPrivilegeTemporaryRange"),
          db
            .ref("temporaryAccessStartTime")
            .withSchema(TableName.AdditionalPrivilege)
            .as("additionalPrivilegeTemporaryAccessStartTime"),
          db
            .ref("temporaryAccessEndTime")
            .withSchema(TableName.AdditionalPrivilege)
            .as("additionalPrivilegeTemporaryAccessEndTime"),
          db.ref("createdAt").withSchema(TableName.AdditionalPrivilege).as("additionalPrivilegeCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.AdditionalPrivilege).as("additionalPrivilegeUpdatedAt"),
          db.ref("id").withSchema(TableName.IdentityMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.IdentityMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.IdentityMetadata).as("metadataValue"),
          db.ref("shouldUseNewPrivilegeSystem").withSchema(TableName.Organization),
          db.ref("authEnforced").withSchema(TableName.Organization).as("orgAuthEnforced"),
          db.ref("googleSsoAuthEnforced").withSchema(TableName.Organization).as("orgGoogleSsoAuthEnforced"),
          db.ref("bypassOrgAuthEnabled").withSchema(TableName.Organization).as("bypassOrgAuthEnabled"),
          db.ref("rootOrgId").withSchema(TableName.Organization).as("rootOrgId")
        );

      const data = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) =>
          MembershipsSchema.extend({
            orgAuthEnforced: z.boolean().optional().nullable(),
            shouldUseNewPrivilegeSystem: z.boolean().optional().nullable(),
            rootOrgId: z.string().optional().nullable(),
            orgGoogleSsoAuthEnforced: z.boolean(),
            bypassOrgAuthEnabled: z.boolean()
          }).parse(el),
        childrenMapper: [
          {
            key: "additionalPrivilegeId",
            label: "additionalPrivileges" as const,
            mapper: ({
              additionalPrivilegeId,
              additionalPrivilegePermissions,
              additionalPrivilegeIsTemporary,
              additionalPrivilegeTemporaryMode,
              additionalPrivilegeTemporaryRange,
              additionalPrivilegeTemporaryAccessEndTime,
              additionalPrivilegeTemporaryAccessStartTime,
              additionalPrivilegeCreatedAt,
              additionalPrivilegeUpdatedAt
            }) => ({
              id: additionalPrivilegeId,
              permissions: additionalPrivilegePermissions,
              temporaryRange: additionalPrivilegeTemporaryRange,
              temporaryMode: additionalPrivilegeTemporaryMode,
              temporaryAccessStartTime: additionalPrivilegeTemporaryAccessStartTime,
              temporaryAccessEndTime: additionalPrivilegeTemporaryAccessEndTime,
              isTemporary: additionalPrivilegeIsTemporary,
              createdAt: additionalPrivilegeCreatedAt,
              updatedAt: additionalPrivilegeUpdatedAt
            })
          },
          {
            key: "membershipRoleId",
            label: "roles" as const,
            mapper: ({
              roleSlug,
              customRolePermission,
              membershipRoleId,
              membershipRole,
              membershipRoleIsTemporary,
              membershipRoleTemporaryMode,
              membershipRoleTemporaryRange,
              membershipRoleTemporaryAccessEndTime,
              membershipRoleTemporaryAccessStartTime,
              membershipRoleCreatedAt,
              membershipRoleUpdatedAt
            }) => ({
              id: membershipRoleId,
              role: membershipRole,
              permissions: customRolePermission,
              customRoleSlug: roleSlug,
              temporaryRange: membershipRoleTemporaryRange,
              temporaryMode: membershipRoleTemporaryMode,
              temporaryAccessStartTime: membershipRoleTemporaryAccessStartTime,
              temporaryAccessEndTime: membershipRoleTemporaryAccessEndTime,
              isTemporary: membershipRoleIsTemporary,
              createdAt: membershipRoleCreatedAt,
              updatedAt: membershipRoleUpdatedAt
            })
          },
          {
            key: "metadataId",
            label: "metadata" as const,
            mapper: ({ metadataKey, metadataValue, metadataId }) => ({
              id: metadataId,
              key: metadataKey,
              value: metadataValue
            })
          }
        ]
      });

      return data;
    } catch (error) {
      throw new DatabaseError({ error, name: "Get Permission" });
    }
  };

  const getProjectGroupPermissions: TPermissionDALFactory["getProjectGroupPermissions"] = async (
    projectId: string,
    filterGroupId?: string
  ) => {
    try {
      const docs = await db
        .replicaNode()(TableName.Membership)
        .whereNotNull(`${TableName.Membership}.actorGroupId`)
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .join(TableName.Groups, `${TableName.Groups}.id`, `${TableName.Membership}.actorGroupId`)
        .join(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .leftJoin<TRoles>(
          { groupCustomRoles: TableName.Role },
          `${TableName.MembershipRole}.customRoleId`,
          `groupCustomRoles.id`
        )
        .where(`${TableName.Membership}.scopeProjectId`, "=", projectId)
        .where((bd) => {
          if (filterGroupId) {
            void bd.where(`${TableName.Membership}.actorGroupId`, "=", filterGroupId);
          }
        })
        .select(
          db.ref("id").withSchema(TableName.Membership).as("membershipId"),
          db.ref("id").withSchema(TableName.Groups).as("groupId"),
          db.ref("name").withSchema(TableName.Groups).as("groupName"),
          db.ref("slug").withSchema("groupCustomRoles").as("groupProjectMembershipRoleCustomRoleSlug"),
          db.ref("permissions").withSchema("groupCustomRoles").as("groupProjectMembershipRolePermission"),
          db.ref("id").withSchema(TableName.MembershipRole).as("groupProjectMembershipRoleId"),
          db.ref("role").withSchema(TableName.MembershipRole).as("groupProjectMembershipRole"),
          db.ref("customRoleId").withSchema(TableName.MembershipRole).as("groupProjectMembershipRoleCustomRoleId"),
          db.ref("isTemporary").withSchema(TableName.MembershipRole).as("groupProjectMembershipRoleIsTemporary"),
          db.ref("temporaryMode").withSchema(TableName.MembershipRole).as("groupProjectMembershipRoleTemporaryMode"),
          db.ref("temporaryRange").withSchema(TableName.MembershipRole).as("groupProjectMembershipRoleTemporaryRange"),
          db
            .ref("temporaryAccessStartTime")
            .withSchema(TableName.MembershipRole)
            .as("groupProjectMembershipRoleTemporaryAccessStartTime"),
          db
            .ref("temporaryAccessEndTime")
            .withSchema(TableName.MembershipRole)
            .as("groupProjectMembershipRoleTemporaryAccessEndTime")
        );

      const groupPermissions = sqlNestRelationships({
        data: docs,
        key: "groupId",
        parentMapper: ({ groupId, groupName, membershipId }) => ({
          groupId,
          username: groupName,
          id: membershipId
        }),
        childrenMapper: [
          {
            key: "groupProjectMembershipRoleId",
            label: "groupRoles" as const,
            mapper: ({
              groupProjectMembershipRoleId,
              groupProjectMembershipRole,
              groupProjectMembershipRolePermission,
              groupProjectMembershipRoleCustomRoleSlug,
              groupProjectMembershipRoleIsTemporary,
              groupProjectMembershipRoleTemporaryMode,
              groupProjectMembershipRoleTemporaryAccessEndTime,
              groupProjectMembershipRoleTemporaryAccessStartTime,
              groupProjectMembershipRoleTemporaryRange
            }) => ({
              id: groupProjectMembershipRoleId,
              role: groupProjectMembershipRole,
              customRoleSlug: groupProjectMembershipRoleCustomRoleSlug,
              permissions: groupProjectMembershipRolePermission,
              temporaryRange: groupProjectMembershipRoleTemporaryRange,
              temporaryMode: groupProjectMembershipRoleTemporaryMode,
              temporaryAccessStartTime: groupProjectMembershipRoleTemporaryAccessStartTime,
              temporaryAccessEndTime: groupProjectMembershipRoleTemporaryAccessEndTime,
              isTemporary: groupProjectMembershipRoleIsTemporary
            })
          }
        ]
      });

      return groupPermissions
        .map((groupPermission) => {
          if (!groupPermission) return undefined;

          const activeGroupRoles =
            groupPermission?.groupRoles?.filter(
              ({ isTemporary, temporaryAccessEndTime }) =>
                !isTemporary || (isTemporary && temporaryAccessEndTime && new Date() < temporaryAccessEndTime)
            ) ?? [];

          return {
            ...groupPermission,
            roles: activeGroupRoles
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
    } catch (error) {
      throw new DatabaseError({ error, name: "GetProjectGroupPermissions" });
    }
  };

  const getProjectUserPermissions: TPermissionDALFactory["getProjectUserPermissions"] = async (
    projectId: string,
    orgId: string
  ) => {
    const userGroupSubquery = db(TableName.Groups)
      .leftJoin(TableName.UserGroupMembership, `${TableName.UserGroupMembership}.groupId`, `${TableName.Groups}.id`)
      .where(`${TableName.Groups}.orgId`, orgId)
      .select(db.ref("id").withSchema(TableName.Groups));

    try {
      const docs = await db
        .replicaNode()(TableName.Users)
        .where("isGhost", "=", false)
        .join(TableName.Membership, `${TableName.Users}.id`, `${TableName.Membership}.actorUserId`)
        .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .leftJoin(TableName.AdditionalPrivilege, (qb) => {
          qb.on(`${TableName.Membership}.actorUserId`, `${TableName.AdditionalPrivilege}.actorUserId`).andOn(
            `${TableName.Membership}.scopeOrgId`,
            `${TableName.AdditionalPrivilege}.orgId`
          );
        })
        .leftJoin(TableName.IdentityMetadata, (queryBuilder) => {
          void queryBuilder
            .on(`${TableName.Users}.id`, `${TableName.IdentityMetadata}.userId`)
            .andOn(`${TableName.Membership}.scopeOrgId`, `${TableName.IdentityMetadata}.orgId`);
        })
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .where((qb) => {
          void qb
            .whereNotNull(`${TableName.Membership}.actorUserId`)
            .orWhereIn(`${TableName.Membership}.actorGroupId`, userGroupSubquery);
        })
        .where((qb) => {
          void qb
            .where(`${TableName.Membership}.scope`, AccessScope.Project)
            .where(`${TableName.Membership}.scopeProjectId`, projectId);
        })
        .select(
          db.ref("id").withSchema(TableName.Users).as("userId"),
          db.ref("username").withSchema(TableName.Users).as("username"),
          db.ref("slug").withSchema(TableName.Role).as("roleSlug"),
          db.ref("permissions").withSchema(TableName.Role).as("customRolePermission"),
          db.ref("id").withSchema(TableName.MembershipRole).as("membershipRoleId"),
          db.ref("role").withSchema(TableName.MembershipRole).as("membershipRole"),
          db.ref("temporaryMode").withSchema(TableName.MembershipRole).as("membershipRoleTemporaryMode"),
          db.ref("isTemporary").withSchema(TableName.MembershipRole).as("membershipRoleIsTemporary"),
          db.ref("temporaryRange").withSchema(TableName.MembershipRole).as("membershipRoleTemporaryRange"),
          db
            .ref("temporaryAccessStartTime")
            .withSchema(TableName.MembershipRole)
            .as("membershipRoleTemporaryAccessStartTime"),
          db
            .ref("temporaryAccessEndTime")
            .withSchema(TableName.MembershipRole)
            .as("membershipRoleTemporaryAccessEndTime"),
          db.ref("createdAt").withSchema(TableName.MembershipRole).as("membershipRoleCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.MembershipRole).as("membershipRoleUpdatedAt"),
          db.ref("id").withSchema(TableName.AdditionalPrivilege).as("additionalPrivilegeId"),
          db.ref("name").withSchema(TableName.AdditionalPrivilege).as("additionalPrivilegeName"),
          db.ref("permissions").withSchema(TableName.AdditionalPrivilege).as("additionalPrivilegePermissions"),
          db.ref("id").withSchema(TableName.AdditionalPrivilege).as("additionalPrivilegeId"),
          db.ref("temporaryMode").withSchema(TableName.AdditionalPrivilege).as("additionalPrivilegeTemporaryMode"),
          db.ref("isTemporary").withSchema(TableName.AdditionalPrivilege).as("additionalPrivilegeIsTemporary"),
          db.ref("temporaryRange").withSchema(TableName.AdditionalPrivilege).as("additionalPrivilegeTemporaryRange"),
          db
            .ref("temporaryAccessStartTime")
            .withSchema(TableName.AdditionalPrivilege)
            .as("additionalPrivilegeTemporaryAccessStartTime"),
          db
            .ref("temporaryAccessEndTime")
            .withSchema(TableName.AdditionalPrivilege)
            .as("additionalPrivilegeTemporaryAccessEndTime"),
          db.ref("createdAt").withSchema(TableName.AdditionalPrivilege).as("additionalPrivilegeCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.AdditionalPrivilege).as("additionalPrivilegeUpdatedAt"),
          // general
          db.ref("id").withSchema(TableName.IdentityMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.IdentityMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.IdentityMetadata).as("metadataValue")
        );

      const userPermissions = sqlNestRelationships({
        data: docs,
        key: "userId",
        parentMapper: ({ username, userId }) => ({
          userId,
          projectId,
          username
        }),
        childrenMapper: [
          {
            key: "additionalPrivilegeId",
            label: "additionalPrivileges" as const,
            mapper: ({
              additionalPrivilegeId,
              additionalPrivilegePermissions,
              additionalPrivilegeIsTemporary,
              additionalPrivilegeTemporaryMode,
              additionalPrivilegeTemporaryRange,
              additionalPrivilegeTemporaryAccessEndTime,
              additionalPrivilegeTemporaryAccessStartTime,
              additionalPrivilegeCreatedAt,
              additionalPrivilegeUpdatedAt
            }) => ({
              id: additionalPrivilegeId,
              permissions: additionalPrivilegePermissions,
              temporaryRange: additionalPrivilegeTemporaryRange,
              temporaryMode: additionalPrivilegeTemporaryMode,
              temporaryAccessStartTime: additionalPrivilegeTemporaryAccessStartTime,
              temporaryAccessEndTime: additionalPrivilegeTemporaryAccessEndTime,
              isTemporary: additionalPrivilegeIsTemporary,
              createdAt: additionalPrivilegeCreatedAt,
              updatedAt: additionalPrivilegeUpdatedAt
            })
          },
          {
            key: "membershipRoleId",
            label: "roles" as const,
            mapper: ({
              roleSlug,
              customRolePermission,
              membershipRoleId,
              membershipRole,
              membershipRoleIsTemporary,
              membershipRoleTemporaryMode,
              membershipRoleTemporaryRange,
              membershipRoleTemporaryAccessEndTime,
              membershipRoleTemporaryAccessStartTime,
              membershipRoleCreatedAt,
              membershipRoleUpdatedAt
            }) => ({
              id: membershipRoleId,
              role: membershipRole,
              permissions: customRolePermission,
              customRoleSlug: roleSlug,
              temporaryRange: membershipRoleTemporaryRange,
              temporaryMode: membershipRoleTemporaryMode,
              temporaryAccessStartTime: membershipRoleTemporaryAccessStartTime,
              temporaryAccessEndTime: membershipRoleTemporaryAccessEndTime,
              isTemporary: membershipRoleIsTemporary,
              createdAt: membershipRoleCreatedAt,
              updatedAt: membershipRoleUpdatedAt
            })
          },
          {
            key: "metadataId",
            label: "metadata" as const,
            mapper: ({ metadataKey, metadataValue, metadataId }) => ({
              id: metadataId,
              key: metadataKey,
              value: metadataValue
            })
          }
        ]
      });

      return userPermissions
        .map((userPermission) => {
          if (!userPermission) return undefined;
          if (!userPermission?.roles?.[0]) return undefined;

          // when introducting cron mode change it here
          const activeRoles =
            userPermission?.roles?.filter(
              ({ isTemporary, temporaryAccessEndTime }) =>
                !isTemporary || (isTemporary && temporaryAccessEndTime && new Date() < temporaryAccessEndTime)
            ) ?? [];

          const activeAdditionalPrivileges =
            userPermission?.additionalPrivileges?.filter(
              ({ isTemporary, temporaryAccessEndTime }) =>
                !isTemporary || (isTemporary && temporaryAccessEndTime && new Date() < temporaryAccessEndTime)
            ) ?? [];

          return {
            ...userPermission,
            roles: activeRoles,
            additionalPrivileges: activeAdditionalPrivileges
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
    } catch (error) {
      throw new DatabaseError({ error, name: "GetProjectUserPermissions" });
    }
  };

  const getProjectIdentityPermissions: TPermissionDALFactory["getProjectIdentityPermissions"] = async (
    projectId: string,
    orgId: string
  ) => {
    try {
      const docs = await db
        .replicaNode()(TableName.Membership)
        .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .leftJoin(TableName.AdditionalPrivilege, (qb) => {
          qb.on(`${TableName.Membership}.actorIdentityId`, `${TableName.AdditionalPrivilege}.actorIdentityId`).andOn(
            `${TableName.Membership}.scopeOrgId`,
            `${TableName.AdditionalPrivilege}.orgId`
          );
        })
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.Membership}.actorIdentityId`)
        .leftJoin(TableName.IdentityMetadata, (queryBuilder) => {
          void queryBuilder.on(`${TableName.Membership}.actorIdentityId`, `${TableName.IdentityMetadata}.identityId`);
        })
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .whereNotNull(`${TableName.Membership}.actorIdentityId`)
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .where(`${TableName.Membership}.scopeProjectId`, projectId)
        .select(selectAllTableCols(TableName.MembershipRole))
        .select(
          db.ref("id").withSchema(TableName.Membership).as("membershipId"),
          db.ref("id").withSchema(TableName.Identity).as("identityId"),
          db.ref("name").withSchema(TableName.Identity).as("identityName"),
          db.ref("createdAt").withSchema(TableName.Membership).as("membershipCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.Membership).as("membershipUpdatedAt"),
          db.ref("slug").withSchema(TableName.Role).as("customRoleSlug"),
          db.ref("permissions").withSchema(TableName.Role),
          db.ref("id").withSchema(TableName.AdditionalPrivilege).as("identityApId"),
          db.ref("permissions").withSchema(TableName.AdditionalPrivilege).as("identityApPermissions"),
          db.ref("temporaryMode").withSchema(TableName.AdditionalPrivilege).as("identityApTemporaryMode"),
          db.ref("isTemporary").withSchema(TableName.AdditionalPrivilege).as("identityApIsTemporary"),
          db.ref("temporaryRange").withSchema(TableName.AdditionalPrivilege).as("identityApTemporaryRange"),
          db
            .ref("temporaryAccessStartTime")
            .withSchema(TableName.AdditionalPrivilege)
            .as("identityApTemporaryAccessStartTime"),
          db
            .ref("temporaryAccessEndTime")
            .withSchema(TableName.AdditionalPrivilege)
            .as("identityApTemporaryAccessEndTime"),
          db.ref("id").withSchema(TableName.IdentityMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.IdentityMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.IdentityMetadata).as("metadataValue")
        );

      const permissions = sqlNestRelationships({
        data: docs,
        key: "identityId",
        parentMapper: ({ membershipId, membershipCreatedAt, membershipUpdatedAt, identityName, identityId }) => ({
          id: membershipId,
          identityId,
          username: identityName,
          projectId,
          createdAt: membershipCreatedAt,
          updatedAt: membershipUpdatedAt,
          orgId,
          // just a prefilled value
          orgAuthEnforced: false
        }),
        childrenMapper: [
          {
            key: "id",
            label: "roles" as const,
            mapper: (data) =>
              MembershipRolesSchema.extend({
                permissions: z.unknown(),
                customRoleSlug: z.string().optional().nullable()
              }).parse(data)
          },
          {
            key: "identityApId",
            label: "additionalPrivileges" as const,
            mapper: ({
              identityApId,
              identityApPermissions,
              identityApIsTemporary,
              identityApTemporaryMode,
              identityApTemporaryRange,
              identityApTemporaryAccessEndTime,
              identityApTemporaryAccessStartTime
            }) => ({
              id: identityApId,
              permissions: identityApPermissions,
              temporaryRange: identityApTemporaryRange,
              temporaryMode: identityApTemporaryMode,
              temporaryAccessEndTime: identityApTemporaryAccessEndTime,
              temporaryAccessStartTime: identityApTemporaryAccessStartTime,
              isTemporary: identityApIsTemporary
            })
          },
          {
            key: "metadataId",
            label: "metadata" as const,
            mapper: ({ metadataKey, metadataValue, metadataId }) => ({
              id: metadataId,
              key: metadataKey,
              value: metadataValue
            })
          }
        ]
      });

      return permissions
        .map((permission) => {
          if (!permission) {
            return undefined;
          }

          // when introducting cron mode change it here
          const activeRoles = permission?.roles.filter(
            ({ isTemporary, temporaryAccessEndTime }) =>
              !isTemporary || (isTemporary && temporaryAccessEndTime && new Date() < temporaryAccessEndTime)
          );
          const activeAdditionalPrivileges = permission?.additionalPrivileges?.filter(
            ({ isTemporary, temporaryAccessEndTime }) =>
              !isTemporary || (isTemporary && temporaryAccessEndTime && new Date() < temporaryAccessEndTime)
          );

          return { ...permission, roles: activeRoles, additionalPrivileges: activeAdditionalPrivileges };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
    } catch (error) {
      throw new DatabaseError({ error, name: "GetProjectIdentityPermissions" });
    }
  };

  return {
    getProjectUserPermissions,
    getProjectIdentityPermissions,
    getProjectGroupPermissions,
    getPermission
  };
};
