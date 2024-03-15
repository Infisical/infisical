import { z } from "zod";

import { TDbClient } from "@app/db";
import { IdentityProjectMembershipRoleSchema, ProjectUserMembershipRolesSchema, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";

export type TPermissionDALFactory = ReturnType<typeof permissionDALFactory>;

export const permissionDALFactory = (db: TDbClient) => {
  const getOrgPermission = async (userId: string, orgId: string) => {
    try {
      const membership = await db(TableName.OrgMembership)
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
      const membership = await db(TableName.IdentityOrgMembership)
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
          `${TableName.ProjectUserAdditionalPrivilege}.projectMembershipId`,
          `${TableName.ProjectMembership}.id`
        )
        .join(TableName.Project, `${TableName.ProjectMembership}.projectId`, `${TableName.Project}.id`)
        .join(TableName.Organization, `${TableName.Project}.orgId`, `${TableName.Organization}.id`)
        .where("userId", userId)
        .where(`${TableName.ProjectMembership}.projectId`, projectId)
        .select(selectAllTableCols(TableName.ProjectUserMembershipRole))
        .select(
          db.ref("id").withSchema(TableName.ProjectMembership).as("membershipId"),
          // TODO(roll-forward-migration): remove this field when we drop this in next migration after a week
          db.ref("role").withSchema(TableName.ProjectMembership).as("oldRoleField"),
          db.ref("createdAt").withSchema(TableName.ProjectMembership).as("membershipCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.ProjectMembership).as("membershipUpdatedAt"),
          db.ref("authEnforced").withSchema(TableName.Organization).as("orgAuthEnforced"),
          db.ref("orgId").withSchema(TableName.Project),
          db.ref("slug").withSchema(TableName.ProjectRoles).as("customRoleSlug"),
          db.ref("permissions").withSchema(TableName.ProjectRoles),
          db.ref("id").withSchema(TableName.ProjectUserAdditionalPrivilege).as("userApId"),
          db.ref("permissions").withSchema(TableName.ProjectUserAdditionalPrivilege).as("userApPermissions"),
          db.ref("temporaryMode").withSchema(TableName.ProjectUserAdditionalPrivilege).as("userApTemporaryMode"),
          db.ref("isTemporary").withSchema(TableName.ProjectUserAdditionalPrivilege).as("userApIsTemporary"),
          db.ref("temporaryRange").withSchema(TableName.ProjectUserAdditionalPrivilege).as("userApTemporaryRange"),
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
        key: "membershipId",
        parentMapper: ({
          orgId,
          orgAuthEnforced,
          membershipId,
          membershipCreatedAt,
          membershipUpdatedAt,
          oldRoleField
        }) => ({
          orgId,
          orgAuthEnforced,
          userId,
          role: oldRoleField,
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
      // when introducting cron mode change it here
      const activeRoles = permission?.[0]?.roles?.filter(
        ({ isTemporary, temporaryAccessEndTime }) =>
          !isTemporary || (isTemporary && temporaryAccessEndTime && new Date() < temporaryAccessEndTime)
      );

      const activeAdditionalPrivileges = permission?.[0]?.additionalPrivileges?.filter(
        ({ isTemporary, temporaryAccessEndTime }) =>
          !isTemporary || (isTemporary && temporaryAccessEndTime && new Date() < temporaryAccessEndTime)
      );

      return permission?.[0]
        ? { ...permission[0], roles: activeRoles, additionalPrivileges: activeAdditionalPrivileges }
        : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "GetProjectPermission" });
    }
  };

  const getProjectIdentityPermission = async (identityId: string, projectId: string) => {
    try {
      const docs = await db(TableName.IdentityProjectMembership)
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
          db.ref("role").withSchema(TableName.IdentityProjectMembership).as("oldRoleField"),
          db.ref("createdAt").withSchema(TableName.IdentityProjectMembership).as("membershipCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.IdentityProjectMembership).as("membershipUpdatedAt"),
          db.ref("slug").withSchema(TableName.ProjectRoles).as("customRoleSlug")
        )
        .select("permissions");

      const permission = sqlNestRelationships({
        data: docs,
        key: "membershipId",
        parentMapper: ({ membershipId, membershipCreatedAt, membershipUpdatedAt, oldRoleField, orgId }) => ({
          id: membershipId,
          identityId,
          projectId,
          role: oldRoleField,
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
          }
        ]
      });

      // when introducting cron mode change it here
      const activeRoles = permission?.[0]?.roles.filter(
        ({ isTemporary, temporaryAccessEndTime }) =>
          !isTemporary || (isTemporary && temporaryAccessEndTime && new Date() < temporaryAccessEndTime)
      );
      return permission?.[0] ? { ...permission[0], roles: activeRoles } : undefined;
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
