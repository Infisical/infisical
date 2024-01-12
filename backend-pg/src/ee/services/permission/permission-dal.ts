import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { selectAllTableCols } from "@app/lib/knex";

export type TPermissionDalFactory = ReturnType<typeof permissionDalFactory>;

export const permissionDalFactory = (db: TDbClient) => {
  const getOrgPermission = async (userId: string, orgId: string) => {
    try {
      const membership = await db(TableName.OrgMembership)
        .leftJoin(
          TableName.OrgRoles,
          `${TableName.OrgMembership}.roleId`,
          `${TableName.OrgRoles}.id`
        )
        .where("userId", userId)
        .where(`${TableName.OrgMembership}.orgId`, orgId)
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
        .leftJoin(
          TableName.OrgRoles,
          `${TableName.IdentityOrgMembership}.roleId`,
          `${TableName.OrgRoles}.id`
        )
        .where("identityId", identityId)
        .where(`${TableName.IdentityOrgMembership}.orgId`, orgId)
        .select(selectAllTableCols(TableName.IdentityOrgMembership))
        .select("permissions")
        .first();
      return membership;
    } catch (error) {
      throw new DatabaseError({ error, name: "GetOrgIdentityPermission" });
    }
  };

  const getProjectPermission = async (userId: string, projectId: string) => {
    try {
      const membership = await db(TableName.ProjectMembership)
        .leftJoin(
          TableName.ProjectRoles,
          `${TableName.ProjectMembership}.roleId`,
          `${TableName.ProjectRoles}.id`
        )
        .where("userId", userId)
        .where(`${TableName.ProjectMembership}.projectId`, projectId)
        .select(selectAllTableCols(TableName.ProjectMembership))
        .select("permissions")
        .first();

      return membership;
    } catch (error) {
      throw new DatabaseError({ error, name: "GetProjectPermission" });
    }
  };

  const getProjectIdentityPermission = async (identityId: string, projectId: string) => {
    try {
      const membership = await db(TableName.IdentityProjectMembership)
        .leftJoin(
          TableName.ProjectRoles,
          `${TableName.IdentityProjectMembership}.roleId`,
          `${TableName.ProjectRoles}.id`
        )
        .where("identityId", identityId)
        .where(`${TableName.IdentityProjectMembership}.projectId`, projectId)
        .select(selectAllTableCols(TableName.IdentityProjectMembership))
        .select("permissions")
        .first();
      return membership;
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
