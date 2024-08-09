import { z } from "zod";

import { TDbClient } from "@app/db";
import { IdentityProjectMembershipRoleSchema, ProjectUserMembershipRolesSchema, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";

export type TPermissionDALFactory = ReturnType<typeof permissionDALFactory>;

export const permissionDALFactory = (db: TDbClient) => {
  const getOrgPermission = async (userId: string, orgId: string) => {
    try {
      const membership = await db
        .replicaNode()(TableName.OrgMembership)
        .leftJoin(TableName.OrgRoles, `${TableName.OrgMembership}.roleId`, `${TableName.OrgRoles}.id`)
        .join(TableName.Organization, `${TableName.OrgMembership}.orgId`, `${TableName.Organization}.id`)
        .where("userId", userId)
        .where(`${TableName.OrgMembership}.orgId`, orgId)
        .select(db.ref("authEnforced").withSchema(TableName.Organization).as("orgAuthEnforced"))
        .select("permissions")
        .select(selectAllTableCols(TableName.OrgMembership))
        .first();

      return membership;
    } catch (error) {
      throw new DatabaseError({ error, name: "GetOrgPermission" });
    }
  };

  const getOrgIdentityPermission = async (identityId: string, orgId: string) => {
    try {
      const membership = await db
        .replicaNode()(TableName.IdentityOrgMembership)
        .leftJoin(TableName.OrgRoles, `${TableName.IdentityOrgMembership}.roleId`, `${TableName.OrgRoles}.id`)
        .join(TableName.Organization, `${TableName.IdentityOrgMembership}.orgId`, `${TableName.Organization}.id`)
        .where("identityId", identityId)
        .where(`${TableName.IdentityOrgMembership}.orgId`, orgId)
        .select(selectAllTableCols(TableName.IdentityOrgMembership))
        .select(db.ref("authEnforced").withSchema(TableName.Organization).as("orgAuthEnforced"))
        .select("permissions")
        .first();
      return membership;
    } catch (error) {
      throw new DatabaseError({ error, name: "GetOrgIdentityPermission" });
    }
  };

  const getProjectPermission = async (userId: string, projectId: string) => {
    try {
      const groups: string[] = await db
        .replicaNode()(TableName.GroupProjectMembership)
        .where(`${TableName.GroupProjectMembership}.projectId`, projectId)
        .pluck(`${TableName.GroupProjectMembership}.groupId`);

      const groupDocs = await db
        .replicaNode()(TableName.UserGroupMembership)
        .where(`${TableName.UserGroupMembership}.userId`, userId)
        .whereIn(`${TableName.UserGroupMembership}.groupId`, groups)
        .join(
          TableName.GroupProjectMembership,
          `${TableName.GroupProjectMembership}.groupId`,
          `${TableName.UserGroupMembership}.groupId`
        )
        .join(
          TableName.GroupProjectMembershipRole,
          `${TableName.GroupProjectMembershipRole}.projectMembershipId`,
          `${TableName.GroupProjectMembership}.id`
        )

        .leftJoin(
          TableName.ProjectRoles,
          `${TableName.GroupProjectMembershipRole}.customRoleId`,
          `${TableName.ProjectRoles}.id`
        )
        .join(TableName.Project, `${TableName.GroupProjectMembership}.projectId`, `${TableName.Project}.id`)
        .join(TableName.Organization, `${TableName.Project}.orgId`, `${TableName.Organization}.id`)

        .leftJoin(
          TableName.ProjectUserAdditionalPrivilege,
          `${TableName.GroupProjectMembership}.projectId`,
          `${TableName.Project}.id`
        )
        .select(selectAllTableCols(TableName.GroupProjectMembershipRole))
        .select(
          db.ref("id").withSchema(TableName.GroupProjectMembership).as("membershipId"),
          db.ref("createdAt").withSchema(TableName.GroupProjectMembership).as("membershipCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.GroupProjectMembership).as("membershipUpdatedAt"),
          db.ref("projectId").withSchema(TableName.GroupProjectMembership),
          db.ref("authEnforced").withSchema(TableName.Organization).as("orgAuthEnforced"),
          db.ref("orgId").withSchema(TableName.Project),
          db.ref("slug").withSchema(TableName.ProjectRoles).as("customRoleSlug"),

          db.ref("permissions").withSchema(TableName.ProjectRoles).as("permissions"),
          // db.ref("permissions").withSchema(TableName.ProjectUserAdditionalPrivilege).as("apPermissions")
          // Additional Privileges
          db.ref("id").withSchema(TableName.ProjectUserAdditionalPrivilege).as("userApId"),
          db.ref("permissions").withSchema(TableName.ProjectUserAdditionalPrivilege).as("userApPermissions"),
          db.ref("temporaryMode").withSchema(TableName.ProjectUserAdditionalPrivilege).as("userApTemporaryMode"),
          db.ref("isTemporary").withSchema(TableName.ProjectUserAdditionalPrivilege).as("userApIsTemporary"),
          db.ref("temporaryRange").withSchema(TableName.ProjectUserAdditionalPrivilege).as("userApTemporaryRange"),

          db.ref("projectId").withSchema(TableName.ProjectUserAdditionalPrivilege).as("userApProjectId"),
          db.ref("userId").withSchema(TableName.ProjectUserAdditionalPrivilege).as("userApUserId"),

          db
            .ref("temporaryAccessStartTime")
            .withSchema(TableName.ProjectUserAdditionalPrivilege)
            .as("userApTemporaryAccessStartTime"),
          db
            .ref("temporaryAccessEndTime")
            .withSchema(TableName.ProjectUserAdditionalPrivilege)
            .as("userApTemporaryAccessEndTime")
        );
      // .select(`${TableName.ProjectRoles}.permissions`);

      const docs = await db(TableName.ProjectMembership)
        .join(
          TableName.ProjectUserMembershipRole,
          `${TableName.ProjectUserMembershipRole}.projectMembershipId`,
          `${TableName.ProjectMembership}.id`
        )
        .leftJoin(
          TableName.ProjectRoles,
          `${TableName.ProjectUserMembershipRole}.customRoleId`,
          `${TableName.ProjectRoles}.id`
        )
        .leftJoin(
          TableName.ProjectUserAdditionalPrivilege,
          `${TableName.ProjectUserAdditionalPrivilege}.projectId`,
          `${TableName.ProjectMembership}.projectId`
        )

        .join(TableName.Project, `${TableName.ProjectMembership}.projectId`, `${TableName.Project}.id`)
        .join(TableName.Organization, `${TableName.Project}.orgId`, `${TableName.Organization}.id`)
        .where(`${TableName.ProjectMembership}.userId`, userId)
        .where(`${TableName.ProjectMembership}.projectId`, projectId)
        .select(selectAllTableCols(TableName.ProjectUserMembershipRole))
        .select(
          db.ref("id").withSchema(TableName.ProjectMembership).as("membershipId"),
          db.ref("createdAt").withSchema(TableName.ProjectMembership).as("membershipCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.ProjectMembership).as("membershipUpdatedAt"),
          db.ref("projectId").withSchema(TableName.ProjectMembership),
          db.ref("authEnforced").withSchema(TableName.Organization).as("orgAuthEnforced"),
          db.ref("orgId").withSchema(TableName.Project),
          db.ref("slug").withSchema(TableName.ProjectRoles).as("customRoleSlug"),
          db.ref("permissions").withSchema(TableName.ProjectRoles),
          db.ref("id").withSchema(TableName.ProjectUserAdditionalPrivilege).as("userApId"),
          db.ref("permissions").withSchema(TableName.ProjectUserAdditionalPrivilege).as("userApPermissions"),
          db.ref("temporaryMode").withSchema(TableName.ProjectUserAdditionalPrivilege).as("userApTemporaryMode"),
          db.ref("isTemporary").withSchema(TableName.ProjectUserAdditionalPrivilege).as("userApIsTemporary"),
          db.ref("temporaryRange").withSchema(TableName.ProjectUserAdditionalPrivilege).as("userApTemporaryRange"),

          db.ref("projectId").withSchema(TableName.ProjectUserAdditionalPrivilege).as("userApProjectId"),
          db.ref("userId").withSchema(TableName.ProjectUserAdditionalPrivilege).as("userApUserId"),

          db
            .ref("temporaryAccessStartTime")
            .withSchema(TableName.ProjectUserAdditionalPrivilege)
            .as("userApTemporaryAccessStartTime"),
          db
            .ref("temporaryAccessEndTime")
            .withSchema(TableName.ProjectUserAdditionalPrivilege)
            .as("userApTemporaryAccessEndTime")
        );

      const permission = sqlNestRelationships({
        data: docs,
        key: "projectId",
        parentMapper: ({ orgId, orgAuthEnforced, membershipId, membershipCreatedAt, membershipUpdatedAt }) => ({
          orgId,
          orgAuthEnforced,
          userId,
          id: membershipId,
          projectId,
          createdAt: membershipCreatedAt,
          updatedAt: membershipUpdatedAt
        }),
        childrenMapper: [
          {
            key: "id",
            label: "roles" as const,
            mapper: (data) =>
              ProjectUserMembershipRolesSchema.extend({
                permissions: z.unknown(),
                customRoleSlug: z.string().optional().nullable()
              }).parse(data)
          },
          {
            key: "userApId",
            label: "additionalPrivileges" as const,
            mapper: ({
              userApId,
              userApPermissions,
              userApIsTemporary,
              userApTemporaryMode,
              userApTemporaryRange,
              userApTemporaryAccessEndTime,
              userApTemporaryAccessStartTime
            }) => ({
              id: userApId,
              permissions: userApPermissions,
              temporaryRange: userApTemporaryRange,
              temporaryMode: userApTemporaryMode,
              temporaryAccessEndTime: userApTemporaryAccessEndTime,
              temporaryAccessStartTime: userApTemporaryAccessStartTime,
              isTemporary: userApIsTemporary
            })
          }
        ]
      });

      const groupPermission = groupDocs.length
        ? sqlNestRelationships({
            data: groupDocs,
            key: "projectId",
            parentMapper: ({ orgId, orgAuthEnforced, membershipId, membershipCreatedAt, membershipUpdatedAt }) => ({
              orgId,
              orgAuthEnforced,
              userId,
              id: membershipId,
              projectId,
              createdAt: membershipCreatedAt,
              updatedAt: membershipUpdatedAt
            }),
            childrenMapper: [
              {
                key: "id",
                label: "roles" as const,
                mapper: (data) =>
                  ProjectUserMembershipRolesSchema.extend({
                    permissions: z.unknown(),
                    customRoleSlug: z.string().optional().nullable()
                  }).parse(data)
              },
              {
                key: "userApId",
                label: "additionalPrivileges" as const,
                mapper: ({
                  userApId,
                  userApProjectId,
                  userApUserId,
                  userApPermissions,
                  userApIsTemporary,
                  userApTemporaryMode,
                  userApTemporaryRange,
                  userApTemporaryAccessEndTime,
                  userApTemporaryAccessStartTime
                }) => ({
                  id: userApId,
                  userId: userApUserId,
                  projectId: userApProjectId,
                  permissions: userApPermissions,
                  temporaryRange: userApTemporaryRange,
                  temporaryMode: userApTemporaryMode,
                  temporaryAccessEndTime: userApTemporaryAccessEndTime,
                  temporaryAccessStartTime: userApTemporaryAccessStartTime,
                  isTemporary: userApIsTemporary
                })
              }
            ]
          })
        : [];

      if (!permission?.[0] && !groupPermission[0]) return undefined;

      // when introducting cron mode change it here
      const activeRoles =
        permission?.[0]?.roles?.filter(
          ({ isTemporary, temporaryAccessEndTime }) =>
            !isTemporary || (isTemporary && temporaryAccessEndTime && new Date() < temporaryAccessEndTime)
        ) ?? [];

      const activeGroupRoles =
        groupPermission?.[0]?.roles?.filter(
          ({ isTemporary, temporaryAccessEndTime }) =>
            !isTemporary || (isTemporary && temporaryAccessEndTime && new Date() < temporaryAccessEndTime)
        ) ?? [];

      const activeAdditionalPrivileges =
        permission?.[0]?.additionalPrivileges?.filter(
          ({ isTemporary, temporaryAccessEndTime }) =>
            !isTemporary || (isTemporary && temporaryAccessEndTime && new Date() < temporaryAccessEndTime)
        ) ?? [];

      const activeGroupAdditionalPrivileges =
        groupPermission?.[0]?.additionalPrivileges?.filter(
          ({ isTemporary, temporaryAccessEndTime, userId: apUserId, projectId: apProjectId }) =>
            apProjectId === projectId &&
            apUserId === userId &&
            (!isTemporary || (isTemporary && temporaryAccessEndTime && new Date() < temporaryAccessEndTime))
        ) ?? [];

      return {
        ...(permission[0] || groupPermission[0]),
        roles: [...activeRoles, ...activeGroupRoles],
        additionalPrivileges: [...activeAdditionalPrivileges, ...activeGroupAdditionalPrivileges]
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "GetProjectPermission" });
    }
  };

  const getProjectIdentityPermission = async (identityId: string, projectId: string) => {
    try {
      const docs = await db
        .replicaNode()(TableName.IdentityProjectMembership)
        .join(
          TableName.IdentityProjectMembershipRole,
          `${TableName.IdentityProjectMembershipRole}.projectMembershipId`,
          `${TableName.IdentityProjectMembership}.id`
        )
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
        .where("identityId", identityId)
        .where(`${TableName.IdentityProjectMembership}.projectId`, projectId)
        .select(selectAllTableCols(TableName.IdentityProjectMembershipRole))
        .select(
          db.ref("id").withSchema(TableName.IdentityProjectMembership).as("membershipId"),
          db.ref("orgId").withSchema(TableName.Project).as("orgId"), // Now you can select orgId from Project
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
            .as("identityApTemporaryAccessEndTime")
        );

      const permission = sqlNestRelationships({
        data: docs,
        key: "membershipId",
        parentMapper: ({ membershipId, membershipCreatedAt, membershipUpdatedAt, orgId }) => ({
          id: membershipId,
          identityId,
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
          }
        ]
      });

      if (!permission?.[0]) return undefined;

      // when introducting cron mode change it here
      const activeRoles = permission?.[0]?.roles.filter(
        ({ isTemporary, temporaryAccessEndTime }) =>
          !isTemporary || (isTemporary && temporaryAccessEndTime && new Date() < temporaryAccessEndTime)
      );
      const activeAdditionalPrivileges = permission?.[0]?.additionalPrivileges?.filter(
        ({ isTemporary, temporaryAccessEndTime }) =>
          !isTemporary || (isTemporary && temporaryAccessEndTime && new Date() < temporaryAccessEndTime)
      );

      return { ...permission[0], roles: activeRoles, additionalPrivileges: activeAdditionalPrivileges };
    } catch (error) {
      throw new DatabaseError({ error, name: "GetProjectIdentityPermission" });
    }
  };

  return {
    getOrgPermission,
    getOrgIdentityPermission,
    getProjectPermission,
    getProjectIdentityPermission
  };
};
