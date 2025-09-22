import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TIdentityGroupMembershipDALFactory = ReturnType<typeof identityGroupMembershipDALFactory>;

export const identityGroupMembershipDALFactory = (db: TDbClient) => {
  const identityGroupMembershipOrm = ormify(db, TableName.IdentityGroupMembership);

  const findGroupMembershipsByIdentityIdInOrg = async (
    identityId: string,
    orgId: string
  ): Promise<
    Array<{
      id: string;
      groupId: string;
      groupName: string;
      identityOrgMembershipId: string;
      identityName: string;
    }>
  > => {
    try {
      const docs = await db
        .replicaNode()(TableName.IdentityGroupMembership)
        .join(TableName.Groups, `${TableName.IdentityGroupMembership}.groupId`, `${TableName.Groups}.id`)
        .join(
          TableName.IdentityOrgMembership,
          `${TableName.IdentityGroupMembership}.identityId`,
          `${TableName.IdentityOrgMembership}.identityId`
        )
        .join(TableName.Identity, `${TableName.IdentityGroupMembership}.identityId`, `${TableName.Identity}.id`)
        .where(`${TableName.Identity}.id`, identityId)
        .where(`${TableName.Groups}.orgId`, orgId)
        .select(
          db.ref("id").withSchema(TableName.IdentityGroupMembership),
          db.ref("groupId").withSchema(TableName.IdentityGroupMembership),
          db.ref("name").withSchema(TableName.Groups).as("groupName"),
          db.ref("id").withSchema(TableName.IdentityOrgMembership).as("identityOrgMembershipId"),
          db.ref("name").withSchema(TableName.Identity).as("identityName")
        );
      return docs as Array<{
        id: string;
        groupId: string;
        groupName: string;
        identityOrgMembershipId: string;
        identityName: string;
      }>;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find group memberships by identity id in org" });
    }
  };

  const findGroupMembershipsByGroupIdInOrg = async (
    groupId: string,
    orgId: string
  ): Promise<
    Array<{
      id: string;
      groupId: string;
      groupName: string;
      identityOrgMembershipId: string;
      identityName: string;
    }>
  > => {
    try {
      const docs = await db
        .replicaNode()(TableName.IdentityGroupMembership)
        .join(TableName.Groups, `${TableName.IdentityGroupMembership}.groupId`, `${TableName.Groups}.id`)
        .join(
          TableName.IdentityOrgMembership,
          `${TableName.IdentityGroupMembership}.identityId`,
          `${TableName.IdentityOrgMembership}.identityId`
        )
        .join(TableName.Identity, `${TableName.IdentityGroupMembership}.identityId`, `${TableName.Identity}.id`)
        .where(`${TableName.Groups}.id`, groupId)
        .where(`${TableName.Groups}.orgId`, orgId)
        .select(
          db.ref("id").withSchema(TableName.IdentityGroupMembership),
          db.ref("groupId").withSchema(TableName.IdentityGroupMembership),
          db.ref("name").withSchema(TableName.Groups).as("groupName"),
          db.ref("id").withSchema(TableName.IdentityOrgMembership).as("identityOrgMembershipId"),
          db.ref("name").withSchema(TableName.Identity).as("identityName")
        );
      return docs as Array<{
        id: string;
        groupId: string;
        groupName: string;
        identityOrgMembershipId: string;
        identityName: string;
      }>;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find group memberships by group id in org" });
    }
  };

  const findIdentityGroupMembershipsInProject = async (
    projectId: string,
    tx?: Knex
  ): Promise<
    Array<{
      id: string;
      groupId: string;
      groupName: string;
      groupSlug: string;
      groupRole: string;
      identityName: string;
      identityId: string;
      projectRole: string;
      membershipRoleId: string;
      customRoleId: string | null;
      isTemporary: boolean;
      temporaryMode: string | null;
      temporaryRange: string | null;
      temporaryAccessStartTime: Date | null;
      temporaryAccessEndTime: Date | null;
      customRoleName: string | null;
      customRoleSlug: string | null;
    }>
  > => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.IdentityGroupMembership)
        .join(TableName.Groups, `${TableName.IdentityGroupMembership}.groupId`, `${TableName.Groups}.id`)
        .join(
          TableName.GroupProjectMembership,
          `${TableName.IdentityGroupMembership}.groupId`,
          `${TableName.GroupProjectMembership}.groupId`
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
        .join(TableName.Identity, `${TableName.IdentityGroupMembership}.identityId`, `${TableName.Identity}.id`)
        .where(`${TableName.GroupProjectMembership}.projectId`, projectId)
        .select(
          selectAllTableCols(TableName.IdentityGroupMembership),
          db.ref("name").withSchema(TableName.Groups).as("groupName"),
          db.ref("slug").withSchema(TableName.Groups).as("groupSlug"),
          db.ref("role").withSchema(TableName.Groups).as("groupRole"),
          db.ref("name").withSchema(TableName.Identity).as("identityName"),
          db.ref("id").withSchema(TableName.Identity).as("identityId"),
          db.ref("role").withSchema(TableName.GroupProjectMembershipRole).as("projectRole"),
          db.ref("id").withSchema(TableName.GroupProjectMembershipRole).as("membershipRoleId"),
          db.ref("customRoleId").withSchema(TableName.GroupProjectMembershipRole),
          db.ref("isTemporary").withSchema(TableName.GroupProjectMembershipRole),
          db.ref("temporaryMode").withSchema(TableName.GroupProjectMembershipRole),
          db.ref("temporaryRange").withSchema(TableName.GroupProjectMembershipRole),
          db.ref("temporaryAccessStartTime").withSchema(TableName.GroupProjectMembershipRole),
          db.ref("temporaryAccessEndTime").withSchema(TableName.GroupProjectMembershipRole),
          db.ref("name").withSchema(TableName.ProjectRoles).as("customRoleName"),
          db.ref("slug").withSchema(TableName.ProjectRoles).as("customRoleSlug")
        );
      return docs as Array<{
        id: string;
        groupId: string;
        groupName: string;
        groupSlug: string;
        groupRole: string;
        identityName: string;
        identityId: string;
        projectRole: string;
        membershipRoleId: string;
        customRoleId: string | null;
        isTemporary: boolean;
        temporaryMode: string | null;
        temporaryRange: string | null;
        temporaryAccessStartTime: Date | null;
        temporaryAccessEndTime: Date | null;
        customRoleName: string | null;
        customRoleSlug: string | null;
      }>;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find identity group memberships in project" });
    }
  };

  return {
    ...identityGroupMembershipOrm,
    findGroupMembershipsByIdentityIdInOrg,
    findGroupMembershipsByGroupIdInOrg,
    findIdentityGroupMembershipsInProject
  };
};
