import { TDbClient } from "@app/db";
import { TableName, TOrgMemberships } from "@app/db/schemas";

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

  return {
    getOrgPermission
  };
};
