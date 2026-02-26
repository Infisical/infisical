import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export const nhiRemediationActionDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.NhiRemediationAction);

  const findByIdentityId = async (identityId: string) => {
    return db.replicaNode()(TableName.NhiRemediationAction).where({ identityId }).orderBy("createdAt", "desc");
  };

  const findByProjectId = async (projectId: string) => {
    return db.replicaNode()(TableName.NhiRemediationAction).where({ projectId }).orderBy("createdAt", "desc");
  };

  return { ...orm, findByIdentityId, findByProjectId };
};

export type TNhiRemediationActionDALFactory = ReturnType<typeof nhiRemediationActionDALFactory>;
