import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TUserAuthenticationDALFactory = ReturnType<typeof userAuthenticationDALFactory>;

export const userAuthenticationDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.UserAuthentication);

  const findByUserId = async (userId: string, tx?: Knex) => {
    const result = await (tx || db.replicaNode())(TableName.UserAuthentication).where({ userId }).first();
    return result || null;
  };

  const findByExternalIdAndType = async (externalId: string, type: string, tx?: Knex) => {
    const result = await (tx || db.replicaNode())(TableName.UserAuthentication).where({ externalId, type }).first();
    return result || null;
  };

  return {
    ...orm,
    findByUserId,
    findByExternalIdAndType
  };
};
