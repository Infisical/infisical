import { z } from "zod";

import { TDbClient } from "@app/db";
import {
  IdentityProjectMembershipRoleSchema,
  OrgMembershipsSchema,
  TableName,
  TProjectRoles,
  TProjects
} from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";

export type TPermissionDALFactory = ReturnType<typeof permissionDALFactory>;

export const permissionDALFactory = (db: TDbClient) => {
  const getOrgPermission = async (userId: string, orgId: string) => {
    try {
      const groupSubQuery = db(TableName.Groups)
        .where(`${TableName.Groups}.orgId`, orgId)
        .join(TableName.UserGroupMembership, (queryBuilder) => {
          queryBuilder
            .on(`${TableName.UserGroupMembership}.groupId`, `${TableName.Groups}.id`)
            .andOn(`${TableName.UserGroupMembership}.userId`, db.raw("?", [userId]));
        })
        .leftJoin(TableName.OrgRoles, `${TableName.Groups}.roleId`, `${TableName.OrgRoles}.id`)
        .select(
          db.ref("id").withSchema(TableName.Groups).as("groupId"),
          db.ref("orgId").withSchema(TableName.Groups).as("groupOrgId"),
          db.ref("name").withSchema(TableName.Groups).as("groupName"),
          db.ref("slug").withSchema(TableName.Groups).as("groupSlug"),
          db.ref("role").withSchema(TableName.Groups).as("groupRole"),
          db.ref("roleId").withSchema(TableName.Groups).as("groupRoleId"),
          db.ref("createdAt").withSchema(TableName.Groups).as("groupCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.Groups).as("groupUpdatedAt"),
          db.ref("permissions").withSchema(TableName.OrgRoles).as("groupCustomRolePermission")
        );

      const membership = await db
        .replicaNode()(TableName.OrgMembership)
        .where(`${TableName.OrgMembership}.orgId`, orgId)
        .where(`${TableName.OrgMembership}.userId`, userId)
        .leftJoin(TableName.OrgRoles, `${TableName.OrgRoles}.id`, `${TableName.OrgMembership}.roleId`)
        .leftJoin<Awaited<typeof groupSubQuery>[0]>(
          groupSubQuery.as("userGroups"),
          "userGroups.groupOrgId",
          db.raw("?", [orgId])
        )
        .join(TableName.Organization, `${TableName.Organization}.id`, `${TableName.OrgMembership}.orgId`)
        .select(
          selectAllTableCols(TableName.OrgMembership),
          db.ref("slug").withSchema(TableName.OrgRoles).withSchema(TableName.OrgRoles).as("customRoleSlug"),
          db.ref("authEnforced").withSchema(TableName.Organization).as("orgAuthEnforced"),
          db.ref("groupId").withSchema("userGroups"),
          db.ref("groupOrgId").withSchema("userGroups"),
          db.ref("groupName").withSchema("userGroups"),
          db.ref("groupSlug").withSchema("userGroups"),
          db.ref("groupRole").withSchema("userGroups"),
          db.ref("groupRoleId").withSchema("userGroups"),
          db.ref("groupCreatedAt").withSchema("userGroups"),
          db.ref("groupUpdatedAt").withSchema("userGroups"),
          db.ref("groupCustomRolePermission").withSchema("userGroups")
        );

      const [formatedDoc] = sqlNestRelationships({
        data: membership,
        key: "id",
        parentMapper: (el) =>
          OrgMembershipsSchema.extend({
            permissions: z.unknown(),
            orgAuthEnforced: z.boolean().optional().nullable(),
            customRoleSlug: z.string().optional().nullable()
          }).parse(el),
        childrenMapper: [
          {
            key: "groupId",
            label: "groups" as const,
            mapper: ({
              groupId,
              groupUpdatedAt,
              groupCreatedAt,
              groupRole,
              groupRoleId,
              groupCustomRolePermission,
              groupName,
              groupSlug,
              groupOrgId
            }) => ({
              id: groupId,
              updatedAt: groupUpdatedAt,
              createdAt: groupCreatedAt,
              role: groupRole,
              roleId: groupRoleId,
              customRolePermission: groupCustomRolePermission,
              name: groupName,
              slug: groupSlug,
              orgId: groupOrgId
            })
          }
        ]
      });

      return formatedDoc;
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
      const docs = await db
        .replicaNode()(TableName.Users)
        .where(`${TableName.Users}.id`, userId)
        .leftJoin(TableName.UserGroupMembership, `${TableName.UserGroupMembership}.userId`, `${TableName.Users}.id`)
        .leftJoin(TableName.GroupProjectMembership, (queryBuilder) => {
          void queryBuilder
            .on(`${TableName.GroupProjectMembership}.projectId`, db.raw("?", [projectId]))
            .andOn(`${TableName.GroupProjectMembership}.groupId`, `${TableName.UserGroupMembership}.groupId`);
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
        .leftJoin(TableName.ProjectMembership, (queryBuilder) => {
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
        .select(
          db.ref("id").withSchema(TableName.Users).as("userId"),
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
          db.ref("authEnforced").withSchema(TableName.Organization).as("orgAuthEnforced"),
          db.ref("orgId").withSchema(TableName.Project),
          db.ref("id").withSchema(TableName.Project).as("projectId")
        );

      const [userPermission] = sqlNestRelationships({
        data: docs,
        key: "projectId",
        parentMapper: ({
          orgId,
          orgAuthEnforced,
          membershipId,
          groupMembershipId,
          membershipCreatedAt,
          groupMembershipCreatedAt,
          groupMembershipUpdatedAt,
          membershipUpdatedAt
        }) => ({
          orgId,
          orgAuthEnforced,
          userId,
          projectId,
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
            label: "projecMembershiptRoles" as const,
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
          }
        ]
      });

      if (!userPermission) return undefined;
      if (!userPermission?.userGroupRoles?.[0] && !userPermission?.projecMembershiptRoles?.[0]) return undefined;

      // when introducting cron mode change it here
      const activeRoles =
        userPermission?.projecMembershiptRoles?.filter(
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
