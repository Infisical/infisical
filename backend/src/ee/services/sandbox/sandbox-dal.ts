import { TDbClient } from "@app/db";
import { TableName, TSandboxes } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSandboxDALFactory = ReturnType<typeof sandboxDALFactory>;

export const sandboxDALFactory = (db: TDbClient) => {
  const sandboxOrm = ormify(db, TableName.Sandbox);

  const findByOrg = async (orgId: string): Promise<TSandboxes[]> =>
    db.replicaNode()(TableName.Sandbox).where({ orgId }).orderBy("createdAt", "desc").select("*");

  return { ...sandboxOrm, findByOrg };
};
