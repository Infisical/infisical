import { TDbClient } from "@app/db";
import { TableName, TSandboxes } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSandboxDALFactory = ReturnType<typeof sandboxDALFactory>;

export const sandboxDALFactory = (db: TDbClient) => {
  const sandboxOrm = ormify(db, TableName.Sandbox);

  const findByOrg = async (orgId: string): Promise<TSandboxes[]> =>
    db.replicaNode()(TableName.Sandbox).where({ orgId }).orderBy("createdAt", "desc").select("*");

  /** Everything `infisical pam db access` needs: it addresses accounts by name, not by id. */
  const findPamAccountTargets = async (accountIds: string[]) => {
    if (!accountIds.length) return [];

    return db
      .replicaNode()(TableName.PamAccount)
      .join(TableName.PamResource, `${TableName.PamResource}.id`, `${TableName.PamAccount}.resourceId`)
      .whereIn(`${TableName.PamAccount}.id`, accountIds)
      .select(
        db.ref("id").withSchema(TableName.PamAccount).as("accountId"),
        db.ref("name").withSchema(TableName.PamAccount).as("accountName"),
        db.ref("projectId").withSchema(TableName.PamAccount).as("projectId"),
        db.ref("name").withSchema(TableName.PamResource).as("resourceName"),
        db.ref("resourceType").withSchema(TableName.PamResource).as("resourceType")
      );
  };

  return { ...sandboxOrm, findByOrg, findPamAccountTargets };
};
