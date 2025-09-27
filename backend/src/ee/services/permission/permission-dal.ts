import { Knex } from "knex";
import { z } from "zod";

import { TDbClient } from "@app/db";
import {
  AccessScope,
  AccessScopeData,
  IdentityProjectMembershipRoleSchema,
  MembershipsSchema,
  TableName,
  TMemberships,
  TProjectRoles,
  TProjects
} from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { ActorType } from "@app/services/auth/auth-type";

interface TPermissionDataReturn extends TMemberships {
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
  getProjectUserPermissions: (projectId: string) => Promise<
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
      orgId: string;
      orgAuthEnforced: boolean | null | undefined;
      userId: string;
      projectId: string;
      username: string;
      projectType?: string | null;
      id: string;
      createdAt: Date;
      updatedAt: Date;
      metadata: {
        id: string;
        key: string;
        value: string;
      }[];
      userGroupRoles: {
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
      projectMembershipRoles: {
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
  getProjectIdentityPermissions: (projectId: string) => Promise<
    {
      roles: {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        isTemporary: boolean;
        role: string;
        projectMembershipId: string;
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
      projectType?: string | null;
      orgAuthEnforced: boolean;
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
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .leftJoin(
          TableName.AdditionalPrivilege,
          `${TableName.Membership}.id`,
          `${TableName.AdditionalPrivilege}.membershipId`
        )
        .leftJoin(TableName.IdentityMetadata, (queryBuilder) => {
          if (actorType === ActorType.USER) {
            void queryBuilder
              .on(`${TableName.Membership}.actorUserId`, `${TableName.IdentityMetadata}.userId`)
              .andOn(`${TableName.Membership}.scopeOrgId`, `${TableName.IdentityMetadata}.orgId`);
          } else if (actorType === ActorType.IDENTITY) {
            void queryBuilder
              .on(`${TableName.Membership}.actorIdentityId`, `${TableName.IdentityMetadata}.identityId`)
              .andOn(`${TableName.Membership}.scopeOrgId`, `${TableName.IdentityMetadata}.orgId`);
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

          if (scopeData.scope === AccessScope.Organization) {
            void qb.where(`${TableName.Membership}.scope`, AccessScope.Organization);
          } else if (scopeData.scope === AccessScope.Namespace) {
            void qb
              .where(`${TableName.Membership}.scope`, AccessScope.Namespace)
              .where(`${TableName.Membership}.scopeNamespaceId`, scopeData.namespaceId)
              .whereNull(`${TableName.Membership}.scopeNamespaceId`);
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
          db.ref("value").withSchema(TableName.IdentityMetadata).as("metadataValue")
        );

      const data = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) => MembershipsSchema.parse(el),
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
        .replicaNode()(TableName.GroupProjectMembership)
        .join(TableName.Groups, `${TableName.Groups}.id`, `${TableName.GroupProjectMembership}.groupId`)
        .join(
          TableName.GroupProjectMembershipRole,
          `${TableName.GroupProjectMembershipRole}.projectMembershipId`,
          `${TableName.GroupProjectMembership}.id`
        )
        .leftJoin<TProjectRoles>(
          { groupCustomRoles: TableName.ProjectRoles },
          `${TableName.GroupProjectMembershipRole}.customRoleId`,
          `groupCustomRoles.id`
        )
        .where(`${TableName.GroupProjectMembership}.projectId`, "=", projectId)
        .where((bd) => {
          if (filterGroupId) {
            void bd.where(`${TableName.GroupProjectMembership}.groupId`, "=", filterGroupId);
          }
        })
        .select(
          db.ref("id").withSchema(TableName.GroupProjectMembership).as("membershipId"),
          db.ref("id").withSchema(TableName.Groups).as("groupId"),
          db.ref("name").withSchema(TableName.Groups).as("groupName"),
          db.ref("slug").withSchema("groupCustomRoles").as("groupProjectMembershipRoleCustomRoleSlug"),
          db.ref("permissions").withSchema("groupCustomRoles").as("groupProjectMembershipRolePermission"),
          db.ref("id").withSchema(TableName.GroupProjectMembershipRole).as("groupProjectMembershipRoleId"),
          db.ref("role").withSchema(TableName.GroupProjectMembershipRole).as("groupProjectMembershipRole"),
          db
            .ref("customRoleId")
            .withSchema(TableName.GroupProjectMembershipRole)
            .as("groupProjectMembershipRoleCustomRoleId"),
          db
            .ref("isTemporary")
            .withSchema(TableName.GroupProjectMembershipRole)
            .as("groupProjectMembershipRoleIsTemporary"),
          db
            .ref("temporaryMode")
            .withSchema(TableName.GroupProjectMembershipRole)
            .as("groupProjectMembershipRoleTemporaryMode"),
          db
            .ref("temporaryRange")
            .withSchema(TableName.GroupProjectMembershipRole)
            .as("groupProjectMembershipRoleTemporaryRange"),
          db
            .ref("temporaryAccessStartTime")
            .withSchema(TableName.GroupProjectMembershipRole)
            .as("groupProjectMembershipRoleTemporaryAccessStartTime"),
          db
            .ref("temporaryAccessEndTime")
            .withSchema(TableName.GroupProjectMembershipRole)
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

  const getProjectUserPermissions: TPermissionDALFactory["getProjectUserPermissions"] = async (projectId: string) => {
    try {
      const docs = await db
        .replicaNode()(TableName.Users)
        .where("isGhost", "=", false)
        .leftJoin(TableName.GroupProjectMembership, (queryBuilder) => {
          void queryBuilder.on(`${TableName.GroupProjectMembership}.projectId`, db.raw("?", [projectId]));
        })
        .leftJoin(
          TableName.GroupProjectMembershipRole,
          `${TableName.GroupProjectMembershipRole}.projectMembershipId`,
          `${TableName.GroupProjectMembership}.id`
        )
        .leftJoin<TProjectRoles>(
          { groupCustomRoles: TableName.ProjectRoles },
          `${TableName.GroupProjectMembershipRole}.customRoleId`,
          `groupCustomRoles.id`
        )
        .join(TableName.ProjectMembership, (queryBuilder) => {
          void queryBuilder
            .on(`${TableName.ProjectMembership}.projectId`, db.raw("?", [projectId]))
            .andOn(`${TableName.ProjectMembership}.userId`, `${TableName.Users}.id`);
        })
        .leftJoin(
          TableName.ProjectUserMembershipRole,
          `${TableName.ProjectUserMembershipRole}.projectMembershipId`,
          `${TableName.ProjectMembership}.id`
        )
        .leftJoin(
          TableName.ProjectRoles,
          `${TableName.ProjectUserMembershipRole}.customRoleId`,
          `${TableName.ProjectRoles}.id`
        )
        .leftJoin(TableName.ProjectUserAdditionalPrivilege, (queryBuilder) => {
          void queryBuilder
            .on(`${TableName.ProjectUserAdditionalPrivilege}.projectId`, db.raw("?", [projectId]))
            .andOn(`${TableName.ProjectUserAdditionalPrivilege}.userId`, `${TableName.Users}.id`);
        })
        .join<TProjects>(TableName.Project, `${TableName.Project}.id`, db.raw("?", [projectId]))
        .join(TableName.Organization, `${TableName.Project}.orgId`, `${TableName.Organization}.id`)
        .leftJoin(TableName.IdentityMetadata, (queryBuilder) => {
          void queryBuilder
            .on(`${TableName.Users}.id`, `${TableName.IdentityMetadata}.userId`)
            .andOn(`${TableName.Organization}.id`, `${TableName.IdentityMetadata}.orgId`);
        })
        .select(
          db.ref("id").withSchema(TableName.Users).as("userId"),
          db.ref("username").withSchema(TableName.Users).as("username"),
          // groups specific
          db.ref("id").withSchema(TableName.GroupProjectMembership).as("groupMembershipId"),
          db.ref("createdAt").withSchema(TableName.GroupProjectMembership).as("groupMembershipCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.GroupProjectMembership).as("groupMembershipUpdatedAt"),
          db.ref("slug").withSchema("groupCustomRoles").as("userGroupProjectMembershipRoleCustomRoleSlug"),
          db.ref("permissions").withSchema("groupCustomRoles").as("userGroupProjectMembershipRolePermission"),
          db.ref("id").withSchema(TableName.GroupProjectMembershipRole).as("userGroupProjectMembershipRoleId"),
          db.ref("role").withSchema(TableName.GroupProjectMembershipRole).as("userGroupProjectMembershipRole"),
          db
            .ref("customRoleId")
            .withSchema(TableName.GroupProjectMembershipRole)
            .as("userGroupProjectMembershipRoleCustomRoleId"),
          db
            .ref("isTemporary")
            .withSchema(TableName.GroupProjectMembershipRole)
            .as("userGroupProjectMembershipRoleIsTemporary"),
          db
            .ref("temporaryMode")
            .withSchema(TableName.GroupProjectMembershipRole)
            .as("userGroupProjectMembershipRoleTemporaryMode"),
          db
            .ref("temporaryRange")
            .withSchema(TableName.GroupProjectMembershipRole)
            .as("userGroupProjectMembershipRoleTemporaryRange"),
          db
            .ref("temporaryAccessStartTime")
            .withSchema(TableName.GroupProjectMembershipRole)
            .as("userGroupProjectMembershipRoleTemporaryAccessStartTime"),
          db
            .ref("temporaryAccessEndTime")
            .withSchema(TableName.GroupProjectMembershipRole)
            .as("userGroupProjectMembershipRoleTemporaryAccessEndTime"),
          // user specific
          db.ref("id").withSchema(TableName.ProjectMembership).as("membershipId"),
          db.ref("createdAt").withSchema(TableName.ProjectMembership).as("membershipCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.ProjectMembership).as("membershipUpdatedAt"),
          db.ref("slug").withSchema(TableName.ProjectRoles).as("userProjectMembershipRoleCustomRoleSlug"),
          db.ref("permissions").withSchema(TableName.ProjectRoles).as("userProjectCustomRolePermission"),
          db.ref("id").withSchema(TableName.ProjectUserMembershipRole).as("userProjectMembershipRoleId"),
          db.ref("role").withSchema(TableName.ProjectUserMembershipRole).as("userProjectMembershipRole"),
          db
            .ref("temporaryMode")
            .withSchema(TableName.ProjectUserMembershipRole)
            .as("userProjectMembershipRoleTemporaryMode"),
          db
            .ref("isTemporary")
            .withSchema(TableName.ProjectUserMembershipRole)
            .as("userProjectMembershipRoleIsTemporary"),
          db
            .ref("temporaryRange")
            .withSchema(TableName.ProjectUserMembershipRole)
            .as("userProjectMembershipRoleTemporaryRange"),
          db
            .ref("temporaryAccessStartTime")
            .withSchema(TableName.ProjectUserMembershipRole)
            .as("userProjectMembershipRoleTemporaryAccessStartTime"),
          db
            .ref("temporaryAccessEndTime")
            .withSchema(TableName.ProjectUserMembershipRole)
            .as("userProjectMembershipRoleTemporaryAccessEndTime"),
          db.ref("id").withSchema(TableName.ProjectUserAdditionalPrivilege).as("userAdditionalPrivilegesId"),
          db
            .ref("permissions")
            .withSchema(TableName.ProjectUserAdditionalPrivilege)
            .as("userAdditionalPrivilegesPermissions"),
          db
            .ref("temporaryMode")
            .withSchema(TableName.ProjectUserAdditionalPrivilege)
            .as("userAdditionalPrivilegesTemporaryMode"),
          db
            .ref("isTemporary")
            .withSchema(TableName.ProjectUserAdditionalPrivilege)
            .as("userAdditionalPrivilegesIsTemporary"),
          db
            .ref("temporaryRange")
            .withSchema(TableName.ProjectUserAdditionalPrivilege)
            .as("userAdditionalPrivilegesTemporaryRange"),
          db.ref("userId").withSchema(TableName.ProjectUserAdditionalPrivilege).as("userAdditionalPrivilegesUserId"),
          db
            .ref("temporaryAccessStartTime")
            .withSchema(TableName.ProjectUserAdditionalPrivilege)
            .as("userAdditionalPrivilegesTemporaryAccessStartTime"),
          db
            .ref("temporaryAccessEndTime")
            .withSchema(TableName.ProjectUserAdditionalPrivilege)
            .as("userAdditionalPrivilegesTemporaryAccessEndTime"),
          // general
          db.ref("id").withSchema(TableName.IdentityMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.IdentityMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.IdentityMetadata).as("metadataValue"),
          db.ref("authEnforced").withSchema(TableName.Organization).as("orgAuthEnforced"),
          db.ref("orgId").withSchema(TableName.Project),
          db.ref("type").withSchema(TableName.Project).as("projectType"),
          db.ref("id").withSchema(TableName.Project).as("projectId")
        );

      const userPermissions = sqlNestRelationships({
        data: docs,
        key: "userId",
        parentMapper: ({
          orgId,
          username,
          orgAuthEnforced,
          membershipId,
          groupMembershipId,
          membershipCreatedAt,
          groupMembershipCreatedAt,
          groupMembershipUpdatedAt,
          membershipUpdatedAt,
          projectType,
          userId
        }) => ({
          orgId,
          orgAuthEnforced,
          userId,
          projectId,
          username,
          projectType,
          id: membershipId || groupMembershipId,
          createdAt: membershipCreatedAt || groupMembershipCreatedAt,
          updatedAt: membershipUpdatedAt || groupMembershipUpdatedAt
        }),
        childrenMapper: [
          {
            key: "userGroupProjectMembershipRoleId",
            label: "userGroupRoles" as const,
            mapper: ({
              userGroupProjectMembershipRoleId,
              userGroupProjectMembershipRole,
              userGroupProjectMembershipRolePermission,
              userGroupProjectMembershipRoleCustomRoleSlug,
              userGroupProjectMembershipRoleIsTemporary,
              userGroupProjectMembershipRoleTemporaryMode,
              userGroupProjectMembershipRoleTemporaryAccessEndTime,
              userGroupProjectMembershipRoleTemporaryAccessStartTime,
              userGroupProjectMembershipRoleTemporaryRange
            }) => ({
              id: userGroupProjectMembershipRoleId,
              role: userGroupProjectMembershipRole,
              customRoleSlug: userGroupProjectMembershipRoleCustomRoleSlug,
              permissions: userGroupProjectMembershipRolePermission,
              temporaryRange: userGroupProjectMembershipRoleTemporaryRange,
              temporaryMode: userGroupProjectMembershipRoleTemporaryMode,
              temporaryAccessStartTime: userGroupProjectMembershipRoleTemporaryAccessStartTime,
              temporaryAccessEndTime: userGroupProjectMembershipRoleTemporaryAccessEndTime,
              isTemporary: userGroupProjectMembershipRoleIsTemporary
            })
          },
          {
            key: "userProjectMembershipRoleId",
            label: "projectMembershipRoles" as const,
            mapper: ({
              userProjectMembershipRoleId,
              userProjectMembershipRole,
              userProjectCustomRolePermission,
              userProjectMembershipRoleIsTemporary,
              userProjectMembershipRoleTemporaryMode,
              userProjectMembershipRoleTemporaryRange,
              userProjectMembershipRoleTemporaryAccessEndTime,
              userProjectMembershipRoleTemporaryAccessStartTime,
              userProjectMembershipRoleCustomRoleSlug
            }) => ({
              id: userProjectMembershipRoleId,
              role: userProjectMembershipRole,
              customRoleSlug: userProjectMembershipRoleCustomRoleSlug,
              permissions: userProjectCustomRolePermission,
              temporaryRange: userProjectMembershipRoleTemporaryRange,
              temporaryMode: userProjectMembershipRoleTemporaryMode,
              temporaryAccessStartTime: userProjectMembershipRoleTemporaryAccessStartTime,
              temporaryAccessEndTime: userProjectMembershipRoleTemporaryAccessEndTime,
              isTemporary: userProjectMembershipRoleIsTemporary
            })
          },
          {
            key: "userAdditionalPrivilegesId",
            label: "additionalPrivileges" as const,
            mapper: ({
              userAdditionalPrivilegesId,
              userAdditionalPrivilegesPermissions,
              userAdditionalPrivilegesIsTemporary,
              userAdditionalPrivilegesTemporaryMode,
              userAdditionalPrivilegesTemporaryRange,
              userAdditionalPrivilegesTemporaryAccessEndTime,
              userAdditionalPrivilegesTemporaryAccessStartTime
            }) => ({
              id: userAdditionalPrivilegesId,
              permissions: userAdditionalPrivilegesPermissions,
              temporaryRange: userAdditionalPrivilegesTemporaryRange,
              temporaryMode: userAdditionalPrivilegesTemporaryMode,
              temporaryAccessStartTime: userAdditionalPrivilegesTemporaryAccessStartTime,
              temporaryAccessEndTime: userAdditionalPrivilegesTemporaryAccessEndTime,
              isTemporary: userAdditionalPrivilegesIsTemporary
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
          if (!userPermission?.userGroupRoles?.[0] && !userPermission?.projectMembershipRoles?.[0]) return undefined;

          // when introducting cron mode change it here
          const activeRoles =
            userPermission?.projectMembershipRoles?.filter(
              ({ isTemporary, temporaryAccessEndTime }) =>
                !isTemporary || (isTemporary && temporaryAccessEndTime && new Date() < temporaryAccessEndTime)
            ) ?? [];

          const activeGroupRoles =
            userPermission?.userGroupRoles?.filter(
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
            roles: [...activeRoles, ...activeGroupRoles],
            additionalPrivileges: activeAdditionalPrivileges
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
    } catch (error) {
      throw new DatabaseError({ error, name: "GetProjectUserPermissions" });
    }
  };

  const getProjectIdentityPermissions: TPermissionDALFactory["getProjectIdentityPermissions"] = async (
    projectId: string
  ) => {
    try {
      const docs = await db
        .replicaNode()(TableName.IdentityProjectMembership)
        .join(
          TableName.IdentityProjectMembershipRole,
          `${TableName.IdentityProjectMembershipRole}.projectMembershipId`,
          `${TableName.IdentityProjectMembership}.id`
        )
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.IdentityProjectMembership}.identityId`)
        .leftJoin(
          TableName.ProjectRoles,
          `${TableName.IdentityProjectMembershipRole}.customRoleId`,
          `${TableName.ProjectRoles}.id`
        )
        .leftJoin(
          TableName.IdentityProjectAdditionalPrivilege,
          `${TableName.IdentityProjectAdditionalPrivilege}.projectMembershipId`,
          `${TableName.IdentityProjectMembership}.id`
        )
        .join(
          // Join the Project table to later select orgId
          TableName.Project,
          `${TableName.IdentityProjectMembership}.projectId`,
          `${TableName.Project}.id`
        )
        .leftJoin(TableName.IdentityMetadata, (queryBuilder) => {
          void queryBuilder
            .on(`${TableName.Identity}.id`, `${TableName.IdentityMetadata}.identityId`)
            .andOn(`${TableName.Project}.orgId`, `${TableName.IdentityMetadata}.orgId`);
        })
        .where(`${TableName.IdentityProjectMembership}.projectId`, projectId)
        .select(selectAllTableCols(TableName.IdentityProjectMembershipRole))
        .select(
          db.ref("id").withSchema(TableName.IdentityProjectMembership).as("membershipId"),
          db.ref("id").withSchema(TableName.Identity).as("identityId"),
          db.ref("name").withSchema(TableName.Identity).as("identityName"),
          db.ref("orgId").withSchema(TableName.Project).as("orgId"), // Now you can select orgId from Project
          db.ref("type").withSchema(TableName.Project).as("projectType"),
          db.ref("createdAt").withSchema(TableName.IdentityProjectMembership).as("membershipCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.IdentityProjectMembership).as("membershipUpdatedAt"),
          db.ref("slug").withSchema(TableName.ProjectRoles).as("customRoleSlug"),
          db.ref("permissions").withSchema(TableName.ProjectRoles),
          db.ref("id").withSchema(TableName.IdentityProjectAdditionalPrivilege).as("identityApId"),
          db.ref("permissions").withSchema(TableName.IdentityProjectAdditionalPrivilege).as("identityApPermissions"),
          db
            .ref("temporaryMode")
            .withSchema(TableName.IdentityProjectAdditionalPrivilege)
            .as("identityApTemporaryMode"),
          db.ref("isTemporary").withSchema(TableName.IdentityProjectAdditionalPrivilege).as("identityApIsTemporary"),
          db
            .ref("temporaryRange")
            .withSchema(TableName.IdentityProjectAdditionalPrivilege)
            .as("identityApTemporaryRange"),
          db
            .ref("temporaryAccessStartTime")
            .withSchema(TableName.IdentityProjectAdditionalPrivilege)
            .as("identityApTemporaryAccessStartTime"),
          db
            .ref("temporaryAccessEndTime")
            .withSchema(TableName.IdentityProjectAdditionalPrivilege)
            .as("identityApTemporaryAccessEndTime"),
          db.ref("id").withSchema(TableName.IdentityMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.IdentityMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.IdentityMetadata).as("metadataValue")
        );

      const permissions = sqlNestRelationships({
        data: docs,
        key: "identityId",
        parentMapper: ({
          membershipId,
          membershipCreatedAt,
          membershipUpdatedAt,
          orgId,
          identityName,
          projectType,
          identityId
        }) => ({
          id: membershipId,
          identityId,
          username: identityName,
          projectId,
          createdAt: membershipCreatedAt,
          updatedAt: membershipUpdatedAt,
          orgId,
          projectType,
          // just a prefilled value
          orgAuthEnforced: false
        }),
        childrenMapper: [
          {
            key: "id",
            label: "roles" as const,
            mapper: (data) =>
              IdentityProjectMembershipRoleSchema.extend({
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
