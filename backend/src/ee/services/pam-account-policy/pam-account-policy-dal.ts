import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TPamAccountPolicyDALFactory = ReturnType<typeof pamAccountPolicyDALFactory>;

export const pamAccountPolicyDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamAccountPolicy);

  const findByProjectId = async (projectId: string, search?: string) => {
    const query = db.replicaNode()(TableName.PamAccountPolicy).where({ projectId }).orderBy("createdAt", "desc");

    if (search) {
      void query.whereILike("name", `%${search}%`);
    }

    return query;
  };

  return {
    ...orm,
    findByProjectId
  };
};
