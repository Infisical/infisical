import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TCaSigningConfigDALFactory = ReturnType<typeof caSigningConfigDALFactory>;

export const caSigningConfigDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.CaSigningConfig);

  const findByCaId = async (caId: string) => {
    const config = await db.replicaNode()(TableName.CaSigningConfig).where({ caId }).first();
    return config;
  };

  return {
    ...orm,
    findByCaId
  };
};
