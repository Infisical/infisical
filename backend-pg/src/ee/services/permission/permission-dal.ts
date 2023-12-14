import { TDbClient } from "@app/db";
import { TableName, TOrgMemberships, TProjectMemberships } from "@app/db/schemas";

export type TPermissionDalFactory = ReturnType<typeof permissionDalFactory>;

export const permissionDalFactory = (db: TDbClient) => {
  const getOrgPermission = async (
    userId: string,
    orgId: string
  ): Promise<(TOrgMemberships & { permissions: string }) | undefined> => {
    const membership = await db(TableName.OrgMembership)
      .leftJoin(TableName.OrgRoles, `${TableName.OrgMembership}.roleId`, `${TableName.OrgRoles}.id`)
      .where("userId", userId)
      .where(`${TableName.OrgMembership}.orgId`, orgId)
      .select(`${TableName.OrgMembership}.*`, "permissions")
      .first();

    return membership;
  };

  const getProjectPermission = async (
    userId: string,
    projectId: string
  ): Promise<(TProjectMemberships & { permissions: string }) | undefined> => {
    const membership = await db(TableName.ProjectMembership)
      .leftJoin(
        TableName.ProjectRoles,
        `${TableName.ProjectMembership}.roleId`,
        `${TableName.ProjectRoles}.id`
      )
      .where("userId", userId)
      .where(`${TableName.ProjectMembership}.projectId`, projectId)
      .select(`${TableName.ProjectMembership}.*`, "permissions")
      .first();

    return membership;
  };

  return {
    getOrgPermission,
    getProjectPermission
  };
};
